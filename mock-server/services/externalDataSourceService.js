import { readJsonFile, writeJsonFile } from './jsonDataService.js';
import { readSettings } from './settingsService.js';
import {
  materializeExternalDataSourceSecrets,
  resolveExternalDataSourceSecrets,
} from './secretVaultService.js';

const EXTERNAL_DATA_SOURCES_FILENAME = 'externalDataSources.json';

const SOURCE_TYPES = new Set(['paid-database', 'search-api', 'open-data', 'web-search']);
const AUTH_TYPES = new Set(['none', 'api-key', 'bearer', 'basic']);
const OUTBOUND_POLICIES = new Set(['blocked', 'masked-only']);
const CAPABILITIES = new Set(['search', 'fetch-detail', 'download']);

const normalizeText = (value = '') => String(value || '').trim();

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

const normalizeCapabilityArray = (value = []) => {
  return normalizeStringArray(value).filter((item) => CAPABILITIES.has(item));
};

const normalizeSourceType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return SOURCE_TYPES.has(normalized) ? normalized : 'search-api';
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
    return '已登记数据源，但尚未填写 API 密钥。';
  }

  if (item.authType === 'basic' && (!item.username || !item.password)) {
    return '已登记数据源，但尚未填写基础认证账号。';
  }

  return '接入位配置完整，可进入后续联调。';
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
    '当前已支持通过 Python Runtime 执行 query / fetch / download；仅允许发送公开查询词或公开资源地址，不上传本地私有资料。',
});

const normalizeExternalDataSource = (item = {}, index = 0) => {
  const id = normalizeText(item.id) || `external-source-${index + 1}`;
  const normalized = {
    id,
    name: normalizeText(item.name) || `外部数据源 ${index + 1}`,
    providerName: normalizeText(item.providerName) || normalizeText(item.name) || `Provider ${index + 1}`,
    sourceType: normalizeSourceType(item.sourceType),
    authType: normalizeAuthType(item.authType),
    enabled: normalizeBoolean(item.enabled, true),
    baseUrl: normalizeText(item.baseUrl),
    apiPath: normalizeText(item.apiPath),
    apiKey: normalizeText(item.apiKey),
    username: normalizeText(item.username),
    password: normalizeText(item.password),
    capabilities: normalizeCapabilityArray(item.capabilities),
    allowedDomains: normalizeStringArray(item.allowedDomains),
    publicDataOnly: normalizeBoolean(item.publicDataOnly, true),
    localDataOutboundPolicy: normalizeOutboundPolicy(item.localDataOutboundPolicy),
    notes: normalizeText(item.notes),
    version: Number.isFinite(Number(item.version)) ? Number(item.version) : 1,
    lastCheckedAt: normalizeText(item.lastCheckedAt),
  };

  const healthStatus = ['healthy', 'warning', 'offline'].includes(item.healthStatus)
    ? item.healthStatus
    : inferHealthStatus(normalized);

  return {
    ...normalized,
    healthStatus,
    healthMessage: normalizeText(item.healthMessage) || inferHealthMessage(normalized),
  };
};

const maskSensitiveFields = (item = {}) => ({
  ...item,
  hasApiKey: Boolean(item.apiKey),
  hasUsername: Boolean(item.username),
  hasPassword: Boolean(item.password),
  apiContract: buildApiContract(item),
  apiKey: undefined,
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

export const createExternalDataSource = (payload = {}) => {
  const currentItems = readExternalDataSources();
  const now = new Date().toISOString();
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
      username:
        payload.username === '' || payload.username === undefined
          ? currentItem.username
          : payload.username,
      password:
        payload.password === '' || payload.password === undefined
          ? currentItem.password
          : payload.password,
      version: currentVersion + 1,
      lastCheckedAt: new Date().toISOString(),
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
  const checkedItem = normalizeExternalDataSource(
    {
      ...currentItem,
      lastCheckedAt: new Date().toISOString(),
      healthStatus: inferHealthStatus(currentItem),
      healthMessage: inferHealthMessage(currentItem),
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
