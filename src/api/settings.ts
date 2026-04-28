import { apiGetData, apiPostData, apiPostEnvelope } from './client';

export type DatabaseSettings = {
  databaseType: string;
  host: string;
  port: string;
  databaseName: string;
  username: string;
  password: string;
};

export type ModelItem = {
  id: string;
  label: string;
  enabled: boolean;
  modelProvider: string;
  baseUrl: string;
  apiKey?: string;
  hasApiKey?: boolean;
  modelName: string;
  timeout: string;
};

export type ModuleBindings = {
  analyze: string;
  script: string;
  search: string;
};

export type ModelSettings = {
  activeModelId: string;
  models: ModelItem[];
  moduleBindings: ModuleBindings;
  // 兼容旧逻辑的过渡字段
  modelProvider: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  timeout: string;
};

export type StrategySettings = {
  analyzeStrategy: string;
  searchStrategy: string;
  scriptStrategy: string;
};

export type ExecutionContext = {
  contractVersion?: string;
  moduleName?: string;
  assistantId?: string;
  rulesScope?: string[];
  productScope?: string[];
  docScope?: string[];
  analyzeStrategy?: string;
  searchStrategy?: string;
  scriptStrategy?: string;
  resolvedAssistant?: {
    assistantId?: string;
    assistantVersion?: string | null;
  } | null;
  resolvedPrompt?: {
    promptId?: string;
    promptVersion?: string | null;
  } | null;
  strategy?: {
    id?: string;
    label?: string;
  } | null;
  source?: Record<string, unknown> | null;
  fallbackReason?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
};

export type AssistantSettings = {
  activeAssistantId?: string;
  executionContext?: ExecutionContext;
};

export type SearchConnectorWhitelist = {
  docTypes?: string[];
  outboundDocTypes?: string[];
  extensions?: string[];
  pathPrefixes?: string[];
  outboundPathPrefixes?: string[];
  tables?: string[];
  outboundTables?: string[];
  schemas?: string[];
  outboundSchemas?: string[];
  sourceRefs?: string[];
  outboundSourceRefs?: string[];
  summaryAllowed?: boolean;
  outboundAllowed?: boolean;
};

export type SearchConnectorFieldMapping = Record<string, unknown>;

export type SearchConnectorLimitSettings = Record<string, unknown>;

export type SearchConnectorPermissionIsolation = {
  enabled?: boolean;
  readIsolationEnabled?: boolean;
  outboundIsolationEnabled?: boolean;
  sourceRefs?: string[];
  outboundSourceRefs?: string[];
};

export type SearchKnowledgeConnector = {
  id: string;
  enabled: boolean;
  adapterType?: 'knowledge';
  connectorType?: 'knowledge';
  whitelist?: SearchConnectorWhitelist;
  fieldMapping?: SearchConnectorFieldMapping;
  limits?: SearchConnectorLimitSettings;
  permissionIsolation?: SearchConnectorPermissionIsolation;
};

export type SearchFileSystemConnector = {
  id: string;
  enabled: boolean;
  adapterType?: 'file-system';
  connectorType?: 'file-system';
  roots?: string[];
  whitelist?: SearchConnectorWhitelist;
  fieldMapping?: SearchConnectorFieldMapping;
  limits?: SearchConnectorLimitSettings;
  permissionIsolation?: SearchConnectorPermissionIsolation;
};

export type SearchDatabaseConnector = {
  id: string;
  enabled: boolean;
  adapterType?: 'database';
  connectorType?: 'database';
  databaseType?: string;
  connection?: {
    databaseName?: string;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    path?: string;
  };
  whitelist?: SearchConnectorWhitelist;
  fieldMapping?: SearchConnectorFieldMapping;
  limits?: SearchConnectorLimitSettings;
  permissionIsolation?: SearchConnectorPermissionIsolation;
};

export type SearchConnectorRegistryItem = {
  id: string;
  enabled: boolean;
  adapterType?: 'knowledge' | 'file-system' | 'database';
  connectorType?: 'knowledge' | 'file-system' | 'database';
  databaseType?: string;
  roots?: string[];
  connection?: {
    databaseName?: string;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    path?: string;
    databaseType?: string;
  };
  whitelist?: SearchConnectorWhitelist;
  fieldMapping?: SearchConnectorFieldMapping;
  limits?: SearchConnectorLimitSettings;
  permissionIsolation?: SearchConnectorPermissionIsolation;
};

export type SearchSettings = {
  contractVersion?: string;
  connectorContractVersion?: string;
  summaryPolicy?: {
    maxWhitelistedEvidenceItems?: number;
    maxEvidenceSummaryLength?: number;
  };
  connectors?: {
    registry?: SearchConnectorRegistryItem[];
    knowledge?: SearchKnowledgeConnector[];
    fileSystems?: SearchFileSystemConnector[];
    databases?: SearchDatabaseConnector[];
  };
};

export type PythonRuntimeModelRoute = 'local' | 'cloud';

export type PythonRuntimeChannelSettings = {
  model: string;
  apiBase: string;
  apiKey?: string;
  hasApiKey?: boolean;
};

export type PythonRuntimeSettings = {
  contractVersion?: string;
  enabled: boolean;
  strictMode: boolean;
  baseUrl: string;
  healthGate: {
    enabled: boolean;
    strictGate: boolean;
    checkPath: string;
    timeoutMs: number;
    cacheTtlMs: number;
    maxConsecutiveFailures: number;
    cooldownMs: number;
  };
  modelRouting: {
    enabled: boolean;
    fallbackEnabled: boolean;
    moduleRoutes: {
      analyze: PythonRuntimeModelRoute;
      search: PythonRuntimeModelRoute;
      script: PythonRuntimeModelRoute;
    };
  };
  channels: {
    local: PythonRuntimeChannelSettings;
    cloud: PythonRuntimeChannelSettings;
  };
};

export type WorkflowReleaseRouteConfig = {
  kind: string;
  route: string;
  displayName?: string;
  stablePluginId: string;
  canaryPluginId: string;
  trafficPercent: number;
  rollbackOnError: boolean;
  bucketBy: string;
  enabled: boolean;
  guardEnabled?: boolean;
  minSampleSize?: number;
  maxErrorRatePercent?: number;
  maxP95LatencyMs?: number;
};

export type WorkflowReleaseSettings = {
  contractVersion?: string;
  routes?: Record<string, WorkflowReleaseRouteConfig>;
};

export type EmbeddedModelSettings = {
  enabled?: boolean;
  provider?: string;
  modelId?: string;
  modelName?: string;
  modelPath?: string;
  status?: string;
  modelPresent?: boolean;
  source?: string;
  updatedAt?: string;
  preloadOnStart?: boolean;
  contextSize?: number;
  temperature?: number;
  classificationMaxTokens?: number;
  jsonMaxTokens?: number;
  routeDecisionTimeoutMs?: number;
  fieldExtractionTimeoutMs?: number;
  structuredTransformTimeoutMs?: number;
  defaultTimeoutMs?: number;
  fallback?: {
    onLoadFailed?: string;
    onTimeout?: string;
    onInvalidJson?: string;
    onLowConfidence?: string;
  };
};

export type WorkflowManifestGovernanceSettings = {
  contractVersion?: string;
  enabled?: boolean;
  allowedRoles?: string[];
  requiredApprovals?: number;
  requireApprovalToken?: boolean;
  approvalTokenEnvVar?: string;
  requireChangeTicket?: boolean;
  allowDelete?: boolean;
  allowRollback?: boolean;
};

export type SettingsTenantIsolationSettings = {
  contractVersion?: string;
  enabled?: boolean;
  defaultTenantId?: string;
  enforceKnownTenants?: boolean;
  knownTenants?: string[];
  tenantHeader?: string;
  actorHeader?: string;
  roleHeader?: string;
};

export type SettingsRbacSettings = {
  contractVersion?: string;
  enabled?: boolean;
  defaultRole?: string;
  rolePermissions?: Record<string, string[]>;
};

export type SettingsReleaseControlSettings = {
  contractVersion?: string;
  enabled?: boolean;
  requireChangeTicket?: boolean;
  rollbackSlaMinutes?: number;
  autoPublishOnSave?: boolean;
  allowRollback?: boolean;
};

export type SettingsKeyManagementSettings = {
  contractVersion?: string;
  enabled?: boolean;
  provider?: string;
  providerConfig?: {
    encryptedFileVault?: {
      vaultFile?: string;
    };
    hashicorpVault?: {
      endpointEnvVar?: string;
      tokenEnvVar?: string;
      namespaceEnvVar?: string;
      mountPath?: string;
      secretPathPrefix?: string;
    };
    cloudKms?: {
      vendor?: string;
      credentialsEnvVar?: string;
      keyIdEnvVar?: string;
      regionEnvVar?: string;
      secretPathPrefix?: string;
    };
  };
  strict?: boolean;
  allowPlaintextWhenVaultUnavailable?: boolean;
  masterKeyEnvVar?: string;
  rotateAfterDays?: number;
};

export type SettingsSsoSettings = {
  contractVersion?: string;
  enabled?: boolean;
  mode?: 'header-trusted' | 'jwt-hs256' | string;
  required?: boolean;
  allowAnonymousRead?: boolean;
  bypassPaths?: string[];
  userIdHeader?: string;
  roleHeader?: string;
  tenantHeader?: string;
  domainsHeader?: string;
  jwtSecretEnvVar?: string;
  userIdClaim?: string;
  roleClaim?: string;
  tenantClaim?: string;
  domainsClaim?: string;
  issuer?: string;
  audience?: string;
};

export type SettingsPermissionDomainsSettings = {
  contractVersion?: string;
  enabled?: boolean;
  strictTenantMatch?: boolean;
  routeDomains?: Record<string, string>;
};

export type SettingsSecuritySettings = {
  contractVersion?: string;
  keyManagement?: SettingsKeyManagementSettings;
  sso?: SettingsSsoSettings;
  permissionDomains?: SettingsPermissionDomainsSettings;
};

export type SettingsGovernancePolicySettings = {
  contractVersion?: string;
  compatibility?: {
    includeLegacySettingsInResponse?: boolean;
  };
  workflowManifest?: WorkflowManifestGovernanceSettings;
  tenantIsolation?: SettingsTenantIsolationSettings;
  rbac?: SettingsRbacSettings;
  releaseControl?: SettingsReleaseControlSettings;
  security?: SettingsSecuritySettings;
};

export type GovernanceAuditFieldChange = {
  field: string;
  before?: string;
  after?: string;
};

export type GovernanceAuditEntry = {
  id: string;
  entityType: 'assistant' | 'prompt';
  action: string;
  actor: string;
  targetId: string;
  targetName?: string;
  summary?: string;
  createdAt?: string | null;
  changeCount?: number;
  changedFields?: GovernanceAuditFieldChange[];
  metadata?: Record<string, unknown>;
};

export type AssistantGovernanceOption = {
  assistantId: string;
  assistantName: string;
  status: string;
  currentVersion: string;
  industryType?: string;
  activeFlag?: boolean;
};

export type SettingsGovernanceSummary = {
  assistantOptions?: AssistantGovernanceOption[];
  activeAssistantId?: string;
  activeAssistantSummary?: {
    assistantId: string;
    assistantName: string;
    status: string;
    currentVersion: string;
    industryType?: string;
    defaultModuleBindings?: {
      analyze?: string;
      search?: string;
      script?: string;
    };
    defaultStrategies?: {
      analyzeStrategy?: string;
      searchStrategy?: string;
      scriptStrategy?: string;
    };
    dataScopes?: {
      rulesScope?: string[];
      productScope?: string[];
      docScope?: string[];
    };
    currentPublishedPrompt?: string;
    currentPublishedPromptVersion?: string;
    currentPublishedStrategy?: string;
  };
  activeAnalyzePromptSummary?: {
    promptId: string;
    name: string;
    module: string;
    version: string;
    status: string;
  } | null;
  databaseBindingSummary?: {
    activeDatabaseId?: string;
    databaseName?: string;
    databaseType?: string;
    relationSource?: string;
    defaultAssociatedDatabase?: string;
    visibleDatabases?: string[];
    availableDatabaseCount?: number;
  };
  recentHistory?: {
    assistant?: GovernanceAuditEntry[];
    analyzePrompt?: GovernanceAuditEntry[];
  };
};

export type SystemSettings = {
  database: DatabaseSettings;
  model: ModelSettings;
  strategy: StrategySettings;
  assistant: AssistantSettings;
  search?: SearchSettings;
  pythonRuntime?: PythonRuntimeSettings;
  workflowRelease?: WorkflowReleaseSettings;
  embeddedModel?: EmbeddedModelSettings;
  governance?: SettingsGovernancePolicySettings;
};

export type SettingsPrimaryContract = {
  contractVersion?: string;
  compatibilityMode?: string;
  settings?: Partial<SystemSettings> | null;
  executionContext?: ExecutionContext | Record<string, unknown> | null;
  governance?: SettingsGovernanceSummary | Record<string, unknown> | null;
  compatibilityPolicy?: Record<string, unknown> | null;
};

export type SettingsResponseData = SystemSettings & {
  primaryContract?: SettingsPrimaryContract;
  compatSettings?: Partial<SystemSettings>;
  configSummary?: Partial<SystemSettings>;
  statusSummary?: Record<string, unknown>;
  governanceSummary?: SettingsGovernanceSummary;
  compatibilityMode?: string;
  responseContract?: Record<string, unknown>;
  deprecatedFields?: Record<string, unknown>;
};

export type GetSettingsResponse = {
  success: boolean;
  message: string;
  data: SettingsResponseData;
};

export type SaveSettingsResponse = {
  success: boolean;
  message: string;
  data: SettingsResponseData;
};

export type WorkflowReleasePluginCandidate = {
  pluginId: string;
  displayName: string;
  releaseStage: string;
  defaultPlugin: boolean;
  order: number;
  manifestPath?: string;
};

export type WorkflowReleaseRouteOption = {
  routeKey: string;
  kind: string;
  route: string;
  displayName: string;
  stablePluginId: string;
  canaryPluginId: string;
  trafficPercent: number;
  rollbackOnError: boolean;
  bucketBy: string;
  enabled: boolean;
  guardEnabled?: boolean;
  minSampleSize?: number;
  maxErrorRatePercent?: number;
  maxP95LatencyMs?: number;
  candidates: WorkflowReleasePluginCandidate[];
};

export type WorkflowReleaseOptionsData = {
  contractVersion?: string;
  loadedAt?: string;
  manifestDirectory?: string;
  routes: WorkflowReleaseRouteOption[];
  errors?: Array<{
    manifestPath?: string;
    message?: string;
  }>;
};

export type GetWorkflowReleaseOptionsResponse = {
  success: boolean;
  message: string;
  data: WorkflowReleaseOptionsData;
};

export type SettingsGovernanceRequestContext = {
  tenantId?: string;
  actorId?: string;
  role?: string;
  changeTicket?: string;
  traceId?: string;
};

export type SettingsGovernanceVersionSummary = {
  contractVersion?: string;
  versionId: string;
  versionNumber: number;
  tenantId?: string;
  versionStatus?: string;
  sourceAction?: string;
  parentVersionId?: string;
  restoredFromVersionId?: string;
  createdAt?: string | null;
  createdBy?: {
    actorId?: string;
    role?: string;
  };
  traceId?: string;
  changeTicket?: string;
  releaseId?: string;
  releaseNumber?: number;
  releasedAt?: string | null;
  releasedBy?: {
    actorId?: string;
    role?: string;
  };
  releaseNote?: string;
  summary?: {
    reason?: string;
    changedFieldCount?: number;
    changedFields?: GovernanceAuditFieldChange[];
  };
  snapshotHash?: string;
  settingsSnapshot?: Partial<SystemSettings> | Record<string, unknown>;
};

export type SettingsGovernanceAuditEntry = {
  id: string;
  contractVersion?: string;
  createdAt?: string | null;
  tenantId?: string;
  action: string;
  actorId?: string;
  role?: string;
  traceId?: string;
  changeTicket?: string;
  targetVersionId?: string;
  fromVersionId?: string;
  toVersionId?: string;
  summary?: string;
  changedFieldCount?: number;
  changedFields?: GovernanceAuditFieldChange[];
  metadata?: Record<string, unknown>;
};

export type SettingsGovernanceOverviewData = {
  contractVersion?: string;
  tenantId: string;
  registryUpdatedAt?: string | null;
  tenant?: {
    tenantId?: string;
    status?: string;
    versionCount?: number;
    releaseCount?: number;
    pointers?: {
      activeVersionId?: string;
      publishedVersionId?: string;
      previousPublishedVersionId?: string;
    };
    latestVersion?: SettingsGovernanceVersionSummary | null;
    latestPublishedVersion?: SettingsGovernanceVersionSummary | null;
    rbac?: {
      enabled?: boolean;
      defaultRole?: string;
      roles?: string[];
    };
    releaseControl?: SettingsReleaseControlSettings;
  };
  tenantIsolation?: SettingsTenantIsolationSettings;
};

export type SettingsGovernanceHistoryData = {
  contractVersion?: string;
  tenantId: string;
  itemCount?: number;
  versions?: SettingsGovernanceVersionSummary[];
  audits?: SettingsGovernanceAuditEntry[];
  pointers?: {
    activeVersionId?: string;
    publishedVersionId?: string;
    previousPublishedVersionId?: string;
  };
  releaseControl?: SettingsReleaseControlSettings;
};

export type SettingsGovernanceReleaseResponseData = {
  contractVersion?: string;
  tenantId: string;
  traceId?: string;
  publishedVersion?: SettingsGovernanceVersionSummary | null;
  previousPublishedVersion?: SettingsGovernanceVersionSummary | null;
  pointers?: SettingsGovernanceHistoryData['pointers'];
  changedFields?: GovernanceAuditFieldChange[];
  releaseControl?: SettingsReleaseControlSettings;
  settings?: SettingsResponseData;
  persistence?: {
    persistedToDatabase?: boolean;
    persistedToLocal?: boolean;
  };
};

export type SettingsGovernanceRollbackResponseData = {
  contractVersion?: string;
  tenantId: string;
  traceId?: string;
  rollbackVersion?: SettingsGovernanceVersionSummary | null;
  restoredFromVersion?: SettingsGovernanceVersionSummary | null;
  replacedVersion?: SettingsGovernanceVersionSummary | null;
  pointers?: SettingsGovernanceHistoryData['pointers'];
  changedFields?: GovernanceAuditFieldChange[];
  rollbackDurationMs?: number;
  rollbackSlaMs?: number;
  rollbackSlaMet?: boolean;
  releaseControl?: SettingsReleaseControlSettings;
  settings?: SettingsResponseData;
  persistence?: {
    persistedToDatabase?: boolean;
    persistedToLocal?: boolean;
  };
};

export type GetSettingsGovernanceOverviewResponse = {
  success: boolean;
  message: string;
  data: SettingsGovernanceOverviewData;
};

export type GetSettingsGovernanceHistoryResponse = {
  success: boolean;
  message: string;
  data: SettingsGovernanceHistoryData;
};

export type PublishSettingsGovernanceResponse = {
  success: boolean;
  message: string;
  data: SettingsGovernanceReleaseResponseData;
};

export type RollbackSettingsGovernanceResponse = {
  success: boolean;
  message: string;
  data: SettingsGovernanceRollbackResponseData;
};

export type PublishSettingsGovernanceRequest = SettingsGovernanceRequestContext & {
  versionId?: string;
  reason?: string;
};

export type RollbackSettingsGovernanceRequest = SettingsGovernanceRequestContext & {
  targetVersionId?: string;
  reason?: string;
};

export type OpsAlertItem = {
  alertId: string;
  level: string;
  category: string;
  title: string;
  message: string;
  status: string;
  count: number;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  metadata?: Record<string, unknown>;
};

export type OpsDashboardData = {
  contractVersion?: string;
  updatedAt?: string;
  totals?: {
    requestCount?: number;
    successCount?: number;
    failureCount?: number;
    errorRatePercent?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    totalCostUsd?: number;
  };
  health?: {
    pythonRuntime?: {
      status?: string;
      consecutiveFailures?: number;
      lastCheckedAt?: string;
      lastHealthyAt?: string;
      lastErrorAt?: string;
      lastErrorMessage?: string;
      lastLatencyMs?: number;
      baseUrl?: string;
    };
  };
  alerts?: {
    summary?: {
      total?: number;
      open?: number;
      critical?: number;
      warning?: number;
      info?: number;
    };
    items?: OpsAlertItem[];
  };
  cost?: {
    costByDate?: Record<string, number>;
    topRoutes?: Array<{
      routeKey?: string;
      kind?: string;
      route?: string;
      pluginId?: string;
      requestCount?: number;
      errorRatePercent?: number;
      totalCostUsd?: number;
      totalTokens?: number;
      p95LatencyMs?: number;
      modelProvider?: string;
      modelName?: string;
      lastUpdatedAt?: string;
    }>;
  };
};

export type PythonRuntimeHealthData = {
  healthProbe?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
};

export type SettingsSecurityPostureData = {
  contractVersion?: string;
  security?: Record<string, unknown>;
  tenantIsolation?: Record<string, unknown>;
  secretVault?: {
    enabled?: boolean;
    provider?: string;
    strict?: boolean;
    masterKeyEnvVar?: string;
    hasMasterKey?: boolean;
    itemCount?: number;
    updatedAt?: string;
    vaultFile?: string;
    integrationStatus?: string;
    providerConfigSummary?: Record<string, unknown>;
    supportedProviders?: Array<{
      value?: string;
      label?: string;
      integrationStatus?: string;
    }>;
  };
  requestSecurityContext?: Record<string, unknown> | null;
};

type SettingsMutationMeta = {
  sessionId?: string;
};

export type SaveSettingsRequest = SettingsMutationMeta & {
  primaryContract: {
    contractVersion?: string;
    settings: Partial<SystemSettings>;
  };
};

export type TestDatabaseConnectionRequest = Pick<SystemSettings, 'database'> & {
  assistant?: AssistantSettings;
  sessionId?: string;
};

export type TestModelConnectionRequest = Pick<SystemSettings, 'model'> & {
  assistant?: AssistantSettings;
  sessionId?: string;
};

export type ResolvedModelInfo = {
  id?: string;
  label?: string;
  provider?: string;
  baseUrl?: string;
  modelName?: string;
  module?: string;
  source?: 'default' | 'module-binding' | 'fallback';
};

export type ModelFailureType = 'config' | 'connection' | 'fallback' | 'unknown';

export type TestDatabaseConnectionResponse = {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    databaseType: string;
    databaseFile: string;
  };
};

export type TestModelConnectionResponse = {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    provider: string;
    baseUrl: string;
    modelName: string;
    status: number;
    preview: string;
    resolvedModel?: ResolvedModelInfo;
    failureType?: ModelFailureType;
    module?: string;
  };
};

export async function getSettings(): Promise<SettingsResponseData> {
  return apiGetData<SettingsResponseData>('/api/settings', 'settings loaded');
}

export async function saveSettings(data: SaveSettingsRequest): Promise<SettingsResponseData> {
  return apiPostData<SettingsResponseData>('/api/settings', data, 'settings saved');
}

export async function testDatabaseConnection(
  data: TestDatabaseConnectionRequest,
): Promise<TestDatabaseConnectionResponse> {
  const response = await apiPostEnvelope<TestDatabaseConnectionResponse['data']>(
    '/api/settings/test-database',
    data,
    '数据库测试连接成功',
  );
  return response as TestDatabaseConnectionResponse;
}

export async function testModelConnection(
  data: TestModelConnectionRequest,
): Promise<TestModelConnectionResponse> {
  const response = await apiPostEnvelope<TestModelConnectionResponse['data']>(
    '/api/settings/test-model',
    data,
    '模型测试连接成功',
  );
  return response as TestModelConnectionResponse;
}

export async function getWorkflowReleaseOptions(): Promise<WorkflowReleaseOptionsData> {
  return apiGetData<WorkflowReleaseOptionsData>(
    '/api/settings/workflow-release-options',
    'workflow release options loaded',
  );
}

const buildGovernanceHeaders = (context: SettingsGovernanceRequestContext = {}) => {
  return {
    ...(context.tenantId ? { 'x-tenant-id': context.tenantId } : {}),
    ...(context.actorId ? { 'x-user-id': context.actorId } : {}),
    ...(context.role ? { 'x-user-role': context.role } : {}),
    ...(context.changeTicket ? { 'x-change-ticket': context.changeTicket } : {}),
    ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
  };
};

export async function getSettingsGovernanceOverview(
  context: SettingsGovernanceRequestContext = {},
): Promise<SettingsGovernanceOverviewData> {
  return apiGetData<SettingsGovernanceOverviewData>(
    '/api/settings/governance/overview',
    'settings governance overview loaded',
    {
      params: {
        ...(context.tenantId ? { tenantId: context.tenantId } : {}),
      },
      headers: buildGovernanceHeaders(context),
    },
  );
}

export async function getSettingsGovernanceHistory(
  context: SettingsGovernanceRequestContext = {},
  options: {
    limit?: number;
    includeSnapshots?: boolean;
  } = {},
): Promise<SettingsGovernanceHistoryData> {
  return apiGetData<SettingsGovernanceHistoryData>(
    '/api/settings/governance/history',
    'settings governance history loaded',
    {
      params: {
        ...(context.tenantId ? { tenantId: context.tenantId } : {}),
        ...(options.limit ? { limit: options.limit } : {}),
        ...(options.includeSnapshots ? { includeSnapshots: true } : {}),
      },
      headers: buildGovernanceHeaders(context),
    },
  );
}

export async function publishSettingsGovernanceVersion(
  payload: PublishSettingsGovernanceRequest,
): Promise<SettingsGovernanceReleaseResponseData> {
  return apiPostData<SettingsGovernanceReleaseResponseData>(
    '/api/settings/governance/release',
    {
      versionId: payload.versionId,
      reason: payload.reason,
      tenantId: payload.tenantId,
      traceId: payload.traceId,
      changeTicket: payload.changeTicket,
      actor: {
        id: payload.actorId,
        role: payload.role,
      },
    },
    'settings governance published',
    {
      headers: buildGovernanceHeaders(payload),
    },
  );
}

export async function rollbackSettingsGovernanceVersion(
  payload: RollbackSettingsGovernanceRequest,
): Promise<SettingsGovernanceRollbackResponseData> {
  return apiPostData<SettingsGovernanceRollbackResponseData>(
    '/api/settings/governance/rollback',
    {
      targetVersionId: payload.targetVersionId,
      reason: payload.reason,
      tenantId: payload.tenantId,
      traceId: payload.traceId,
      changeTicket: payload.changeTicket,
      actor: {
        id: payload.actorId,
        role: payload.role,
      },
    },
    'settings governance rolled back',
    {
      headers: buildGovernanceHeaders(payload),
    },
  );
}

export async function getOpsDashboard(): Promise<OpsDashboardData> {
  return apiGetData<OpsDashboardData>('/api/settings/ops-dashboard', 'ops dashboard loaded');
}

export async function acknowledgeOpsAlert(alertId: string, actorId = ''): Promise<OpsAlertItem> {
  return apiPostData<OpsAlertItem>(
    `/api/settings/ops-alerts/${encodeURIComponent(alertId)}/ack`,
    {
      actorId,
    },
    'ops alert acknowledged',
  );
}

export async function getPythonRuntimeHealth(force = false): Promise<PythonRuntimeHealthData> {
  return apiGetData<PythonRuntimeHealthData>(
    '/api/settings/python-runtime/health',
    'python runtime health loaded',
    {
      params: force ? { force: true } : undefined,
    },
  );
}

export async function getSettingsSecurityPosture(): Promise<SettingsSecurityPostureData> {
  return apiGetData<SettingsSecurityPostureData>(
    '/api/settings/security/posture',
    'security posture loaded',
  );
}
