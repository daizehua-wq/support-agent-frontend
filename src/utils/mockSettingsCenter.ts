import type { SettingsCenterState } from '../types/settingsCenter';

const BASE: SettingsCenterState = {
  role: 'admin',
  scenario: 'default',
  plannerModel: {
    status: 'ready',
    source: 'embedded-planner',
    modelName: 'gpt-4o-mini',
    lastCallCount: 142,
    successRate: 94.3,
    fallbackStrategy: '默认任务模板',
  },
  defaultAssistant: { name: '默认销售支持助手', status: 'healthy' },
  defaultModel: { name: 'gpt-4o-mini', status: 'healthy' },
  defaultDataSource: { name: '企业内部数据库 (SQLite)', status: 'healthy' },
  pythonRuntimeStatus: 'healthy',
  secretVaultStatus: 'healthy',
  apiGatewayStatus: 'healthy',
  externalSources: [
    { name: '企查查', status: 'healthy' },
    { name: '本地知识库', status: 'healthy' },
  ],
  recentGovernance: [
    { action: 'Assistant 发布', target: '销售支持助手 v3', changedAt: '2026-04-28 10:00', actor: 'admin' },
    { action: '默认模型变更', target: 'gpt-4o-mini → deepseek-chat', changedAt: '2026-04-27 16:00', actor: 'admin' },
    { action: '数据源绑定更新', target: '企查查 接入位更新', changedAt: '2026-04-27 14:30', actor: 'system' },
  ],
  degradedCapabilities: [],
};

export function getMockSettingsCenter(): SettingsCenterState {
  return { ...BASE };
}

export function getDegraded(): SettingsCenterState {
  return {
    ...BASE,
    scenario: 'degraded',
    plannerModel: { ...BASE.plannerModel, status: 'degraded', successRate: 72.1 },
    externalSources: [
      { name: '企查查', status: 'degraded' },
      { name: '本地知识库', status: 'healthy' },
    ],
    degradedCapabilities: ['企查查（外部资料源）', '任务规划器小模型'],
    defaultDataSource: { name: '企业内部数据库 (SQLite)', status: 'degraded' },
  };
}

export function getMissingDefaults(): SettingsCenterState {
  return {
    ...BASE,
    scenario: 'missingDefaults',
    defaultAssistant: { name: '', status: 'unknown', detail: '未配置' },
    defaultModel: { name: '', status: 'unknown', detail: '未配置' },
    plannerModel: { ...BASE.plannerModel, status: 'unavailable', source: 'fallback' },
    degradedCapabilities: ['默认 Assistant', '默认模型'],
  };
}

export function getUserView(base?: SettingsCenterState): SettingsCenterState {
  const src = base || BASE;
  return {
    ...src,
    role: 'user',
    scenario: src.scenario === 'missingDefaults' ? 'missingDefaults' : 'default',
    plannerModel: {
      ...src.plannerModel,
      lastCallCount: 0,
      successRate: 0,
    },
    recentGovernance: [],
    secretVaultStatus: 'unknown',
  };
}

export function getNoPermission(): SettingsCenterState {
  return {
    ...BASE,
    role: 'user',
    scenario: 'noPermission',
  };
}
