// ============================================================================
// Settings Center Aggregation Service (P2)
// ============================================================================

import { getDefaultSettings, getSettingsConfigSummary, sanitizeSettingsForClient } from './settingsService.js';
import { listAssistants, getDefaultAssistantProfile, listPrompts } from './governanceRegistryService.js';
import { listGovernanceAuditEntries } from './governanceAuditService.js';
import { getStorageHealthSnapshot } from './storageHealthService.js';
import { getPythonRuntimeHealthSnapshot } from './pythonRuntimeAdapterService.js';
import { getLocalModelHealthSnapshot } from './localModelHealthService.js';
import { getContextStoreSummary } from './sessionService.js';

function safe(cb, fallback) {
  try { return cb(); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// 1. Overview
// ---------------------------------------------------------------------------

export function getSettingsCenterOverview() {
  const settings = safe(() => readSettingsSanitized(), getDefaultSettings());

  const capabilitySummary = {
    taskPlanner: safe(() => {
      const c = settings?.model?.settings ?? {};
      return {
        status: c.activeModelId ? 'ready' : 'degraded',
        source: 'embedded_model',
        modelName: c.models?.[0]?.modelName || 'gpt-4o-mini',
        fallback: c.models?.length > 1 ? '可用' : '默认任务模板',
      };
    }, { status: 'unknown', source: 'embedded_model', modelName: '—', fallback: '默认任务模板' }),
    defaultAssistant: safe(() => {
      const asst = getDefaultAssistantProfile();
      return {
        status: asst ? 'healthy' : 'missing',
        name: asst?.assistantName || '未配置',
        version: asst?.version || '—',
      };
    }, { status: 'missing', name: '未配置', version: '—' }),
    defaultModel: safe(() => {
      const m = settings?.model?.settings?.models?.[0] ?? {};
      return { status: m.enabled !== false ? 'healthy' : 'inactive', name: m.modelName || '未配置', provider: m.provider || 'local' };
    }, { status: 'missing', name: '未配置', provider: '—' }),
    dataSources: safe(() => {
      const ds = settings?.search?.settings?.connectors?.registry ?? [];
      return ds.map((r) => ({ name: r.name || r.sourceName, type: r.sourceType || 'internal', status: r.status || 'healthy' }));
    }, [{ name: '内部知识库', type: 'internal', status: 'healthy' }]),
    runtime: safe(() => {
      const py = getPythonRuntimeHealthSnapshot();
      return { status: py?.status ?? 'healthy' };
    }, { status: 'unknown' }),
  };

  const systemHealth = [
    { key: 'planner', label: '任务规划器', status: capabilitySummary.taskPlanner.status === 'ready' ? 'ok' : 'warning', summary: capabilitySummary.taskPlanner.modelName },
    { key: 'assistant', label: '默认 Assistant', status: capabilitySummary.defaultAssistant.status === 'healthy' ? 'ok' : 'error', summary: capabilitySummary.defaultAssistant.name },
    { key: 'model', label: '默认大模型', status: capabilitySummary.defaultModel.status === 'healthy' ? 'ok' : 'warning', summary: capabilitySummary.defaultModel.name },
    { key: 'runtime', label: 'Python Runtime', status: capabilitySummary.runtime.status === 'healthy' ? 'ok' : 'warning', summary: '—' },
  ];

  const degradedCapabilities = [];
  if (capabilitySummary.taskPlanner.status !== 'ready') {
    degradedCapabilities.push({ key: 'planner', label: '任务规划器', status: 'degraded', impact: '任务计划可能使用默认模板', suggestion: '检查嵌入模型或 API 模型连接' });
  }

  const recentGovernanceEvents = safe(() => {
    const entries = listGovernanceAuditEntries({ limit: 5 }) || [];
    return entries.map((e) => ({
      eventId: e.id,
      type: e.entityType,
      title: e.targetName || e.action,
      operator: e.actor || '系统',
      createdAt: e.createdAt,
      status: 'completed',
    }));
  }, []);

  const quickActions = [
    { key: 'models', label: '查看大模型', targetRoute: '/settings/models', requiredPermission: 'canManageModels' },
    { key: 'assistants', label: '管理 Assistant', targetRoute: '/settings/assistants', requiredPermission: 'canManageAssistants' },
    { key: 'data-sources', label: '数据源配置', targetRoute: '/settings/data-sources', requiredPermission: 'canManageDataSources' },
  ];

  return { capabilitySummary, systemHealth, degradedCapabilities, recentGovernanceEvents, quickActions };
}

// ---------------------------------------------------------------------------
// 2. Models
// ---------------------------------------------------------------------------

export function getSettingsCenterModels() {
  const settings = safe(() => readSettingsSanitized(), getDefaultSettings());
  const modelCfg = settings?.model?.settings ?? {};

  const plannerModel = {
    status: modelCfg.activeModelId ? 'ready' : 'degraded',
    source: 'embedded_model',
    modelName: 'gpt-4o-mini',
    fallbackStrategy: '默认任务模板',
  };

  const defaultModel = {
    id: modelCfg.activeModelId || 'default',
    name: modelCfg.models?.[0]?.modelName || 'gpt-4o-mini',
    provider: modelCfg.modelProvider || 'local',
    status: modelCfg.activeModelId ? 'healthy' : 'missing',
  };

  const models = (modelCfg.models || []).map((m) => ({
    id: m.id || m.modelId,
    name: m.modelName || m.name,
    provider: m.provider || 'local',
    status: m.enabled !== false ? 'healthy' : 'disabled',
    isDefault: m.id === modelCfg.activeModelId,
  }));

  const moduleBindings = (modelCfg.moduleBindings || {});

  const fallbackRules = {
    modelFallback: modelCfg.models?.length > 1 ? 'degraded' : 'blocked',
    plannerFallback: '默认任务模板',
  };

  const runtimeStatus = {
    python: safe(() => getPythonRuntimeHealthSnapshot()?.status ?? 'healthy', 'unknown'),
    embeddedModel: safe(() => getLocalModelHealthSnapshot()?.status?.status ?? 'loading', 'unknown'),
  };

  return { plannerModel, defaultModel, models, moduleBindings, fallbackRules, runtimeStatus };
}

// ---------------------------------------------------------------------------
// 3. Assistants
// ---------------------------------------------------------------------------

export function getSettingsCenterAssistants() {
  const assistants = safe(() => listAssistants().map((a) => ({
    id: a.assistantId,
    name: a.assistantName,
    version: a.version,
    enabled: a.enabled,
    publishState: a.publishState,
    updatedAt: a.updatedAt,
  })), []);

  const prompts = safe(() => listPrompts().map((p) => ({
    id: p.promptId,
    name: p.promptName,
    module: p.module,
    version: p.version,
    enabled: p.enabled,
    publishState: p.publishState,
    updatedAt: p.updatedAt,
  })), []);

  const currentPublished = safe(() => {
    const asst = getDefaultAssistantProfile();
    return asst ? { assistantId: asst.assistantId, assistantName: asst.assistantName, version: asst.version } : null;
  }, null);

  const moduleBindings = {};

  const strategyConfigs = [];

  const governanceEvents = safe(() => {
    const entries = listGovernanceAuditEntries({ entityType: 'assistant', limit: 5 });
    return (entries || []).map((e) => ({ eventId: e.id, type: e.entityType, action: e.action, title: e.targetName, operator: e.actor, createdAt: e.createdAt, status: 'completed' }));
  }, []);

  return { assistants, prompts, currentPublished, moduleBindings, strategyConfigs, governanceEvents };
}

// ---------------------------------------------------------------------------
// 4. Data Sources
// ---------------------------------------------------------------------------

export function getSettingsCenterDataSources() {
  const settings = safe(() => readSettingsSanitized(), getDefaultSettings());
  const connectors = settings?.search?.settings?.connectors?.registry ?? [];

  const overview = {
    total: connectors.length,
    healthy: connectors.filter((c) => c.status === 'healthy').length,
    degraded: connectors.filter((c) => c.status === 'degraded').length,
  };

  const internalSources = connectors.filter((c) => c.sourceType === 'internal').map((c) => ({ name: c.name || c.sourceName, status: c.status || 'healthy', summary: '' }));
  const externalSources = connectors.filter((c) => c.sourceType !== 'internal').map((c) => ({ name: c.name || c.sourceName, status: c.status || 'unknown', summary: '', impact: c.status === 'degraded' ? '影响外部资料检索精确度' : '', suggestion: c.status === 'degraded' ? '检查外部资料源 API 连接' : '' }));

  return {
    overview,
    internalSources,
    externalSources,
    referencePacks: [],
    lightBindings: [],
    providerStates: externalSources,
    credentialReferences: ['secret://settings/database', 'env.DATABASE_HOST', 'env.MODEL_API_KEY'].filter(() => true),
  };
}

// ---------------------------------------------------------------------------
// 5. Apps
// ---------------------------------------------------------------------------

export function getSettingsCenterApps() {
  return {
    apps: [],
    apiKeys: [{ id: 'default-app-key', label: '默认应用 API Key', reference: 'secret://apps/default-app-key' }],
    channels: [{ name: 'Lark 飞书', status: 'not_configured' }],
    applicationPacks: [],
    platformManager: { requiredPermission: 'canAccessPlatformManager' },
    adminUi: { requiredPermission: 'canAccessAdminUi' },
    rulesKnowledgeSummary: { rulesCount: 4, knowledgeSourcesCount: 4 },
  };
}

// ---------------------------------------------------------------------------
// 6. Rules
// ---------------------------------------------------------------------------

export function getSettingsCenterRules() {
  return {
    rules: [
      { id: 'r1', name: '证据风险标记', type: 'evidence_risk', status: 'active', scope: ['evidence', 'output'], description: '标记高风险证据并限制引用' },
      { id: 'r2', name: '外部源降级处理', type: 'degraded_handling', status: 'active', scope: ['evidence'], description: '外部数据源不可用时降级为内部检索' },
      { id: 'r3', name: '高风险行业标记', type: 'high_risk_mark', status: 'active', scope: ['analysis'], description: '识别高风险行业并触发额外审查' },
      { id: 'r4', name: '数据安全与隐私', type: 'data_protection', status: 'active', scope: ['all'], description: '保护客户隐私，限制敏感信息输出' },
    ],
    knowledgeSources: [
      { id: 'k1', name: '内部知识库', type: 'internal_knowledge', status: 'healthy', entryCount: 248 },
      { id: 'k2', name: 'Reference Pack', type: 'reference_pack', status: 'healthy', entryCount: 12 },
      { id: 'k3', name: 'FAQ 知识库', type: 'faq', status: 'healthy', entryCount: 56 },
      { id: 'k4', name: '产品文档库', type: 'product_docs', status: 'healthy', entryCount: 34 },
    ],
    applicationPackBindings: [],
    strategyStates: [],
    governanceEvents: safe(() => {
      const entries = listGovernanceAuditEntries({ entityType: 'settings', limit: 3 });
      return (entries || []).map((e) => ({ eventId: e.id, action: e.action, title: e.targetName, operator: e.actor, createdAt: e.createdAt }));
    }, []),
  };
}

// ---------------------------------------------------------------------------
// 7. Runtime
// ---------------------------------------------------------------------------

export function getSettingsCenterRuntime() {
  const storage = safe(() => getStorageHealthSnapshot({ probeExternal: false }), {}) || {};
  const py = safe(() => getPythonRuntimeHealthSnapshot(), {}) || {};
  const emb = safe(() => getLocalModelHealthSnapshot(), {}) || {};
  const ctx = safe(() => getContextStoreSummary(), {}) || {};

  return {
    health: {
      storage: { status: storage?.readiness === 'sqlite-mvp-active' ? 'ok' : 'warning', summary: storage?.activeStore || 'sqlite' },
      pythonRuntime: { status: py?.status || 'healthy', summary: py?.version || '' },
      embeddedModel: { status: emb?.status?.status || 'loading', summary: emb?.status?.modelPresent ? '已加载' : '加载中' },
      contextStore: { status: ctx?.active ? 'ok' : 'warning', summary: ctx?.store || '' },
    },
    ops: { alerts: [] },
    pythonRuntime: { enabled: py?.status === 'healthy', baseUrl: py?.baseUrl || '', version: py?.version || '' },
    embeddedModel: { present: emb?.status?.modelPresent || false, status: emb?.status?.status || 'loading' },
    secretVault: { status: 'active', keyCount: 5, keysRefs: ['secret://settings/database', 'secret://settings/model', 'env.DATABASE_HOST', 'env.MODEL_API_KEY'] },
    internalRoutes: [{ path: '/internal', boundary: 'internal_only', description: '内部管理接口' }],
    apiGateway: { status: 'healthy', routes: ['/api/agent/*', '/api/settings/*', '/api/tasks/*'] },
    webhook: { boundary: 'internal_only', publicSignatureEnabled: false, warning: '公网暴露前必须完成平台签名校验' },
    rateLimit: { enabled: false, summary: 'rate limit 未启用' },
    securityTips: ['建议启用公网签名校验', '定期轮换 API Key', '开启 rate limit 保护'],
  };
}

// ---------------------------------------------------------------------------
// 8. Governance
// ---------------------------------------------------------------------------

export function getSettingsCenterGovernance() {
  const events = safe(() => {
    const entries = listGovernanceAuditEntries({ limit: 20 });
    return (entries || []).map((e) => ({
      eventId: e.id,
      type: e.entityType,
      title: e.targetName || e.action,
      operator: e.actor || '系统',
      createdAt: e.createdAt,
      status: 'completed',
      impactScope: e.metadata?.scope || '',
    }));
  }, []);

  const filters = [
    { key: 'all', label: '全部' },
    { key: 'assistant', label: 'Assistant' },
    { key: 'prompt', label: 'Prompt' },
    { key: 'model', label: '大模型' },
    { key: 'settings', label: '设置变更' },
  ];

  return {
    events,
    filters,
    rollbackState: { available: false, reason: '回滚能力将在后续版本开放。当前仅支持查看变更详情。' },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSettingsSanitized() {
  try {
    const { getSettingsConfigSummary, getDefaultSettings } = require('./settingsService.js');
    return sanitizeSettingsForClient(getDefaultSettings());
  } catch {
    return getDefaultSettings();
  }
}
