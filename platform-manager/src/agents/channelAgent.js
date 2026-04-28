import axios from 'axios';
import internalClient from '../lib/internalClient.js';

export const CHANNEL_SYSTEM_PROMPT = `
你是一个渠道配置专家。你可以帮助管理员配置企业 IM 渠道（如飞书、钉钉）。

配置一个新渠道需要以下信息：
- 关联的 Agent Platform 应用 ID（Apps 中的 app_id）
- 渠道类型（飞书 / 钉钉 / 企业微信）
- 应用名称（用于标识）
- App ID
- App Secret
- 其他必要信息（如飞书的 Verification Token、Encrypt Key）

当信息不全时，逐一询问。每次只问一个问题。

当信息齐全时，生成确认清单：
- 渠道类型与名称
- 关键配置摘要（App ID 脱敏显示部分字符）

用户确认后，输出最终配置 JSON：
{
  "confirmed": true,
  "app_id": "Agent Platform 应用 ID",
  "channel_type": "feishu",
  "channel_name": "法务部风控助手",
  "config": {
    "app_id": "cli_xxxxx",
    "app_secret": "xxxxx",
    "verification_token": "xxxxx",
    "encrypt_key": "xxxxx"
  }
}

注意：App Secret 等密钥只在生成 JSON 时包含，对话过程中不要暴露完整密钥。
`.trim();

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeHistory = (history = []) => {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      role: ['assistant', 'user'].includes(item?.role) ? item.role : 'user',
      content: normalizeText(item?.content),
    }))
    .filter((item) => item.content);
};

const hasUsableOpenAiKey = () => {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  return apiKey && apiKey !== 'sk-your-key-here';
};

const callOpenAI = async (messages = []) => {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    },
  );

  return normalizeText(response.data?.choices?.[0]?.message?.content);
};

const unwrapInternalData = (payload = {}) => {
  if (payload?.data && isPlainObject(payload.data) && 'data' in payload.data) {
    return payload.data.data;
  }

  if (payload?.data !== undefined) {
    return payload.data;
  }

  return payload;
};

const extractJsonBlock = (text = '') => {
  const normalizedText = normalizeText(text);
  if (!normalizedText.includes('"confirmed"') && !normalizedText.includes('confirmed')) {
    return null;
  }

  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || normalizedText;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end < start) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed?.confirmed === true ? parsed : null;
  } catch {
    return null;
  }
};

const readConversationText = (history = [], userMessage = '') => {
  return [...normalizeHistory(history).map((item) => item.content), userMessage].join('\n');
};

const matchValue = (text = '', patterns = []) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1].replace(/[，。；,;]$/, ''));
    }
  }

  return '';
};

const normalizeChannelType = (text = '') => {
  if (/飞书|feishu|lark/i.test(text)) return 'feishu';
  if (/钉钉|dingtalk/i.test(text)) return 'dingtalk';
  if (/企业微信|企微|wecom|wechat[_-]?work/i.test(text)) return 'wecom';
  return '';
};

const displayChannelType = (type = '') => {
  const labels = {
    feishu: '飞书',
    dingtalk: '钉钉',
    wecom: '企业微信',
  };
  return labels[type] || type || '未确认';
};

const maskValue = (value = '') => {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
};

const inferChannelState = (conversationText = '') => {
  const text = normalizeText(conversationText);
  const channelType = normalizeChannelType(text);
  const appId = matchValue(text, [
    /(?:App\s*ID|AppID|app_id|应用\s*ID|应用ID)\s*(?:是|为|:|：|=)?\s*([A-Za-z0-9_.-]+)/i,
    /\b(cli_[A-Za-z0-9_.-]+)/i,
  ]);
  const appSecret = matchValue(text, [
    /(?:App\s*Secret|Secret|app_secret|应用密钥|密钥)\s*(?:是|为|:|：|=)?\s*([A-Za-z0-9_.-]+)/i,
  ]);
  const verificationToken = matchValue(text, [
    /(?:Verification\s*Token|verification_token|校验\s*Token|验证\s*Token)\s*(?:是|为|:|：|=)?\s*([A-Za-z0-9_.-]+)/i,
  ]);
  const encryptKey = matchValue(text, [
    /(?:Encrypt\s*Key|encrypt_key|加密密钥|加密\s*Key)\s*(?:是|为|:|：|=)?\s*([A-Za-z0-9_.-]+)/i,
  ]);
  const nameFromFor = matchValue(text, [
    /(?:为|给)([^，。；,;\n]{2,24}?)(?:创建|配置|接入|新增).*(?:飞书|钉钉|企业微信|企微)/,
  ]);
  const explicitName = matchValue(text, [
    /(?:渠道名称|应用名称|名称)\s*(?:是|为|:|：|=)?\s*([^，。；,;\n]+)/,
  ]);
  const appScopedId = matchValue(text, [
    /(?:关联应用|应用\s*App|业务应用|app_id)\s*(?:是|为|:|：|=)?\s*([0-9a-f-]{16,})/i,
  ]);

  return {
    app_id: appScopedId,
    channel_type: channelType,
    channel_name: explicitName || nameFromFor || '',
    config: {
      app_id: appId,
      app_secret: appSecret,
      verification_token: verificationToken,
      encrypt_key: encryptKey,
    },
  };
};

const missingFieldQuestion = (state = {}) => {
  if (!state.channel_type) {
    return '要配置哪一种渠道？目前支持飞书、钉钉、企业微信。';
  }

  if (!state.channel_name) {
    return '这个渠道在平台里叫什么名字？例如“法务部风控助手”。';
  }

  if (!state.app_id) {
    return '请提供要关联的 Agent Platform 应用 ID，也就是 Apps 中的新应用 app_id。';
  }

  if (!state.config?.app_id) {
    return `请提供${displayChannelType(state.channel_type)}应用的 App ID。`;
  }

  if (!state.config?.app_secret) {
    return `请提供${displayChannelType(state.channel_type)}应用的 App Secret。`;
  }

  return '';
};

const buildConfirmationList = (state = {}) => {
  return [
    '确认清单：',
    `- 渠道类型：${displayChannelType(state.channel_type)}`,
    `- 渠道名称：${state.channel_name}`,
    `- 关联应用 ID：${state.app_id}`,
    `- App ID：${maskValue(state.config?.app_id)}`,
    `- App Secret：${maskValue(state.config?.app_secret)}`,
    state.config?.verification_token
      ? `- Verification Token：${maskValue(state.config.verification_token)}`
      : '- Verification Token：未提供，可后续编辑补充',
    state.config?.encrypt_key
      ? `- Encrypt Key：${maskValue(state.config.encrypt_key)}`
      : '- Encrypt Key：未提供，可后续编辑补充',
    '',
    '确认后，我会把配置写入 P2.5 数据层，并通知 P4 网关热加载。请回复或点击“确认执行”。',
  ].join('\n');
};

const normalizePlan = (plan = {}) => {
  return {
    confirmed: plan.confirmed === true,
    app_id: normalizeText(plan.app_id || plan.appId),
    channel_type: normalizeChannelType(plan.channel_type || plan.channelType),
    channel_name: normalizeText(plan.channel_name || plan.channelName),
    config: isPlainObject(plan.config) ? plan.config : {},
  };
};

const callGatewayReload = async () => {
  const gatewayUrl = normalizeText(process.env.API_GATEWAY_URL) || 'http://localhost:3000';
  const response = await axios.post(
    `${gatewayUrl.replace(/\/$/, '')}/internal/channels/reload`,
    {},
    {
      headers: {
        'X-Internal-Call': 'true',
      },
      timeout: 30000,
    },
  );

  return response.data;
};

const executeChannelPlan = async (plan = {}) => {
  const normalizedPlan = normalizePlan(plan);

  if (!normalizedPlan.confirmed) {
    return {
      error: 'channel plan is not confirmed',
    };
  }

  const createResponse = await internalClient.post('/internal/channels', {
    app_id: normalizedPlan.app_id,
    channel_type: normalizedPlan.channel_type,
    channel_name: normalizedPlan.channel_name,
    config: normalizedPlan.config,
    created_by: 'p5',
  });
  const channel = unwrapInternalData(createResponse);

  let reloadResult = null;
  try {
    reloadResult = await callGatewayReload();
  } catch (error) {
    reloadResult = {
      success: false,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
    };
  }

  return {
    reply: reloadResult?.success === false
      ? `渠道已创建，但 P4 网关热加载失败：${reloadResult.message || '未知错误'}。可以在渠道管理页手动重新加载。`
      : `渠道配置完成！已创建「${channel.channel_name || channel.channelName}」，P4 网关已热加载。`,
    needsConfirmation: false,
    channel_id: channel.id,
    channelId: channel.id,
    channel_type: channel.channel_type || channel.channelType,
    channelType: channel.channel_type || channel.channelType,
    channel_name: channel.channel_name || channel.channelName,
    channelName: channel.channel_name || channel.channelName,
    config_summary: channel.configSummary || {},
    configSummary: channel.configSummary || {},
    reload: reloadResult,
  };
};

const runLocalChannel = async (sessionId = '', userMessage = '', history = []) => {
  const normalizedMessage = normalizeText(userMessage);
  const state = inferChannelState(readConversationText(history, userMessage));

  if (/确认执行|确认创建|执行|开始创建|确认/.test(normalizedMessage)) {
    return executeChannelPlan({
      confirmed: true,
      ...state,
    });
  }

  const question = missingFieldQuestion(state);
  if (question) {
    return {
      reply: question,
      needsConfirmation: false,
      session_id: sessionId,
    };
  }

  return {
    reply: buildConfirmationList(state),
    needsConfirmation: true,
    session_id: sessionId,
  };
};

export const runChannelConversation = async (
  sessionId = '',
  userMessage = '',
  conversationHistory = [],
) => {
  const normalizedMessage = normalizeText(userMessage);
  const history = normalizeHistory(conversationHistory);

  if (!normalizedMessage) {
    return {
      reply: '请描述要配置的渠道，例如“为法务部创建一个飞书机器人，App ID 是 xxx，Secret 是 xxx”。',
      needsConfirmation: false,
      session_id: sessionId,
    };
  }

  try {
    if (!hasUsableOpenAiKey()) {
      return await runLocalChannel(sessionId, normalizedMessage, history);
    }

    const messages = [
      { role: 'system', content: CHANNEL_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: normalizedMessage },
    ];
    const aiReply = await callOpenAI(messages);
    const plan = extractJsonBlock(aiReply);

    if (plan) {
      return await executeChannelPlan(plan);
    }

    if (/确认执行|确认创建|执行/.test(normalizedMessage)) {
      return await executeChannelPlan({
        confirmed: true,
        ...inferChannelState(readConversationText(history, normalizedMessage)),
      });
    }

    return {
      reply: aiReply,
      needsConfirmation: /确认清单|热加载|确认执行|请确认/.test(aiReply),
      session_id: sessionId,
    };
  } catch (error) {
    return {
      error:
        normalizeText(error.response?.data?.error?.message) ||
        normalizeText(error.response?.data?.message) ||
        normalizeText(error.message) ||
        '渠道配置失败',
      reply: '渠道配置失败，请稍后重试或检查 P5 / mock-server / api-gateway 配置。',
      needsConfirmation: false,
    };
  }
};

export default {
  runChannelConversation,
};
