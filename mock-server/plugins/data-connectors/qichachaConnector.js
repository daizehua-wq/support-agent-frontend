import {
  classifyPaidApiProviderFailure,
  queryPaidApiProvider,
} from './paidApiConnector.js';
import { nowLocalIso } from '../../utils/localTime.js';

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeEndpointParts = (config = {}) => {
  const defaultBaseUrl = 'https://api.qichacha.com';
  const defaultApiPath = '/EnterpriseInfo/Verify';
  const baseUrl = normalizeText(config.baseUrl) || defaultBaseUrl;
  const apiPath = normalizeText(config.apiPath) || defaultApiPath;
  const endpointCandidate = /^https?:\/\//i.test(apiPath) ? apiPath : baseUrl;

  try {
    const url = new URL(endpointCandidate);
    const baseHasEndpointPath =
      endpointCandidate === baseUrl &&
      !/^https?:\/\//i.test(apiPath) &&
      url.pathname &&
      url.pathname !== '/';

    if (/^https?:\/\//i.test(apiPath) || baseHasEndpointPath) {
      return {
        baseUrl: url.origin,
        apiPath: `${url.pathname}${url.search}` || defaultApiPath,
      };
    }
  } catch (error) {
    // Keep the user's configured values; queryPaidApiProvider will return a
    // provider-specific failure instead of routing through Python runtime.
  }

  return {
    baseUrl,
    apiPath: apiPath.startsWith('/') ? apiPath : `/${apiPath}`,
  };
};

const getNestedQueryValue = (value = {}, key = '') => {
  if (!isPlainObject(value) || !key) {
    return '';
  }

  return normalizeText(value[key]);
};

const resolveKeyword = (runtimePayload = {}) => {
  const requestBody = isPlainObject(runtimePayload.requestBody) ? runtimePayload.requestBody : {};
  const queryParams = isPlainObject(runtimePayload.queryParams) ? runtimePayload.queryParams : {};
  const source = isPlainObject(runtimePayload.source) ? runtimePayload.source : {};
  const configuredQueryParam = normalizeText(source.queryParam) || 'keyword';

  return (
    normalizeText(runtimePayload.query) ||
    normalizeText(runtimePayload.keyword) ||
    normalizeText(runtimePayload.companyName) ||
    getNestedQueryValue(requestBody, 'query') ||
    getNestedQueryValue(requestBody, 'keyword') ||
    getNestedQueryValue(requestBody, 'companyName') ||
    getNestedQueryValue(queryParams, configuredQueryParam) ||
    getNestedQueryValue(queryParams, 'keyword') ||
    getNestedQueryValue(queryParams, 'q') ||
    '公开主体'
  );
};

const buildQichachaRuntimeConfig = (sourceConfig = {}, runtimePayload = {}) => {
  const endpointParts = normalizeEndpointParts(sourceConfig);

  return {
    ...sourceConfig,
    ...endpointParts,
    provider: 'qichacha',
    providerName: '企查查',
    sourceType: 'paid_api',
    integrationMode: 'node_connector',
    connector: 'qichacha',
    runtimeProvider: null,
    method: normalizeText(runtimePayload.httpMethod || sourceConfig.method || 'GET').toUpperCase(),
    queryParam: normalizeText(sourceConfig.queryParam) || 'keyword',
    limitParam: normalizeText(sourceConfig.limitParam) || 'limit',
    defaultLimit: Number(runtimePayload.pageSize || sourceConfig.defaultLimit || 5),
  };
};

export const isQichachaPaidApiSource = (sourceConfig = {}) =>
  normalizeText(sourceConfig.sourceType) === 'paid_api' &&
  normalizeText(sourceConfig.provider).toLowerCase() === 'qichacha';

export const queryQichachaConnector = async ({
  sourceConfig = {},
  runtimePayload = {},
} = {}) => {
  const executedAt = nowLocalIso();
  const config = buildQichachaRuntimeConfig(sourceConfig, runtimePayload);
  const keyword = resolveKeyword({
    ...runtimePayload,
    source: {
      ...(runtimePayload.source || {}),
      queryParam: config.queryParam,
    },
  });

  try {
    const evidenceCandidates = await queryPaidApiProvider({
      config,
      keyword,
      sessionId: runtimePayload.sessionId || '',
      appId: runtimePayload.appId || '',
    });

    return {
      action: 'query',
      provider: 'qichacha',
      providerName: '企查查',
      sourceType: 'paid_api',
      integrationMode: 'node_connector',
      connector: 'qichacha',
      runtimeProvider: null,
      status: 'success',
      reason: '',
      query: keyword,
      resultCount: evidenceCandidates.length,
      results: evidenceCandidates,
      evidenceCandidates,
      executedAt,
      technicalDetails: {
        endpointHost: 'api.qichacha.com',
        baseUrl: config.baseUrl,
        apiPath: config.apiPath,
        hasApiKey: Boolean(normalizeText(config.apiKey)),
        hasSecretKey: Boolean(normalizeText(config.secretKey)),
        hasToken: Boolean(normalizeText(config.token)),
        usesPythonRuntime: false,
      },
    };
  } catch (error) {
    const reason = classifyPaidApiProviderFailure({
      provider: 'qichacha',
      error,
      httpStatus: error?.httpStatus || null,
    });

    return {
      action: 'query',
      degraded: true,
      provider: 'qichacha',
      providerName: '企查查',
      sourceType: 'paid_api',
      integrationMode: 'node_connector',
      connector: 'qichacha',
      runtimeProvider: null,
      status: reason.includes('网络') ? 'unavailable' : 'failed',
      reason,
      query: keyword,
      resultCount: 0,
      results: [],
      evidenceCandidates: [],
      executedAt,
      error: {
        code: 'QICHACHA_PROVIDER_FAILED',
        message: reason,
      },
      degradation: {
        code: 'QICHACHA_PROVIDER_FAILED',
        message: '企查查连接失败，已降级处理。',
        provider: 'qichacha',
        sourceType: 'paid_api',
        runtime: {
          provider: null,
          status: 'node-connector-failed',
          reason,
        },
      },
      technicalDetails: {
        baseUrl: config.baseUrl,
        apiPath: config.apiPath,
        httpStatus: error?.httpStatus || null,
        providerMessage: normalizeText(error?.providerMessage),
        hasApiKey: Boolean(normalizeText(config.apiKey)),
        hasSecretKey: Boolean(normalizeText(config.secretKey)),
        hasToken: Boolean(normalizeText(config.token)),
        usesPythonRuntime: false,
      },
    };
  }
};
