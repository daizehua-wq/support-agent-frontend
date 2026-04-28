import { listExternalDataSourceRuntimeConfigs } from '../../services/externalDataSourceService.js';
import { appendExternalProviderCallLog } from '../../services/externalProviderCallLogService.js';
import { nowLocalIso } from '../../utils/localTime.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeLower = (value = '') => normalizeText(value).toLowerCase();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nowIso = nowLocalIso;

const safeJson = async (response) => {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    return {
      text: rawText,
    };
  }
};

const extractItems = (payload = {}) => {
  const candidates = [
    payload.items,
    payload.results,
    payload.webPages?.value,
    payload.organic_results,
    payload.data?.items,
    payload.data?.results,
    payload.data,
  ];
  const matched = candidates.find((item) => Array.isArray(item));
  if (matched) {
    return matched;
  }

  return Array.isArray(payload) ? payload : [];
};

const getHostname = (url = '') => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
};

const domainMatches = (hostname = '', domains = []) => {
  const normalizedHostname = normalizeLower(hostname);
  return domains.some((domain) => {
    const normalizedDomain = normalizeLower(domain);
    return normalizedDomain && (
      normalizedHostname === normalizedDomain ||
      normalizedHostname.endsWith(`.${normalizedDomain}`)
    );
  });
};

const inferWebCategory = ({ item = {}, config = {} } = {}) => {
  const declaredCategory = normalizeText(item.category || item.sourceCategory);
  if (declaredCategory) {
    return declaredCategory;
  }

  if (config.sourceType === 'official_site') {
    return 'official_web';
  }

  const url = normalizeLower(item.url || item.link);
  const sourceName = normalizeLower(item.source || item.sourceName || item.provider || config.providerName);
  if (url.includes('.gov') || sourceName.includes('政府') || sourceName.includes('监管') || sourceName.includes('官方')) {
    return 'official_web';
  }

  if (sourceName.includes('news') || sourceName.includes('媒体') || sourceName.includes('新闻')) {
    return 'media_web';
  }

  if (sourceName.includes('forum') || sourceName.includes('论坛') || sourceName.includes('社交')) {
    return 'social_or_forum';
  }

  return 'general_web';
};

const buildProviderUrl = (config = {}, keyword = '', limit = 5) => {
  const baseUrl = normalizeText(config.baseUrl);
  const apiPath = normalizeText(config.apiPath);
  const url = new URL(
    apiPath ? apiPath.replace(/^\/+/, '') : baseUrl,
    apiPath ? `${baseUrl.replace(/\/+$/, '')}/` : undefined,
  );
  url.searchParams.set(config.queryParam || 'q', keyword);
  url.searchParams.set(config.limitParam || 'limit', String(limit));
  if (normalizeText(config.freshness)) {
    url.searchParams.set('freshness', config.freshness);
  }
  return url;
};

const buildHeaders = (config = {}) => {
  const headers = {
    accept: 'application/json',
  };
  const apiKey = normalizeText(config.apiKey);

  if (!apiKey) {
    return headers;
  }

  if (config.authType === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  headers['x-api-key'] = apiKey;
  return headers;
};

const getEndpointHost = (url = null) => {
  try {
    return url ? url.hostname : '';
  } catch (error) {
    return '';
  }
};

const normalizeProviderResult = ({
  item = {},
  index = 0,
  config = {},
  keyword = '',
  retrievedAt = nowIso(),
  sessionId = '',
  appId = '',
} = {}) => {
  const record = isPlainObject(item) ? item : { title: String(item || '') };
  const url = normalizeText(record.url || record.link || record.displayLink);
  const title =
    normalizeText(record.title || record.name || record.headline) ||
    `${keyword || config.providerName || '网页'} 结果 ${index + 1}`;
  const summary =
    normalizeText(record.summary || record.snippet || record.description || record.abstract) ||
    normalizeText(record.content || record.text) ||
    `${title} 的公开网页摘要。`;
  const content =
    normalizeText(record.content || record.text || record.body) ||
    [title, summary, url].filter(Boolean).join('\n');

  return {
    rawId:
      normalizeText(record.id || record.rawId || record.cacheId || url) ||
      `web_search_${config.id || config.provider || 'generic'}_${index + 1}`,
    sourceType: 'web_search',
    sourceName: record.source || record.sourceName || config.name || config.providerName || 'Generic Web Search',
    provider: config.provider || config.providerName || 'generic_web_search',
    category: inferWebCategory({ item: record, config }),
    title,
    summary,
    content,
    url,
    retrievedAt,
    updatedAt: record.updatedAt || record.dateLastCrawled || null,
    publishedAt: record.publishedAt || record.datePublished || null,
    externalAvailable: config.externalAvailable !== false,
    canUseInExternalOutput: config.allowExternalOutput === true,
    refreshPolicy: config.refreshPolicy || 'onDemand',
    claimKey: record.claimKey || '',
    claimValue: record.claimValue || '',
    retainRaw: config.retainRaw === true,
    sessionId,
    appId,
  };
};

const filterByDomainPolicy = (items = [], config = {}) =>
  items.filter((item) => {
    const hostname = getHostname(item.url || item.link || '');
    if (!hostname) {
      return true;
    }

    const blockedDomains = Array.isArray(config.blockedDomains) ? config.blockedDomains : [];
    if (domainMatches(hostname, blockedDomains)) {
      return false;
    }

    const allowedDomains = Array.isArray(config.allowedDomains) ? config.allowedDomains : [];
    return allowedDomains.length === 0 || domainMatches(hostname, allowedDomains);
  });

const queryGenericWebSearchProvider = async ({
  config = {},
  keyword = '',
  sessionId = '',
  appId = '',
} = {}) => {
  const retrievedAt = nowIso();
  const startedAt = nowIso();
  const limit = Number(config.defaultLimit || 5);
  const url = buildProviderUrl(config, keyword, limit);
  const method = normalizeText(config.method || 'GET').toUpperCase();
  let response = null;

  try {
    response = await fetch(url, {
      method,
      headers: {
        ...buildHeaders(config),
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(method === 'GET'
        ? {}
        : {
            body: JSON.stringify({
              [config.queryParam || 'q']: keyword,
              [config.limitParam || 'limit']: limit,
              freshness: config.freshness || 'month',
            }),
          }),
    });

    if (!response.ok) {
      throw new Error(`provider ${config.provider || config.id} returned ${response.status}`);
    }

    const payload = await safeJson(response);
    const items = filterByDomainPolicy(extractItems(payload), config).slice(0, limit);
    const sources = items.map((item, index) =>
      normalizeProviderResult({
        item,
        index,
        config,
        keyword,
        retrievedAt,
        sessionId,
        appId,
      }),
    );

    appendExternalProviderCallLog({
      provider: config.provider || config.providerName || 'generic_web_search',
      sourceType: 'web_search',
      keyword,
      status: 'success',
      resultCount: sources.length,
      startedAt,
      finishedAt: nowIso(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      httpStatus: response.status,
      endpointHost: getEndpointHost(url),
      hasApiKey: Boolean(config.apiKey),
      items: sources,
    });

    return sources;
  } catch (error) {
    appendExternalProviderCallLog({
      provider: config.provider || config.providerName || 'generic_web_search',
      sourceType: 'web_search',
      keyword,
      status: 'failed',
      reason: error.message,
      resultCount: 0,
      startedAt,
      finishedAt: nowIso(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      httpStatus: response?.status || null,
      endpointHost: getEndpointHost(url),
      hasApiKey: Boolean(config.apiKey),
    });
    throw error;
  }
};

export const runMockWebSearchConnector = async ({
  keyword = '',
  sessionId = '',
  appId = '',
} = {}) => {
  const query = normalizeText(keyword) || '公开主体';
  const retrievedAt = nowLocalIso();
  const encodedQuery = encodeURIComponent(query);

  return [
    {
      rawId: `official_web_${Buffer.from(query).toString('hex').slice(0, 12)}`,
      sourceType: 'web_search',
      sourceName: 'Mock 官方网站公告页',
      provider: 'mock_web_search',
      category: 'official_web',
      title: `${query} 官方公告与资料页`,
      summary: `${query} 官方网站公开资料显示，当前资料页仍在更新，适合作为背景和事实补充来源。`,
      content: [
        `${query} 官方网站公开说明：资料页正常更新。`,
        '该条目用于验证 official_web 分类、P2 优先级和引用追溯能力。',
      ].join('\n'),
      url: `https://official.example.com/search?q=${encodedQuery}`,
      retrievedAt,
      updatedAt: retrievedAt,
      publishedAt: retrievedAt,
      externalAvailable: true,
      canUseInExternalOutput: true,
      refreshPolicy: 'weekly',
      sessionId,
      appId,
    },
    {
      rawId: `general_web_conflict_${Buffer.from(query).toString('hex').slice(0, 12)}`,
      sourceType: 'web_search',
      sourceName: 'Mock 普通网页转载',
      provider: 'mock_web_search',
      category: 'general_web',
      title: `${query} 普通网页转载信息`,
      summary: `${query} 的普通网页转载称主体状态可能已停业，该说法来源不明，不能直接作为事实。`,
      content: [
        `${query} 普通网页转载：主体状态可能已停业。`,
        '该条目刻意与权威 mock paid_api 的经营状态形成冲突，用于验证 conflicts 治理。',
      ].join('\n'),
      url: `https://example-blog.invalid/articles/${encodedQuery}`,
      retrievedAt,
      updatedAt: '2025-01-12T09:00:00+08:00',
      publishedAt: '2025-01-12T09:00:00+08:00',
      externalAvailable: true,
      canUseInExternalOutput: false,
      refreshPolicy: 'onDemand',
      claimKey: `${query}:经营状态`,
      claimValue: '停业',
      sessionId,
      appId,
    },
    {
      rawId: `web_duplicate_${Buffer.from(query).toString('hex').slice(0, 12)}`,
      sourceType: 'web_search',
      sourceName: 'Mock 网页聚合结果',
      provider: 'mock_web_search',
      category: 'general_web',
      title: `${query} 官方公告与资料页`,
      summary: `${query} 官方网站公开资料显示，当前资料页仍在更新，适合作为背景和事实补充来源。`,
      content: `${query} 官方网站公开说明：资料页正常更新。`,
      url: `https://aggregator.example.invalid/official?q=${encodedQuery}`,
      retrievedAt,
      updatedAt: retrievedAt,
      publishedAt: retrievedAt,
      externalAvailable: true,
      canUseInExternalOutput: false,
      refreshPolicy: 'onDemand',
      sessionId,
      appId,
    },
  ];
};

export const runWebSearchConnector = async ({
  keyword = '',
  sessionId = '',
  appId = '',
  useMockFallback = true,
} = {}) => {
  const configs = listExternalDataSourceRuntimeConfigs({ family: 'web_search' });
  const sources = [];
  const providerStates = [];

  for (const config of configs) {
    const provider = config.provider || config.providerName || config.id || 'generic_web_search';

    if (!config.runtimeReady) {
      appendExternalProviderCallLog({
        provider,
        sourceType: 'web_search',
        keyword,
        status: config.runtimeStatus || 'unavailable',
        reason: config.runtimeBlockers?.[0]?.message || config.healthMessage || 'provider unavailable',
        resultCount: 0,
        finishedAt: nowIso(),
        hasApiKey: Boolean(config.apiKey),
      });
      providerStates.push({
        provider,
        sourceType: 'web_search',
        status: config.runtimeStatus || 'unavailable',
        reason: config.runtimeBlockers?.[0]?.message || config.healthMessage || 'provider unavailable',
      });
      continue;
    }

    try {
      const providerSources = await queryGenericWebSearchProvider({
        config,
        keyword,
        sessionId,
        appId,
      });
      sources.push(...providerSources);
      providerStates.push({
        provider,
        sourceType: 'web_search',
        status: 'success',
        resultCount: providerSources.length,
      });
    } catch (error) {
      providerStates.push({
        provider,
        sourceType: 'web_search',
        status: 'failed',
        reason: error.message,
        resultCount: 0,
      });
    }
  }

  const hasExecutedRealProvider = providerStates.some((item) => item.status === 'success');

  if (sources.length === 0 && useMockFallback && !hasExecutedRealProvider) {
    const mockSources = await runMockWebSearchConnector({ keyword, sessionId, appId });
    appendExternalProviderCallLog({
      provider: 'mock_web_search',
      sourceType: 'web_search',
      keyword,
      status: 'mock_fallback',
      reason: configs.length
        ? '真实 web_search provider 暂不可用，已使用 mock provider 验证治理链路。'
        : '未配置真实 web_search provider，已使用 mock provider 验证治理链路。',
      resultCount: mockSources.length,
      finishedAt: nowIso(),
      items: mockSources,
    });
    return {
      sources: mockSources,
      providerStates: [
        ...providerStates,
        {
          provider: 'mock_web_search',
          sourceType: 'web_search',
          status: 'mock_fallback',
          reason: configs.length
            ? '真实 web_search provider 暂不可用，已使用 mock provider 验证治理链路。'
            : '未配置真实 web_search provider，已使用 mock provider 验证治理链路。',
          resultCount: mockSources.length,
        },
      ],
    };
  }

  if (configs.length === 0) {
    appendExternalProviderCallLog({
      provider: 'generic_web_search',
      sourceType: 'web_search',
      keyword,
      status: 'unconfigured',
      reason: '未配置真实 web_search provider。',
      resultCount: 0,
      finishedAt: nowIso(),
    });
    providerStates.push({
      provider: 'generic_web_search',
      sourceType: 'web_search',
      status: 'unconfigured',
      reason: '未配置真实 web_search provider。',
      resultCount: 0,
    });
  }

  return {
    sources,
    providerStates,
  };
};
