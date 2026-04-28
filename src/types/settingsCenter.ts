export type SettingsRole = 'admin' | 'user';

export type SettingsScenario = 'default' | 'degraded' | 'missingDefaults' | 'noPermission';

export type PlannerStatus = 'ready' | 'degraded' | 'unavailable';

export type PlannerSource = 'embedded-planner' | 'rule-engine' | 'fallback';

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export type NavItemStatus = 'ok' | 'locked' | 'warning' | 'error' | 'blue';

export interface SettingsNavItem {
  key: string;
  label: string;
  path: string;
  status: NavItemStatus;
}

export interface PlannerModelState {
  status: PlannerStatus;
  source: PlannerSource;
  modelName: string;
  lastCallCount: number;
  successRate: number;
  fallbackStrategy: string;
}

export interface CapabilityItem {
  name: string;
  status: HealthStatus;
  detail?: string;
}

export interface ExternalSourceState {
  name: string;
  status: HealthStatus;
}

export interface GovernancePreviewItem {
  action: string;
  target: string;
  changedAt: string;
  actor: string;
}

export interface SettingsCenterState {
  role: SettingsRole;
  scenario: SettingsScenario;
  plannerModel: PlannerModelState;
  defaultAssistant: CapabilityItem;
  defaultModel: CapabilityItem;
  defaultDataSource: CapabilityItem;
  pythonRuntimeStatus: HealthStatus;
  secretVaultStatus: HealthStatus;
  apiGatewayStatus: HealthStatus;
  externalSources: ExternalSourceState[];
  recentGovernance: GovernancePreviewItem[];
  degradedCapabilities: string[];
}

export interface SideNavConfig {
  items: SettingsNavItem[];
}
