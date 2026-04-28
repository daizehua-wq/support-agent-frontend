import { apiGetEnvelope, apiPostEnvelope } from './client';

const DATABASE_MANAGER_BASE = '/api/database-manager';

export type DatabaseManagerListItem = {
  id?: string;
  databaseId?: string;
  name?: string;
  databaseName?: string;
  type?: string;
  databaseType?: string;
  environment?: string;
  host?: string;
  port?: number | string;
  username?: string;
  adminUsername?: string;
  hasPassword?: boolean;
  hasAdminPassword?: boolean;
  databaseFile?: string;
  description?: string;
  available?: boolean;
  availabilityStatus?: string;
  healthStatus?: string;
  healthMessage?: string;
  lastCheckedAt?: string;
  version?: number;
  modifiedAt?: string;
  defaultAssociatedDatabase?: string;
  visibleDatabases?: string[];
  relationSource?: string;
  lightBindingSummary?: {
    accountId?: string;
    defaultAssociatedDatabase?: string;
    visibleDatabases?: string[];
    relationSource?: string;
  };
  [key: string]: unknown;
};

export type DatabaseManagerDetail = DatabaseManagerListItem;

export type CreateDatabaseRequest = {
  createMode?: 'register-only' | 'create-remote';
  databaseId?: string;
  databaseName: string;
  host?: string;
  port?: number | string;
  databaseType?: string;
  username?: string;
  password?: string;
  adminUsername?: string;
  adminPassword?: string;
  databaseFile?: string;
  environment?: string;
  description?: string;
};

export type UpdateDatabaseRequest = {
  databaseId?: string;
  databaseName?: string;
  host?: string;
  port?: number | string;
  databaseType?: string;
  username?: string;
  password?: string;
  adminUsername?: string;
  adminPassword?: string;
  databaseFile?: string;
  environment?: string;
  description?: string;
  version: number;
};

export type DeleteDatabaseRequest = {
  deleteMode?: 'config-only' | 'drop-remote';
  force?: boolean;
};

export type SaveLightBindingRequest = {
  lightBindingSummary: {
    defaultAssociatedDatabase?: string | null;
    visibleDatabases?: string[];
    relationSource?: string;
  };
};

export type ExternalDataSourceType =
  | 'paid_api'
  | 'web_search'
  | 'official_site'
  | 'internal_database'
  | 'paid-database'
  | 'search-api'
  | 'open-data'
  | 'web-search';

export type ExternalDataSourceAuthType = 'none' | 'api-key' | 'bearer' | 'basic';

export type ExternalDataSourceCapability = 'search' | 'fetch-detail' | 'download';
export type ExternalDataSourceProviderCapability =
  | ExternalDataSourceCapability
  | 'company_lookup'
  | 'risk_lookup';

export type ExternalDataSourceHealthStatus = 'healthy' | 'warning' | 'offline';

export type ExternalDataSourceItem = {
  id: string;
  name: string;
  provider?: string;
  providerTemplate?: string;
  sourceCategory?: string;
  providerName: string;
  sourceType: ExternalDataSourceType;
  integrationMode?: string;
  connector?: string;
  runtimeProvider?: string | null;
  authType: ExternalDataSourceAuthType;
  enabled: boolean;
  baseUrl?: string;
  apiPath?: string;
  method?: string;
  queryParam?: string;
  limitParam?: string;
  callQuota?: number;
  cacheTtlHours?: number;
  cacheTtl?: number;
  quotaLimit?: number;
  defaultLimit?: number;
  freshness?: string;
  externalAvailable?: boolean;
  allowExternalOutput?: boolean;
  priority?: string;
  retainRaw?: boolean;
  hasApiKey?: boolean;
  hasSecretKey?: boolean;
  hasToken?: boolean;
  hasUsername?: boolean;
  hasPassword?: boolean;
  capabilities?: ExternalDataSourceProviderCapability[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  publicDataOnly?: boolean;
  localDataOutboundPolicy?: 'blocked' | 'masked-only';
  headersConfig?: string;
  fieldMappings?: string;
  notes?: string;
  version?: number;
  healthStatus?: ExternalDataSourceHealthStatus;
  healthMessage?: string;
  lastCheckedAt?: string;
  apiContract?: {
    configEndpoint?: string;
    healthCheckEndpoint?: string;
    queryEndpoint?: string;
    fetchEndpoint?: string;
    downloadEndpoint?: string;
    futureQueryEndpoint?: string;
    futureFetchEndpoint?: string;
    futureDownloadEndpoint?: string;
    integrationBoundary?: string;
  };
  healthCheckResult?: {
    status?: string;
    userMessage?: string;
    technicalDetails?: Record<string, unknown>;
  };
};

export type CreateExternalDataSourceRequest = {
  id?: string;
  name: string;
  providerName?: string;
  provider?: string;
  providerTemplate?: string;
  sourceCategory?: string;
  sourceType: ExternalDataSourceType;
  integrationMode?: string;
  connector?: string;
  runtimeProvider?: string | null;
  authType: ExternalDataSourceAuthType;
  enabled: boolean;
  baseUrl?: string;
  apiPath?: string;
  method?: string;
  queryParam?: string;
  limitParam?: string;
  callQuota?: number;
  cacheTtlHours?: number;
  cacheTtl?: number;
  quotaLimit?: number;
  defaultLimit?: number;
  freshness?: string;
  externalAvailable?: boolean;
  allowExternalOutput?: boolean;
  priority?: string;
  retainRaw?: boolean;
  apiKey?: string;
  secretKey?: string;
  token?: string;
  username?: string;
  password?: string;
  capabilities?: ExternalDataSourceProviderCapability[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  publicDataOnly?: boolean;
  localDataOutboundPolicy?: 'blocked' | 'masked-only';
  headersConfig?: string;
  fieldMappings?: string;
  notes?: string;
};

export type UpdateExternalDataSourceRequest = CreateExternalDataSourceRequest & {
  version: number;
};

export type ExternalDataSourceQueryRequest = {
  sessionId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  path?: string;
  apiPath?: string;
  httpMethod?: 'GET' | 'POST';
  timeoutMs?: number;
  queryParams?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

export type ExternalDataSourceFetchRequest = {
  sessionId?: string;
  resourceUrl?: string;
  resourcePath?: string;
  path?: string;
  timeoutMs?: number;
  headers?: Record<string, unknown>;
};

export type ExternalDataSourceDownloadRequest = {
  sessionId?: string;
  resourceUrl?: string;
  resourcePath?: string;
  path?: string;
  fileName?: string;
  timeoutMs?: number;
  headers?: Record<string, unknown>;
};

export async function getDatabaseManagerList() {
  return apiGetEnvelope<{
    items?: DatabaseManagerListItem[];
    summary?: Record<string, unknown>;
  }>(`${DATABASE_MANAGER_BASE}/databases`, 'Database 列表获取成功');
}

export async function getDatabaseManagerDetail(databaseId: string) {
  return apiGetEnvelope<{
    detail?: DatabaseManagerDetail;
    summary?: Record<string, unknown>;
  }>(`${DATABASE_MANAGER_BASE}/databases/${databaseId}`, 'Database 详情获取成功');
}

export async function createDatabase(data: CreateDatabaseRequest) {
  return apiPostEnvelope<{
    targetId?: string;
    createMode?: 'register-only' | 'create-remote';
    detail?: DatabaseManagerDetail;
    remoteCreateResult?: Record<string, unknown>;
    writeBackStatus?: Record<string, unknown>;
  }>(`${DATABASE_MANAGER_BASE}/databases/create`, data, 'Database 创建成功');
}

export async function updateDatabase(databaseId: string, data: UpdateDatabaseRequest) {
  return apiPostEnvelope<{
    detail?: DatabaseManagerDetail;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/databases/${databaseId}/update`,
    data,
    'Database 保存成功',
  );
}

export async function deleteDatabase(databaseId: string, data: DeleteDatabaseRequest = {}) {
  return apiPostEnvelope<{
    deleted?: boolean;
    deleteMode?: 'config-only' | 'drop-remote';
    remoteDeleteResult?: Record<string, unknown>;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/databases/${databaseId}/delete`,
    data,
    'Database 删除成功',
  );
}

export async function healthCheckDatabase(databaseId: string) {
  return apiPostEnvelope<{
    detail?: DatabaseManagerDetail;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/databases/${databaseId}/health-check`,
    undefined,
    'Database 健康检查成功',
  );
}

export async function saveLightBindings(accountId: string, data: SaveLightBindingRequest) {
  return apiPostEnvelope<{
    detail?: DatabaseManagerDetail;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/accounts/${accountId}/database-binding/save`,
    data,
    '轻绑定关系保存成功',
  );
}

export async function getExternalDataSourceList() {
  return apiGetEnvelope<{
    items?: ExternalDataSourceItem[];
    summary?: Record<string, unknown>;
  }>(`${DATABASE_MANAGER_BASE}/external-sources`, '外部数据源列表获取成功');
}

export async function getExternalDataSourceDetail(sourceId: string) {
  return apiGetEnvelope<{
    detail?: ExternalDataSourceItem;
  }>(`${DATABASE_MANAGER_BASE}/external-sources/${sourceId}`, '外部数据源详情获取成功');
}

export async function createExternalDataSource(data: CreateExternalDataSourceRequest) {
  return apiPostEnvelope<{
    detail?: ExternalDataSourceItem;
    writeBackStatus?: Record<string, unknown>;
  }>(`${DATABASE_MANAGER_BASE}/external-sources/create`, data, '外部数据源创建成功');
}

export async function updateExternalDataSource(sourceId: string, data: UpdateExternalDataSourceRequest) {
  return apiPostEnvelope<{
    detail?: ExternalDataSourceItem;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/update`,
    data,
    '外部数据源保存成功',
  );
}

export async function deleteExternalDataSource(sourceId: string) {
  return apiPostEnvelope<{
    deleted?: boolean;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/delete`,
    undefined,
    '外部数据源删除成功',
  );
}

export async function healthCheckExternalDataSource(sourceId: string) {
  return apiPostEnvelope<{
    detail?: ExternalDataSourceItem;
    writeBackStatus?: Record<string, unknown>;
  }>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/health-check`,
    undefined,
    '外部数据源检测成功',
  );
}

export async function queryExternalDataSource(
  sourceId: string,
  data: ExternalDataSourceQueryRequest,
) {
  return apiPostEnvelope<Record<string, unknown>>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/query`,
    data,
    '外部数据源查询成功',
  );
}

export async function fetchExternalDataSource(
  sourceId: string,
  data: ExternalDataSourceFetchRequest,
) {
  return apiPostEnvelope<Record<string, unknown>>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/fetch`,
    data,
    '外部数据源详情抓取成功',
  );
}

export async function downloadExternalDataSource(
  sourceId: string,
  data: ExternalDataSourceDownloadRequest,
) {
  return apiPostEnvelope<Record<string, unknown>>(
    `${DATABASE_MANAGER_BASE}/external-sources/${sourceId}/download`,
    data,
    '外部数据源下载成功',
  );
}
