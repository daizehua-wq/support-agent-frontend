const ANALYZE_LLM_BASE_URL = process.env.ANALYZE_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || '';
const ANALYZE_LLM_MODEL = process.env.ANALYZE_LLM_MODEL || process.env.LOCAL_LLM_MODEL || '';
const ANALYZE_LLM_API_KEY = process.env.ANALYZE_LLM_API_KEY || process.env.LOCAL_LLM_API_KEY || 'ollama';
const ANALYZE_LLM_TIMEOUT_MS = Number(
  process.env.ANALYZE_LLM_TIMEOUT_MS || process.env.LOCAL_LLM_TIMEOUT_MS || 180000
);

const ALLOWED_ENHANCED_FIELDS = ['summary', 'sceneJudgement', 'riskNotes', 'nextActions'];

const normalizeStringArray = (value, fallback = []) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const resolveAnalyzeModelConfig = (options = {}) => {
  const modelConfig = options.modelConfig || options.model || {};
  const executionStrategy = options.executionStrategy || '';
  const outboundAllowed = options.outboundAllowed === true;

  const provider =
    executionStrategy === 'masked-api' && outboundAllowed
      ? 'api'
      : modelConfig.modelProvider || 'local';

  return {
    provider,
    baseUrl: modelConfig.baseUrl || ANALYZE_LLM_BASE_URL,
    modelName: modelConfig.modelName || ANALYZE_LLM_MODEL,
    apiKey: modelConfig.apiKey || ANALYZE_LLM_API_KEY,
    timeout: Number(modelConfig.timeout || ANALYZE_LLM_TIMEOUT_MS),
  };
};

const cleanAnalyzeLLMOutput = (text = '') => {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
};

const buildAnalyzePrompt = ({ sanitizedText = '', safeMeta = {}, baseResult = {} }) => {
  return `你是通用 Agent 平台的任务判断增强模块。

你会收到：
1. 一段已经脱敏的任务文本
2. 一组规则层已生成的基础判断结果
3. 一些安全可用的上下文信息

你的任务：
- 在不改变业务事实的前提下，增强以下字段的表达质量：summary、sceneJudgement、riskNotes、nextActions
- 保留已有的方括号占位符，例如 [客户公司]、[客户联系人]、[产品方向]
- 可以不使用某个占位符，但不要删除、改写、拆分或新增占位符
- 不要编造客户意图、产品能力、测试结果或商务承诺
- 不要修改 recommendedProducts 和 followupQuestions
- riskNotes 和 nextActions 必须返回字符串数组
- 只返回 JSON，不要输出解释，不要输出 Markdown 代码块

输出 JSON 格式必须严格如下：
{
  "summary": "",
  "sceneJudgement": "",
  "riskNotes": [],
  "nextActions": []
}

【脱敏客户文本】
${sanitizedText}

【安全上下文】
${JSON.stringify(safeMeta, null, 2)}

【规则层基础分析结果】
${JSON.stringify(baseResult, null, 2)}
`;
};

const extractJsonBlock = (text = '') => {
  const trimmed = String(text || '').trim();
  const deFenced = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  if (!deFenced) {
    throw new Error('Analyze LLM 返回为空');
  }

  try {
    return JSON.parse(deFenced);
  } catch {
    // continue
  }

  const match = deFenced.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Analyze LLM 返回中未找到 JSON');
  }

  return JSON.parse(match[0]);
};

const normalizeEnhancedResult = (parsed = {}, baseResult = {}) => {
  const next = {
    ...baseResult,
  };

  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    next.summary = parsed.summary.trim();
  }

  if (typeof parsed.sceneJudgement === 'string' && parsed.sceneJudgement.trim()) {
    next.sceneJudgement = parsed.sceneJudgement.trim();
  }

  next.riskNotes = normalizeStringArray(parsed.riskNotes, baseResult.riskNotes || []);
  next.nextActions = normalizeStringArray(parsed.nextActions, baseResult.nextActions || []);

  return next;
};

const callAnalyzeLLM = async (prompt, options = {}) => {
  const config = resolveAnalyzeModelConfig(options);

  if (!config.baseUrl || !config.modelName) {
    throw new Error('Analyze LLM 未配置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout);

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
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: '你是一个严格遵守占位符和 JSON 输出格式的客户分析增强助手。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Analyze LLM HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    return cleanAnalyzeLLMOutput(rawText);
  } finally {
    clearTimeout(timeout);
  }
};

export const enhanceAnalyzeWithLLM = async ({
  sanitizedText = '',
  safeMeta = {},
  baseResult = {},
  modelConfig = {},
  executionStrategy = '',
  outboundAllowed = false,
}) => {
  const prompt = buildAnalyzePrompt({ sanitizedText, safeMeta, baseResult });
  const resolvedConfig = resolveAnalyzeModelConfig({
    modelConfig,
    executionStrategy,
    outboundAllowed,
  });
  const source = resolvedConfig.provider === 'local' ? 'local-llm' : 'api-llm';
  const successReason = resolvedConfig.provider === 'local'
    ? 'analyze-local-call-success'
    : 'analyze-api-call-success';

  try {
    const rawText = await callAnalyzeLLM(prompt, {
      modelConfig,
      executionStrategy,
      outboundAllowed,
    });
    const parsed = extractJsonBlock(rawText);
    const enhancedResult = normalizeEnhancedResult(parsed, baseResult);

    return {
      enhancedResult,
      rawText,
      source,
      reason: successReason,
    };
  } catch (error) {
    return {
      enhancedResult: baseResult,
      rawText: '',
      source: 'rules-fallback',
      reason: error instanceof Error ? error.message : 'analyze-llm-failed',
    };
  }
};

export const previewAnalyzePrompt = ({ sanitizedText = '', safeMeta = {}, baseResult = {} }) => {
  return buildAnalyzePrompt({ sanitizedText, safeMeta, baseResult });
};
