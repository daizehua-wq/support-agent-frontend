const API_LLM_BASE_URL = process.env.API_LLM_BASE_URL || '';
const API_LLM_MODEL = process.env.API_LLM_MODEL || '';
const API_LLM_API_KEY = process.env.API_LLM_API_KEY || '';
const API_LLM_TIMEOUT_MS = Number(process.env.API_LLM_TIMEOUT_MS || 30000);
const ALLOW_API_SENSITIVE_DATA = process.env.ALLOW_API_SENSITIVE_DATA === 'true';

const resolveApiModelConfig = (payload = {}) => {
  const modelConfig = payload.modelConfig || payload.model || {};

  return {
    baseUrl: modelConfig.baseUrl || API_LLM_BASE_URL,
    modelName: modelConfig.modelName || API_LLM_MODEL,
    apiKey: modelConfig.apiKey || API_LLM_API_KEY,
    timeout: Number(modelConfig.timeout || API_LLM_TIMEOUT_MS),
  };
};

export const isApiLLMConfigured = (payload = {}) => {
  const config = resolveApiModelConfig(payload);
  return Boolean(config.baseUrl && config.modelName);
};

export const validateApiPayloadSafety = (payload) => {
  if (ALLOW_API_SENSITIVE_DATA) {
    return { safe: true, reason: 'explicitly-allowed' };
  }

  const scriptExecutionStrategy = payload.scriptExecutionStrategy || '';
  const outboundAllowed = payload.outboundAllowed === true;

  // 允许“脱敏后出网”
  if (scriptExecutionStrategy === 'masked-api') {
    return outboundAllowed
      ? { safe: true, reason: 'masked-api-allowed' }
      : { safe: false, reason: 'masked-api-blocked-by-outbound-check' };
  }

  const hasTaskInput = Boolean((payload.taskInput || payload.customerText || '').trim());
  const hasReferenceSummary = Boolean(payload.referenceSummary?.trim());
  const hasTaskSubject = Boolean((payload.taskSubject || payload.productDirection || '').trim());

  if (hasTaskInput || hasReferenceSummary || hasTaskSubject) {
    return {
      safe: false,
      reason: 'sensitive-local-data-blocked-by-policy',
    };
  }

  return { safe: true, reason: 'no-sensitive-local-data' };
};

export const buildApiLLMPrompt = ({
  scene = 'first_reply',
  toneStyle = 'formal',
  goal = '',
  taskSubject = '',
  taskInput = '',
  referenceSummary = '',
  cautionNotes = [],
  selectedTemplate = '',
}) => {
  return `你是一个通用岗位写作助手，需要基于已有模板生成一版更自然、更专业的参考文稿。\n\n【场景】\n${scene}\n\n【输出目标】\n${goal || '未提供'}\n\n【表达风格】\n${toneStyle}\n\n【任务主题】\n${taskSubject || '未提供'}\n\n【任务输入】\n${taskInput || '未提供'}\n\n【背景资料摘要】\n${referenceSummary || '未提供'}\n\n【基础模板】\n${selectedTemplate || '未提供'}\n\n【必须遵守的风险边界】\n${cautionNotes.length ? cautionNotes.map((item) => `- ${item}`).join('\n') : '- 当前阶段不建议直接承诺未经验证的结果。'}\n\n请输出一版更自然、更专业、但不越界的参考文稿。\n要求：\n1. 不要脱离基础模板的核心意思。\n2. 不要虚构事实或能力。\n3. 不要承诺未经验证的结果。\n4. 输出只返回最终正文，不要加解释。`;
};

const cleanApiLLMOutput = (text = '') => {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
};

const callApiLLM = async (prompt, payload = {}) => {
  const config = resolveApiModelConfig(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: '你是一个严谨的岗位助手，必须遵守模板和风险边界。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API LLM request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content?.trim() || '';
    return cleanApiLLMOutput(rawText);
  } finally {
    clearTimeout(timer);
  }
};

export const generateScriptWithAPILLM = async (payload) => {
  const safetyCheck = validateApiPayloadSafety(payload);

  if (!safetyCheck.safe) {
    return {
      prompt: '',
      rewrittenScript: payload.selectedTemplate || '',
      source: 'api-blocked-by-policy',
      reason: safetyCheck.reason,
    };
  }

  if (!isApiLLMConfigured(payload)) {
    return {
      prompt: '',
      rewrittenScript: payload.selectedTemplate || '',
      source: 'api-template-fallback',
      reason: 'api-not-configured',
    };
  }

  const prompt = buildApiLLMPrompt(payload);

  try {
    const rewrittenScript = await callApiLLM(prompt, payload);

    return {
      prompt,
      rewrittenScript: rewrittenScript || payload.selectedTemplate || '',
      source: 'api-llm',
      reason: 'api-call-success',
    };
  } catch (error) {
    console.error('[apiLLMService] api llm failed, fallback to selectedTemplate:', error);

    return {
      prompt,
      rewrittenScript: payload.selectedTemplate || '',
      source: 'api-template-fallback',
      reason: 'api-call-failed',
    };
  }
};
