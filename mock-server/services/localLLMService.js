import { estimateTokens, safeRecordCall } from '../data/models/modelCallLog.js';
import { getPromptByAppId } from '../data/models/appPrompt.js';
import { buildCompressedLLMMessages } from './contextCompressor.js';

const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL || '';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || '';
const LOCAL_LLM_API_KEY = process.env.LOCAL_LLM_API_KEY || '';
const LOCAL_LLM_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS || 30000);

export const isLocalLLMConfigured = () => {
  return Boolean(LOCAL_LLM_BASE_URL && LOCAL_LLM_MODEL);
};

export const buildLocalLLMPrompt = ({
  scene = 'first_reply',
  toneStyle = 'formal',
  goal = '',
  taskSubject = '',
  taskInput = '',
  referenceSummary = '',
  cautionNotes = [],
  selectedTemplate = '',
}) => {
  return `你是一个通用岗位写作助手，需要基于已有模板生成一版更自然、更贴近真实工作语境的参考文稿。\n\n【场景】\n${scene}\n\n【输出目标】\n${goal || '未提供'}\n\n【表达风格】\n${toneStyle}\n\n【任务主题】\n${taskSubject || '未提供'}\n\n【任务输入】\n${taskInput || '未提供'}\n\n【背景资料摘要】\n${referenceSummary || '未提供'}\n\n【基础模板】\n${selectedTemplate || '未提供'}\n\n【必须遵守的风险边界】\n${cautionNotes.length ? cautionNotes.map((item) => `- ${item}`).join('\n') : '- 当前阶段不建议直接承诺未经验证的结果。'}\n\n请输出一版更自然、更专业、但不越界的参考文稿。\n要求：\n1. 不要脱离基础模板的核心意思。\n2. 不要虚构事实或能力。\n3. 不要承诺未经验证的结果。\n4. 输出只返回最终正文，不要加解释。`;
};

const sanitizeLocalLLMOutput = (text) => {
  if (!text) {
    return '';
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const resolveSystemPrompt = (defaultPrompt = '', appId = '') => {
  if (!appId) {
    return defaultPrompt;
  }

  try {
    const appPrompt = getPromptByAppId(appId);
    return appPrompt ? `${appPrompt}\n\n【平台默认边界】\n${defaultPrompt}` : defaultPrompt;
  } catch (error) {
    console.warn('[localLLMService] failed to load app prompt:', error.message);
    return defaultPrompt;
  }
};

const callLocalLLM = async (prompt, payload = {}) => {
  const appId = payload.appId || payload.app_id || '';
  const systemPrompt = resolveSystemPrompt(
    '你是一个严谨的本地岗位助手，必须遵守模板和风险边界。',
    appId,
  );
  const messageBundle = await buildCompressedLLMMessages({
    sessionId: payload.sessionId || payload.session_id || '',
    appId,
    systemPrompt,
    userPrompt: prompt,
  });
  const messages = Array.isArray(messageBundle.messages) && messageBundle.messages.length
    ? messageBundle.messages
    : [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ];
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${LOCAL_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LOCAL_LLM_API_KEY ? { Authorization: `Bearer ${LOCAL_LLM_API_KEY}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LOCAL_LLM_MODEL,
        temperature: 0.4,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local LLM request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content?.trim() || '';
    safeRecordCall({
      appId: payload.appId || payload.app_id || '',
      model: LOCAL_LLM_MODEL,
      success: true,
      latencyMs: Date.now() - startedAt,
      tokensUsed: data?.usage?.total_tokens || estimateTokens(JSON.stringify(messages), rawText),
    });
    return rawText;
  } catch (error) {
    safeRecordCall({
      appId: payload.appId || payload.app_id || '',
      model: LOCAL_LLM_MODEL,
      success: false,
      latencyMs: Date.now() - startedAt,
      tokensUsed: 0,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const generateScriptWithLocalLLM = async (payload) => {
  const prompt = buildLocalLLMPrompt(payload);

  if (!isLocalLLMConfigured()) {
    return {
      prompt,
      rewrittenScript: payload.selectedTemplate || '',
      source: 'local-template-fallback',
      reason: 'local-llm-not-configured',
    };
  }

  try {
    const rewrittenScript = await callLocalLLM(prompt, payload);
    const cleanedScript = sanitizeLocalLLMOutput(rewrittenScript);

    return {
      prompt,
      rewrittenScript: cleanedScript || payload.selectedTemplate || '',
      source: 'local-llm',
      reason: 'local-call-success',
    };
  } catch (error) {
    console.error('[localLLMService] local llm failed, fallback to selectedTemplate:', error);

    return {
      prompt,
      rewrittenScript: payload.selectedTemplate || '',
      source: 'local-template-fallback',
      reason: 'local-call-failed',
    };
  }
};
