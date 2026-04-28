import { readJsonFile, writeJsonFile } from './jsonDataService.js';
import { readSettings } from './settingsService.js';
import { nowLocalIso } from '../utils/localTime.js';
import {
  materializeExternalDataSourceSecrets,
  resolveExternalDataSourceSecrets,
} from './secretVaultService.js';

const EXTERNAL_DATA_SOURCES_FILENAME = 'externalDataSources.json';

const SOURCE_TYPES = new Set([
  'paid_api',
  'web_search',
  'official_site',
  'internal_database',
  'paid-database',
  'search-api',
  'open-data',
  'web-search',
]);
const PAID_API_SOURCE_TYPES = new Set(['paid_api', 'paid-database', 'open-data']);
const WEB_SEARCH_SOURCE_TYPES = new Set([
  'web_search',
  'web-search',
  'search-api',
  'official_site',
]);
const AUTH_TYPES = new Set(['none', 'api-key', 'bearer', 'basic']);
const OUTBOUND_POLICIES = new Set(['blocked', 'masked-only']);
const CAPABILITIES = new Set(['search', 'company_lookup', 'risk_lookup', 'fetch-detail', 'download']);
const ACTION_CAPABILITY_MAP = Object.freeze({
  query: 'search',
  fetch: 'fetch-detail',
  download: 'download',
});

const normalizeText = (value = '') => String(value || '').trim();

const PROVIDER_PRESETS = Object.freeze({
  qichacha: {
    providerTemplate: 'qichacha',
    sourceCategory: 'authoritative_database',
    provider: 'qichacha',
    providerName: '企查查',
    sourceType: 'paid_api',
    integrationMode: 'node_connector',
    connector: 'qichacha',
    runtimeProvider: null,
    authType: 'api-key',
    priority: 'P1',
    baseUrl: 'https://api.qichacha.com',
    apiPath: '/EnterpriseInfo/Verify',
    method: 'GET',
    queryParam: 'keyword',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    externalAvailable: true,
    retainRaw: false,
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    capabilities: ['search', 'company_lookup', 'risk_lookup'],
    allowedDomains: ['api.qichacha.com'],
    blockedDomains: [],
    requiresSecretKey: true,
  },
  tavily: {
    providerTemplate: 'tavily',
    sourceCategory: 'web_search',
    provider: 'tavily',
    providerName: 'Tavily',
    sourceType: 'web_search',
    authType: 'api-key',
    priority: 'P4',
    baseUrl: 'https://api.tavily.com',
    apiPath: '/search',
    method: 'POST',
    queryParam: 'query',
    limitParam: 'max_results',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    externalAvailable: true,
    retainRaw: false,
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    capabilities: ['search'],
  },
  bing_search: {
    providerTemplate: 'bing_search',
    sourceCategory: 'web_search',
    provider: 'bing_search',
    providerName: 'Bing Search',
    sourceType: 'web_search',
    authType: 'api-key',
    priority: 'P4',
    baseUrl: 'https://api.bing.microsoft.com',
    apiPath: '/v7.0/search',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'count',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    externalAvailable: true,
    retainRaw: false,
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    capabilities: ['search'],
  },
  serpapi: {
    providerTemplate: 'serpapi',
    sourceCategory: 'web_search',
    provider: 'serpapi',
    providerName: 'SerpAPI',
    sourceType: 'web_search',
    authType: 'api-key',
    priority: 'P4',
    baseUrl: 'https://serpapi.com',
    apiPath: '/search.json',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'num',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    externalAvailable: true,
    retainRaw: false,
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    capabilities: ['search'],
  },
});

const normalizeBoolean = (value, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const normalizeStringArray = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const normalizeDomainArray = (value = []) =>
  normalizeStringArray(value)
    .map((item) => {
      try {
        const normalized = item.includes('://') ? new URL(item).hostname : item.split('/')[0];
        return normalizeText(normalized).toLowerCase();
      } catch (error) {
        return normalizeText(item).toLowerCase();
      }
    })
    .filter(Boolean);

const normalizeCapabilityArray = (value = []) => {
  return normalizeStringArray(value).filter((item) => CAPABILITIES.has(item));
};

const normalizeSourceType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return SOURCE_TYPES.has(normalized) ? normalized : 'search-api';
};

const normalizeProviderKey = (value = '') =>
  normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeProviderAlias = (value = '') =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');

const resolveProviderPreset = (item = {}) => {
  const candidates = [
    item.providerTemplate,
    item.provider,
    item.providerName,
    item.name,
  ].map(normalizeProviderAlias);

  if (candidates.some((value) => value === 'qichacha' || value.includes('企查查'))) {
    return PROVIDER_PRESETS.qichacha;
  }
  if (candidates.some((value) => value === 'tavily')) {
    return PROVIDER_PRESETS.tavily;
  }
  if (candidates.some((value) => value === 'bing_search' || value === 'bing')) {
    return PROVIDER_PRESETS.bing_search;
  }
  if (candidates.some((value) => value === 'serpapi' || value === 'serp_api')) {
    return PROVIDER_PRESETS.serpapi;
  }

  return null;
};

const applyProviderPreset = (item = {}) => {
  const preset = resolveProviderPreset(item);
  if (!preset) {
    return item;
  }

  const merged = {
    ...preset,
    ...item,
    providerTemplate: normalizeText(item.providerTemplate) || preset.providerTemplate,
    sourceCategory: normalizeText(item.sourceCategory) || preset.sourceCategory,
    provider: preset.provider,
    providerName: preset.providerName,
    sourceType: preset.sourceType,
    authType: normalizeText(item.authType) || preset.authType,
    integrationMode: normalizeText(item.integrationMode) || preset.integrationMode,
    connector: normalizeText(item.connector) || preset.connector,
    runtimeProvider:
      item.runtimeProvider === null
        ? null
        : normalizeText(item.runtimeProvider) || preset.runtimeProvider || '',
    priority: normalizeText(item.priority) || preset.priority,
    baseUrl: normalizeText(item.baseUrl) || preset.baseUrl,
    apiPath: normalizeText(item.apiPath) || preset.apiPath,
    method: normalizeText(item.method || item.httpMethod) || preset.method,
    queryParam: normalizeText(item.queryParam) || preset.queryParam,
    limitParam: normalizeText(item.limitParam) || preset.limitParam,
    capabilities: normalizeStringArray(item.capabilities).length
      ? item.capabilities
      : preset.capabilities,
    allowedDomains: normalizeStringArray(item.allowedDomains).length
      ? item.allowedDomains
      : preset.allowedDomains,
    blockedDomains: normalizeStringArray(item.blockedDomains).length
      ? item.blockedDomains
      : preset.blockedDomains,
    externalAvailable:
      typeof item.externalAvailable === 'boolean' ? item.externalAvailable : preset.externalAvailable,
    retainRaw: typeof item.retainRaw === 'boolean' ? item.retainRaw : preset.retainRaw,
    publicDataOnly:
      typeof item.publicDataOnly === 'boolean' ? item.publicDataOnly : preset.publicDataOnly,
    localDataOutboundPolicy: normalizeText(item.localDataOutboundPolicy) || preset.localDataOutboundPolicy,
  };

  if (preset.provider === 'qichacha') {
    return {
      ...merged,
      sourceCategory: 'authoritative_database',
      sourceType: 'paid_api',
      integrationMode: 'node_connector',
      connector: 'qichacha',
      runtimeProvider: null,
      priority: 'P1',
      retainRaw: false,
      externalAvailable: true,
    };
  }

  return merged;
};

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const normalizedKey = normalizeText(key);
    if (normalizedKey && normalizeText(process.env[normalizedKey])) {
      return normalizeText(process.env[normalizedKey]);
    }
  }

  return '';
};

const normalizeAuthType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return AUTH_TYPES.has(normalized) ? normalized : 'none';
};

const normalizeOutboundPolicy = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return OUTBOUND_POLICIES.has(normalized) ? normalized : 'blocked';
};

const inferHealthStatus = (item = {}) => {
  if (item.enabled === false) {
    return 'offline';
  }

  if (!item.baseUrl) {
    return 'warning';
  }

  if ((item.authType === 'api-key' || item.authType === 'bearer') && !item.apiKey) {
    return 'warning';
  }

  if (item.provider === 'qichacha' && !item.secretKey && !item.token) {
    return 'warning';
  }

  if (item.authType === 'basic' && (!item.username || !item.password)) {
    return 'warning';
  }

  return 'healthy';
};

const inferHealthMessage = (item = {}) => {
  if (item.enabled === false) {
    return '当前已停用，仅保留接入位配置。';
  }

  if (!item.baseUrl) {
    return '已保留接入位，待填写供应商 API Base URL。';
  }

  if ((item.authType === 'api-key' || item.authType === 'bearer') && !item.apiKey) {
    return 'API Key 未填写。';
  }

  if (item.provider === 'qichacha' && !item.secretKey && !item.token) {
    return '缺少 Secret Key。';
  }

  if (item.authType === 'basic' && (!item.username || !item.password)) {
    return '已登记数据源，但尚未填写基础认证账号。';
  }

  if (item.provider === 'qichacha') {
    return '连接配置已通过。企查查将作为权威数据库参与 Search 资料治理。';
  }

  return '连接配置已通过。';
};

const buildApiContract = (item = {}) => ({
  configEndpoint: `/api/database-manager/external-sources/${item.id}`,
  healthCheckEndpoint: `/api/database-manager/external-sources/${item.id}/health-check`,
  queryEndpoint: `/api/database-manager/external-sources/${item.id}/query`,
  fetchEndpoint: `/api/database-manager/external-sources/${item.id}/fetch`,
  downloadEndpoint: `/api/database-manager/external-sources/${item.id}/download`,
  futureQueryEndpoint: `/api/database-manager/external-sources/${item.id}/query`,
  futureFetchEndpoint: `/api/database-manager/external-sources/${item.id}/fetch`,
  futureDownloadEndpoint: `/api/database-manager/external-sources/${item.id}/download`,
  integrationBoundary:
    item.sourceType === 'paid_api'
      ? '权威数据库通过 Search 资料治理链路调用，不走 Python Runtime health gate；写作端只能读取治理后的 referencePack。'
      : '互联网搜索类接入可用于 Search 资料治理；运行联调仅允许发送公开查询词或公开资源地址，不上传本地私有资料。',
});

const normalizeExternalDataSource = (item = {}, index = 0) => {
  const source = applyProviderPreset(item);
  const id = normalizeText(source.id) || `external-source-${index + 1}`;
  const normalized = {
    id,
    name: normalizeText(source.name) || `外部数据源 ${index + 1}`,
    provider: normalizeText(source.provider || source.providerName) || normalizeText(source.name) || `Provider ${index + 1}`,
    providerTemplate: normalizeText(source.providerTemplate),
    sourceCategory: normalizeText(source.sourceCategory),
    providerName:
      normalizeText(source.providerName || source.provider) ||
      normalizeText(source.name) ||
      `Provider ${index + 1}`,
    sourceType: normalizeSourceType(source.sourceType),
    integrationMode:
      normalizeText(source.integrationMode) ||
      (source.provider === 'qichacha' && normalizeSourceType(source.sourceType) === 'paid_api'
        ? 'node_connector'
        : 'python_runtime'),
    connector:
      normalizeText(source.connector) ||
      (source.provider === 'qichacha' && normalizeSourceType(source.sourceType) === 'paid_api'
        ? 'qichacha'
        : ''),
    runtimeProvider:
      source.runtimeProvider === null
        ? null
        : normalizeText(source.runtimeProvider) ||
          (source.provider === 'qichacha' && normalizeSourceType(source.sourceType) === 'paid_api'
            ? null
            : 'python-runtime'),
    authType: normalizeAuthType(source.authType),
    enabled: normalizeBoolean(source.enabled, true),
    baseUrl: normalizeText(source.baseUrl),
    apiPath: normalizeText(source.apiPath),
    method: normalizeText(source.method || source.httpMethod || 'GET').toUpperCase(),
    queryParam: normalizeText(source.queryParam) || 'q',
    limitParam: normalizeText(source.limitParam) || 'limit',
    apiKey: normalizeText(source.apiKey),
    secretKey: normalizeText(source.secretKey),
    token: normalizeText(source.token),
    callQuota: Number.isFinite(Number(source.callQuota)) ? Number(source.callQuota) : 0,
    cacheTtlHours: Number.isFinite(Number(source.cacheTtlHours)) ? Number(source.cacheTtlHours) : 24,
    cacheTtl:
      Number.isFinite(Number(source.cacheTtl))
        ? Number(source.cacheTtl)
        : Number.isFinite(Number(source.cacheTtlHours))
          ? Number(source.cacheTtlHours)
          : 24,
    quotaLimit:
      Number.isFinite(Number(source.quotaLimit))
        ? Number(source.quotaLimit)
        : Number.isFinite(Number(source.callQuota))
          ? Number(source.callQuota)
          : 0,
    defaultLimit: Number.isFinite(Number(source.defaultLimit)) ? Number(source.defaultLimit) : 5,
    freshness: normalizeText(source.freshness) || 'month',
    externalAvailable: normalizeBoolean(source.externalAvailable, true),
    allowExternalOutput: normalizeBoolean(source.allowExternalOutput, false),
    priority: normalizeText(source.priority) || 'P3',
    retainRaw: normalizeBoolean(source.retainRaw, false),
    username: normalizeText(source.username),
    password: normalizeText(source.password),
    capabilities: normalizeCapabilityArray(source.capabilities),
    allowedDomains: normalizeDomainArray(source.allowedDomains),
    blockedDomains: normalizeDomainArray(source.blockedDomains),
    publicDataOnly: normalizeBoolean(source.publicDataOnly, true),
    localDataOutboundPolicy: normalizeOutboundPolicy(source.localDataOutboundPolicy),
    headersConfig: normalizeText(source.headersConfig),
    fieldMappings: normalizeText(source.fieldMappings),
    notes: normalizeText(source.notes),
    version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
    lastCheckedAt: normalizeText(source.lastCheckedAt),
  };

  const healthStatus = ['healthy', 'warning', 'offline'].includes(source.healthStatus)
    ? source.healthStatus
    : inferHealthStatus(normalized);

  return {
    ...normalized,
    healthStatus,
    healthMessage: normalizeText(source.healthMessage) || inferHealthMessage(normalized),
    healthCheckResult: source.healthCheckResult || null,
  };
};

const maskSensitiveFields = (item = {}) => ({
  ...item,
  hasApiKey: Boolean(item.apiKey),
  hasSecretKey: Boolean(item.secretKey),
  hasToken: Boolean(item.token),
  hasUsername: Boolean(item.username),
  hasPassword: Boolean(item.password),
  apiContract: buildApiContract(item),
  apiKey: undefined,
  secretKey: undefined,
  token: undefined,
  username: undefined,
  password: undefined,
});

export const readExternalDataSources = () => {
  const payload = readJsonFile(EXTERNAL_DATA_SOURCES_FILENAME, []);
  const list = Array.isArray(payload) ? payload : [];
  return list.map((item, index) => normalizeExternalDataSource(item, index));
};

const getVaultSettings = () => {
  try {
    return readSettings();
  } catch (error) {
    console.warn('[external-data-source] read settings failed, fallback to empty policy:', error.message);
    return {};
  }
};

export const readExternalDataSourcesResolved = () => {
  const rawItems = readExternalDataSources();
  const runtimeSettings = getVaultSettings();
  const { items } = resolveExternalDataSourceSecrets({
    items: rawItems,
    settings: runtimeSettings,
  });

  return Array.isArray(items)
    ? items.map((item, index) => normalizeExternalDataSource(item, index))
    : [];
};

const isRuntimeConfigForFamily = (item = {}, family = '') => {
  const sourceType = normalizeSourceType(item.sourceType);
  if (family === 'paid_api') {
    return PAID_API_SOURCE_TYPES.has(sourceType);
  }

  if (family === 'web_search') {
    return WEB_SEARCH_SOURCE_TYPES.has(sourceType);
  }

  return false;
};

const applyRuntimeEnvFallbacks = (item = {}, family = '') => {
  const providerKey = normalizeProviderKey(item.provider || item.providerName || item.name);
  const familyKey = family === 'paid_api' ? 'GENERIC_PAID_API' : 'GENERIC_WEB_SEARCH';
  const canUseGenericFamilyEnv = providerKey === familyKey;
  const baseUrl = normalizeText(item.baseUrl) || readEnvValue(
    `AP_${providerKey}_BASE_URL`,
    `${providerKey}_BASE_URL`,
    ...(canUseGenericFamilyEnv ? [`AP_${familyKey}_BASE_URL`, `${familyKey}_BASE_URL`] : []),
  );
  const apiKey = normalizeText(item.apiKey) || readEnvValue(
    `AP_${providerKey}_KEY`,
    `${providerKey}_KEY`,
    `AP_${providerKey}_API_KEY`,
    `${providerKey}_API_KEY`,
    ...(canUseGenericFamilyEnv
      ? [`AP_${familyKey}_KEY`, `${familyKey}_KEY`, `AP_${familyKey}_API_KEY`, `${familyKey}_API_KEY`]
      : []),
  );
  const secretKey = normalizeText(item.secretKey) || readEnvValue(
    `AP_${providerKey}_SECRET_KEY`,
    `${providerKey}_SECRET_KEY`,
    `AP_${providerKey}_SECRET`,
    `${providerKey}_SECRET`,
  );
  const token = normalizeText(item.token) || readEnvValue(
    `AP_${providerKey}_TOKEN`,
    `${providerKey}_TOKEN`,
  );
  const apiPath = normalizeText(item.apiPath) || readEnvValue(
    `AP_${providerKey}_PATH`,
    `${providerKey}_PATH`,
    `AP_${providerKey}_API_PATH`,
    `${providerKey}_API_PATH`,
    ...(canUseGenericFamilyEnv
      ? [`AP_${familyKey}_PATH`, `${familyKey}_PATH`, `AP_${familyKey}_API_PATH`, `${familyKey}_API_PATH`]
      : []),
  );
  const authType = normalizeAuthType(item.authType || (apiKey ? 'api-key' : 'none'));

  return normalizeExternalDataSource({
    ...item,
    baseUrl,
    apiKey,
    secretKey,
    token,
    apiPath,
    authType,
  });
};

const buildEnvOnlyRuntimeConfig = (family = '') => {
  const isPaidApi = family === 'paid_api';
  const provider = isPaidApi ? 'generic_paid_api' : 'generic_web_search';
  const familyKey = isPaidApi ? 'GENERIC_PAID_API' : 'GENERIC_WEB_SEARCH';
  const baseUrl = readEnvValue(`AP_${familyKey}_BASE_URL`, `${familyKey}_BASE_URL`);
  const apiKey = readEnvValue(
    `AP_${familyKey}_KEY`,
    `${familyKey}_KEY`,
    `AP_${familyKey}_API_KEY`,
    `${familyKey}_API_KEY`,
  );
  const apiPath = readEnvValue(
    `AP_${familyKey}_PATH`,
    `${familyKey}_PATH`,
    `AP_${familyKey}_API_PATH`,
    `${familyKey}_API_PATH`,
  );
  const token = readEnvValue(`AP_${familyKey}_TOKEN`, `${familyKey}_TOKEN`);

  if (!baseUrl && !apiKey && !apiPath) {
    return null;
  }

  return normalizeExternalDataSource({
    id: `env-${provider}`,
    name: isPaidApi ? 'Generic Paid API' : 'Generic Web Search',
    provider,
    providerName: provider,
    sourceType: isPaidApi ? 'paid_api' : 'web_search',
    authType: 'api-key',
    enabled: true,
    baseUrl,
    apiPath,
    apiKey,
    token,
    priority: isPaidApi ? 'P1' : 'P4',
    cacheTtlHours: Number(readEnvValue(`AP_${familyKey}_CACHE_TTL`, `${familyKey}_CACHE_TTL`)) || 24,
    defaultLimit: Number(readEnvValue(`AP_${familyKey}_DEFAULT_LIMIT`, `${familyKey}_DEFAULT_LIMIT`)) || 5,
    retainRaw: false,
    capabilities: ['search'],
  });
};

export const listExternalDataSourceRuntimeConfigs = ({ family = '' } = {}) => {
  const normalizedFamily = normalizeText(family).toLowerCase();
  const persistedItems = readExternalDataSourcesResolved()
    .filter((item) => isRuntimeConfigForFamily(item, normalizedFamily))
    .map((item) => applyRuntimeEnvFallbacks(item, normalizedFamily));
  const envOnlyConfig = buildEnvOnlyRuntimeConfig(normalizedFamily);
  const items = envOnlyConfig ? [...persistedItems, envOnlyConfig] : persistedItems;

  return items.map((item) => {
    const readiness = assessExternalDataSourceRuntimeReadiness(item, 'query');
    return {
      ...item,
      runtimeReady: readiness.ready,
      runtimeBlockers: readiness.blockers,
      runtimeSummary: readiness.summary,
      runtimeStatus: readiness.ready ? 'ready' : item.enabled === false ? 'disabled' : 'unavailable',
    };
  });
};

export const saveExternalDataSources = (items = []) => {
  const normalized = Array.isArray(items)
    ? items.map((item, index) => normalizeExternalDataSource(item, index))
    : [];
  const runtimeSettings = getVaultSettings();
  const { items: persistedItems } = materializeExternalDataSourceSecrets({
    items: normalized,
    settings: runtimeSettings,
  });

  writeJsonFile(EXTERNAL_DATA_SOURCES_FILENAME, persistedItems);

  const { items: resolvedItems } = resolveExternalDataSourceSecrets({
    items: persistedItems,
    settings: runtimeSettings,
  });

  return Array.isArray(resolvedItems)
    ? resolvedItems.map((item, index) => normalizeExternalDataSource(item, index))
    : [];
};

export const listExternalDataSources = () => readExternalDataSources().map(maskSensitiveFields);

export const getExternalDataSourceDetail = (sourceId = '') => {
  const normalizedSourceId = normalizeText(sourceId);
  const target = readExternalDataSources().find((item) => item.id === normalizedSourceId);
  return target ? maskSensitiveFields(target) : null;
};

export const getExternalDataSourceRuntimeDetail = (sourceId = '') => {
  const normalizedSourceId = normalizeText(sourceId);
  const target = readExternalDataSourcesResolved().find((item) => item.id === normalizedSourceId);
  return target || null;
};

const validateExternalDataSourceDraft = (draft = {}) => {
  const fieldErrors = [];

  if (!normalizeText(draft.name)) {
    fieldErrors.push({
      field: 'name',
      message: 'name is required',
    });
  }

  if (!SOURCE_TYPES.has(normalizeSourceType(draft.sourceType))) {
    fieldErrors.push({
      field: 'sourceType',
      message: 'sourceType is invalid',
    });
  }

  if (!AUTH_TYPES.has(normalizeAuthType(draft.authType))) {
    fieldErrors.push({
      field: 'authType',
      message: 'authType is invalid',
    });
  }

  return fieldErrors;
};

const buildExternalDataSourceSummary = (items = []) => ({
  totalCount: items.length,
  enabledCount: items.filter((item) => item.enabled !== false).length,
  readyCount: items.filter((item) => item.healthStatus === 'healthy').length,
  blockedOutboundCount: items.filter((item) => item.localDataOutboundPolicy === 'blocked').length,
});

export const buildExternalDataSourceResponseSummary = () => {
  return buildExternalDataSourceSummary(listExternalDataSources());
};

const buildUserReadableHealthCheck = (sourceConfig = {}) => {
  const status = inferHealthStatus(sourceConfig);
  const message = inferHealthMessage(sourceConfig);
  let code = 'CONNECTION_READY';

  if (sourceConfig.enabled === false) {
    code = 'PROVIDER_DISABLED';
  } else if (!normalizeText(sourceConfig.baseUrl)) {
    code = 'PROVIDER_ENDPOINT_MISSING';
  } else if (
    (sourceConfig.authType === 'api-key' || sourceConfig.authType === 'bearer') &&
    !normalizeText(sourceConfig.apiKey)
  ) {
    code = 'API_KEY_MISSING';
  } else if (
    sourceConfig.provider === 'qichacha' &&
    !normalizeText(sourceConfig.secretKey) &&
    !normalizeText(sourceConfig.token)
  ) {
    code = 'SECRET_KEY_MISSING';
  }

  return {
    status,
    code,
    userMessage: message,
    technicalDetails: {
      provider: sourceConfig.provider,
      providerName: sourceConfig.providerName,
      sourceType: sourceConfig.sourceType,
      integrationMode: sourceConfig.integrationMode,
      connector: sourceConfig.connector || (sourceConfig.sourceType === 'paid_api' ? 'paidApiConnector' : 'webSearchConnector'),
      runtimeProvider: sourceConfig.runtimeProvider || null,
      baseUrlConfigured: Boolean(normalizeText(sourceConfig.baseUrl)),
      apiPathConfigured: Boolean(normalizeText(sourceConfig.apiPath)),
      hasApiKey: Boolean(normalizeText(sourceConfig.apiKey)),
      hasSecretKey: Boolean(normalizeText(sourceConfig.secretKey)),
      hasToken: Boolean(normalizeText(sourceConfig.token)),
      usesPythonRuntime: sourceConfig.integrationMode === 'python_runtime',
    },
  };
};

export const assessExternalDataSourceRuntimeReadiness = (sourceConfig = {}, actionName = '') => {
  const normalizedAction = normalizeText(actionName).toLowerCase();
  const requiredCapability = ACTION_CAPABILITY_MAP[normalizedAction] || '';
  const capabilities = normalizeCapabilityArray(sourceConfig.capabilities);
  const blockers = [];

  if (sourceConfig.enabled === false) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_DISABLED',
      message: '当前接入位已停用，暂不执行外部请求。',
    });
  }

  if (!normalizeText(sourceConfig.baseUrl)) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_BASE_URL_MISSING',
      message: '当前接入位尚未配置 API Base URL，已返回降级说明。',
    });
  }

  if (requiredCapability && !capabilities.includes(requiredCapability)) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_CAPABILITY_MISSING',
      message: `当前接入位未声明 ${requiredCapability} 能力，暂不执行 ${normalizedAction}。`,
    });
  }

  if (
    (sourceConfig.authType === 'api-key' || sourceConfig.authType === 'bearer') &&
    !normalizeText(sourceConfig.apiKey)
  ) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_CREDENTIALS_MISSING',
      message: '当前接入位尚未配置 API 密钥，已返回降级说明。',
    });
  }

  if (
    sourceConfig.provider === 'qichacha' &&
    !normalizeText(sourceConfig.secretKey) &&
    !normalizeText(sourceConfig.token)
  ) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_SECRET_KEY_MISSING',
      message: '当前企查查接入位尚未配置 Secret Key 或 Token，已返回降级说明。',
    });
  }

  if (
    sourceConfig.authType === 'basic' &&
    (!normalizeText(sourceConfig.username) || !normalizeText(sourceConfig.password))
  ) {
    blockers.push({
      code: 'EXTERNAL_SOURCE_CREDENTIALS_MISSING',
      message: '当前接入位尚未配置基础认证账号，已返回降级说明。',
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    summary: {
      sourceId: normalizeText(sourceConfig.id),
      sourceName: normalizeText(sourceConfig.name),
      action: normalizedAction,
      requiredCapability,
      healthStatus: inferHealthStatus(sourceConfig),
      healthMessage: inferHealthMessage(sourceConfig),
      publicDataOnly: sourceConfig.publicDataOnly !== false,
      localDataOutboundPolicy: normalizeOutboundPolicy(sourceConfig.localDataOutboundPolicy),
    },
  };
};

export const buildExternalDataSourceDegradation = ({
  sourceConfig = {},
  actionName = '',
  reasonCode = '',
  reasonMessage = '',
  blockers = [],
  runtimeSummary = null,
} = {}) => {
  const readiness = assessExternalDataSourceRuntimeReadiness(sourceConfig, actionName);
  const normalizedBlockers = Array.isArray(blockers) && blockers.length > 0 ? blockers : readiness.blockers;
  const primaryBlocker = normalizedBlockers[0] || null;

  return {
    degraded: true,
    status: 'degraded',
    action: normalizeText(actionName).toLowerCase(),
    result: null,
    source: maskSensitiveFields(sourceConfig),
    degradation: {
      code: reasonCode || primaryBlocker?.code || 'EXTERNAL_SOURCE_UNAVAILABLE',
      message:
        reasonMessage ||
        primaryBlocker?.message ||
        inferHealthMessage(sourceConfig) ||
        '外部数据源当前不可用，已返回降级说明。',
      blockers: normalizedBlockers.length > 0 ? normalizedBlockers : undefined,
      runtime: runtimeSummary || undefined,
    },
  };
};

export const createExternalDataSource = (payload = {}) => {
  const currentItems = readExternalDataSources();
  const now = nowLocalIso();
  const draftId =
    normalizeText(payload.id) ||
    normalizeText(payload.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    `external-source-${Date.now()}`;

  const nextItem = normalizeExternalDataSource(
    {
      ...payload,
      id: draftId,
      version: 1,
      lastCheckedAt: now,
    },
    currentItems.length,
  );

  const fieldErrors = validateExternalDataSourceDraft(nextItem);
  if (currentItems.some((item) => item.id === nextItem.id)) {
    fieldErrors.push({
      field: 'id',
      message: 'id already exists',
    });
  }

  if (fieldErrors.length > 0) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '外部数据源配置校验失败',
        fieldErrors,
      },
    };
  }

  const nextItems = [...currentItems, nextItem];
  saveExternalDataSources(nextItems);

  return {
    success: true,
    detail: maskSensitiveFields(nextItem),
  };
};

export const updateExternalDataSource = (sourceId = '', payload = {}) => {
  const currentItems = readExternalDataSources();
  const targetIndex = currentItems.findIndex((item) => item.id === normalizeText(sourceId));

  if (targetIndex === -1) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'external data source not found',
      },
    };
  }

  const currentItem = currentItems[targetIndex];
  const currentVersion = Number.isFinite(Number(currentItem.version)) ? Number(currentItem.version) : 1;
  const incomingVersion = Number.isFinite(Number(payload.version))
    ? Number(payload.version)
    : currentVersion;

  if (incomingVersion !== currentVersion) {
    return {
      success: false,
      error: {
        code: 'VERSION_CONFLICT',
        message: 'external data source version conflict',
      },
      detail: maskSensitiveFields(currentItem),
    };
  }

  const nextItem = normalizeExternalDataSource(
    {
      ...currentItem,
      ...payload,
      id: currentItem.id,
      apiKey: payload.apiKey === '' || payload.apiKey === undefined ? currentItem.apiKey : payload.apiKey,
      secretKey:
        payload.secretKey === '' || payload.secretKey === undefined
          ? currentItem.secretKey
          : payload.secretKey,
      token: payload.token === '' || payload.token === undefined ? currentItem.token : payload.token,
      username:
        payload.username === '' || payload.username === undefined
          ? currentItem.username
          : payload.username,
      password:
        payload.password === '' || payload.password === undefined
          ? currentItem.password
          : payload.password,
      version: currentVersion + 1,
      lastCheckedAt: nowLocalIso(),
    },
    targetIndex,
  );

  const fieldErrors = validateExternalDataSourceDraft(nextItem);
  if (fieldErrors.length > 0) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '外部数据源配置校验失败',
        fieldErrors,
      },
    };
  }

  const nextItems = [...currentItems];
  nextItems[targetIndex] = nextItem;
  saveExternalDataSources(nextItems);

  return {
    success: true,
    detail: maskSensitiveFields(nextItem),
  };
};

export const deleteExternalDataSource = (sourceId = '') => {
  const currentItems = readExternalDataSources();
  const nextItems = currentItems.filter((item) => item.id !== normalizeText(sourceId));

  if (nextItems.length === currentItems.length) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'external data source not found',
      },
    };
  }

  saveExternalDataSources(nextItems);
  return {
    success: true,
  };
};

export const healthCheckExternalDataSource = (sourceId = '') => {
  const currentItems = readExternalDataSources();
  const targetIndex = currentItems.findIndex((item) => item.id === normalizeText(sourceId));

  if (targetIndex === -1) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'external data source not found',
      },
    };
  }

  const currentItem = currentItems[targetIndex];
  const healthCheckResult = buildUserReadableHealthCheck(currentItem);
  const checkedItem = normalizeExternalDataSource(
    {
      ...currentItem,
      lastCheckedAt: nowLocalIso(),
      healthStatus: healthCheckResult.status,
      healthMessage: healthCheckResult.userMessage,
      healthCheckResult,
    },
    targetIndex,
  );

  const nextItems = [...currentItems];
  nextItems[targetIndex] = checkedItem;
  saveExternalDataSources(nextItems);

  return {
    success: true,
    detail: maskSensitiveFields(checkedItem),
  };
};
