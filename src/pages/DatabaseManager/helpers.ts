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
  { label: '商业数据库', value: 'paid-database' },
  { label: '检索 API', value: 'search-api' },
  { label: '开放数据源', value: 'open-data' },
  { label: '公开网页检索', value: 'web-search' },
];

export const externalAuthTypeOptions = [
  { label: '无认证', value: 'none' },
  { label: 'API Key', value: 'api-key' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
];

export const externalCapabilityOptions = [
  { label: 'Search', value: 'search' },
  { label: 'Fetch Detail', value: 'fetch-detail' },
  { label: 'Download', value: 'download' },
];

export const externalOutboundPolicyOptions = [
  { label: '禁止本地数据外发', value: 'blocked' },
  { label: '仅允许脱敏后外发', value: 'masked-only' },
];

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
