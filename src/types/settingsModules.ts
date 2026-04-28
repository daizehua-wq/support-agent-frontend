export type RuleType = 'evidence_risk' | 'degraded_handling' | 'high_risk_mark' | 'data_protection' | 'output_structure';

export type RuleStatus = 'enabled' | 'disabled';

export type RuleModuleScope = 'analyze' | 'search' | 'output' | 'all';

export interface SettingsRule {
  id: string;
  name: string;
  type: RuleType;
  status: RuleStatus;
  scope: RuleModuleScope[];
  updatedAt: string;
  description: string;
}

export type KnowledgeSourceType = 'internal_knowledge' | 'reference_pack' | 'faq' | 'product_docs';

export type KnowledgeStatus = 'connected' | 'ready' | 'disabled' | 'degraded';

export interface KnowledgeSource {
  id: string;
  name: string;
  type: KnowledgeSourceType;
  status: KnowledgeStatus;
  itemCount: number;
  updatedAt: string;
}

export interface ApplicationPackBinding {
  id: string;
  label: string;
  name: string;
  assistantName: string;
  dataSourceName: string;
  ruleName: string;
  status: 'active' | 'inactive';
}

export interface StrategyToggle {
  id: string;
  label: string;
  enabled: boolean;
}

export type GovernanceEventType =
  | 'assistant_publish'
  | 'model_default_change'
  | 'data_source_binding'
  | 'settings_modify'
  | 'app_channel_modify'
  | 'security_config_change';

export interface GovernanceEvent {
  id: string;
  type: GovernanceEventType;
  content: string;
  actor: string;
  timestamp: string;
  status: 'active' | 'archived' | 'pending';
  summary?: string;
  affectedModules?: string[];
}

export type RuntimeStatus = 'healthy' | 'degraded' | 'unavailable';

export interface ServiceHealth {
  name: string;
  status: RuntimeStatus;
  detail?: string;
}

export interface ApiGatewayState {
  serviceStatus: RuntimeStatus;
  authEnabled: boolean;
  rateLimitEnabled: boolean;
}

export interface WebhookBoundary {
  signatureEnabled: boolean;
  boundary: 'internal_only';
  statusNote: string;
}

export interface RateLimitConfig {
  level: string;
  limit: number;
  burst: number;
}

export interface SecretVaultState {
  status: RuntimeStatus;
  credentialCount: number;
  lastRotation?: string;
}

export interface RuntimeModuleState {
  health: ServiceHealth[];
  pythonRuntime: ServiceHealth;
  embeddedModel: ServiceHealth;
  apiGateway: ApiGatewayState;
  webhook: WebhookBoundary;
  rateLimits: RateLimitConfig[];
  secretVault: SecretVaultState;
  internalRoutes: Array<{ name: string; path: string; access: string }>;
}
