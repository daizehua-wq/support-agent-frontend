import type {
  SettingsRule,
  KnowledgeSource,
  StrategyToggle,
  GovernanceEvent,
  RuntimeModuleState,
} from '../types/settingsModules';

export const MOCK_RULES: SettingsRule[] = [
  { id: 'r1', name: '证据不足风险提示规则', type: 'evidence_risk', status: 'enabled', scope: ['search', 'output'], updatedAt: '2026-04-27 14:00', description: '当证据不足时在 Output 中强化风险提示，避免误导输出。' },
  { id: 'r2', name: '外部源降级处理规则', type: 'degraded_handling', status: 'enabled', scope: ['search', 'all'], updatedAt: '2026-04-26 10:30', description: '外部源不可用时自动降级为内部检索，并在执行上下文和风险区标注。' },
  { id: 'r3', name: '强依赖外部源高风险标记', type: 'high_risk_mark', status: 'enabled', scope: ['analyze', 'search'], updatedAt: '2026-04-25 16:00', description: '当任务强依赖外部企业数据时，在计划阶段就标记高风险并提示用户。' },
  { id: 'r4', name: '敏感资料跨任务复制保护', type: 'data_protection', status: 'enabled', scope: ['all'], updatedAt: '2026-04-28 08:00', description: '新建类似任务时不复制客户敏感资料、历史输出或外部源结果。' },
];

export const MOCK_KNOWLEDGE: KnowledgeSource[] = [
  { id: 'k1', name: '内部知识库', type: 'internal_knowledge', status: 'connected', itemCount: 156, updatedAt: '2026-04-28' },
  { id: 'k2', name: 'Reference Pack', type: 'reference_pack', status: 'ready', itemCount: 42, updatedAt: '2026-04-27' },
  { id: 'k3', name: '业务 FAQ', type: 'faq', status: 'connected', itemCount: 89, updatedAt: '2026-04-26' },
  { id: 'k4', name: '产品资料', type: 'product_docs', status: 'degraded', itemCount: 230, updatedAt: '2026-04-25' },
];

export const MOCK_STRATEGIES: StrategyToggle[] = [
  { id: 's1', label: '证据不足提示', enabled: true },
  { id: 's2', label: '外部源降级提示', enabled: true },
  { id: 's3', label: '输出三版结构', enabled: true },
  { id: 's4', label: '敏感资料跨任务复制保护', enabled: true },
];

export const MOCK_RUNTIME: RuntimeModuleState = {
  health: [
    { name: 'Platform API', status: 'healthy' },
    { name: 'Task Runtime', status: 'healthy' },
    { name: 'Model Runtime', status: 'healthy' },
    { name: 'Data Source Runtime', status: 'degraded', detail: '企查查降级' },
    { name: 'Output Runtime', status: 'healthy' },
  ],
  pythonRuntime: { name: 'Python Runtime', status: 'healthy', detail: 'v1.0.0 / port 8008' },
  embeddedModel: { name: '嵌入式任务规划器', status: 'healthy', detail: 'gpt-4o-mini' },
  apiGateway: { serviceStatus: 'healthy', authEnabled: true, rateLimitEnabled: true },
  webhook: { signatureEnabled: false, boundary: 'internal_only', statusNote: '仅内部使用' },
  rateLimits: [
    { level: '普通用户', limit: 60, burst: 10 },
    { level: '业务管理员', limit: 300, burst: 50 },
    { level: '系统管理员', limit: 1000, burst: 100 },
  ],
  secretVault: { status: 'healthy', credentialCount: 5, lastRotation: '2026-04-28 08:00' },
  internalRoutes: [
    { name: 'Admin UI', path: '/admin-ui', access: 'admin only' },
    { name: 'Internal Ops', path: '/internal/ops', access: 'internal only' },
    { name: 'Internal Webhook', path: '/internal/webhook', access: 'internal only' },
  ],
};

export const MOCK_GOVERNANCE: GovernanceEvent[] = [
  { id: 'g1', type: 'assistant_publish', content: '销售支持助手 · v3 发布', actor: 'admin', timestamp: '2026-04-28 10:00', status: 'active', summary: '更新默认 Assistant 到 v3，新增证据不足提示规则。', affectedModules: ['workbench', 'output'] },
  { id: 'g2', type: 'model_default_change', content: '默认模型变更 gpt-4o-mini → deepseek-chat', actor: 'admin', timestamp: '2026-04-27 16:00', status: 'active', summary: '分析模块切换到 deepseek-chat，Output 保持 gpt-4o-mini。' },
  { id: 'g3', type: 'data_source_binding', content: '企查查接入位 Secret Key 更新', actor: 'system', timestamp: '2026-04-27 14:30', status: 'active', summary: '更新外部数据源凭据引用。' },
  { id: 'g4', type: 'settings_modify', content: 'Settings 全局配置 v12 → v13', actor: 'admin', timestamp: '2026-04-27 12:00', status: 'active', summary: '更新 fallback 策略和 Python Runtime 健康检查配置。' },
  { id: 'g5', type: 'app_channel_modify', content: 'API App 测试应用 · Token 权限调整', actor: 'admin', timestamp: '2026-04-26 09:00', status: 'active', summary: '限制测试应用仅可访问公共端点。' },
  { id: 'g6', type: 'security_config_change', content: 'SSO JWT Secret 轮换', actor: 'system', timestamp: '2026-04-25 02:00', status: 'archived', summary: '定期轮换 SSO JWT Secret。' },
];
