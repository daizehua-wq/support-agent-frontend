import { createElement } from 'react';
import { Tag } from 'antd';

export type DatabaseItem = {
  id: string;
  name: string;
  type: string;
  environment: string;
  host?: string;
  port?: number | string;
  username?: string;
  adminUsername?: string;
  hasPassword?: boolean;
  hasAdminPassword?: boolean;
  databaseFile?: string;
  version?: number;
  available: boolean;
  healthStatus: 'healthy' | 'warning' | 'offline';
  lastCheckedAt: string;
  healthMessage?: string;
  defaultAssociatedDatabase?: string;
  visibleDatabases?: string[];
  relationSource?: string;
  description?: string;
};

export type ExternalSourceHealthStatus = 'healthy' | 'warning' | 'offline';
export type ExternalSourceCategory =
  | 'authoritative_database'
  | 'web_search'
  | 'internal_database'
  | 'custom_api';

export const databaseTypeOptions = [
  { label: 'SQLite', value: 'sqlite' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgres' },
];

export const createModeOptions = [
  { label: '仅登记配置', value: 'register-only' },
  { label: '创建远端数据库', value: 'create-remote' },
];

export const externalSourceTypeOptions = [
  { label: '权威付费 API', value: 'paid_api' },
  { label: '互联网检索', value: 'web_search' },
  { label: '官方网站', value: 'official_site' },
  { label: '内部数据库', value: 'internal_database' },
  { label: '商业数据库', value: 'paid-database' },
  { label: '检索 API', value: 'search-api' },
  { label: '开放数据源', value: 'open-data' },
  { label: '公开网页检索', value: 'web-search' },
];

export const externalSourceCategoryOptions = [
  { label: '权威数据库', value: 'authoritative_database' },
  { label: '互联网搜索', value: 'web_search' },
  { label: '内部数据库', value: 'internal_database' },
  { label: '自定义 API', value: 'custom_api' },
];

export const externalAuthTypeOptions = [
  { label: '无认证', value: 'none' },
  { label: 'API Key', value: 'api-key' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
];

export const externalCapabilityOptions = [
  { label: 'Search', value: 'search' },
  { label: 'Company Lookup', value: 'company_lookup' },
  { label: 'Risk Lookup', value: 'risk_lookup' },
  { label: 'Fetch Detail', value: 'fetch-detail' },
  { label: 'Download', value: 'download' },
];

export const externalOutboundPolicyOptions = [
  { label: '禁止本地数据外发', value: 'blocked' },
  { label: '仅允许脱敏后外发', value: 'masked-only' },
];

export type ExternalProviderTemplate = {
  label: string;
  value: string;
  category: ExternalSourceCategory;
  normalName: string;
  provider: string;
  providerName: string;
  sourceType: string;
  authType: string;
  priority: string;
  baseUrl: string;
  apiPath: string;
  method: 'GET' | 'POST';
  queryParam: string;
  limitParam: string;
  cacheTtlHours: number;
  defaultLimit: number;
  freshness: string;
  retainRaw: boolean;
  externalAvailable: boolean;
  capabilities: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  publicDataOnly: boolean;
  localDataOutboundPolicy: 'blocked' | 'masked-only';
  requiresSecretKey?: boolean;
  custom?: boolean;
};

export const externalProviderTemplates: ExternalProviderTemplate[] = [
  {
    label: '企查查',
    value: 'qichacha',
    category: 'authoritative_database',
    normalName: '企查查',
    provider: 'qichacha',
    providerName: '企查查',
    sourceType: 'paid_api',
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
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search', 'company_lookup', 'risk_lookup'],
    allowedDomains: ['api.qichacha.com'],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    requiresSecretKey: true,
  },
  {
    label: '天眼查',
    value: 'tianyancha',
    category: 'authoritative_database',
    normalName: '天眼查',
    provider: 'tianyancha',
    providerName: '天眼查',
    sourceType: 'paid_api',
    authType: 'api-key',
    priority: 'P1',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'keyword',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search', 'company_lookup', 'risk_lookup'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: '启信宝',
    value: 'qixinbao',
    category: 'authoritative_database',
    normalName: '启信宝',
    provider: 'qixinbao',
    providerName: '启信宝',
    sourceType: 'paid_api',
    authType: 'api-key',
    priority: 'P1',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'keyword',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search', 'company_lookup', 'risk_lookup'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: '政府公开库',
    value: 'government_open_data',
    category: 'authoritative_database',
    normalName: '政府公开库',
    provider: 'government_open_data',
    providerName: '政府公开库',
    sourceType: 'paid_api',
    authType: 'none',
    priority: 'P1',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'keyword',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: '自定义权威 API',
    value: 'custom_paid_api',
    category: 'authoritative_database',
    normalName: '自定义权威 API',
    provider: 'custom_paid_api',
    providerName: '自定义权威 API',
    sourceType: 'paid_api',
    authType: 'api-key',
    priority: 'P1',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    custom: true,
  },
  {
    label: 'Tavily',
    value: 'tavily',
    category: 'web_search',
    normalName: 'Tavily',
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
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: 'Bing Search',
    value: 'bing_search',
    category: 'web_search',
    normalName: 'Bing Search',
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
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: 'SerpAPI',
    value: 'serpapi',
    category: 'web_search',
    normalName: 'SerpAPI',
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
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: '自定义 Web Search',
    value: 'custom_web_search',
    category: 'web_search',
    normalName: '自定义 Web Search',
    provider: 'custom_web_search',
    providerName: '自定义 Web Search',
    sourceType: 'web_search',
    authType: 'api-key',
    priority: 'P4',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    custom: true,
  },
  {
    label: '内部数据库',
    value: 'internal_database',
    category: 'internal_database',
    normalName: '内部数据库',
    provider: 'internal_database',
    providerName: '内部数据库',
    sourceType: 'internal_database',
    authType: 'none',
    priority: 'P0',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: false,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: false,
    localDataOutboundPolicy: 'blocked',
  },
  {
    label: '自定义 API',
    value: 'custom_api',
    category: 'custom_api',
    normalName: '自定义 API',
    provider: 'custom_api',
    providerName: '自定义 API',
    sourceType: 'web_search',
    authType: 'api-key',
    priority: 'P4',
    baseUrl: '',
    apiPath: '',
    method: 'GET',
    queryParam: 'q',
    limitParam: 'limit',
    cacheTtlHours: 24,
    defaultLimit: 5,
    freshness: 'month',
    retainRaw: false,
    externalAvailable: true,
    capabilities: ['search'],
    allowedDomains: [],
    blockedDomains: [],
    publicDataOnly: true,
    localDataOutboundPolicy: 'blocked',
    custom: true,
  },
];

export function getExternalProviderTemplate(templateId?: string) {
  return externalProviderTemplates.find((item) => item.value === templateId);
}

export function getExternalProviderOptions(category?: ExternalSourceCategory | string) {
  return externalProviderTemplates
    .filter((item) => !category || item.category === category)
    .map((item) => ({ label: item.label, value: item.value }));
}

export function getDefaultProviderTemplateId(category?: ExternalSourceCategory | string) {
  return getExternalProviderOptions(category)[0]?.value || 'custom_api';
}

export function inferExternalSourceCategory(source?: {
  provider?: string;
  providerName?: string;
  sourceType?: string;
} | null): ExternalSourceCategory {
  const provider = `${source?.provider || ''} ${source?.providerName || ''}`.toLowerCase();
  if (provider.includes('qichacha') || provider.includes('企查查')) return 'authoritative_database';
  if (source?.sourceType === 'paid_api' || source?.sourceType === 'paid-database' || source?.sourceType === 'open-data') return 'authoritative_database';
  if (source?.sourceType === 'internal_database') return 'internal_database';
  if (source?.sourceType === 'web_search' || source?.sourceType === 'web-search' || source?.sourceType === 'search-api' || source?.sourceType === 'official_site') return 'web_search';
  return 'custom_api';
}

export function inferExternalProviderTemplateId(source?: {
  provider?: string;
  providerName?: string;
  sourceType?: string;
} | null) {
  const provider = `${source?.provider || ''} ${source?.providerName || ''}`.toLowerCase();
  if (provider.includes('qichacha') || provider.includes('企查查')) return 'qichacha';

  const matched = externalProviderTemplates.find((item) => {
    const key = `${item.value} ${item.provider} ${item.providerName}`.toLowerCase();
    return provider && key.includes(provider.trim());
  });
  if (matched) return matched.value;

  const category = inferExternalSourceCategory(source);
  if (category === 'authoritative_database') return 'custom_paid_api';
  if (category === 'web_search') return 'custom_web_search';
  if (category === 'internal_database') return 'internal_database';
  return 'custom_api';
}

export function buildExternalProviderTemplateFormValues(templateId: string) {
  const template = getExternalProviderTemplate(templateId) || getExternalProviderTemplate('custom_api');
  if (!template) return {};

  return {
    sourceCategory: template.category,
    providerTemplate: template.value,
    name: template.normalName,
    provider: template.provider,
    providerName: template.providerName,
    sourceType: template.sourceType,
    authType: template.authType,
    enabled: true,
    baseUrl: template.baseUrl,
    apiPath: template.apiPath,
    method: template.method,
    queryParam: template.queryParam,
    limitParam: template.limitParam,
    callQuota: 0,
    cacheTtlHours: template.cacheTtlHours,
    defaultLimit: template.defaultLimit,
    freshness: template.freshness,
    externalAvailable: template.externalAvailable,
    allowExternalOutput: false,
    priority: template.priority,
    retainRaw: template.retainRaw,
    capabilities: template.capabilities,
    allowedDomains: template.allowedDomains,
    blockedDomains: template.blockedDomains,
    publicDataOnly: template.publicDataOnly,
    localDataOutboundPolicy: template.localDataOutboundPolicy,
  };
}

export function isExternalSourceCustomApi(templateId?: string, category?: string) {
  const template = getExternalProviderTemplate(templateId);
  return category === 'custom_api' || template?.custom === true;
}

export function normalizeDatabaseTypeValue(value: unknown) {
  if (typeof value !== 'string') return '';

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'postgresql') return 'postgres';
  if (normalizedValue === 'sqlite3') return 'sqlite';
  return normalizedValue;
}

export function getDatabaseTypeLabel(value: string) {
  const normalizedValue = normalizeDatabaseTypeValue(value);

  if (normalizedValue === 'sqlite') return 'SQLite';
  if (normalizedValue === 'mysql') return 'MySQL';
  if (normalizedValue === 'postgres') return 'PostgreSQL';
  return value || '未返回';
}

export function usesNetworkConnectionFields(value: string) {
  return normalizeDatabaseTypeValue(value) !== 'sqlite';
}

export function getHealthTag(status: DatabaseItem['healthStatus']) {
  if (status === 'healthy') {
    return createElement(Tag, { color: 'success' }, '健康');
  }

  if (status === 'warning') {
    return createElement(Tag, { color: 'warning' }, '告警');
  }

  return createElement(Tag, { color: 'error' }, '离线');
}

export function getAvailabilityTag(available: boolean) {
  return createElement(Tag, { color: available ? 'success' : 'default' }, available ? '可用' : '不可用');
}

export function getCredentialStatusText(hasCredential?: boolean) {
  return hasCredential ? '已保存' : '未保存';
}

export function getExternalSourceTypeLabel(value: string) {
  const matched = externalSourceTypeOptions.find((item) => item.value === value);
  return matched?.label || value || '未返回';
}

export function getExternalAuthTypeLabel(value: string) {
  const matched = externalAuthTypeOptions.find((item) => item.value === value);
  return matched?.label || value || '未返回';
}

export function getOutboundPolicyLabel(value?: string) {
  const matched = externalOutboundPolicyOptions.find((item) => item.value === value);
  return matched?.label || value || '未返回';
}

export function getHealthStatusTag(status: ExternalSourceHealthStatus | string | undefined) {
  if (status === 'healthy') {
    return createElement(Tag, { color: 'success' }, '健康');
  }

  if (status === 'warning') {
    return createElement(Tag, { color: 'warning' }, '待联调');
  }

  return createElement(Tag, { color: 'default' }, '停用/离线');
}
