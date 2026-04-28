import { createHash } from 'node:crypto';
import { listExternalDataSourceRuntimeConfigs } from '../../services/externalDataSourceService.js';
import { appendExternalProviderCallLog } from '../../services/externalProviderCallLogService.js';
import { nowLocalIso } from '../../utils/localTime.js';

const normalizeText = (value = '') => String(value || '').trim();

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
    payload.records,
    payload.Result,
    payload.result,
    payload.Data,
    payload.data?.items,
    payload.data?.results,
    payload.data?.records,
    payload.data?.Result,
    payload.data?.result,
    payload.data,
  ];
  for (const matched of candidates) {
    if (Array.isArray(matched)) {
      return matched;
    }
    if (isPlainObject(matched)) {
      return [matched];
    }
  }

  return Array.isArray(payload) ? payload : [];
};

const isSuccessfulProviderStatus = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return !normalized || normalized === '200' || normalized === '0' || normalized === 'success' || normalized === 'ok';
};

const buildProviderUrl = (config = {}, keyword = '', limit = 5) => {
  const baseUrl = normalizeText(config.baseUrl);
  const apiPath = normalizeText(config.apiPath);
  const isAbsoluteApiPath = /^https?:\/\//i.test(apiPath);
  const url = new URL(
    isAbsoluteApiPath
      ? apiPath
      : apiPath
        ? apiPath.replace(/^\/+/, '')
        : baseUrl,
    !isAbsoluteApiPath && apiPath ? `${baseUrl.replace(/\/+$/, '')}/` : undefined,
  );
  const queryParam = config.queryParam || 'q';
  const limitParam = config.limitParam || 'limit';

  if (queryParam && keyword) {
    url.searchParams.set(queryParam, keyword);
  }
  if (limitParam && limit) {
    url.searchParams.set(limitParam, String(limit));
  }
  if (normalizeText(config.provider) === 'qichacha' && normalizeText(config.apiKey) && !url.searchParams.has('key')) {
    url.searchParams.set('key', normalizeText(config.apiKey));
  }

  return url;
};

const buildQichachaAuthHeaders = (config = {}) => {
  const apiKey = normalizeText(config.apiKey);
  const secretKey = normalizeText(config.secretKey);
  const configuredToken = normalizeText(config.token);
  const timespan = String(Math.floor(Date.now() / 1000));
  const token =
    configuredToken ||
    (apiKey && secretKey
      ? createHash('md5')
          .update(`${apiKey}${timespan}${secretKey}`)
          .digest('hex')
          .toUpperCase()
      : '');

  return {
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
    ...(token ? { Token: token } : {}),
    ...(timespan && token ? { Timespan: timespan } : {}),
  };
};

const buildHeaders = (config = {}) => {
  const headers = {
    accept: 'application/json',
  };
  const apiKey = normalizeText(config.apiKey);
  const token = normalizeText(config.token);

  if (normalizeText(config.provider) === 'qichacha') {
    return {
      ...headers,
      ...buildQichachaAuthHeaders(config),
    };
  }

  if (!apiKey) {
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  if (config.authType === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  headers['x-api-key'] = apiKey;
  if (normalizeText(config.secretKey)) {
    headers['x-secret-key'] = normalizeText(config.secretKey);
  }
  return headers;
};

const getEndpointHost = (url = null) => {
  try {
    return url ? url.hostname : '';
  } catch (error) {
    return '';
  }
};

export const classifyPaidApiProviderFailure = ({
  provider = '',
  error = null,
  httpStatus = null,
} = {}) => {
  const normalizedProvider = normalizeText(provider);
  const message = normalizeText(error?.message || error);
  const status = Number(httpStatus || error?.httpStatus || 0);
  const raw = `${message} ${normalizeText(error?.providerMessage)}`.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    raw.includes('unauthorized') ||
    raw.includes('invalid key') ||
    raw.includes('key 无效') ||
    raw.includes('密钥无效') ||
    raw.includes('token 无效') ||
    raw.includes('验签失败') ||
    raw.includes('验证失败')
  ) {
    return normalizedProvider === 'qichacha' ? '企查查 API Key 无效。' : 'API Key 无效。';
  }

  if (
    status === 402 ||
    status === 429 ||
    raw.includes('quota') ||
    raw.includes('rate limit') ||
    raw.includes('余额') ||
    raw.includes('额度')
  ) {
    return normalizedProvider === 'qichacha' ? '企查查调用额度不足。' : '服务商调用额度不足。';
  }

  if (
    raw.includes('fetch failed') ||
    raw.includes('econnrefused') ||
    raw.includes('enotfound') ||
    raw.includes('network') ||
    raw.includes('timeout')
  ) {
    return normalizedProvider === 'qichacha' ? '企查查网络不可用。' : '服务商网络不可用。';
  }

  return normalizedProvider === 'qichacha' ? '企查查接口调用失败。' : '权威数据库接口调用失败。';
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
  const title =
    normalizeText(
      record.title ||
        record.name ||
        record.Name ||
        record.companyName ||
        record.CompanyName ||
        record.subject,
    ) ||
    `${keyword || config.providerName || '权威数据'} 记录 ${index + 1}`;
  const summary =
    normalizeText(
      record.summary ||
        record.description ||
        record.abstract ||
        record.statusText ||
        record.Status ||
        record.EntStatus,
    ) ||
    normalizeText(record.content || record.text || record.remark) ||
    `${title} 的权威数据库返回记录。`;
  const content =
    normalizeText(record.content || record.text || record.detail) ||
    [title, summary].filter(Boolean).join('\n');

  return {
    rawId:
      normalizeText(record.id || record.rawId || record.recordId || record.creditCode || record.CreditCode) ||
      `paid_api_${config.id || config.provider || 'generic'}_${index + 1}`,
    sourceType: 'paid_api',
    sourceName: config.name || config.providerName || 'Generic Paid API',
    provider: config.provider || config.providerName || 'generic_paid_api',
    category: 'paid_authoritative_data',
    title,
    summary,
    content,
    url: record.url || record.link || null,
    retrievedAt,
    updatedAt: record.updatedAt || record.updateTime || retrievedAt,
    publishedAt: record.publishedAt || record.publishTime || null,
    structured: true,
    externalAvailable: config.externalAvailable !== false,
    canUseInExternalOutput: config.allowExternalOutput === true,
    refreshPolicy: config.refreshPolicy || 'manual',
    claimKey: record.claimKey || record.CreditCode || '',
    claimValue: record.claimValue || record.EntStatus || record.Status || '',
    retainRaw: config.retainRaw === true,
    sessionId,
    appId,
  };
};

export const queryPaidApiProvider = async ({
  config = {},
  keyword = '',
  sessionId = '',
  appId = '',
} = {}) => {
  const retrievedAt = nowIso();
  const startedAt = nowIso();
  const limit = Number(config.defaultLimit || 5);
  let url = null;
  const method = normalizeText(config.method || 'GET').toUpperCase();
  const headers = buildHeaders(config);
  let response = null;

  try {
    url = buildProviderUrl(config, keyword, limit);
    response = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(method === 'GET'
        ? {}
        : {
            body: JSON.stringify({
              [config.queryParam || 'q']: keyword,
              [config.limitParam || 'limit']: limit,
            }),
          }),
    });

    if (!response.ok) {
      const errorPayload = await safeJson(response);
      const error = new Error(`provider ${config.provider || config.id} returned ${response.status}`);
      error.httpStatus = response.status;
      error.providerPayload = errorPayload;
      error.providerMessage =
        normalizeText(errorPayload?.message || errorPayload?.error || errorPayload?.statusText) ||
        normalizeText(errorPayload?.text);
      throw error;
    }

    const payload = await safeJson(response);
    const providerStatus = normalizeText(payload?.Status || payload?.status || payload?.Code || payload?.code);
    if (normalizeText(config.provider) === 'qichacha' && !isSuccessfulProviderStatus(providerStatus)) {
      const error = new Error(`provider qichacha returned business status ${providerStatus}`);
      error.httpStatus = response.status;
      error.providerPayload = payload;
      error.providerMessage =
        normalizeText(payload?.Message || payload?.message || payload?.ErrorMessage || payload?.error) ||
        `企查查返回业务状态 ${providerStatus}`;
      throw error;
    }
    const items = extractItems(payload).slice(0, limit);
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
      provider: config.provider || config.providerName || 'generic_paid_api',
      sourceType: 'paid_api',
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
      provider: config.provider || config.providerName || 'generic_paid_api',
      sourceType: 'paid_api',
      keyword,
      status: 'failed',
      reason: classifyPaidApiProviderFailure({
        provider: config.provider || config.providerName || 'generic_paid_api',
        error,
        httpStatus: response?.status || null,
      }),
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

export const runMockPaidApiConnector = async ({
  keyword = '',
  sessionId = '',
  appId = '',
} = {}) => {
  const query = normalizeText(keyword) || '公开主体';
  const retrievedAt = nowLocalIso();
  const provider = 'mock_paid_api';

  return [
    {
      rawId: `paid_api_business_${Buffer.from(query).toString('hex').slice(0, 12)}`,
      sourceType: 'paid_api',
      sourceName: 'Mock 权威工商数据库',
      provider,
      category: 'paid_authoritative_data',
      title: `${query} 权威工商与经营状态记录`,
      summary: `${query} 在 mock 权威数据库中的经营状态为存续，主体信息完整，近 30 日未发现高风险变更。`,
      content: [
        `${query} mock 工商记录：经营状态为存续。`,
        '统一社会信用代码、注册地址、经营范围等字段均已结构化返回。',
        '本记录来自第一阶段 mock paid_api connector，不包含真实供应商数据或真实 API Key。',
      ].join('\n'),
      url: null,
      retrievedAt,
      updatedAt: retrievedAt,
      publishedAt: null,
      structured: true,
      externalAvailable: true,
      canUseInExternalOutput: false,
      refreshPolicy: 'manual',
      claimKey: `${query}:经营状态`,
      claimValue: '存续',
      sessionId,
      appId,
    },
    {
      rawId: `paid_api_risk_${Buffer.from(query).toString('hex').slice(0, 12)}`,
      sourceType: 'paid_api',
      sourceName: 'Mock 权威风险数据库',
      provider,
      category: 'paid_authoritative_data',
      title: `${query} 权威风险与公告记录`,
      summary: `${query} 的 mock 风险库结果显示：未命中法院公告、监管处罚或重大经营异常。`,
      content: [
        `${query} mock 风险记录：未命中重大风险。`,
        '风险记录按法院公告、监管处罚、招投标异常、专利争议四类聚合。',
      ].join('\n'),
      url: null,
      retrievedAt,
      updatedAt: retrievedAt,
      structured: true,
      externalAvailable: true,
      canUseInExternalOutput: false,
      refreshPolicy: 'manual',
      sessionId,
      appId,
    },
  ];
};

export const runPaidApiConnector = async ({
  keyword = '',
  sessionId = '',
  appId = '',
  useMockFallback = true,
} = {}) => {
  const configs = listExternalDataSourceRuntimeConfigs({ family: 'paid_api' });
  const sources = [];
  const providerStates = [];

  for (const config of configs) {
    const provider = config.provider || config.providerName || config.id || 'generic_paid_api';

    if (!config.runtimeReady) {
      appendExternalProviderCallLog({
        provider,
        sourceType: 'paid_api',
        keyword,
        status: config.runtimeStatus || 'unavailable',
        reason: config.runtimeBlockers?.[0]?.message || config.healthMessage || 'provider unavailable',
        resultCount: 0,
        finishedAt: nowIso(),
        hasApiKey: Boolean(config.apiKey),
      });
      providerStates.push({
        provider,
        sourceType: 'paid_api',
        status: config.runtimeStatus || 'unavailable',
        reason: config.runtimeBlockers?.[0]?.message || config.healthMessage || 'provider unavailable',
      });
      continue;
    }

    try {
      const providerSources = await queryPaidApiProvider({
        config,
        keyword,
        sessionId,
        appId,
      });
      sources.push(...providerSources);
      providerStates.push({
        provider,
        sourceType: 'paid_api',
        status: 'success',
        resultCount: providerSources.length,
      });
    } catch (error) {
      providerStates.push({
        provider,
        sourceType: 'paid_api',
        status: 'failed',
        reason: error.message,
        resultCount: 0,
      });
    }
  }

  const hasExecutedRealProvider = providerStates.some((item) => item.status === 'success');

  if (sources.length === 0 && useMockFallback && !hasExecutedRealProvider) {
    const mockSources = await runMockPaidApiConnector({ keyword, sessionId, appId });
    appendExternalProviderCallLog({
      provider: 'mock_paid_api',
      sourceType: 'paid_api',
      keyword,
      status: 'mock_fallback',
      reason: configs.length
        ? '真实 paid_api provider 暂不可用，已使用 mock provider 验证治理链路。'
        : '未配置真实 paid_api provider，已使用 mock provider 验证治理链路。',
      resultCount: mockSources.length,
      finishedAt: nowIso(),
      items: mockSources,
    });
    return {
      sources: mockSources,
      providerStates: [
        ...providerStates,
        {
          provider: 'mock_paid_api',
          sourceType: 'paid_api',
          status: 'mock_fallback',
          reason: configs.length
            ? '真实 paid_api provider 暂不可用，已使用 mock provider 验证治理链路。'
            : '未配置真实 paid_api provider，已使用 mock provider 验证治理链路。',
          resultCount: mockSources.length,
        },
      ],
    };
  }

  if (configs.length === 0) {
    appendExternalProviderCallLog({
      provider: 'generic_paid_api',
      sourceType: 'paid_api',
      keyword,
      status: 'unconfigured',
      reason: '未配置真实 paid_api provider。',
      resultCount: 0,
      finishedAt: nowIso(),
    });
    providerStates.push({
      provider: 'generic_paid_api',
      sourceType: 'paid_api',
      status: 'unconfigured',
      reason: '未配置真实 paid_api provider。',
      resultCount: 0,
    });
  }

  return {
    sources,
    providerStates,
  };
};
