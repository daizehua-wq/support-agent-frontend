import { isSearchSummaryModelAllowed } from './searchPolicyService.js';
import { getPromptByAppId } from '../data/models/appPrompt.js';
import { estimateTokens, safeRecordCall } from '../data/models/modelCallLog.js';

const EXTERNAL_SEARCH_PROVIDER = process.env.EXTERNAL_SEARCH_PROVIDER || 'mock-external-search';
const EXTERNAL_SEARCH_API_KEY = process.env.EXTERNAL_SEARCH_API_KEY || '';
const EXTERNAL_SEARCH_TIMEOUT_MS = Number(process.env.EXTERNAL_SEARCH_TIMEOUT_MS || '15000');

const normalizeText = (value = '') => String(value || '').trim();

export const isExternalProviderConfigured = () => Boolean(EXTERNAL_SEARCH_API_KEY);

export const canUseSearchModel = (modelConfig = {}) => {
  return Boolean(modelConfig.baseUrl && modelConfig.modelName);
};

const resolveSystemPrompt = (defaultPrompt = '', appId = '') => {
  if (!appId) {
    return defaultPrompt;
  }

  try {
    const appPrompt = getPromptByAppId(appId);
    return appPrompt ? `${appPrompt}\n\n【平台默认边界】\n${defaultPrompt}` : defaultPrompt;
  } catch (error) {
    console.warn('[searchSummaryService] failed to load app prompt:', error.message);
    return defaultPrompt;
  }
};

export const runExternalProviderSearch = async ({ keyword = '' }) => {
  if (!isExternalProviderConfigured()) {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_SEARCH_TIMEOUT_MS);

  try {
    await new Promise((resolve) => setTimeout(resolve, 120));

    return [
      {
        id: `external-${Date.now()}`,
        title: `${keyword || '目标客户'} 公开资料补充`,
        summary: '已补充公开资料线索，可用于辅助判断客户官网信息、产线动态或行业公开新闻。',
        sourceType: EXTERNAL_SEARCH_PROVIDER,
        sourceHint: '公开资料 / 官网 / 行业新闻',
      },
    ];
  } finally {
    clearTimeout(timer);
  }
};

export const buildExternalFallbackResults = (evidenceItems = []) => {
  return evidenceItems
    .filter((item) => item.outboundPolicy?.decision === 'allowed')
    .map((item) => ({
      id: `${item.sourceType}-${item.sourceRef}-external`,
      title: item.title,
      summary: item.summary,
      sourceType: 'external-supplement',
      sourceHint: '可继续补充官网资料 / 对外资料 / 行业新闻',
    }));
};

export const buildLocalSearchSummary = ({
  keyword = '',
  matchedRule = null,
  evidenceItems = [],
  externalResults = [],
  sourceSummary = undefined,
} = {}) => {
  const topDocs = evidenceItems.slice(0, 3).map((item) => item.title);

  if (evidenceItems.length === 0) {
    return `未找到与“${keyword || '当前关键词'}”直接匹配的本地资料，建议补充更明确的产品名、工序名或场景关键词。`;
  }

  const summaryParts = [];

  if (matchedRule?.name) {
    summaryParts.push(`已命中本地规则：${matchedRule.name}`);
  } else {
    summaryParts.push('当前未命中明确规则，已返回本地可参考资料');
  }

  summaryParts.push(`共找到 ${evidenceItems.length} 条本地证据`);

  if (sourceSummary) {
    const sourceParts = [
      sourceSummary.knowledgeCount ? `知识资料 ${sourceSummary.knowledgeCount}` : '',
      sourceSummary.fileSystemCount ? `文件系统 ${sourceSummary.fileSystemCount}` : '',
      sourceSummary.enterpriseDatabaseCount ? `本地数据库 ${sourceSummary.enterpriseDatabaseCount}` : '',
    ].filter(Boolean);

    if (sourceParts.length > 0) {
      summaryParts.push(`来源分布：${sourceParts.join(' / ')}`);
    }
  }

  if (topDocs.length > 0) {
    summaryParts.push(`建议优先查看：${topDocs.join('、')}`);
  }

  if (externalResults.length > 0) {
    summaryParts.push(`另有 ${externalResults.length} 条公开资料补充可供参考`);
  }

  return `${summaryParts.join('；')}。`;
};

export const runSearchModelSummary = async ({
  modelConfig = {},
  sanitizedKeyword = '',
  whitelistedEvidenceSummaries = [],
}) => {
  const startedAt = Date.now();
  const systemPrompt = resolveSystemPrompt(
    '你是一个资料检索整理助手。你只能使用脱敏关键词和白名单证据摘要生成简洁、可执行的检索结论，不得引用未提供的信息，也不要推断原始内部资料。',
    modelConfig.appId || modelConfig.app_id || '',
  );
  const controller = new AbortController();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (modelConfig.apiKey) {
    headers.Authorization = `Bearer ${modelConfig.apiKey}`;
  }

  const userPrompt = `【脱敏后的检索关键词】\n${sanitizedKeyword || '未提供'}\n\n【白名单证据摘要】\n${JSON.stringify(
    whitelistedEvidenceSummaries,
    null,
    2,
  )}\n\n请输出：\n1. 一段简洁检索结论\n2. 推荐先看的 1-3 条证据\n3. 如需继续做公开资料补充，说明原因`;

  try {
    const response = await fetch(`${modelConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelConfig.modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search model HTTP ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    safeRecordCall({
      appId: modelConfig.appId || modelConfig.app_id || '',
      model: modelConfig.modelName,
      success: true,
      latencyMs: Date.now() - startedAt,
      tokensUsed: data?.usage?.total_tokens || estimateTokens(userPrompt, rawText),
    });
    return String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (error) {
    safeRecordCall({
      appId: modelConfig.appId || modelConfig.app_id || '',
      model: modelConfig.modelName,
      success: false,
      latencyMs: Date.now() - startedAt,
      tokensUsed: 0,
    });
    throw error;
  }
};

export const generateSearchSummary = async ({
  modulePolicy = null,
  modelConfig = {},
  keywordPolicy = null,
  matchedRule = null,
  evidenceItems = [],
  sourceSummary = undefined,
  externalResults = [],
  whitelistedEvidenceSummaries = [],
} = {}) => {
  const localSummary = buildLocalSearchSummary({
    keyword: keywordPolicy?.keyword || '',
    matchedRule,
    evidenceItems,
    externalResults,
    sourceSummary,
  });
  const summaryModelPolicy = isSearchSummaryModelAllowed({
    modulePolicy,
    modelEnabled: canUseSearchModel(modelConfig),
    keywordPolicy,
    whitelistedEvidenceCount: whitelistedEvidenceSummaries.length,
  });

  if (!summaryModelPolicy.allowed) {
    return {
      searchSummary: localSummary,
      searchRoute: keywordPolicy?.externalSearchAllowed ? 'local+external' : 'search-summary-local-only',
      searchReason: summaryModelPolicy.reason,
      summaryModelTrace: {
        allowed: false,
        used: false,
        reason: summaryModelPolicy.reason,
        whitelistedEvidenceCount: whitelistedEvidenceSummaries.length,
        whitelistedEvidenceIds: whitelistedEvidenceSummaries.map((item) => item.evidenceId),
      },
    };
  }

  try {
    const searchSummary = await runSearchModelSummary({
      modelConfig,
      sanitizedKeyword: keywordPolicy?.sanitizedKeyword || keywordPolicy?.keyword || '',
      whitelistedEvidenceSummaries,
    });

    return {
      searchSummary: searchSummary || localSummary,
      searchRoute: keywordPolicy?.externalSearchAllowed ? 'search-llm+external' : 'search-llm-local',
      searchReason: 'search-summary-model-success',
      summaryModelTrace: {
        allowed: true,
        used: true,
        reason: 'search-summary-model-success',
        whitelistedEvidenceCount: whitelistedEvidenceSummaries.length,
        whitelistedEvidenceIds: whitelistedEvidenceSummaries.map((item) => item.evidenceId),
      },
    };
  } catch (error) {
    return {
      searchSummary: localSummary,
      searchRoute: 'search-summary-fallback',
      searchReason: error.message,
      summaryModelTrace: {
        allowed: true,
        used: false,
        reason: error.message,
        whitelistedEvidenceCount: whitelistedEvidenceSummaries.length,
        whitelistedEvidenceIds: whitelistedEvidenceSummaries.map((item) => item.evidenceId),
      },
    };
  }
};

export const getExternalSearchProvider = () => EXTERNAL_SEARCH_PROVIDER;
