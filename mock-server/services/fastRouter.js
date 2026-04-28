import { generate, extractJSON } from '../plugins/model-adapters/embeddedModelAdapter.js';
import {
  getCachedCompany,
  isCacheValid,
} from '../data/models/cachedCompanyData.js';
import { matchRules } from '../data/models/knowledgeRule.js';
import { safeRecordCall } from '../data/models/modelCallLog.js';
import { appendTestRecord } from './logService.js';
import { nowLocalIso } from '../utils/localTime.js';

const COMPANY_CACHE_KEY = Symbol.for('ap.p2.fastRouter.companyCache');
const ROUTE_LOG_TIMEOUT_MS = 500;
const LOCAL_MODEL_TIMEOUT_MS = 800;

if (!globalThis[COMPANY_CACHE_KEY]) {
  globalThis[COMPANY_CACHE_KEY] = new Map();
}

const normalizeText = (value = '') => String(value || '').trim();

const nowMs = () => Date.now();

const maskUserMessage = (value = '') => {
  const text = normalizeText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/1[3-9]\d{9}/g, '[phone]')
    .replace(/\d{6,}/g, '[number]');

  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
};

const normalizeCompanyName = (value = '') => {
  return normalizeText(value)
    .replace(/^[：:\s,，。；;]+/, '')
    .replace(/[？?。！!；;，,\s]+$/g, '')
    .trim();
};

const getCompanyCache = () => globalThis[COMPANY_CACHE_KEY];

const cacheKeyForCompany = (companyName = '', appId = '') => {
  return `${normalizeText(appId) || 'global'}:${normalizeCompanyName(companyName).toLowerCase()}`;
};

const getCachedCompanyData = (companyName = '', appId = '') => {
  const companyNameKey = cacheKeyForCompany(companyName, appId);
  const memoryCache =
    getCompanyCache().get(companyNameKey) ||
    getCompanyCache().get(cacheKeyForCompany(companyName, ''));

  if (memoryCache) {
    return memoryCache;
  }

  try {
    const persistentCache = getCachedCompany(companyName);
    if (
      persistentCache &&
      isCacheValid(persistentCache, 'basic') &&
      isCacheValid(persistentCache, 'risk') &&
      isCacheValid(persistentCache, 'operation')
    ) {
      return {
        companyName: persistentCache.companyName,
        data: {
          ...(persistentCache.basicInfo || {}),
          riskInfo: persistentCache.riskInfo || {},
          operationInfo: persistentCache.operationInfo || {},
        },
        cachedAt: persistentCache.fetchedAt,
        source: 'p2_5_cached_company_data',
      };
    }
  } catch (error) {
    console.warn('[fastRouter] persistent company cache lookup failed:', error.message);
  }

  return null;
};

export const upsertCompanyCache = ({ companyName = '', appId = '', data = null } = {}) => {
  const normalizedCompanyName = normalizeCompanyName(companyName);
  if (!normalizedCompanyName || !data) {
    return false;
  }

  getCompanyCache().set(cacheKeyForCompany(normalizedCompanyName, appId), {
    companyName: normalizedCompanyName,
    data,
    cachedAt: nowLocalIso(),
  });
  return true;
};

const summarizeCompanyData = (cachedRecord = null) => {
  const data = cachedRecord?.data || cachedRecord || {};
  const companyName = normalizeText(data.companyName || data.company_name || cachedRecord?.companyName);
  const riskInfo = data.riskInfo && typeof data.riskInfo === 'object' ? data.riskInfo : {};
  const operationInfo =
    data.operationInfo && typeof data.operationInfo === 'object' ? data.operationInfo : {};
  const status = normalizeText(data.enterpriseStatus || data.companyStatus || data.status || data.regStatus);
  const legalRepresentative = normalizeText(data.legalRepresentative || data.legal_person);
  const registeredCapital = normalizeText(data.registeredCapital || data.regCapital);
  const executionRecords = Array.isArray(data.executionRecords)
    ? data.executionRecords
    : Array.isArray(riskInfo.executionRecords)
      ? riskInfo.executionRecords
      : [];
  const dishonestRecords = Array.isArray(data.dishonestRecords)
    ? data.dishonestRecords
    : Array.isArray(riskInfo.dishonestyRecords)
      ? riskInfo.dishonestyRecords
      : [];
  const shareholderCount = Array.isArray(operationInfo.shareholders)
    ? operationInfo.shareholders.length
    : 0;
  const lines = [
    `企业：${companyName || '未提供'}`,
    status ? `状态：${status}` : '',
    legalRepresentative ? `法定代表人：${legalRepresentative}` : '',
    registeredCapital ? `注册资本：${registeredCapital}` : '',
    `被执行记录：${executionRecords.length}`,
    `失信记录：${dishonestRecords.length}`,
    shareholderCount ? `股东记录：${shareholderCount}` : '',
  ].filter(Boolean);

  return `${lines.join('\n')}\n\n数据来源：P2.5 企业信息缓存。`;
};

const buildRuleReply = (rule = null, fallbackSubject = '') => {
  const suggestions = rule?.suggestions && typeof rule.suggestions === 'object' ? rule.suggestions : {};
  const riskNotes = Array.isArray(rule?.riskNotes)
    ? rule.riskNotes
    : [rule?.riskNotes].filter(Boolean);
  const lines = [
    suggestions.summaryTemplate || rule?.scenario || `已根据高置信度规则识别：${fallbackSubject || '当前请求'}`,
    suggestions.sceneJudgement ? `判断：${suggestions.sceneJudgement}` : '',
    riskNotes.length ? `风险提示：${riskNotes.join('；')}` : '',
    Array.isArray(suggestions.nextActions) && suggestions.nextActions.length
      ? `建议动作：${suggestions.nextActions.join('；')}`
      : '',
  ].filter(Boolean);

  return lines.join('\n');
};

const findHighConfidenceKnowledgeRule = ({ userMessage = '', appId = '', workflowStage = 'analyze' } = {}) => {
  const rules = matchRules({
    appId,
    workflowStage,
    keyword: userMessage,
  });

  return rules.find((rule) => Number(rule?.confidence ?? 1) > 0.8) || null;
};

const buildChatMLPrompt = (userMessage = '') => {
  return `<|im_start|>system
你是一个意图分类助手。将用户输入分类为以下之一：查公司、查风险、生成报告、简单闲聊、复杂问题。
只输出分类结果，不要解释。
<|im_end|>
<|im_start|>user
${normalizeText(userMessage)}
<|im_end|>
<|im_start|>assistant
`;
};

const normalizeIntent = (value = '') => {
  const text = normalizeText(value).replace(/[。.!！\s"'`]/g, '');

  if (text.includes('查公司')) {
    return '查公司';
  }

  if (text.includes('查风险') || text.includes('风险')) {
    return '查风险';
  }

  if (text.includes('生成报告') || text.includes('报告')) {
    return '生成报告';
  }

  if (text.includes('简单闲聊') || text.includes('闲聊')) {
    return '简单闲聊';
  }

  return '复杂问题';
};

const extractCompanyName = (userMessage = '') => {
  const text = normalizeText(userMessage);
  const exactMatch = text.match(/^查(?:公司|企业|一下)(.+)$/);
  if (exactMatch) {
    return normalizeCompanyName(exactMatch[1]);
  }

  const namedCompanyMatch = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,}(?:公司|企业|集团|厂|店|中心|事务所))/);
  return normalizeCompanyName(namedCompanyMatch?.[1] || '');
};

const buildUpgrade = ({
  startedAt,
  routeResult = 'upgraded',
  localModelUsed = false,
  extractedInfo = {},
  reason = '',
  localModelError = '',
} = {}) => {
  return {
    handled: false,
    context: {
      extractedInfo,
      routeResult,
      routeLatency: Math.max(0, nowMs() - startedAt),
      localModelUsed,
      reason,
      localModelError,
    },
  };
};

const buildHandled = ({ reply = '', handledBy = 'handled_by_rule' } = {}) => {
  return {
    handled: true,
    reply,
    handledBy,
  };
};

export const logRouteDecision = async ({
  appId = '',
  sessionId = '',
  userMessage = '',
  routeResult = 'upgraded',
  latencyMs = 0,
  localModelUsed = false,
} = {}) => {
  const payload = {
    app_id: normalizeText(appId),
    session_id: normalizeText(sessionId),
    user_message: maskUserMessage(userMessage),
    route_result: routeResult,
    latency_ms: Math.max(0, Number(latencyMs) || 0),
    local_model_used: localModelUsed === true,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_LOG_TIMEOUT_MS);

  try {
    const port = Number(process.env.PORT || 3001);
    await fetch(`http://127.0.0.1:${port}/internal/model-calls/log`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Internal-Call': 'true',
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    safeRecordCall({
      appId,
      model: `fast-router:${routeResult}`,
      success: routeResult !== 'upgraded',
      latencyMs,
      tokensUsed: 0,
    });
    appendTestRecord({
      type: 'fast-router-decision',
      ...payload,
      logFallbackReason: normalizeText(error.message),
    });
  } finally {
    clearTimeout(timeout);
  }
};

const finish = async ({
  result,
  startedAt,
  appId,
  sessionId,
  userMessage,
  routeResult,
  localModelUsed,
}) => {
  const latencyMs = Math.max(0, nowMs() - startedAt);
  await logRouteDecision({
    appId,
    sessionId,
    userMessage,
    routeResult,
    latencyMs,
    localModelUsed,
  });

  if (!result.handled && result.context) {
    result.context.routeLatency = latencyMs;
  }

  return result;
};

export async function routeRequest(userMessage, appId = '', sessionId = '') {
  const startedAt = nowMs();
  const normalizedMessage = normalizeText(userMessage);
  const normalizedAppId = normalizeText(appId);
  const normalizedSessionId = normalizeText(sessionId);

  if (!normalizedMessage) {
    return finish({
      result: buildUpgrade({
        startedAt,
        reason: 'empty_message',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'upgraded',
      localModelUsed: false,
    });
  }

  if (/^(你好|您好|在吗|帮助|help)$/i.test(normalizedMessage)) {
    return finish({
      result: buildHandled({
        handledBy: 'handled_by_rule',
        reply: '你好，我在。你可以直接告诉我想查企业、看风险，或生成一份分析材料。',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'handled_by_rule',
      localModelUsed: false,
    });
  }

  const companyRuleMatch = normalizedMessage.match(/^查(?:公司|企业|一下)(.+)$/);
  if (companyRuleMatch) {
    const companyName = normalizeCompanyName(companyRuleMatch[1]);
    const cachedCompany = getCachedCompanyData(companyName, normalizedAppId);

    if (cachedCompany) {
      return finish({
        result: buildHandled({
          handledBy: 'handled_by_rule',
          reply: summarizeCompanyData(cachedCompany),
        }),
        startedAt,
        appId: normalizedAppId,
        sessionId: normalizedSessionId,
        userMessage: normalizedMessage,
        routeResult: 'handled_by_rule',
        localModelUsed: false,
      });
    }

    return finish({
      result: buildUpgrade({
        startedAt,
        routeResult: 'upgraded',
        extractedInfo: {
          intent: '查公司',
          companyName,
          cacheHit: false,
        },
        reason: 'company_cache_miss',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'upgraded',
      localModelUsed: false,
    });
  }

  const analysisRuleMatch = normalizedMessage.match(/^帮我分析(.+)$/);
  if (analysisRuleMatch) {
    const highConfidenceRule = findHighConfidenceKnowledgeRule({
      userMessage: normalizedMessage,
      appId: normalizedAppId,
      workflowStage: 'analyze',
    });

    if (highConfidenceRule) {
      return finish({
        result: buildHandled({
          handledBy: 'handled_by_rule',
          reply: buildRuleReply(highConfidenceRule, analysisRuleMatch[1]),
        }),
        startedAt,
        appId: normalizedAppId,
        sessionId: normalizedSessionId,
        userMessage: normalizedMessage,
        routeResult: 'handled_by_rule',
        localModelUsed: false,
      });
    }
  }

  let intent = '复杂问题';
  let localModelError = '';
  let localModelUsed = false;

  try {
    localModelUsed = true;
    intent = normalizeIntent(
      await generate(buildChatMLPrompt(normalizedMessage), {
        maxTokens: 16,
        temperature: 0,
        timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
      }),
    );
  } catch (error) {
    localModelError = normalizeText(error.message);
    console.warn('[fastRouter] local intent classification failed, upgrading:', localModelError);

    return finish({
      result: buildUpgrade({
        startedAt,
        localModelUsed: true,
        localModelError,
        reason: 'local_model_failed',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'upgraded',
      localModelUsed: true,
    });
  }

  if (intent === '查公司') {
    const companyName = extractCompanyName(normalizedMessage);
    const cachedCompany = companyName ? getCachedCompanyData(companyName, normalizedAppId) : null;

    if (cachedCompany) {
      return finish({
        result: buildHandled({
          handledBy: 'handled_by_local_model',
          reply: summarizeCompanyData(cachedCompany),
        }),
        startedAt,
        appId: normalizedAppId,
        sessionId: normalizedSessionId,
        userMessage: normalizedMessage,
        routeResult: 'handled_by_local_model',
        localModelUsed,
      });
    }

    return finish({
      result: buildUpgrade({
        startedAt,
        localModelUsed,
        extractedInfo: {
          intent,
          companyName,
          cacheHit: false,
        },
        reason: 'company_cache_miss',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'upgraded',
      localModelUsed,
    });
  }

  if (intent === '查风险') {
    const highConfidenceRule = findHighConfidenceKnowledgeRule({
      userMessage: normalizedMessage,
      appId: normalizedAppId,
      workflowStage: 'analyze',
    });

    if (highConfidenceRule) {
      return finish({
        result: buildHandled({
          handledBy: 'handled_by_local_model',
          reply: buildRuleReply(highConfidenceRule, normalizedMessage),
        }),
        startedAt,
        appId: normalizedAppId,
        sessionId: normalizedSessionId,
        userMessage: normalizedMessage,
        routeResult: 'handled_by_local_model',
        localModelUsed,
      });
    }

    return finish({
      result: buildUpgrade({
        startedAt,
        localModelUsed,
        extractedInfo: {
          intent,
          riskFocus: normalizedMessage,
          companyName: extractCompanyName(normalizedMessage),
        },
        reason: 'risk_rule_miss',
      }),
      startedAt,
      appId: normalizedAppId,
      sessionId: normalizedSessionId,
      userMessage: normalizedMessage,
      routeResult: 'upgraded',
      localModelUsed,
    });
  }

  if (intent === '简单闲聊') {
    try {
      const reply = await generate(
        `请用中文给用户一个简短、友好的回复，不要超过 60 字。\n用户：${normalizedMessage}`,
        {
          maxTokens: 100,
          temperature: 0.2,
          timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
        },
      );

      return finish({
        result: buildHandled({
          handledBy: 'handled_by_local_model',
          reply: reply || '我在，可以继续说说你想处理的事情。',
        }),
        startedAt,
        appId: normalizedAppId,
        sessionId: normalizedSessionId,
        userMessage: normalizedMessage,
        routeResult: 'handled_by_local_model',
        localModelUsed: true,
      });
    } catch (error) {
      localModelError = normalizeText(error.message);
      console.warn('[fastRouter] local chat reply failed, upgrading:', localModelError);
    }
  }

  return finish({
    result: buildUpgrade({
      startedAt,
      localModelUsed,
      localModelError,
      extractedInfo: {
        intent,
        companyName: extractCompanyName(normalizedMessage),
      },
      reason: intent === '生成报告' || intent === '复杂问题' ? 'complex_or_report_request' : 'not_handled',
    }),
    startedAt,
    appId: normalizedAppId,
    sessionId: normalizedSessionId,
    userMessage: normalizedMessage,
    routeResult: 'upgraded',
    localModelUsed,
  });
}

export default {
  routeRequest,
  logRouteDecision,
  upsertCompanyCache,
  extractJSON,
};
