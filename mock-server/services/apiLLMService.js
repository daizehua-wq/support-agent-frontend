

const API_LLM_BASE_URL = process.env.API_LLM_BASE_URL || '';
const API_LLM_MODEL = process.env.API_LLM_MODEL || '';
const API_LLM_API_KEY = process.env.API_LLM_API_KEY || '';
const API_LLM_TIMEOUT_MS = Number(process.env.API_LLM_TIMEOUT_MS || 30000);
const ALLOW_API_SENSITIVE_DATA = process.env.ALLOW_API_SENSITIVE_DATA === 'true';

export const isApiLLMConfigured = () => {
  return Boolean(API_LLM_BASE_URL && API_LLM_MODEL && API_LLM_API_KEY);
};

export const validateApiPayloadSafety = (payload) => {
  if (ALLOW_API_SENSITIVE_DATA) {
    return { safe: true, reason: 'explicitly-allowed' };
  }

  const hasCustomerText = Boolean(payload.customerText?.trim());
  const hasReferenceSummary = Boolean(payload.referenceSummary?.trim());
  const hasProductDirection = Boolean(payload.productDirection?.trim());

  if (hasCustomerText || hasReferenceSummary || hasProductDirection) {
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
  productDirection = '',
  customerText = '',
  referenceSummary = '',
  cautionNotes = [],
  selectedTemplate = '',
}) => {
  return `你是一个销售支持助手，需要基于已有模板生成一版更自然、更商务的话术。\n\n【场景】\n${scene}\n\n【语气风格】\n${toneStyle}\n\n【产品方向】\n${productDirection || '未提供'}\n\n【客户原话】\n${customerText || '未提供'}\n\n【资料摘要】\n${referenceSummary || '未提供'}\n\n【基础模板】\n${selectedTemplate || '未提供'}\n\n【必须遵守的风险边界】\n${cautionNotes.length ? cautionNotes.map((item) => `- ${item}`).join('\n') : '- 当前阶段不建议直接承诺具体性能提升结果。'}\n\n请输出一版更自然、更商务、但不越界的话术。\n要求：\n1. 不要脱离基础模板的核心意思。\n2. 不要虚构产品能力。\n3. 不要承诺未经验证的结果。\n4. 输出只返回最终话术正文，不要加解释。`;
};

const callApiLLM = async (prompt) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_LLM_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: API_LLM_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: '你是一个严谨的销售支持助手，必须遵守模板和风险边界。',
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
    return data?.choices?.[0]?.message?.content?.trim() || '';
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

  if (!isApiLLMConfigured()) {
    return {
      prompt: '',
      rewrittenScript: payload.selectedTemplate || '',
      source: 'api-template-fallback',
      reason: 'api-not-configured',
    };
  }

  const prompt = buildApiLLMPrompt(payload);

  try {
    const rewrittenScript = await callApiLLM(prompt);

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