import { getSession } from '../data/models/session.js';
import {
  extractJSON,
  generate,
  getEmbeddedModelStatus,
  runEmbeddedModelJson,
} from '../plugins/model-adapters/embeddedModelAdapter.js';

const DEFAULT_MAX_FULL_ROUNDS = 10;
const MIDDLE_ROUND_COUNT = 10;

const normalizeText = (value = '') => String(value || '').trim();

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStructuredContext = (value = {}) => {
  const source = isPlainObject(value) ? value : {};
  const normalizeArray = (arrayValue = []) =>
    (Array.isArray(arrayValue) ? arrayValue : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20);

  return {
    entities: normalizeArray(source.entities),
    key_numbers: normalizeArray(source.key_numbers || source.keyNumbers),
    risk_concerns: normalizeArray(source.risk_concerns || source.riskConcerns),
    user_constraints: normalizeArray(source.user_constraints || source.userConstraints),
    decision_points: normalizeArray(source.decision_points || source.decisionPoints),
  };
};

const mergeStructuredContext = (...contexts) => {
  const merged = {
    entities: [],
    key_numbers: [],
    risk_concerns: [],
    user_constraints: [],
    decision_points: [],
  };

  contexts.map(normalizeStructuredContext).forEach((context) => {
    Object.keys(merged).forEach((key) => {
      merged[key].push(...context[key]);
    });
  });

  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, [...new Set(value)].slice(0, 20)]),
  );
};

const toMessage = (message = {}) => ({
  role: ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user',
  content: normalizeText(message.content),
  createdAt: message.createdAt || message.created_at || '',
  id: message.id || '',
});

const groupConversationRounds = (messages = []) => {
  const rounds = [];
  let currentRound = null;

  messages
    .map(toMessage)
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content)
    .forEach((message) => {
      if (message.role === 'user' || !currentRound) {
        currentRound = [];
        rounds.push(currentRound);
      }

      currentRound.push({
        role: message.role,
        content: message.content,
      });
    });

  return rounds;
};

const flattenRounds = (rounds = []) => rounds.flat().map(({ role, content }) => ({ role, content }));

const buildExtractionPrompt = (historicalText = '') => {
  return `<|im_start|>system
你是一个信息提取助手。从以下对话历史中提取关键信息，只返回 JSON，不要添加任何解释。
JSON 格式如下：
{
  "entities": ["公司名1", "公司名2"],
  "key_numbers": ["金额/比例/日期"],
  "risk_concerns": ["用户关注的风险点"],
  "user_constraints": ["用户提出的限制条件"],
  "decision_points": ["用户做过的关键选择"]
}
如果某个字段没有相关信息，填空数组 []。
<|im_end|>
<|im_start|>user
对话历史：
${historicalText}
<|im_end|>
<|im_start|>assistant
`;
};

const truncateText = (value = '', maxLength = 6000) => {
  const text = normalizeText(value);
  return text.length > maxLength ? text.slice(-maxLength) : text;
};

const roundsToHistoricalText = (rounds = []) => {
  return truncateText(
    flattenRounds(rounds)
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n'),
  );
};

const extractByRegex = (text = '') => {
  const normalizedText = normalizeText(text);
  const companies = normalizedText.match(/[\u4e00-\u9fa5A-Za-z0-9（）()]{2,40}(?:公司|集团|企业|厂|店)/g) || [];
  const keyNumbers =
    normalizedText.match(
      /(?:\d+(?:\.\d+)?\s*(?:万|亿|元|%|％|天|年|个月|月|日)|\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?)/g,
    ) || [];
  const riskConcerns = [
    '失信',
    '被执行',
    '诉讼',
    '经营异常',
    '注册资本',
    '实缴资本',
    '回款',
    '逾期',
    '风险',
  ].filter((keyword) => normalizedText.includes(keyword));
  const userConstraints =
    normalizedText.match(/(?:必须|需要|不要|不能|限制|要求)[^。！？\n]{2,60}/g) || [];
  const decisionPoints =
    normalizedText.match(/(?:确认|决定|选择|优先|暂定|采用)[^。！？\n]{2,60}/g) || [];

  return normalizeStructuredContext({
    entities: companies,
    key_numbers: keyNumbers,
    risk_concerns: riskConcerns,
    user_constraints: userConstraints,
    decision_points: decisionPoints,
  });
};

const extractStructuredContextWithModel = async (historicalText = '') => {
  const text = normalizeText(historicalText);
  if (!text) {
    return normalizeStructuredContext();
  }

  const status = getEmbeddedModelStatus();
  if (!status.ready) {
    throw new Error('embedded model is not ready');
  }

  try {
    const extraction = await runEmbeddedModelJson(
      {
        task: 'field_extraction',
        text,
        domainType: 'conversation',
        workflowStage: 'context_compression',
        goal: 'extract reusable context',
      },
      {
        task: 'field_extraction',
        timeoutMs: 2500,
        maxTokens: 96,
        minConfidence: 0,
        temperature: 0,
      },
    );
    const fields = Array.isArray(extraction?.data?.fields) ? extraction.data.fields : [];
    const fieldText = fields.map((field) => `${field.name}:${field.value}`).join('\n');
    return mergeStructuredContext(extractByRegex(text), extractByRegex(fieldText));
  } catch (error) {
    console.warn('[contextCompressor] field extraction schema failed, trying free JSON:', error.message);
  }

  const rawText = await generate(buildExtractionPrompt(text), {
    timeoutMs: 2500,
    maxTokens: 180,
    temperature: 0,
  });
  return normalizeStructuredContext(extractJSON(rawText));
};

export const compressConversation = async (sessionId = '', options = {}) => {
  const normalizedSessionId = normalizeText(sessionId);
  const maxFullRounds = toPositiveInteger(options.maxFullRounds, DEFAULT_MAX_FULL_ROUNDS);

  if (!normalizedSessionId) {
    return {
      recentMessages: [],
      structuredContext: normalizeStructuredContext(),
      compression: {
        applied: false,
        reason: 'missing-session-id',
      },
    };
  }

  try {
    const session = getSession(normalizedSessionId, {
      appId: options.appId || options.app_id || '',
    }) || getSession(normalizedSessionId);
    const rounds = groupConversationRounds(session?.messages || []);
    const totalRounds = rounds.length;

    if (totalRounds <= maxFullRounds) {
      return {
        recentMessages: flattenRounds(rounds),
        structuredContext: normalizeStructuredContext(),
        compression: {
          applied: false,
          reason: 'within-window',
          totalRounds,
          maxFullRounds,
        },
      };
    }

    const recentRounds = rounds.slice(-maxFullRounds);
    const middleEnd = Math.max(0, totalRounds - maxFullRounds);
    const middleStart = Math.max(0, middleEnd - MIDDLE_ROUND_COUNT);
    const middleRounds = rounds.slice(middleStart, middleEnd);
    const olderRounds = rounds.slice(0, middleStart);
    const middleText = roundsToHistoricalText(middleRounds);
    const olderText = roundsToHistoricalText(olderRounds);
    const modelStructuredContext = middleText
      ? await extractStructuredContextWithModel(middleText)
      : normalizeStructuredContext();
    const regexStructuredContext = olderText
      ? extractByRegex(olderText)
      : normalizeStructuredContext();

    return {
      recentMessages: flattenRounds(recentRounds),
      structuredContext: mergeStructuredContext(modelStructuredContext, regexStructuredContext),
      compression: {
        applied: true,
        reason: 'compressed',
        totalRounds,
        maxFullRounds,
        recentRounds: recentRounds.length,
        modelExtractedRounds: middleRounds.length,
        regexExtractedRounds: olderRounds.length,
      },
    };
  } catch (error) {
    console.warn('[contextCompressor] compression failed, falling back to full history:', error.message);
    try {
      const session = getSession(normalizedSessionId) || {};
      return {
        recentMessages: flattenRounds(groupConversationRounds(session.messages || [])),
        structuredContext: normalizeStructuredContext(),
        compression: {
          applied: false,
          reason: 'fallback-full-history',
          error: error.message,
        },
      };
    } catch {
      return {
        recentMessages: [],
        structuredContext: normalizeStructuredContext(),
        compression: {
          applied: false,
          reason: 'fallback-empty-history',
          error: error.message,
        },
      };
    }
  }
};

export const formatContextForLLM = (recentMessages = [], structuredContext = {}) => {
  const context = normalizeStructuredContext(structuredContext);
  const lines = ['[历史对话关键信息]'];

  if (context.entities.length) {
    lines.push(`涉及公司：${context.entities.join('、')}`);
  }

  if (context.key_numbers.length) {
    lines.push(`关键数据：${context.key_numbers.join('、')}`);
  }

  if (context.risk_concerns.length) {
    lines.push(`用户关注：${context.risk_concerns.join('、')}`);
  }

  if (context.user_constraints.length) {
    lines.push(`用户约束：${context.user_constraints.join('、')}`);
  }

  if (context.decision_points.length) {
    lines.push(`关键选择：${context.decision_points.join('、')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
};

export const buildCompressedLLMMessages = async ({
  sessionId = '',
  appId = '',
  systemPrompt = '',
  userPrompt = '',
  maxFullRounds = DEFAULT_MAX_FULL_ROUNDS,
} = {}) => {
  const fallbackMessages = [
    {
      role: 'system',
      content: normalizeText(systemPrompt),
    },
    {
      role: 'user',
      content: normalizeText(userPrompt),
    },
  ].filter((message) => message.content);

  if (!normalizeText(sessionId)) {
    return {
      messages: fallbackMessages,
      compression: {
        applied: false,
        reason: 'missing-session-id',
      },
    };
  }

  const compressed = await compressConversation(sessionId, {
    appId,
    maxFullRounds,
  });
  const contextText = formatContextForLLM(
    compressed.recentMessages,
    compressed.structuredContext,
  );
  const systemContent = [normalizeText(systemPrompt), contextText].filter(Boolean).join('\n\n');
  const recentMessages = (compressed.recentMessages || [])
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content)
    .map(({ role, content }) => ({ role, content }));

  return {
    messages: [
      ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
      ...recentMessages,
      ...(normalizeText(userPrompt) ? [{ role: 'user', content: normalizeText(userPrompt) }] : []),
    ],
    structuredContext: compressed.structuredContext,
    recentMessages: compressed.recentMessages,
    contextText,
    compression: compressed.compression,
  };
};

export default {
  buildCompressedLLMMessages,
  compressConversation,
  formatContextForLLM,
};
