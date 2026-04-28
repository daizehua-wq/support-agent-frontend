import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultAssistantProfile, getPromptForModule } from './promptService.js';
import {
  DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG,
  materializeSettingsSecrets,
  normalizeKeyManagementProviderConfig,
  normalizeKeyManagementProviderName,
  resolveSettingsSecrets,
} from './secretVaultService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const settingsFilePath = path.join(projectRoot, 'data', 'system-settings.json');
const rootSettingsFilePath = path.resolve(projectRoot, '..', 'data', 'system-settings.json');

const WORKFLOW_RELEASE_SETTINGS_CONTRACT_VERSION = 'workflow-release-settings/v1';
const SETTINGS_GOVERNANCE_CONTRACT_VERSION = 'settings-governance/v1';
const WORKFLOW_MANIFEST_GOVERNANCE_CONTRACT_VERSION = 'workflow-manifest-governance/v1';
const SETTINGS_TENANT_ISOLATION_CONTRACT_VERSION = 'settings-tenant-isolation/v1';
const SETTINGS_RBAC_CONTRACT_VERSION = 'settings-rbac/v1';
const SETTINGS_RELEASE_CONTROL_CONTRACT_VERSION = 'settings-release-control/v1';
const SETTINGS_SECURITY_CONTRACT_VERSION = 'settings-security/v1';
const SETTINGS_KEY_MANAGEMENT_CONTRACT_VERSION = 'settings-key-management/v1';
const SETTINGS_SSO_CONTRACT_VERSION = 'settings-sso/v1';
const SETTINGS_PERMISSION_DOMAIN_CONTRACT_VERSION = 'settings-permission-domain/v1';
const SEARCH_CONNECTOR_PLATFORM_VERSION = 'search-connector-platform/v2';
const PYTHON_RUNTIME_SETTINGS_CONTRACT_VERSION = 'python-runtime-settings/v1';

const DEFAULT_WORKFLOW_RELEASE_ROUTES = Object.freeze({
  'analyze:analyze-customer': {
    kind: 'analyze',
    route: 'analyze-customer',
    displayName: 'Analyze / analyze-customer',
    stablePluginId: 'builtin.analyze.default',
    canaryPluginId: '',
    trafficPercent: 0,
    rollbackOnError: false,
    bucketBy: 'sessionId',
    enabled: true,
    guardEnabled: false,
    minSampleSize: 20,
    maxErrorRatePercent: 20,
    maxP95LatencyMs: 25000,
  },
  'search:search-documents': {
    kind: 'search',
    route: 'search-documents',
    displayName: 'Search / search-documents',
    stablePluginId: 'builtin.search.default',
    canaryPluginId: '',
    trafficPercent: 0,
    rollbackOnError: false,
    bucketBy: 'sessionId',
    enabled: true,
    guardEnabled: false,
    minSampleSize: 20,
    maxErrorRatePercent: 20,
    maxP95LatencyMs: 25000,
  },
  'output:generate-script': {
    kind: 'output',
    route: 'generate-script',
    displayName: 'Output / generate-script',
    stablePluginId: 'builtin.output.default',
    canaryPluginId: 'custom.output.canary-annotator',
    trafficPercent: 20,
    rollbackOnError: true,
    bucketBy: 'sessionId',
    enabled: true,
    guardEnabled: false,
    minSampleSize: 20,
    maxErrorRatePercent: 20,
    maxP95LatencyMs: 25000,
  },
});

const DEFAULT_WORKFLOW_MANIFEST_GOVERNANCE = Object.freeze({
  contractVersion: WORKFLOW_MANIFEST_GOVERNANCE_CONTRACT_VERSION,
  enabled: true,
  allowedRoles: ['platform-owner', 'release-manager'],
  requiredApprovals: 1,
  requireApprovalToken: true,
  approvalTokenEnvVar: 'WORKFLOW_MANIFEST_ADMIN_TOKEN',
  requireChangeTicket: true,
  allowDelete: true,
  allowRollback: true,
});

const DEFAULT_SETTINGS_TENANT_ISOLATION = Object.freeze({
  contractVersion: SETTINGS_TENANT_ISOLATION_CONTRACT_VERSION,
  enabled: true,
  defaultTenantId: 'default',
  enforceKnownTenants: false,
  knownTenants: ['default'],
  tenantHeader: 'x-tenant-id',
  actorHeader: 'x-user-id',
  roleHeader: 'x-user-role',
});

const buildBuiltinSettingsRolePermissions = () => ({
  'platform-owner': [
    'settings:read',
    'settings:update',
    'settings:publish',
    'settings:rollback',
    'settings:audit',
    'settings:release:manage',
  ],
  'release-manager': [
    'settings:read',
    'settings:publish',
    'settings:rollback',
    'settings:audit',
  ],
  'config-editor': [
    'settings:read',
    'settings:update',
    'settings:audit',
  ],
  auditor: [
    'settings:read',
    'settings:audit',
  ],
  viewer: ['settings:read'],
});

const DEFAULT_SETTINGS_RBAC_ROLE_PERMISSIONS = Object.freeze(
  buildBuiltinSettingsRolePermissions(),
);

const DEFAULT_SETTINGS_RBAC = Object.freeze({
  contractVersion: SETTINGS_RBAC_CONTRACT_VERSION,
  enabled: true,
  defaultRole: 'platform-owner',
  rolePermissions: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_RBAC_ROLE_PERMISSIONS)),
});

const DEFAULT_SETTINGS_RELEASE_CONTROL = Object.freeze({
  contractVersion: SETTINGS_RELEASE_CONTROL_CONTRACT_VERSION,
  enabled: true,
  requireChangeTicket: true,
  rollbackSlaMinutes: 5,
  autoPublishOnSave: false,
  allowRollback: true,
});

const DEFAULT_SETTINGS_KEY_MANAGEMENT = Object.freeze({
  contractVersion: SETTINGS_KEY_MANAGEMENT_CONTRACT_VERSION,
  enabled: true,
  provider: 'encrypted-file-vault',
  providerConfig: JSON.parse(JSON.stringify(DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG)),
  strict: false,
  allowPlaintextWhenVaultUnavailable: true,
  masterKeyEnvVar: 'SETTINGS_SECRET_MASTER_KEY',
  rotateAfterDays: 90,
});

const DEFAULT_SETTINGS_SSO = Object.freeze({
  contractVersion: SETTINGS_SSO_CONTRACT_VERSION,
  enabled: false,
  mode: 'header-trusted',
  required: true,
  allowAnonymousRead: false,
  bypassPaths: ['/health'],
  userIdHeader: 'x-sso-user-id',
  roleHeader: 'x-sso-role',
  tenantHeader: 'x-sso-tenant-id',
  domainsHeader: 'x-sso-domains',
  jwtSecretEnvVar: 'SETTINGS_SSO_JWT_SECRET',
  userIdClaim: 'sub',
  roleClaim: 'role',
  tenantClaim: 'tenantId',
  domainsClaim: 'domains',
  issuer: '',
  audience: '',
});

const DEFAULT_SETTINGS_PERMISSION_DOMAINS = Object.freeze({
  contractVersion: SETTINGS_PERMISSION_DOMAIN_CONTRACT_VERSION,
  enabled: true,
  strictTenantMatch: true,
  routeDomains: {
    '/api/settings': 'settings',
    '/api/agent': 'runtime',
    '/api/database-manager': 'database',
  },
});

const DEFAULT_SETTINGS_SECURITY = Object.freeze({
  contractVersion: SETTINGS_SECURITY_CONTRACT_VERSION,
  keyManagement: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_KEY_MANAGEMENT)),
  sso: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_SSO)),
  permissionDomains: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_PERMISSION_DOMAINS)),
});

const DEFAULT_SETTINGS_GOVERNANCE = Object.freeze({
  contractVersion: SETTINGS_GOVERNANCE_CONTRACT_VERSION,
  compatibility: {
    includeLegacySettingsInResponse: false,
  },
  workflowManifest: JSON.parse(JSON.stringify(DEFAULT_WORKFLOW_MANIFEST_GOVERNANCE)),
  tenantIsolation: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_TENANT_ISOLATION)),
  rbac: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_RBAC)),
  releaseControl: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_RELEASE_CONTROL)),
  security: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_SECURITY)),
});

// =========================
// 配置默认值层
// 只承接系统默认配置，不承接运行态解析结果。
// =========================
export const DEFAULT_SETTINGS = {
  database: {
    databaseType: 'sqlite',
    host: 'localhost',
    port: '5432',
    databaseName: 'sales_support_agent',
    username: 'postgres',
    password: '',
  },
  model: {
    activeModelId: 'default-local',
    models: [
      {
        id: 'default-local',
        label: '本地模型',
        enabled: true,
        modelProvider: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: '',
        modelName: 'deepseek-r1:14b',
        timeout: '180000',
      },
    ],
    moduleBindings: {
      analyze: 'default-local',
      script: 'default-local',
      search: 'default-local',
    },
    modelProvider: 'local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    modelName: 'deepseek-r1:14b',
    timeout: '180000',
  },
  strategy: {
    analyzeStrategy: 'rules-only',
    searchStrategy: 'local-only',
    scriptStrategy: 'local-model',
  },
  assistant: {
    activeAssistantId: '',
    activePromptId: null,
    assistantVersion: null,
    promptVersion: null,
    executionContext: null,
  },
  search: {
    contractVersion: 'search-settings/v1',
    connectorContractVersion: SEARCH_CONNECTOR_PLATFORM_VERSION,
    summaryPolicy: {
      maxWhitelistedEvidenceItems: 6,
      maxEvidenceSummaryLength: 180,
    },
    connectors: {
      knowledge: [
        {
          id: 'knowledge-products',
          enabled: true,
          whitelist: {
            docTypes: ['spec', 'faq', 'case', 'project', '规格书', 'FAQ', '案例资料', '项目资料'],
            outboundDocTypes: ['spec', 'faq', '规格书', 'FAQ'],
            summaryAllowed: true,
          },
          fieldMapping: {
            title: 'docName',
            docType: 'docType',
            summary: 'summaryText',
            applicableScene: 'applicableScene',
          },
        },
      ],
      fileSystems: [
        {
          id: 'filesystem-default',
          enabled: true,
          roots: ['前端支持文件', '后端支持文件', 'data'],
          whitelist: {
            extensions: ['.md', '.txt', '.json'],
            pathPrefixes: [],
            outboundPathPrefixes: [],
            summaryAllowed: false,
          },
          fieldMapping: {
            title: 'basename',
            applicableScene: 'directory',
          },
          limits: {
            maxScanCount: 120,
            maxMatchCount: 8,
          },
        },
      ],
      databases: [],
    },
  },
  pythonRuntime: {
    contractVersion: PYTHON_RUNTIME_SETTINGS_CONTRACT_VERSION,
    enabled: false,
    strictMode: false,
    baseUrl: 'http://127.0.0.1:8008',
    healthGate: {
      enabled: true,
      strictGate: false,
      checkPath: '/health',
      timeoutMs: 1500,
      cacheTtlMs: 5000,
      maxConsecutiveFailures: 2,
      cooldownMs: 15000,
    },
    modelRouting: {
      enabled: true,
      fallbackEnabled: true,
      moduleRoutes: {
        analyze: 'local',
        search: 'local',
        script: 'cloud',
      },
    },
    channels: {
      local: {
        model: 'ollama/deepseek-r1:14b',
        apiBase: 'http://127.0.0.1:11434',
        apiKey: '',
      },
      cloud: {
        model: 'gpt-4o-mini',
        apiBase: '',
        apiKey: '',
      },
    },
  },
  workflowRelease: {
    contractVersion: WORKFLOW_RELEASE_SETTINGS_CONTRACT_VERSION,
    routes: JSON.parse(JSON.stringify(DEFAULT_WORKFLOW_RELEASE_ROUTES)),
  },
  governance: JSON.parse(JSON.stringify(DEFAULT_SETTINGS_GOVERNANCE)),
};

export const normalizeAssistantSettings = (assistantSettings = {}) => {
  return {
    ...DEFAULT_SETTINGS.assistant,
    ...(assistantSettings || {}),
    executionContext:
      assistantSettings?.executionContext === undefined
        ? DEFAULT_SETTINGS.assistant.executionContext
        : assistantSettings.executionContext,
  };
};

// 运行模型解析 helper：服务 model snapshot / module model 解析。
const getResolvedActiveModelSnapshot = (modelSettings = {}) => {
  const models = Array.isArray(modelSettings.models) ? modelSettings.models : [];
  const activeModelId = modelSettings.activeModelId || models[0]?.id || DEFAULT_SETTINGS.model.activeModelId;
  const matchedModel =
    models.find((item) => item.id === activeModelId) ||
    models.find((item) => item.id === DEFAULT_SETTINGS.model.activeModelId) ||
    models[0] ||
    DEFAULT_SETTINGS.model.models[0];

  return {
    activeModelId: matchedModel.id || activeModelId,
    modelProvider: matchedModel.modelProvider || modelSettings.modelProvider || DEFAULT_SETTINGS.model.modelProvider,
    baseUrl: matchedModel.baseUrl || modelSettings.baseUrl || DEFAULT_SETTINGS.model.baseUrl,
    apiKey: matchedModel.apiKey || modelSettings.apiKey || '',
    modelName: matchedModel.modelName || modelSettings.modelName || DEFAULT_SETTINGS.model.modelName,
    timeout: matchedModel.timeout || modelSettings.timeout || DEFAULT_SETTINGS.model.timeout,
  };
};

// =========================
// 运行解析层
// 只服务 executionContext、strategy、model runtime 解析。
// =========================
const MODULE_STRATEGY_KEY_MAP = {
  analyze: 'analyzeStrategy',
  search: 'searchStrategy',
  script: 'scriptStrategy',
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizePythonModelRoute = (value = '', fallback = 'local') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'local' || normalized === 'cloud') {
    return normalized;
  }
  return fallback;
};

const normalizePythonRuntimeChannel = (channelInput = {}, fallback = {}) => {
  const normalizedInput = isPlainObject(channelInput) ? channelInput : {};
  const normalizedFallback = isPlainObject(fallback) ? fallback : {};

  return {
    model: String(normalizedInput.model || normalizedFallback.model || '').trim(),
    apiBase: String(normalizedInput.apiBase || normalizedFallback.apiBase || '').trim(),
    apiKey: String(normalizedInput.apiKey || normalizedFallback.apiKey || '').trim(),
  };
};

const stripOllamaModelPrefix = (value = '') => {
  return String(value || '').trim().replace(/^ollama\//i, '');
};

const toOllamaRuntimeModelRef = (value = '') => {
  const modelName = stripOllamaModelPrefix(value);
  return modelName ? `ollama/${modelName}` : '';
};

const getConfiguredLocalModelNames = (modelSettings = {}) => {
  const models = Array.isArray(modelSettings.models) ? modelSettings.models : [];

  return models
    .filter((model) => {
      const provider = String(model?.modelProvider || model?.provider || '').trim().toLowerCase();
      return model?.enabled !== false && ['local', 'ollama'].includes(provider);
    })
    .map((model) => stripOllamaModelPrefix(model.modelName || model.model || ''))
    .filter(Boolean);
};

const resolvePythonRuntimeLocalModel = (currentModel = '', modelSettings = {}) => {
  const localModelNames = getConfiguredLocalModelNames(modelSettings);
  const currentModelName = stripOllamaModelPrefix(currentModel);

  if (currentModelName && localModelNames.includes(currentModelName)) {
    return toOllamaRuntimeModelRef(currentModelName);
  }

  const activeModel = Array.isArray(modelSettings.models)
    ? modelSettings.models.find((model) => model?.id === modelSettings.activeModelId)
    : null;
  const activeProvider = String(activeModel?.modelProvider || activeModel?.provider || '').toLowerCase();
  const activeLocalModelName =
    activeModel?.enabled !== false && ['local', 'ollama'].includes(activeProvider)
      ? stripOllamaModelPrefix(activeModel.modelName || activeModel.model || '')
      : '';

  return toOllamaRuntimeModelRef(
    activeLocalModelName ||
      localModelNames[0] ||
      DEFAULT_SETTINGS.model.modelName,
  );
};

const syncPythonRuntimeLocalChannelWithModels = (pythonRuntimeSettings = {}, modelSettings = null) => {
  if (!isPlainObject(modelSettings)) {
    return pythonRuntimeSettings;
  }

  const channels = isPlainObject(pythonRuntimeSettings.channels)
    ? pythonRuntimeSettings.channels
    : {};
  const localChannel = isPlainObject(channels.local) ? channels.local : {};

  return {
    ...pythonRuntimeSettings,
    channels: {
      ...channels,
      local: {
        ...localChannel,
        model: resolvePythonRuntimeLocalModel(localChannel.model, modelSettings),
      },
    },
  };
};

export const normalizePythonRuntimeSettings = (pythonRuntimeSettings = {}, options = {}) => {
  const normalizedInput = isPlainObject(pythonRuntimeSettings) ? pythonRuntimeSettings : {};
  const routingInput = isPlainObject(normalizedInput.modelRouting)
    ? normalizedInput.modelRouting
    : {};
  const healthGateInput = isPlainObject(normalizedInput.healthGate)
    ? normalizedInput.healthGate
    : {};
  const channelsInput = isPlainObject(normalizedInput.channels)
    ? normalizedInput.channels
    : {};
  const defaultSettings = DEFAULT_SETTINGS.pythonRuntime;
  const defaultRouting = defaultSettings.modelRouting || {};
  const defaultHealthGate = isPlainObject(defaultSettings.healthGate)
    ? defaultSettings.healthGate
    : {};
  const defaultModuleRoutes = defaultRouting.moduleRoutes || {};
  const defaultChannels = defaultSettings.channels || {};

  const normalized = {
    contractVersion:
      String(normalizedInput.contractVersion || '').trim() ||
      PYTHON_RUNTIME_SETTINGS_CONTRACT_VERSION,
    enabled:
      normalizedInput.enabled === undefined
        ? defaultSettings.enabled === true
        : normalizedInput.enabled === true,
    strictMode:
      normalizedInput.strictMode === undefined
        ? defaultSettings.strictMode === true
        : normalizedInput.strictMode === true,
    baseUrl:
      String(normalizedInput.baseUrl || '').trim() ||
      String(defaultSettings.baseUrl || '').trim(),
    healthGate: {
      enabled:
        healthGateInput.enabled === undefined
          ? defaultHealthGate.enabled !== false
          : healthGateInput.enabled === true,
      strictGate:
        healthGateInput.strictGate === undefined
          ? defaultHealthGate.strictGate === true
          : healthGateInput.strictGate === true,
      checkPath:
        String(healthGateInput.checkPath || '').trim() ||
        String(defaultHealthGate.checkPath || '/health').trim() ||
        '/health',
      timeoutMs: Math.max(
        300,
        Number(healthGateInput.timeoutMs || defaultHealthGate.timeoutMs || 1500) || 1500,
      ),
      cacheTtlMs: Math.max(
        0,
        Number(healthGateInput.cacheTtlMs || defaultHealthGate.cacheTtlMs || 5000) || 5000,
      ),
      maxConsecutiveFailures: Math.max(
        1,
        Number(
          healthGateInput.maxConsecutiveFailures ||
            defaultHealthGate.maxConsecutiveFailures ||
            2,
        ) || 2,
      ),
      cooldownMs: Math.max(
        0,
        Number(healthGateInput.cooldownMs || defaultHealthGate.cooldownMs || 15000) || 15000,
      ),
    },
    modelRouting: {
      enabled:
        routingInput.enabled === undefined
          ? defaultRouting.enabled !== false
          : routingInput.enabled === true,
      fallbackEnabled:
        routingInput.fallbackEnabled === undefined
          ? defaultRouting.fallbackEnabled !== false
          : routingInput.fallbackEnabled === true,
      moduleRoutes: {
        analyze: normalizePythonModelRoute(
          routingInput.moduleRoutes?.analyze,
          normalizePythonModelRoute(defaultModuleRoutes.analyze, 'local'),
        ),
        search: normalizePythonModelRoute(
          routingInput.moduleRoutes?.search,
          normalizePythonModelRoute(defaultModuleRoutes.search, 'local'),
        ),
        script: normalizePythonModelRoute(
          routingInput.moduleRoutes?.script,
          normalizePythonModelRoute(defaultModuleRoutes.script, 'cloud'),
        ),
      },
    },
    channels: {
      local: normalizePythonRuntimeChannel(
        channelsInput.local,
        defaultChannels.local,
      ),
      cloud: normalizePythonRuntimeChannel(
        channelsInput.cloud,
        defaultChannels.cloud,
      ),
    },
  };

  return syncPythonRuntimeLocalChannelWithModels(normalized, options.modelSettings);
};

const normalizeDatabaseType = (databaseType = 'sqlite') => {
  const normalizedType = String(databaseType || 'sqlite').trim().toLowerCase();

  if (!normalizedType) {
    return 'sqlite';
  }

  if (normalizedType === 'postgresql') {
    return 'postgres';
  }

  if (normalizedType === 'sqlite3') {
    return 'sqlite';
  }

  return normalizedType;
};

const normalizeDatabaseSettingsList = (databaseSettings = [], legacyDatabase = undefined) => {
  const normalizedDatabases = Array.isArray(databaseSettings)
    ? databaseSettings.filter((item) => isPlainObject(item))
    : [];

  if (normalizedDatabases.length > 0) {
    return normalizedDatabases;
  }

  if (isPlainObject(legacyDatabase) && Object.keys(legacyDatabase).length > 0) {
    return [
      {
        ...DEFAULT_SETTINGS.database,
        ...legacyDatabase,
      },
    ];
  }

  return [];
};

const normalizeConnectorObject = (value = {}, fallback = {}) => {
  return {
    ...fallback,
    ...(isPlainObject(value) ? value : {}),
  };
};

const normalizeConnectorList = (value = [], fallback = []) => {
  const normalizedValue = Array.isArray(value) ? value.filter((item) => isPlainObject(item)) : [];
  return normalizedValue.length > 0 ? normalizedValue : fallback;
};

const normalizeStringArray = (value = [], fallback = []) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const normalizeRoleArray = (value = [], fallback = []) => {
  const normalizedValues = normalizeStringArray(value, []);

  if (normalizedValues.length > 0) {
    return [...new Set(normalizedValues)];
  }

  return normalizeStringArray(fallback, []);
};

const normalizeStringRecord = (value = {}, fallback = {}) => {
  const fallbackRecord = isPlainObject(fallback) ? fallback : {};
  const inputRecord = isPlainObject(value) ? value : {};
  const normalizedRecord = {};

  Object.entries(fallbackRecord).forEach(([key, fallbackValue]) => {
    normalizedRecord[String(key || '').trim()] = normalizeStringArray(
      inputRecord[key],
      normalizeStringArray(fallbackValue, []),
    );
  });

  Object.entries(inputRecord).forEach(([key, inputValue]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return;
    }

    if (normalizedRecord[normalizedKey]) {
      return;
    }

    const normalizedValues = normalizeStringArray(inputValue, []);
    if (normalizedValues.length > 0) {
      normalizedRecord[normalizedKey] = [...new Set(normalizedValues)];
    }
  });

  return normalizedRecord;
};

const normalizeRolePermissionsMap = (value = {}, fallback = {}) => {
  const fallbackRecord = isPlainObject(fallback) ? fallback : {};
  const inputRecord = isPlainObject(value) ? value : {};
  const allRoles = [...new Set([...Object.keys(fallbackRecord), ...Object.keys(inputRecord)])];
  const normalizedRecord = {};

  allRoles.forEach((roleName) => {
    const normalizedRole = String(roleName || '').trim();
    if (!normalizedRole) {
      return;
    }

    const inputPermissions = normalizeStringArray(inputRecord[normalizedRole], []);
    const fallbackPermissions = normalizeStringArray(fallbackRecord[normalizedRole], []);
    const selectedPermissions =
      inputPermissions.length > 0 ? inputPermissions : fallbackPermissions;

    if (selectedPermissions.length > 0) {
      normalizedRecord[normalizedRole] = [...new Set(selectedPermissions)];
    }
  });

  return normalizedRecord;
};

const normalizeTenantIsolationSettings = (tenantIsolationSettings = {}) => {
  const normalizedSettings = isPlainObject(tenantIsolationSettings)
    ? tenantIsolationSettings
    : {};
  const fallbackSettings = DEFAULT_SETTINGS_TENANT_ISOLATION;
  const fallbackKnownTenants = normalizeStringArray(fallbackSettings.knownTenants, ['default']);
  const effectiveFallbackKnownTenants =
    fallbackKnownTenants.length > 0 ? fallbackKnownTenants : ['default'];
  const incomingKnownTenants = normalizeStringArray(normalizedSettings.knownTenants, []);

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_TENANT_ISOLATION_CONTRACT_VERSION,
      ).trim() || SETTINGS_TENANT_ISOLATION_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled !== false
        : normalizedSettings.enabled !== false,
    defaultTenantId:
      String(
        normalizedSettings.defaultTenantId ||
          fallbackSettings.defaultTenantId ||
          'default',
      ).trim() || 'default',
    enforceKnownTenants:
      normalizedSettings.enforceKnownTenants === undefined
        ? fallbackSettings.enforceKnownTenants === true
        : normalizedSettings.enforceKnownTenants === true,
    knownTenants:
      incomingKnownTenants.length > 0
        ? incomingKnownTenants
        : effectiveFallbackKnownTenants,
    tenantHeader:
      String(
        normalizedSettings.tenantHeader ||
          fallbackSettings.tenantHeader ||
          'x-tenant-id',
      ).trim() || 'x-tenant-id',
    actorHeader:
      String(
        normalizedSettings.actorHeader ||
          fallbackSettings.actorHeader ||
          'x-user-id',
      ).trim() || 'x-user-id',
    roleHeader:
      String(
        normalizedSettings.roleHeader ||
          fallbackSettings.roleHeader ||
          'x-user-role',
      ).trim() || 'x-user-role',
  };
};

const normalizeSettingsRbac = (rbacSettings = {}) => {
  const normalizedSettings = isPlainObject(rbacSettings)
    ? rbacSettings
    : {};
  const fallbackSettings = DEFAULT_SETTINGS_RBAC;
  const builtinRolePermissions = buildBuiltinSettingsRolePermissions();
  const fallbackRolePermissions = normalizeRolePermissionsMap(
    fallbackSettings.rolePermissions,
    builtinRolePermissions,
  );
  const fallbackRolePermissionCount = Object.values(fallbackRolePermissions).reduce(
    (count, permissions) =>
      count + (Array.isArray(permissions) ? permissions.length : 0),
    0,
  );
  const effectiveFallbackRolePermissions =
    Object.keys(fallbackRolePermissions).length > 0 && fallbackRolePermissionCount > 0
      ? fallbackRolePermissions
      : normalizeRolePermissionsMap({}, builtinRolePermissions);

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_RBAC_CONTRACT_VERSION,
      ).trim() || SETTINGS_RBAC_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled !== false
        : normalizedSettings.enabled !== false,
    defaultRole:
      String(
        normalizedSettings.defaultRole ||
          fallbackSettings.defaultRole ||
          'platform-owner',
      ).trim() || 'platform-owner',
    rolePermissions: normalizeRolePermissionsMap(
      normalizedSettings.rolePermissions,
      effectiveFallbackRolePermissions,
    ),
  };
};

const normalizeSettingsReleaseControl = (releaseControlSettings = {}) => {
  const normalizedSettings = isPlainObject(releaseControlSettings)
    ? releaseControlSettings
    : {};
  const fallbackSettings = DEFAULT_SETTINGS_RELEASE_CONTROL;

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_RELEASE_CONTROL_CONTRACT_VERSION,
      ).trim() || SETTINGS_RELEASE_CONTROL_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled !== false
        : normalizedSettings.enabled !== false,
    requireChangeTicket:
      normalizedSettings.requireChangeTicket === undefined
        ? fallbackSettings.requireChangeTicket === true
        : normalizedSettings.requireChangeTicket === true,
    rollbackSlaMinutes: Math.max(
      1,
      Number(
        normalizedSettings.rollbackSlaMinutes !== undefined
          ? normalizedSettings.rollbackSlaMinutes
          : fallbackSettings.rollbackSlaMinutes || 5,
      ) || 5,
    ),
    autoPublishOnSave:
      normalizedSettings.autoPublishOnSave === undefined
        ? fallbackSettings.autoPublishOnSave === true
        : normalizedSettings.autoPublishOnSave === true,
    allowRollback:
      normalizedSettings.allowRollback === undefined
        ? fallbackSettings.allowRollback !== false
        : normalizedSettings.allowRollback !== false,
  };
};

const normalizeSettingsKeyManagement = (keyManagementSettings = {}) => {
  const normalizedSettings = isPlainObject(keyManagementSettings)
    ? keyManagementSettings
    : {};
  const fallbackSettings = DEFAULT_SETTINGS_KEY_MANAGEMENT;

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_KEY_MANAGEMENT_CONTRACT_VERSION,
      ).trim() || SETTINGS_KEY_MANAGEMENT_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled === true
        : normalizedSettings.enabled === true,
    provider:
      normalizeKeyManagementProviderName(
        String(normalizedSettings.provider || fallbackSettings.provider || 'encrypted-file-vault')
          .trim() || 'encrypted-file-vault',
      ),
    providerConfig: normalizeKeyManagementProviderConfig(
      normalizedSettings.providerConfig || fallbackSettings.providerConfig,
    ),
    strict:
      normalizedSettings.strict === undefined
        ? fallbackSettings.strict === true
        : normalizedSettings.strict === true,
    allowPlaintextWhenVaultUnavailable:
      normalizedSettings.allowPlaintextWhenVaultUnavailable === undefined
        ? fallbackSettings.allowPlaintextWhenVaultUnavailable === true
        : normalizedSettings.allowPlaintextWhenVaultUnavailable === true,
    masterKeyEnvVar:
      String(
        normalizedSettings.masterKeyEnvVar ||
          fallbackSettings.masterKeyEnvVar ||
          'SETTINGS_SECRET_MASTER_KEY',
      ).trim() || 'SETTINGS_SECRET_MASTER_KEY',
    rotateAfterDays: Math.max(
      1,
      Number(
        normalizedSettings.rotateAfterDays !== undefined
          ? normalizedSettings.rotateAfterDays
          : fallbackSettings.rotateAfterDays || 90,
      ) || 90,
    ),
  };
};

const normalizeSettingsSso = (ssoSettings = {}) => {
  const normalizedSettings = isPlainObject(ssoSettings) ? ssoSettings : {};
  const fallbackSettings = DEFAULT_SETTINGS_SSO;
  const modeCandidate = String(normalizedSettings.mode || fallbackSettings.mode || 'header-trusted')
    .trim()
    .toLowerCase();
  const normalizedMode =
    modeCandidate === 'jwt-hs256' || modeCandidate === 'header-trusted'
      ? modeCandidate
      : 'header-trusted';

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_SSO_CONTRACT_VERSION,
      ).trim() || SETTINGS_SSO_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled === true
        : normalizedSettings.enabled === true,
    mode: normalizedMode,
    required:
      normalizedSettings.required === undefined
        ? fallbackSettings.required !== false
        : normalizedSettings.required !== false,
    allowAnonymousRead:
      normalizedSettings.allowAnonymousRead === undefined
        ? fallbackSettings.allowAnonymousRead === true
        : normalizedSettings.allowAnonymousRead === true,
    bypassPaths: normalizeStringArray(
      normalizedSettings.bypassPaths,
      normalizeStringArray(fallbackSettings.bypassPaths, ['/health']),
    ),
    userIdHeader:
      String(normalizedSettings.userIdHeader || fallbackSettings.userIdHeader || 'x-sso-user-id')
        .trim() || 'x-sso-user-id',
    roleHeader:
      String(normalizedSettings.roleHeader || fallbackSettings.roleHeader || 'x-sso-role').trim() ||
      'x-sso-role',
    tenantHeader:
      String(
        normalizedSettings.tenantHeader ||
          fallbackSettings.tenantHeader ||
          'x-sso-tenant-id',
      ).trim() || 'x-sso-tenant-id',
    domainsHeader:
      String(
        normalizedSettings.domainsHeader ||
          fallbackSettings.domainsHeader ||
          'x-sso-domains',
      ).trim() || 'x-sso-domains',
    jwtSecretEnvVar:
      String(
        normalizedSettings.jwtSecretEnvVar ||
          fallbackSettings.jwtSecretEnvVar ||
          'SETTINGS_SSO_JWT_SECRET',
      ).trim() || 'SETTINGS_SSO_JWT_SECRET',
    userIdClaim:
      String(normalizedSettings.userIdClaim || fallbackSettings.userIdClaim || 'sub').trim() ||
      'sub',
    roleClaim:
      String(normalizedSettings.roleClaim || fallbackSettings.roleClaim || 'role').trim() || 'role',
    tenantClaim:
      String(normalizedSettings.tenantClaim || fallbackSettings.tenantClaim || 'tenantId').trim() ||
      'tenantId',
    domainsClaim:
      String(normalizedSettings.domainsClaim || fallbackSettings.domainsClaim || 'domains').trim() ||
      'domains',
    issuer: String(normalizedSettings.issuer || fallbackSettings.issuer || '').trim(),
    audience: String(normalizedSettings.audience || fallbackSettings.audience || '').trim(),
  };
};

const normalizeRouteDomains = (routeDomains = {}, fallbackRouteDomains = {}) => {
  const normalizedRouteDomains = {};
  const fallbackRecord = isPlainObject(fallbackRouteDomains) ? fallbackRouteDomains : {};
  const inputRecord = isPlainObject(routeDomains) ? routeDomains : {};

  Object.entries({ ...fallbackRecord, ...inputRecord }).forEach(([routePrefix, domainName]) => {
    const normalizedRoutePrefix = String(routePrefix || '').trim();
    const normalizedDomainName = String(domainName || '').trim();

    if (!normalizedRoutePrefix || !normalizedDomainName) {
      return;
    }

    normalizedRouteDomains[normalizedRoutePrefix] = normalizedDomainName;
  });

  return normalizedRouteDomains;
};

const normalizeSettingsPermissionDomains = (permissionDomainSettings = {}) => {
  const normalizedSettings = isPlainObject(permissionDomainSettings)
    ? permissionDomainSettings
    : {};
  const fallbackSettings = DEFAULT_SETTINGS_PERMISSION_DOMAINS;

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_PERMISSION_DOMAIN_CONTRACT_VERSION,
      ).trim() || SETTINGS_PERMISSION_DOMAIN_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled !== false
        : normalizedSettings.enabled !== false,
    strictTenantMatch:
      normalizedSettings.strictTenantMatch === undefined
        ? fallbackSettings.strictTenantMatch !== false
        : normalizedSettings.strictTenantMatch !== false,
    routeDomains: normalizeRouteDomains(
      normalizedSettings.routeDomains,
      fallbackSettings.routeDomains,
    ),
  };
};

const normalizeSettingsSecurity = (securitySettings = {}) => {
  const normalizedSettings = isPlainObject(securitySettings) ? securitySettings : {};
  const fallbackSettings = DEFAULT_SETTINGS_SECURITY;

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          SETTINGS_SECURITY_CONTRACT_VERSION,
      ).trim() || SETTINGS_SECURITY_CONTRACT_VERSION,
    keyManagement: normalizeSettingsKeyManagement(
      normalizedSettings.keyManagement || fallbackSettings.keyManagement,
    ),
    sso: normalizeSettingsSso(normalizedSettings.sso || fallbackSettings.sso),
    permissionDomains: normalizeSettingsPermissionDomains(
      normalizedSettings.permissionDomains || fallbackSettings.permissionDomains,
    ),
  };
};

const normalizeWorkflowManifestGovernanceSettings = (workflowManifestSettings = {}) => {
  const normalizedSettings = isPlainObject(workflowManifestSettings)
    ? workflowManifestSettings
    : {};
  const fallbackSettings = DEFAULT_WORKFLOW_MANIFEST_GOVERNANCE;
  const fallbackAllowedRoles = normalizeRoleArray(
    fallbackSettings.allowedRoles,
    ['platform-owner', 'release-manager'],
  );
  const effectiveFallbackAllowedRoles =
    fallbackAllowedRoles.length > 0
      ? fallbackAllowedRoles
      : ['platform-owner', 'release-manager'];

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          fallbackSettings.contractVersion ||
          WORKFLOW_MANIFEST_GOVERNANCE_CONTRACT_VERSION,
      ).trim() || WORKFLOW_MANIFEST_GOVERNANCE_CONTRACT_VERSION,
    enabled:
      normalizedSettings.enabled === undefined
        ? fallbackSettings.enabled !== false
        : normalizedSettings.enabled !== false,
    allowedRoles: normalizeRoleArray(
      normalizedSettings.allowedRoles,
      effectiveFallbackAllowedRoles,
    ),
    requiredApprovals: Math.max(
      1,
      Number(
        normalizedSettings.requiredApprovals !== undefined
          ? normalizedSettings.requiredApprovals
          : fallbackSettings.requiredApprovals || 1,
      ) || 1,
    ),
    requireApprovalToken:
      normalizedSettings.requireApprovalToken === undefined
        ? fallbackSettings.requireApprovalToken === true
        : normalizedSettings.requireApprovalToken === true,
    approvalTokenEnvVar:
      String(
        normalizedSettings.approvalTokenEnvVar ||
          fallbackSettings.approvalTokenEnvVar ||
          'WORKFLOW_MANIFEST_ADMIN_TOKEN',
      ).trim() || 'WORKFLOW_MANIFEST_ADMIN_TOKEN',
    requireChangeTicket:
      normalizedSettings.requireChangeTicket === undefined
        ? fallbackSettings.requireChangeTicket === true
        : normalizedSettings.requireChangeTicket === true,
    allowDelete:
      normalizedSettings.allowDelete === undefined
        ? fallbackSettings.allowDelete !== false
        : normalizedSettings.allowDelete !== false,
    allowRollback:
      normalizedSettings.allowRollback === undefined
        ? fallbackSettings.allowRollback !== false
        : normalizedSettings.allowRollback !== false,
  };
};

const normalizeSettingsGovernance = (governanceSettings = {}) => {
  const normalizedGovernanceSettings = isPlainObject(governanceSettings)
    ? governanceSettings
    : {};
  const fallbackGovernance = DEFAULT_SETTINGS_GOVERNANCE;
  const compatibilitySettings = isPlainObject(normalizedGovernanceSettings.compatibility)
    ? normalizedGovernanceSettings.compatibility
    : {};
  const fallbackCompatibility = isPlainObject(fallbackGovernance.compatibility)
    ? fallbackGovernance.compatibility
    : {};

  return {
    contractVersion:
      String(
        normalizedGovernanceSettings.contractVersion ||
          fallbackGovernance.contractVersion ||
          SETTINGS_GOVERNANCE_CONTRACT_VERSION,
      ).trim() || SETTINGS_GOVERNANCE_CONTRACT_VERSION,
    compatibility: {
      includeLegacySettingsInResponse:
        compatibilitySettings.includeLegacySettingsInResponse === undefined
          ? fallbackCompatibility.includeLegacySettingsInResponse === true
          : compatibilitySettings.includeLegacySettingsInResponse === true,
    },
    workflowManifest: normalizeWorkflowManifestGovernanceSettings(
      normalizedGovernanceSettings.workflowManifest,
    ),
    tenantIsolation: normalizeTenantIsolationSettings(
      normalizedGovernanceSettings.tenantIsolation,
    ),
    rbac: normalizeSettingsRbac(
      normalizedGovernanceSettings.rbac,
    ),
    releaseControl: normalizeSettingsReleaseControl(
      normalizedGovernanceSettings.releaseControl,
    ),
    security: normalizeSettingsSecurity(
      normalizedGovernanceSettings.security,
    ),
  };
};

const toIntegerPercent = (value, fallback = 0) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const normalizeWorkflowRouteKey = (kind = '', route = '') => {
  const normalizedKind = String(kind || '').trim();
  const normalizedRoute = String(route || '').trim();

  if (!normalizedKind || !normalizedRoute) {
    return '';
  }

  return `${normalizedKind}:${normalizedRoute}`;
};

const parseWorkflowRouteKey = (routeKey = '') => {
  const normalizedKey = String(routeKey || '').trim();

  if (!normalizedKey.includes(':')) {
    return {
      kind: '',
      route: '',
    };
  }

  const [kind = '', route = ''] = normalizedKey.split(':');
  return {
    kind: String(kind || '').trim(),
    route: String(route || '').trim(),
  };
};

const normalizeWorkflowReleaseRouteConfig = (routeConfig = {}, fallbackConfig = {}, routeKey = '') => {
  const mergedConfig = {
    ...(isPlainObject(fallbackConfig) ? fallbackConfig : {}),
    ...(isPlainObject(routeConfig) ? routeConfig : {}),
  };
  const parsedFromKey = parseWorkflowRouteKey(routeKey);
  const kind = String(
    mergedConfig.kind || parsedFromKey.kind || fallbackConfig.kind || '',
  ).trim();
  const route = String(
    mergedConfig.route || parsedFromKey.route || fallbackConfig.route || '',
  ).trim();
  const normalizedRouteKey = normalizeWorkflowRouteKey(kind, route);

  return {
    kind,
    route,
    displayName: String(
      mergedConfig.displayName || fallbackConfig.displayName || `${kind} / ${route}`,
    ).trim(),
    stablePluginId: String(
      mergedConfig.stablePluginId || fallbackConfig.stablePluginId || '',
    ).trim(),
    canaryPluginId: String(
      mergedConfig.canaryPluginId || fallbackConfig.canaryPluginId || '',
    ).trim(),
    trafficPercent: toIntegerPercent(
      mergedConfig.trafficPercent,
      toIntegerPercent(fallbackConfig.trafficPercent, 0),
    ),
    rollbackOnError:
      mergedConfig.rollbackOnError === undefined
        ? fallbackConfig.rollbackOnError === true
        : mergedConfig.rollbackOnError === true,
    bucketBy: String(mergedConfig.bucketBy || fallbackConfig.bucketBy || 'sessionId').trim() || 'sessionId',
    guardEnabled:
      mergedConfig.guardEnabled === undefined
        ? fallbackConfig.guardEnabled === true
        : mergedConfig.guardEnabled === true,
    minSampleSize: Math.max(
      1,
      Number(
        mergedConfig.minSampleSize !== undefined
          ? mergedConfig.minSampleSize
          : fallbackConfig.minSampleSize || 20,
      ) || 20,
    ),
    maxErrorRatePercent: toIntegerPercent(
      mergedConfig.maxErrorRatePercent,
      toIntegerPercent(fallbackConfig.maxErrorRatePercent, 20),
    ),
    maxP95LatencyMs: Math.max(
      0,
      Number(
        mergedConfig.maxP95LatencyMs !== undefined
          ? mergedConfig.maxP95LatencyMs
          : fallbackConfig.maxP95LatencyMs || 25000,
      ) || 25000,
    ),
    enabled:
      mergedConfig.enabled === undefined
        ? fallbackConfig.enabled !== false
        : mergedConfig.enabled !== false,
    routeKey: normalizedRouteKey || routeKey || normalizeWorkflowRouteKey(kind, route),
  };
};

const readWorkflowReleaseRoutesFromSeed = (routesSeed = undefined) => {
  if (Array.isArray(routesSeed)) {
    return routesSeed
      .filter((item) => isPlainObject(item))
      .map((item, index) => ({
        routeKey:
          normalizeWorkflowRouteKey(item.kind, item.route) || `route-${index + 1}`,
        config: item,
      }));
  }

  if (isPlainObject(routesSeed)) {
    return Object.entries(routesSeed)
      .filter(([, value]) => isPlainObject(value))
      .map(([routeKey, config]) => ({
        routeKey,
        config,
      }));
  }

  return [];
};

export const normalizeWorkflowReleaseSettings = (workflowReleaseSettings = {}) => {
  const normalizedSettings = isPlainObject(workflowReleaseSettings)
    ? workflowReleaseSettings
    : {};
  const normalizedRoutes = {};
  const defaultRouteEntries = Object.entries(DEFAULT_WORKFLOW_RELEASE_ROUTES);
  const incomingRouteEntries = readWorkflowReleaseRoutesFromSeed(normalizedSettings.routes);
  const incomingRouteMap = new Map(
    incomingRouteEntries.map((item) => [item.routeKey, item.config]),
  );

  defaultRouteEntries.forEach(([defaultRouteKey, defaultRouteConfig]) => {
    const normalizedRouteConfig = normalizeWorkflowReleaseRouteConfig(
      incomingRouteMap.get(defaultRouteKey) || {},
      defaultRouteConfig,
      defaultRouteKey,
    );
    const normalizedRouteKey = normalizedRouteConfig.routeKey || defaultRouteKey;
    normalizedRoutes[normalizedRouteKey] = {
      ...normalizedRouteConfig,
    };
  });

  incomingRouteEntries.forEach(({ routeKey, config }) => {
    if (normalizedRoutes[routeKey]) {
      return;
    }

    const normalizedRouteConfig = normalizeWorkflowReleaseRouteConfig(
      config,
      {},
      routeKey,
    );
    const normalizedRouteKey = normalizedRouteConfig.routeKey || routeKey;

    if (!normalizedRouteConfig.kind || !normalizedRouteConfig.route) {
      return;
    }

    normalizedRoutes[normalizedRouteKey] = {
      ...normalizedRouteConfig,
    };
  });

  return {
    contractVersion:
      String(
        normalizedSettings.contractVersion ||
          WORKFLOW_RELEASE_SETTINGS_CONTRACT_VERSION,
      ).trim() || WORKFLOW_RELEASE_SETTINGS_CONTRACT_VERSION,
    routes: normalizedRoutes,
  };
};

const normalizeSearchDatabaseConnector = (databaseConfig = {}, index = 0) => {
  const connectionConfig = isPlainObject(databaseConfig.connection)
    ? databaseConfig.connection
    : databaseConfig;
  const databaseType = normalizeDatabaseType(
    databaseConfig.databaseType ||
      databaseConfig.dbType ||
      connectionConfig.databaseType ||
      connectionConfig.dbType ||
      'sqlite',
  );
  const databaseId =
    connectionConfig.databaseId ||
    connectionConfig.id ||
    connectionConfig.databaseName ||
    `database-${index + 1}`;

  return {
    id: databaseConfig.id || `database-${databaseId}`,
    adapterType: 'database',
    connectorType: 'database',
    enabled: databaseConfig.enabled !== false,
    databaseType,
    connection: {
      ...connectionConfig,
      databaseType,
      databaseName: connectionConfig.databaseName || databaseId,
      port:
        connectionConfig.port ||
        (databaseType === 'mysql' ? '3306' : databaseType === 'postgres' ? '5432' : ''),
    },
    whitelist: normalizeSearchConnectorWhitelist(databaseConfig.whitelist || databaseConfig.searchWhitelist, {
      tables: [],
      outboundTables: [],
      schemas: [],
      outboundSchemas: [],
      sourceRefs: [],
      outboundSourceRefs: [],
      summaryAllowed: false,
    }),
    fieldMapping: normalizeConnectorObject(databaseConfig.fieldMapping || databaseConfig.searchFieldMapping, {
      titleFields: ['name', 'title', 'id'],
      summaryFields: ['summary', 'description', 'remark', 'notes'],
      sceneFields: ['scene', 'category', 'industryType'],
    }),
    limits: normalizeConnectorObject(databaseConfig.limits || databaseConfig.searchLimits, {
      maxTableCount: 12,
      maxRowCountPerTable: 20,
      maxMatchCount: 8,
    }),
    permissionIsolation: normalizeSearchConnectorPermissionIsolation(databaseConfig.permissionIsolation, {
      enabled: true,
      readIsolationEnabled: false,
      outboundIsolationEnabled: true,
      sourceRefs: [],
      outboundSourceRefs: [],
    }),
  };
};

const normalizeOptionalBoolean = (value, fallback = undefined) => {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return fallback;
};

const normalizeSearchConnectorAdapterType = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue === 'filesystem' || normalizedValue === 'file-system' || normalizedValue === 'file') {
    return 'file-system';
  }

  if (
    normalizedValue === 'knowledge' ||
    normalizedValue === 'local-document' ||
    normalizedValue === 'knowledge-base'
  ) {
    return 'knowledge';
  }

  if (
    normalizedValue === 'database' ||
    normalizedValue === 'db' ||
    normalizedValue === 'mysql' ||
    normalizedValue === 'postgres' ||
    normalizedValue === 'postgresql' ||
    normalizedValue === 'sqlite' ||
    normalizedValue === 'sqlite3'
  ) {
    return 'database';
  }

  return normalizedValue;
};

const inferSearchConnectorAdapterType = (connectorConfig = {}) => {
  const explicitAdapterType = normalizeSearchConnectorAdapterType(
    connectorConfig.adapterType || connectorConfig.connectorType || connectorConfig.kind,
  );

  if (explicitAdapterType) {
    return explicitAdapterType;
  }

  if (
    connectorConfig.databaseType ||
    connectorConfig.connection ||
    connectorConfig.dbType
  ) {
    return 'database';
  }

  if (Array.isArray(connectorConfig.roots)) {
    return 'file-system';
  }

  return 'knowledge';
};

const normalizeSearchConnectorWhitelist = (whitelistSettings = {}, fallbackWhitelist = {}) => {
  const normalizedFallback = normalizeConnectorObject(fallbackWhitelist, {});
  const normalizedWhitelist = normalizeConnectorObject(whitelistSettings, normalizedFallback);

  return {
    docTypes: normalizeStringArray(
      normalizedWhitelist.docTypes,
      normalizeStringArray(normalizedFallback.docTypes, []),
    ),
    outboundDocTypes: normalizeStringArray(
      normalizedWhitelist.outboundDocTypes,
      normalizeStringArray(normalizedFallback.outboundDocTypes, []),
    ),
    extensions: normalizeStringArray(
      normalizedWhitelist.extensions,
      normalizeStringArray(normalizedFallback.extensions, []),
    ),
    pathPrefixes: normalizeStringArray(
      normalizedWhitelist.pathPrefixes,
      normalizeStringArray(normalizedFallback.pathPrefixes, []),
    ),
    outboundPathPrefixes: normalizeStringArray(
      normalizedWhitelist.outboundPathPrefixes,
      normalizeStringArray(normalizedFallback.outboundPathPrefixes, []),
    ),
    tables: normalizeStringArray(
      normalizedWhitelist.tables,
      normalizeStringArray(normalizedFallback.tables, []),
    ),
    outboundTables: normalizeStringArray(
      normalizedWhitelist.outboundTables,
      normalizeStringArray(normalizedFallback.outboundTables, []),
    ),
    schemas: normalizeStringArray(
      normalizedWhitelist.schemas,
      normalizeStringArray(normalizedFallback.schemas, []),
    ),
    outboundSchemas: normalizeStringArray(
      normalizedWhitelist.outboundSchemas,
      normalizeStringArray(normalizedFallback.outboundSchemas, []),
    ),
    sourceRefs: normalizeStringArray(
      normalizedWhitelist.sourceRefs,
      normalizeStringArray(normalizedFallback.sourceRefs, []),
    ),
    outboundSourceRefs: normalizeStringArray(
      normalizedWhitelist.outboundSourceRefs,
      normalizeStringArray(normalizedFallback.outboundSourceRefs, []),
    ),
    summaryAllowed:
      normalizedWhitelist.summaryAllowed === undefined
        ? normalizedFallback.summaryAllowed === true
        : normalizedWhitelist.summaryAllowed === true,
    outboundAllowed: normalizeOptionalBoolean(
      normalizedWhitelist.outboundAllowed,
      normalizeOptionalBoolean(normalizedFallback.outboundAllowed, undefined),
    ),
  };
};

const normalizeSearchConnectorPermissionIsolation = (
  permissionIsolationSettings = {},
  fallbackPermissionIsolation = {},
) => {
  const normalizedFallback = normalizeConnectorObject(fallbackPermissionIsolation, {
    enabled: true,
    readIsolationEnabled: false,
    outboundIsolationEnabled: true,
    sourceRefs: [],
    outboundSourceRefs: [],
  });
  const normalizedPermissionIsolation = normalizeConnectorObject(
    permissionIsolationSettings,
    normalizedFallback,
  );

  return {
    enabled:
      normalizedPermissionIsolation.enabled === undefined
        ? normalizedFallback.enabled !== false
        : normalizedPermissionIsolation.enabled !== false,
    readIsolationEnabled:
      normalizedPermissionIsolation.readIsolationEnabled === undefined
        ? normalizedFallback.readIsolationEnabled === true
        : normalizedPermissionIsolation.readIsolationEnabled === true,
    outboundIsolationEnabled:
      normalizedPermissionIsolation.outboundIsolationEnabled === undefined
        ? normalizedFallback.outboundIsolationEnabled !== false
        : normalizedPermissionIsolation.outboundIsolationEnabled !== false,
    sourceRefs: normalizeStringArray(
      normalizedPermissionIsolation.sourceRefs,
      normalizeStringArray(normalizedFallback.sourceRefs, []),
    ),
    outboundSourceRefs: normalizeStringArray(
      normalizedPermissionIsolation.outboundSourceRefs,
      normalizeStringArray(normalizedFallback.outboundSourceRefs, []),
    ),
  };
};

const normalizeSearchKnowledgeConnector = (connectorConfig = {}, index = 0, fallbackConnector = {}) => {
  const normalizedFallback = normalizeConnectorObject(fallbackConnector, {});

  return {
    id: connectorConfig.id || `knowledge-${index + 1}`,
    adapterType: 'knowledge',
    connectorType: 'knowledge',
    enabled: connectorConfig.enabled !== false,
    whitelist: normalizeSearchConnectorWhitelist(
      connectorConfig.whitelist,
      normalizedFallback.whitelist,
    ),
    fieldMapping: normalizeConnectorObject(
      connectorConfig.fieldMapping,
      normalizedFallback.fieldMapping || {},
    ),
    limits: normalizeConnectorObject(
      connectorConfig.limits,
      normalizedFallback.limits || {},
    ),
    permissionIsolation: normalizeSearchConnectorPermissionIsolation(
      connectorConfig.permissionIsolation,
      normalizedFallback.permissionIsolation,
    ),
  };
};

const normalizeSearchFileSystemConnector = (connectorConfig = {}, index = 0, fallbackConnector = {}) => {
  const normalizedFallback = normalizeConnectorObject(fallbackConnector, {});

  return {
    id: connectorConfig.id || `filesystem-${index + 1}`,
    adapterType: 'file-system',
    connectorType: 'file-system',
    enabled: connectorConfig.enabled !== false,
    roots: normalizeStringArray(
      connectorConfig.roots,
      normalizeStringArray(normalizedFallback.roots, []),
    ),
    whitelist: normalizeSearchConnectorWhitelist(
      connectorConfig.whitelist,
      normalizedFallback.whitelist,
    ),
    fieldMapping: normalizeConnectorObject(
      connectorConfig.fieldMapping,
      normalizedFallback.fieldMapping || {},
    ),
    limits: normalizeConnectorObject(
      connectorConfig.limits,
      normalizedFallback.limits || {},
    ),
    permissionIsolation: normalizeSearchConnectorPermissionIsolation(
      connectorConfig.permissionIsolation,
      normalizedFallback.permissionIsolation,
    ),
  };
};

const normalizeUnifiedSearchConnector = (
  connectorConfig = {},
  index = 0,
  defaultSearchSettings = DEFAULT_SETTINGS.search,
) => {
  const adapterType = inferSearchConnectorAdapterType(connectorConfig);

  if (adapterType === 'database') {
    return normalizeSearchDatabaseConnector(
      {
        ...connectorConfig,
        adapterType: 'database',
        connectorType: 'database',
      },
      index,
    );
  }

  if (adapterType === 'file-system') {
    return normalizeSearchFileSystemConnector(
      connectorConfig,
      index,
      defaultSearchSettings.connectors?.fileSystems?.[0] || {},
    );
  }

  return normalizeSearchKnowledgeConnector(
    connectorConfig,
    index,
    defaultSearchSettings.connectors?.knowledge?.[0] || {},
  );
};

const splitSearchConnectorRegistryByAdapter = (registry = []) => {
  return registry.reduce(
    (accumulator, connector) => {
      const adapterType = normalizeSearchConnectorAdapterType(
        connector.adapterType || connector.connectorType,
      );

      if (adapterType === 'database') {
        accumulator.databases.push({
          ...connector,
          adapterType: 'database',
          connectorType: 'database',
        });
        return accumulator;
      }

      if (adapterType === 'file-system') {
        accumulator.fileSystems.push({
          ...connector,
          adapterType: 'file-system',
          connectorType: 'file-system',
        });
        return accumulator;
      }

      accumulator.knowledge.push({
        ...connector,
        adapterType: 'knowledge',
        connectorType: 'knowledge',
      });
      return accumulator;
    },
    {
      knowledge: [],
      fileSystems: [],
      databases: [],
    },
  );
};

export const normalizeSearchSettings = (
  searchSettings = {},
  databaseSettings = [],
  legacyDatabase = undefined,
) => {
  const defaultSearchSettings = DEFAULT_SETTINGS.search;
  const normalizedSearchSettings = isPlainObject(searchSettings) ? searchSettings : {};
  const normalizedDatabases = normalizeDatabaseSettingsList(databaseSettings, legacyDatabase);
  const rawConnectors = isPlainObject(normalizedSearchSettings.connectors)
    ? normalizedSearchSettings.connectors
    : {};
  const hasRegistryConnectorSeed = Object.prototype.hasOwnProperty.call(rawConnectors, 'registry');
  const rawRegistryConnectors = hasRegistryConnectorSeed
    ? (Array.isArray(rawConnectors.registry)
        ? rawConnectors.registry.filter((item) => isPlainObject(item))
        : [])
    : null;

  let normalizedConnectorRegistry = [];

  if (hasRegistryConnectorSeed) {
    normalizedConnectorRegistry = (rawRegistryConnectors || []).map((item, index) =>
      normalizeUnifiedSearchConnector(item, index, defaultSearchSettings),
    );
  } else {
    const normalizedKnowledgeConnectors = normalizeConnectorList(
      rawConnectors.knowledge,
      defaultSearchSettings.connectors.knowledge,
    ).map((item, index) =>
      normalizeSearchKnowledgeConnector(
        item,
        index,
        defaultSearchSettings.connectors.knowledge[0] || {},
      ),
    );

    const normalizedFileSystemConnectors = normalizeConnectorList(
      rawConnectors.fileSystems,
      defaultSearchSettings.connectors.fileSystems,
    ).map((item, index) =>
      normalizeSearchFileSystemConnector(
        item,
        index,
        defaultSearchSettings.connectors.fileSystems[0] || {},
      ),
    );

    const normalizedDatabaseConnectors =
      normalizeConnectorList(rawConnectors.databases).length > 0
        ? normalizeConnectorList(rawConnectors.databases).map((item, index) =>
            normalizeSearchDatabaseConnector(item, index),
          )
        : normalizedDatabases.map((item, index) => normalizeSearchDatabaseConnector(item, index));

    normalizedConnectorRegistry = [
      ...normalizedKnowledgeConnectors,
      ...normalizedFileSystemConnectors,
      ...normalizedDatabaseConnectors,
    ];
  }

  const normalizedConnectorGroups = splitSearchConnectorRegistryByAdapter(normalizedConnectorRegistry);

  return {
    contractVersion: normalizedSearchSettings.contractVersion || defaultSearchSettings.contractVersion,
    connectorContractVersion:
      normalizedSearchSettings.connectorContractVersion ||
      defaultSearchSettings.connectorContractVersion ||
      SEARCH_CONNECTOR_PLATFORM_VERSION,
    summaryPolicy: normalizeConnectorObject(
      normalizedSearchSettings.summaryPolicy,
      defaultSearchSettings.summaryPolicy,
    ),
    connectors: {
      registry: normalizedConnectorRegistry,
      knowledge: normalizedConnectorGroups.knowledge,
      fileSystems: normalizedConnectorGroups.fileSystems,
      databases: normalizedConnectorGroups.databases,
    },
  };
};

const mergeSearchSettings = (
  currentSearch = {},
  incomingSearch = {},
  databaseSettings = [],
  legacyDatabase = undefined,
) => {
  const currentConnectors = isPlainObject(currentSearch.connectors) ? currentSearch.connectors : {};
  const incomingConnectors = isPlainObject(incomingSearch.connectors) ? incomingSearch.connectors : {};
  const hasIncomingLegacyConnectorPatch =
    incomingConnectors.knowledge !== undefined ||
    incomingConnectors.fileSystems !== undefined ||
    incomingConnectors.databases !== undefined;
  const mergedConnectors = {
    ...currentConnectors,
    ...incomingConnectors,
    knowledge:
      incomingConnectors.knowledge === undefined
        ? currentConnectors.knowledge
        : incomingConnectors.knowledge,
    fileSystems:
      incomingConnectors.fileSystems === undefined
        ? currentConnectors.fileSystems
        : incomingConnectors.fileSystems,
    databases:
      incomingConnectors.databases === undefined
        ? currentConnectors.databases
        : incomingConnectors.databases,
  };

  if (incomingConnectors.registry !== undefined) {
    mergedConnectors.registry = incomingConnectors.registry;
  } else if (!hasIncomingLegacyConnectorPatch) {
    mergedConnectors.registry = currentConnectors.registry;
  } else {
    delete mergedConnectors.registry;
  }

  return normalizeSearchSettings(
    {
      ...currentSearch,
      ...incomingSearch,
      connectorContractVersion:
        incomingSearch.connectorContractVersion ||
        currentSearch.connectorContractVersion ||
        SEARCH_CONNECTOR_PLATFORM_VERSION,
      summaryPolicy: {
        ...(currentSearch.summaryPolicy || {}),
        ...(incomingSearch.summaryPolicy || {}),
      },
      connectors: mergedConnectors,
    },
    databaseSettings,
    legacyDatabase,
  );
};

const mergeWorkflowReleaseSettings = (currentWorkflowRelease = {}, incomingWorkflowRelease = {}) => {
  const currentNormalizedSettings = normalizeWorkflowReleaseSettings(currentWorkflowRelease);
  const incomingSettings = isPlainObject(incomingWorkflowRelease)
    ? incomingWorkflowRelease
    : {};
  const incomingRouteEntries = readWorkflowReleaseRoutesFromSeed(incomingSettings.routes);
  const mergedRoutes = {
    ...(currentNormalizedSettings.routes || {}),
  };

  incomingRouteEntries.forEach(({ routeKey, config }) => {
    const fallbackConfig = mergedRoutes[routeKey] || {};
    const normalizedRouteConfig = normalizeWorkflowReleaseRouteConfig(
      config,
      fallbackConfig,
      routeKey,
    );
    const normalizedRouteKey = normalizedRouteConfig.routeKey || routeKey;

    if (!normalizedRouteConfig.kind || !normalizedRouteConfig.route) {
      return;
    }

    mergedRoutes[normalizedRouteKey] = normalizedRouteConfig;
  });

  return normalizeWorkflowReleaseSettings({
    contractVersion:
      incomingSettings.contractVersion || currentNormalizedSettings.contractVersion,
    routes: mergedRoutes,
  });
};

const toNullableString = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const resolveStringCandidate = (candidates = [], options = {}) => {
  const { defaultValue = null, defaultSource = 'default', defaultFallbackReason = null } = options;

  for (const candidate of candidates) {
    const normalizedValue = toNullableString(candidate?.value);

    if (normalizedValue) {
      return {
        value: normalizedValue,
        source: candidate?.source || defaultSource,
        fallbackReason: candidate?.fallbackReason || null,
      };
    }
  }

  return {
    value: defaultValue,
    source: defaultSource,
    fallbackReason: defaultFallbackReason,
  };
};

const normalizeStrategySelection = (value) => {
  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    return normalizedValue
      ? {
          id: normalizedValue,
          label: normalizedValue,
        }
      : null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedId = toNullableString(value.id) || toNullableString(value.strategyId) || toNullableString(value.name);

  if (!normalizedId) {
    return null;
  }

  return {
    ...value,
    id: normalizedId,
    label: toNullableString(value.label) || normalizedId,
  };
};

const resolveStrategyCandidate = (candidates = [], options = {}) => {
  const { defaultValue = null, defaultSource = 'default', defaultFallbackReason = null } = options;

  for (const candidate of candidates) {
    const normalizedValue = normalizeStrategySelection(candidate?.value);

    if (normalizedValue) {
      return {
        value: normalizedValue,
        source: candidate?.source || defaultSource,
        fallbackReason: candidate?.fallbackReason || null,
      };
    }
  }

  return {
    value: defaultValue,
    source: defaultSource,
    fallbackReason: defaultFallbackReason,
  };
};

export const getStrategySettings = () => {
  const settings = readSettings();
  return {
    ...DEFAULT_SETTINGS.strategy,
    ...(settings.strategy || {}),
  };
};

export const getStrategyForModule = (moduleName, incomingExecutionContext = {}) => {
  const strategySettings = getStrategySettings();
  const moduleStrategyKey = MODULE_STRATEGY_KEY_MAP[moduleName];
  const assistantSettings = getAssistantSettings();
  const baseExecutionContext = isPlainObject(assistantSettings.executionContext) ? assistantSettings.executionContext : {};
  const runtimeExecutionContext = isPlainObject(incomingExecutionContext) ? incomingExecutionContext : {};

  return resolveStrategyCandidate(
    [
      {
        value: runtimeExecutionContext.strategy,
        source: 'runtime.executionContext.strategy',
      },
      {
        value: baseExecutionContext.strategy,
        source: 'settings.assistant.executionContext.strategy',
      },
      {
        value: moduleStrategyKey ? strategySettings[moduleStrategyKey] : null,
        source: moduleStrategyKey ? `settings.strategy.${moduleStrategyKey}` : 'settings.strategy',
        fallbackReason: moduleStrategyKey ? 'module-strategy-applied' : null,
      },
    ],
    {
      defaultValue: null,
      defaultSource: 'default',
      defaultFallbackReason: moduleStrategyKey ? 'module-strategy-missing' : 'strategy-missing',
    },
  );
};

export const getResolvedExecutionContextForModule = (moduleName, incomingExecutionContext = {}, options = {}) => {
  const assistantSettings = getAssistantSettings();
  const baseExecutionContext = isPlainObject(assistantSettings.executionContext) ? assistantSettings.executionContext : {};
  const runtimeExecutionContext = isPlainObject(incomingExecutionContext) ? incomingExecutionContext : {};
  const mergedExecutionContext = {
    ...baseExecutionContext,
    ...runtimeExecutionContext,
  };
  const modulePromptFallback = isPlainObject(options.modulePrompt) ? options.modulePrompt : {};

  const resolvedAssistant = resolveStringCandidate(
    [
      {
        value:
          runtimeExecutionContext.resolvedAssistant?.assistantId ||
          runtimeExecutionContext.resolvedAssistant?.id ||
          runtimeExecutionContext.assistantId ||
          runtimeExecutionContext.activeAssistantId,
        source: 'runtime.executionContext.assistant',
      },
      {
        value:
          baseExecutionContext.resolvedAssistant?.assistantId ||
          baseExecutionContext.resolvedAssistant?.id ||
          baseExecutionContext.assistantId ||
          baseExecutionContext.activeAssistantId,
        source: 'settings.assistant.executionContext.assistant',
      },
      {
        value: assistantSettings.activeAssistantId,
        source: 'settings.assistant.activeAssistantId',
        fallbackReason: 'assistant-active-setting-applied',
      },
    ],
    {
      defaultValue: getDefaultAssistantProfile()?.id || DEFAULT_SETTINGS.assistant.activeAssistantId,
      defaultSource: 'default.assistant.activeAssistantId',
      defaultFallbackReason: 'assistant-default-applied',
    },
  );

  const resolvedAssistantVersion = resolveStringCandidate(
    [
      {
        value: runtimeExecutionContext.resolvedAssistant?.assistantVersion || runtimeExecutionContext.assistantVersion,
        source: 'runtime.executionContext.assistantVersion',
      },
      {
        value: baseExecutionContext.resolvedAssistant?.assistantVersion || baseExecutionContext.assistantVersion,
        source: 'settings.assistant.executionContext.assistantVersion',
      },
      {
        value: assistantSettings.assistantVersion,
        source: 'settings.assistant.assistantVersion',
      },
    ],
    {
      defaultValue: null,
      defaultSource: 'none',
      defaultFallbackReason: 'assistant-version-missing',
    },
  );

  const resolvedPrompt = resolveStringCandidate(
    [
      {
        value:
          runtimeExecutionContext.resolvedPrompt?.promptId ||
          runtimeExecutionContext.resolvedPrompt?.id ||
          runtimeExecutionContext.prompt?.promptId ||
          runtimeExecutionContext.prompt?.id ||
          runtimeExecutionContext.promptId ||
          runtimeExecutionContext.activePromptId,
        source: 'runtime.executionContext.prompt',
      },
      {
        value:
          baseExecutionContext.resolvedPrompt?.promptId ||
          baseExecutionContext.resolvedPrompt?.id ||
          baseExecutionContext.prompt?.promptId ||
          baseExecutionContext.prompt?.id ||
          baseExecutionContext.promptId ||
          baseExecutionContext.activePromptId,
        source: 'settings.assistant.executionContext.prompt',
      },
      {
        value: modulePromptFallback.promptId || modulePromptFallback.id || null,
        source: `module.${moduleName}.prompt`,
        fallbackReason: 'module-prompt-applied',
      },
      {
        value: assistantSettings.activePromptId,
        source: 'settings.assistant.activePromptId',
        fallbackReason: 'assistant-prompt-setting-applied',
      },
    ],
    {
      defaultValue: null,
      defaultSource: 'none',
      defaultFallbackReason: 'prompt-missing',
    },
  );

  const resolvedPromptVersion = resolveStringCandidate(
    [
      {
        value:
          runtimeExecutionContext.resolvedPrompt?.promptVersion ||
          runtimeExecutionContext.prompt?.promptVersion ||
          runtimeExecutionContext.promptVersion,
        source: 'runtime.executionContext.promptVersion',
      },
      {
        value:
          baseExecutionContext.resolvedPrompt?.promptVersion ||
          baseExecutionContext.prompt?.promptVersion ||
          baseExecutionContext.promptVersion,
        source: 'settings.assistant.executionContext.promptVersion',
      },
      {
        value: modulePromptFallback.promptVersion || null,
        source: `module.${moduleName}.promptVersion`,
        fallbackReason: 'module-prompt-version-applied',
      },
      {
        value: assistantSettings.promptVersion,
        source: 'settings.assistant.promptVersion',
      },
    ],
    {
      defaultValue: null,
      defaultSource: 'none',
      defaultFallbackReason: 'prompt-version-missing',
    },
  );

  const resolvedStrategy = getStrategyForModule(moduleName, mergedExecutionContext);

  return {
    ...mergedExecutionContext,
    moduleName,
    resolvedAssistant: {
      assistantId: resolvedAssistant.value,
      assistantVersion: resolvedAssistantVersion.value,
    },
    resolvedPrompt: {
      promptId: resolvedPrompt.value,
      promptVersion: resolvedPromptVersion.value,
    },
    strategy: resolvedStrategy.value,
    source: {
      assistant: resolvedAssistant.source,
      assistantVersion: resolvedAssistantVersion.source,
      prompt: resolvedPrompt.source,
      promptVersion: resolvedPromptVersion.source,
      strategy: resolvedStrategy.source,
    },
    fallbackReason: {
      assistant: resolvedAssistant.fallbackReason,
      assistantVersion: resolvedAssistantVersion.fallbackReason,
      prompt: resolvedPrompt.fallbackReason,
      promptVersion: resolvedPromptVersion.fallbackReason,
      strategy: resolvedStrategy.fallbackReason,
    },
    summary: {
      assistantId: resolvedAssistant.value,
      promptId: resolvedPrompt.value,
      promptVersion: resolvedPromptVersion.value,
      strategyId: resolvedStrategy.value?.id || null,
    },
  };
};

// =========================
// 配置读写层
// 负责 settings 持久化、读取、merge，不直接承接页面展示语义。
// =========================
const ensureSettingsDir = () => {
  const dir = path.dirname(settingsFilePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const getDefaultSettings = () => {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
};

export const readSettings = () => {
  ensureSettingsDir();

  if (!fs.existsSync(settingsFilePath)) {
    return getDefaultSettings();
  }

  const rawText = fs.readFileSync(settingsFilePath, 'utf-8');

  if (!rawText.trim()) {
    return getDefaultSettings();
  }

  const parsedSettings = JSON.parse(rawText);
  const { settings: savedSettings } = resolveSettingsSecrets({
    settings: parsedSettings,
  });
  const databases = normalizeDatabaseSettingsList(savedSettings.databases, savedSettings.database);
  const modelSettings = {
    ...DEFAULT_SETTINGS.model,
    ...(savedSettings.model || {}),
    models: Array.isArray(savedSettings.model?.models)
      ? savedSettings.model.models
      : DEFAULT_SETTINGS.model.models,
    moduleBindings: {
      ...DEFAULT_SETTINGS.model.moduleBindings,
      ...(savedSettings.model?.moduleBindings || {}),
    },
  };

  return {
    database: {
      ...DEFAULT_SETTINGS.database,
      ...(savedSettings.database || {}),
    },
    model: modelSettings,
    strategy: {
      ...DEFAULT_SETTINGS.strategy,
      ...(savedSettings.strategy || {}),
    },
    assistant: normalizeAssistantSettings(savedSettings.assistant || {}),
    search: normalizeSearchSettings(savedSettings.search || {}, databases, savedSettings.database),
    pythonRuntime: normalizePythonRuntimeSettings(savedSettings.pythonRuntime || {}, {
      modelSettings,
    }),
    workflowRelease: normalizeWorkflowReleaseSettings(savedSettings.workflowRelease || {}),
    governance: normalizeSettingsGovernance(savedSettings.governance || {}),
    databases,
  };
};

export const saveSettings = (settings) => {
  ensureSettingsDir();
  const { settings: persistedSettings } = materializeSettingsSecrets({
    settings,
  });
  fs.writeFileSync(settingsFilePath, `${JSON.stringify(persistedSettings, null, 2)}\n`, 'utf-8');

  const { settings: runtimeSettings } = resolveSettingsSecrets({
    settings: persistedSettings,
  });

  return runtimeSettings;
};

// 兼容 / 冻结 / 退场策略
// - topLevelSettings 与 assistant.executionContext 进入冻结后退场路径
// - sanitizeSettingsForClient / getModelSettings / getAssistantSettings 作为兼容桥接 helper，后续准备退场
export const SETTINGS_COMPATIBILITY_POLICY = {
  primary: ['primaryContract', 'getSettingsConfigSummary', 'getSettingsStatusSummary'],
  compatibilityHelpers: [
    'sanitizeSettingsForClient',
    'getModelSettings',
    'getAssistantSettings',
    'getActiveDatabaseConfig',
  ],
  frozenLegacyObjects: ['topLevelSettings', 'assistant.executionContext'],
  retirementPlanned: [
    'topLevelSettings',
    'assistant.executionContext',
    'sanitizeSettingsForClient',
    'getModelSettings',
    'getAssistantSettings',
  ],
};
// =========================
// 前端适配层（兼容层）
// 负责把 settings 转成页面当前可消费的摘要。
// 这层只兼容，不再继续扩字段；正式主口径已切到：
// - getSettingsConfigSummary
// - getSettingsStatusSummary
// =========================
export const sanitizeModelSettingsForClient = (modelSettings = {}) => {
  const sanitizedModels = Array.isArray(modelSettings.models)
    ? modelSettings.models.map((item, index) => ({
        ...item,
        apiKey: '',
        hasApiKey: Boolean(item.apiKey),
      }))
    : [];

  const resolvedSnapshot = getResolvedActiveModelSnapshot({
    ...modelSettings,
    models: sanitizedModels.map((item, index) => ({
      ...item,
      apiKey:
        Array.isArray(modelSettings.models) && modelSettings.models[index]
          ? modelSettings.models[index].apiKey || ''
          : '',
    })),
  });

  return {
    ...modelSettings,
    activeModelId: resolvedSnapshot.activeModelId,
    modelProvider: resolvedSnapshot.modelProvider,
    baseUrl: resolvedSnapshot.baseUrl,
    apiKey: '',
    hasApiKey: Boolean(resolvedSnapshot.apiKey),
    modelName: resolvedSnapshot.modelName,
    timeout: resolvedSnapshot.timeout,
    models: sanitizedModels,
  };
};

const sanitizePythonRuntimeSettingsForClient = (pythonRuntimeSettings = {}, modelSettings = null) => {
  const normalized = normalizePythonRuntimeSettings(
    pythonRuntimeSettings || DEFAULT_SETTINGS.pythonRuntime,
    isPlainObject(modelSettings) ? { modelSettings } : {},
  );

  return {
    ...normalized,
    channels: {
      local: {
        ...normalized.channels.local,
        apiKey: '',
        hasApiKey: Boolean(normalized.channels.local.apiKey),
      },
      cloud: {
        ...normalized.channels.cloud,
        apiKey: '',
        hasApiKey: Boolean(normalized.channels.cloud.apiKey),
      },
    },
  };
};

// 兼容层 helper：仅服务旧页面 / 过渡页面消费，不作为长期主口径对象源。
export const sanitizeSettingsForClient = (settings = {}) => {
  return {
    database: {
      ...DEFAULT_SETTINGS.database,
      ...(settings.database || {}),
    },
    model: sanitizeModelSettingsForClient(settings.model || DEFAULT_SETTINGS.model),
    strategy: {
      ...DEFAULT_SETTINGS.strategy,
      ...(settings.strategy || {}),
    },
    assistant: {
      ...normalizeAssistantSettings(settings.assistant || {}),
      executionContext: isPlainObject(settings.assistant?.executionContext)
        ? getResolvedExecutionContextForModule('analyze', settings.assistant.executionContext)
        : normalizeAssistantSettings(settings.assistant || {}).executionContext,
    },
    pythonRuntime: sanitizePythonRuntimeSettingsForClient(
      settings.pythonRuntime || DEFAULT_SETTINGS.pythonRuntime,
      settings.model || DEFAULT_SETTINGS.model,
    ),
    workflowRelease: normalizeWorkflowReleaseSettings(settings.workflowRelease || {}),
    governance: normalizeSettingsGovernance(settings.governance || {}),
  };
};

const mergeModelSettingsPreserveApiKeys = (currentModel = {}, incomingModel = {}) => {
  const currentModels = Array.isArray(currentModel.models) ? currentModel.models : [];
  const incomingModels = Array.isArray(incomingModel.models) ? incomingModel.models : [];

  const currentModelMap = new Map(currentModels.map((item) => [item.id, item]));
  const incomingModelMap = new Map(incomingModels.map((item) => [item.id, item]));
  const orderedIds = [...incomingModels.map((item) => item.id), ...currentModels.map((item) => item.id)].filter(
    (id, index, list) => Boolean(id) && list.indexOf(id) === index,
  );

  const mergedModels = orderedIds.map((id) => {
    const matchedItem = currentModelMap.get(id) || {};
    const incomingItem = incomingModelMap.get(id) || {};
    return {
      ...matchedItem,
      ...incomingItem,
      apiKey:
        incomingItem.apiKey === undefined || incomingItem.apiKey === ''
          ? matchedItem.apiKey || ''
          : incomingItem.apiKey,
    };
  });

  const mergedModel = {
    ...currentModel,
    ...incomingModel,
    apiKey:
      incomingModel.apiKey === undefined || incomingModel.apiKey === ''
        ? currentModel.apiKey || ''
        : incomingModel.apiKey,
    models: mergedModels.length > 0 ? mergedModels : currentModels,
    moduleBindings: {
      ...(currentModel.moduleBindings || {}),
      ...(incomingModel.moduleBindings || {}),
    },
  };

  return {
    ...mergedModel,
    ...getResolvedActiveModelSnapshot(mergedModel),
  };
};

const mergePythonRuntimeSettingsPreserveApiKeys = (
  currentPythonRuntime = {},
  incomingPythonRuntime = {},
  modelSettings = null,
) => {
  const normalizeOptions = isPlainObject(modelSettings) ? { modelSettings } : {};
  const currentNormalized = normalizePythonRuntimeSettings(currentPythonRuntime, normalizeOptions);
  const incomingNormalized = normalizePythonRuntimeSettings({
    ...currentNormalized,
    ...(isPlainObject(incomingPythonRuntime) ? incomingPythonRuntime : {}),
    healthGate: {
      ...(currentNormalized.healthGate || {}),
      ...(
        isPlainObject(incomingPythonRuntime?.healthGate)
          ? incomingPythonRuntime.healthGate
          : {}
      ),
    },
    channels: {
      ...(currentNormalized.channels || {}),
      ...(
        isPlainObject(incomingPythonRuntime?.channels)
          ? incomingPythonRuntime.channels
          : {}
      ),
      local: {
        ...(currentNormalized.channels?.local || {}),
        ...(
          isPlainObject(incomingPythonRuntime?.channels?.local)
            ? incomingPythonRuntime.channels.local
            : {}
        ),
      },
      cloud: {
        ...(currentNormalized.channels?.cloud || {}),
        ...(
          isPlainObject(incomingPythonRuntime?.channels?.cloud)
            ? incomingPythonRuntime.channels.cloud
            : {}
        ),
      },
    },
    modelRouting: {
      ...(currentNormalized.modelRouting || {}),
      ...(
        isPlainObject(incomingPythonRuntime?.modelRouting)
          ? incomingPythonRuntime.modelRouting
          : {}
      ),
      moduleRoutes: {
        ...(currentNormalized.modelRouting?.moduleRoutes || {}),
        ...(
          isPlainObject(incomingPythonRuntime?.modelRouting?.moduleRoutes)
            ? incomingPythonRuntime.modelRouting.moduleRoutes
            : {}
        ),
      },
    },
  }, normalizeOptions);

  return normalizePythonRuntimeSettings(
    {
      ...incomingNormalized,
      channels: {
        ...incomingNormalized.channels,
        local: {
          ...incomingNormalized.channels.local,
          apiKey:
            incomingPythonRuntime?.channels?.local?.apiKey === undefined ||
            incomingPythonRuntime?.channels?.local?.apiKey === ''
              ? currentNormalized.channels?.local?.apiKey || ''
              : String(incomingPythonRuntime.channels.local.apiKey || '').trim(),
        },
        cloud: {
          ...incomingNormalized.channels.cloud,
          apiKey:
            incomingPythonRuntime?.channels?.cloud?.apiKey === undefined ||
            incomingPythonRuntime?.channels?.cloud?.apiKey === ''
              ? currentNormalized.channels?.cloud?.apiKey || ''
              : String(incomingPythonRuntime.channels.cloud.apiKey || '').trim(),
        },
      },
    },
    normalizeOptions,
  );
};

export const mergeSettingsPreserveApiKeys = (currentSettings = {}, incomingSettings = {}) => {
  const mergedDatabase = {
    ...DEFAULT_SETTINGS.database,
    ...(currentSettings.database || {}),
    ...(incomingSettings.database || {}),
  };
  const databases = Array.isArray(incomingSettings.databases)
    ? normalizeDatabaseSettingsList(incomingSettings.databases)
    : normalizeDatabaseSettingsList(currentSettings.databases, mergedDatabase);
  const mergedModel = mergeModelSettingsPreserveApiKeys(
    currentSettings.model || {},
    incomingSettings.model || {},
  );

  return {
    database: mergedDatabase,
    databases,
    model: mergedModel,
    strategy: {
      ...DEFAULT_SETTINGS.strategy,
      ...(currentSettings.strategy || {}),
      ...(incomingSettings.strategy || {}),
    },
    assistant: normalizeAssistantSettings({
      ...(currentSettings.assistant || {}),
      ...(incomingSettings.assistant || {}),
    }),
    search: mergeSearchSettings(
      currentSettings.search || DEFAULT_SETTINGS.search,
      incomingSettings.search || {},
      databases,
      mergedDatabase,
    ),
    pythonRuntime: mergePythonRuntimeSettingsPreserveApiKeys(
      currentSettings.pythonRuntime || DEFAULT_SETTINGS.pythonRuntime,
      incomingSettings.pythonRuntime || {},
      mergedModel,
    ),
    workflowRelease: mergeWorkflowReleaseSettings(
      currentSettings.workflowRelease || DEFAULT_SETTINGS.workflowRelease,
      incomingSettings.workflowRelease || {},
    ),
    governance: normalizeSettingsGovernance({
      ...(currentSettings.governance || DEFAULT_SETTINGS.governance),
      ...(incomingSettings.governance || {}),
      compatibility: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .compatibility || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.compatibility)
            ? incomingSettings.governance.compatibility
            : {}
        ),
      },
      workflowManifest: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .workflowManifest || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.workflowManifest)
            ? incomingSettings.governance.workflowManifest
            : {}
        ),
      },
      tenantIsolation: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .tenantIsolation || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.tenantIsolation)
            ? incomingSettings.governance.tenantIsolation
            : {}
        ),
      },
      rbac: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .rbac || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.rbac)
            ? incomingSettings.governance.rbac
            : {}
        ),
      },
      releaseControl: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .releaseControl || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.releaseControl)
            ? incomingSettings.governance.releaseControl
            : {}
        ),
      },
      security: {
        ...(
          normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
            .security || {}
        ),
        ...(
          isPlainObject(incomingSettings.governance?.security)
            ? incomingSettings.governance.security
            : {}
        ),
        keyManagement: {
          ...(
            normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
              .security?.keyManagement || {}
          ),
          ...(
            isPlainObject(incomingSettings.governance?.security?.keyManagement)
              ? incomingSettings.governance.security.keyManagement
              : {}
          ),
        },
        sso: {
          ...(
            normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
              .security?.sso || {}
          ),
          ...(
            isPlainObject(incomingSettings.governance?.security?.sso)
              ? incomingSettings.governance.security.sso
              : {}
          ),
        },
        permissionDomains: {
          ...(
            normalizeSettingsGovernance(currentSettings.governance || DEFAULT_SETTINGS.governance)
              .security?.permissionDomains || {}
          ),
          ...(
            isPlainObject(incomingSettings.governance?.security?.permissionDomains)
              ? incomingSettings.governance.security.permissionDomains
              : {}
          ),
        },
      },
    }),
  };
};

// =========================
// 当前对象层收口辅助
// 先补 SettingsConfigSummary 与 SettingsStatusSummary，帮助后续拆 Settings / AssistantCenter 边界。
// =========================
export const getSettingsCompatibilitySummary = () => ({
  primary: SETTINGS_COMPATIBILITY_POLICY.primary,
  compatibilityHelpers: SETTINGS_COMPATIBILITY_POLICY.compatibilityHelpers,
  frozenLegacyObjects: SETTINGS_COMPATIBILITY_POLICY.frozenLegacyObjects,
  retirementPlanned: SETTINGS_COMPATIBILITY_POLICY.retirementPlanned,
});

const buildSearchConnectorConfigSummary = (settings = {}) => {
  const searchSettings = normalizeSearchSettings(
    settings.search || DEFAULT_SETTINGS.search,
    settings.databases || [],
    settings.database || {},
  );

  return {
    contractVersion: searchSettings.contractVersion,
    connectorContractVersion:
      searchSettings.connectorContractVersion || SEARCH_CONNECTOR_PLATFORM_VERSION,
    summaryPolicy: {
      ...searchSettings.summaryPolicy,
    },
    connectors: {
      registry: (searchSettings.connectors.registry || []).map((item) => ({
        id: item.id,
        adapterType: item.adapterType || item.connectorType || '',
        connectorType: item.connectorType || item.adapterType || '',
        enabled: item.enabled !== false,
        databaseType: item.databaseType || item.connection?.databaseType || 'sqlite',
        roots: item.roots || [],
        connection: {
          databaseName: item.connection?.databaseName || '',
          host: item.connection?.host || '',
          port: item.connection?.port || '',
          username: item.connection?.username || item.connection?.user || '',
          hasPassword: Boolean(item.connection?.password),
          path: item.connection?.path || item.connection?.databaseFile || '',
        },
        whitelist: item.whitelist || {},
        fieldMapping: item.fieldMapping || {},
        limits: item.limits || {},
        permissionIsolation: item.permissionIsolation || {},
      })),
      knowledge: (searchSettings.connectors.knowledge || []).map((item) => ({
        id: item.id,
        adapterType: item.adapterType || 'knowledge',
        connectorType: item.connectorType || item.adapterType || 'knowledge',
        enabled: item.enabled !== false,
        whitelist: item.whitelist || {},
        fieldMapping: item.fieldMapping || {},
        limits: item.limits || {},
        permissionIsolation: item.permissionIsolation || {},
      })),
      fileSystems: (searchSettings.connectors.fileSystems || []).map((item) => ({
        id: item.id,
        adapterType: item.adapterType || 'file-system',
        connectorType: item.connectorType || item.adapterType || 'file-system',
        enabled: item.enabled !== false,
        roots: item.roots || [],
        whitelist: item.whitelist || {},
        fieldMapping: item.fieldMapping || {},
        limits: item.limits || {},
        permissionIsolation: item.permissionIsolation || {},
      })),
      databases: (searchSettings.connectors.databases || []).map((item) => ({
        id: item.id,
        adapterType: item.adapterType || 'database',
        connectorType: item.connectorType || item.adapterType || 'database',
        enabled: item.enabled !== false,
        databaseType: item.databaseType || item.connection?.databaseType || 'sqlite',
        connection: {
          databaseName: item.connection?.databaseName || '',
          host: item.connection?.host || '',
          port: item.connection?.port || '',
          username: item.connection?.username || item.connection?.user || '',
          hasPassword: Boolean(item.connection?.password),
          path: item.connection?.path || item.connection?.databaseFile || '',
        },
        whitelist: item.whitelist || {},
        fieldMapping: item.fieldMapping || {},
        limits: item.limits || {},
        permissionIsolation: item.permissionIsolation || {},
      })),
    },
  };
};

export const buildExecutionContextContract = (executionContext = null, moduleName = 'analyze') => {
  const resolvedExecutionContext =
    executionContext && typeof executionContext === 'object' ? executionContext : {};

  return {
    contractVersion: 'execution-context/v1',
    moduleName: resolvedExecutionContext.moduleName || moduleName,
    resolvedAssistant: resolvedExecutionContext.resolvedAssistant || null,
    resolvedPrompt: resolvedExecutionContext.resolvedPrompt || null,
    strategy: resolvedExecutionContext.strategy || null,
    scopes: {
      rulesScope: Array.isArray(resolvedExecutionContext.rulesScope)
        ? resolvedExecutionContext.rulesScope
        : [],
      productScope: Array.isArray(resolvedExecutionContext.productScope)
        ? resolvedExecutionContext.productScope
        : [],
      docScope: Array.isArray(resolvedExecutionContext.docScope)
        ? resolvedExecutionContext.docScope
        : [],
    },
    source: resolvedExecutionContext.source || null,
    fallbackReason: resolvedExecutionContext.fallbackReason || null,
    summary: resolvedExecutionContext.summary || null,
  };
};

export const buildSettingsPrimaryContract = ({
  configSummary = null,
  executionContextContract = null,
  governanceSummary = null,
} = {}) => {
  return {
    contractVersion: 'settings-primary/v1',
    compatibilityMode: 'read-only-frozen',
    settings: configSummary,
    executionContext: executionContextContract,
    governance: governanceSummary,
    compatibilityPolicy: getSettingsCompatibilitySummary(),
  };
};

export const getWorkflowReleaseSettings = (settingsInput = null) => {
  const settings = settingsInput || readSettings();
  return normalizeWorkflowReleaseSettings(
    settings.workflowRelease || DEFAULT_SETTINGS.workflowRelease,
  );
};

export const getSettingsGovernanceSettings = (settingsInput = null) => {
  const settings = settingsInput || readSettings();
  return normalizeSettingsGovernance(
    settings.governance || DEFAULT_SETTINGS.governance,
  );
};

export const getWorkflowManifestGovernanceSettings = (settingsInput = null) => {
  return getSettingsGovernanceSettings(settingsInput).workflowManifest;
};

export const getSettingsTenantIsolationSettings = (settingsInput = null) => {
  return getSettingsGovernanceSettings(settingsInput).tenantIsolation;
};

export const getSettingsRbacSettings = (settingsInput = null) => {
  return getSettingsGovernanceSettings(settingsInput).rbac;
};

export const getSettingsReleaseControlSettings = (settingsInput = null) => {
  return getSettingsGovernanceSettings(settingsInput).releaseControl;
};

export const getSettingsSecuritySettings = (settingsInput = null) => {
  return getSettingsGovernanceSettings(settingsInput).security;
};

export const shouldIncludeLegacySettingsInResponse = (settingsInput = null) => {
  return (
    getSettingsGovernanceSettings(settingsInput).compatibility
      ?.includeLegacySettingsInResponse === true
  );
};

export const getWorkflowReleaseRouteConfig = ({
  settingsInput = null,
  kind = '',
  route = '',
} = {}) => {
  const workflowRelease = getWorkflowReleaseSettings(settingsInput);
  const routeKey = normalizeWorkflowRouteKey(kind, route);
  const routes = workflowRelease.routes || {};

  if (routeKey && isPlainObject(routes[routeKey])) {
    return {
      routeKey,
      ...routes[routeKey],
    };
  }

  const fallbackConfig = Object.entries(routes).find(([, item]) => {
    return (
      String(item?.kind || '').trim() === String(kind || '').trim() &&
      String(item?.route || '').trim() === String(route || '').trim()
    );
  });

  if (!fallbackConfig) {
    return null;
  }

  return {
    routeKey: fallbackConfig[0],
    ...fallbackConfig[1],
  };
};

export const getActiveDatabaseConfig = () => {
  const settings = readSettings();
  return {
    ...DEFAULT_SETTINGS.database,
    ...(settings.database || {}),
  };
};

// 兼容桥接 helper：继续保留，但不再继续扩字段。
export const getModelSettings = () => {
  const settings = readSettings();
  const mergedModelSettings = {
    ...DEFAULT_SETTINGS.model,
    ...(settings.model || {}),
    models: Array.isArray(settings.model?.models)
      ? settings.model.models
      : DEFAULT_SETTINGS.model.models,
    moduleBindings: {
      ...DEFAULT_SETTINGS.model.moduleBindings,
      ...(settings.model?.moduleBindings || {}),
    },
  };

  return {
    ...mergedModelSettings,
    ...getResolvedActiveModelSnapshot(mergedModelSettings),
  };
};

// 兼容桥接 helper：继续保留，但不再继续扩字段。
export const getAssistantSettings = () => {
  const settings = readSettings();
  return normalizeAssistantSettings(settings.assistant || {});
};

export const getActiveAssistantId = () => {
  const assistantSettings = getAssistantSettings();
  return (
    assistantSettings.activeAssistantId ||
    getDefaultAssistantProfile()?.id ||
    DEFAULT_SETTINGS.assistant.activeAssistantId
  );
};

export const getModelConfigForModule = (moduleName) => {
  const modelSettings = getModelSettings();
  const models = Array.isArray(modelSettings.models) ? modelSettings.models : [];
  const activeModelId =
    (modelSettings.moduleBindings && modelSettings.moduleBindings[moduleName]) ||
    modelSettings.activeModelId ||
    'default-local';

  const matchedModel =
    models.find((item) => item.id === activeModelId) ||
    models.find((item) => item.id === modelSettings.activeModelId) ||
    models[0] ||
    DEFAULT_SETTINGS.model.models[0];

  return {
    modelProvider: matchedModel.modelProvider || 'local',
    baseUrl: matchedModel.baseUrl || '',
    apiKey: matchedModel.apiKey || '',
    modelName: matchedModel.modelName || '',
    timeout: matchedModel.timeout || '180000',
    activeModelId: matchedModel.id || activeModelId,
  };
};

const resolveEmbeddedModelPresence = (modelPath = '') => {
  const normalizedPath = String(modelPath || '').trim();
  if (!normalizedPath) {
    return false;
  }

  try {
    if (path.isAbsolute(normalizedPath)) {
      return fs.existsSync(normalizedPath);
    }

    return (
      fs.existsSync(path.resolve(projectRoot, '..', normalizedPath)) ||
      fs.existsSync(path.resolve(projectRoot, normalizedPath))
    );
  } catch {
    return false;
  }
};

const buildEmbeddedModelConfigSummary = (embeddedModelInput = {}) => {
  const embeddedModel = isPlainObject(embeddedModelInput) ? embeddedModelInput : {};
  const hasConfig = Object.keys(embeddedModel).length > 0;
  const enabled = hasConfig && embeddedModel.enabled === true;
  const provider = String(embeddedModel.provider || '').trim();
  const modelId = String(
    embeddedModel.modelId ||
      embeddedModel.modelName ||
      embeddedModel.model ||
      '',
  ).trim();
  const modelPresent = resolveEmbeddedModelPresence(embeddedModel.modelPath);
  const status = !hasConfig
    ? 'not_configured'
    : !enabled
      ? 'disabled'
      : modelId && modelPresent
        ? 'available'
        : 'unavailable';

  return {
    enabled,
    provider,
    modelId,
    modelName: modelId,
    status,
    modelPresent,
    source: hasConfig ? 'settings.embeddedModel' : 'not_configured',
    updatedAt: String(
      embeddedModel.updatedAt ||
        embeddedModel.checkedAt ||
        embeddedModel.loadedAt ||
        '',
    ).trim(),
  };
};

const readRootEmbeddedModelSettings = () => {
  if (!fs.existsSync(rootSettingsFilePath)) {
    return {};
  }

  try {
    const parsedSettings = JSON.parse(fs.readFileSync(rootSettingsFilePath, 'utf8') || '{}');
    return isPlainObject(parsedSettings.embeddedModel) ? parsedSettings.embeddedModel : {};
  } catch {
    return {};
  }
};

const resolveEmbeddedModelSettingsForSummary = (settings = {}) => {
  if (isPlainObject(settings.embeddedModel) && Object.keys(settings.embeddedModel).length > 0) {
    return settings.embeddedModel;
  }

  return readRootEmbeddedModelSettings();
};

export const getSettingsConfigSummary = (settingsInput = null) => {
  const settings = settingsInput || readSettings();
  const activeAssistantId =
    settings.assistant?.activeAssistantId ||
    getDefaultAssistantProfile()?.id ||
    DEFAULT_SETTINGS.assistant.activeAssistantId;
  const activeAnalyzePrompt = getPromptForModule(activeAssistantId, 'analyze');
  const modelSettings = getResolvedActiveModelSnapshot({
    ...DEFAULT_SETTINGS.model,
    ...(settings.model || {}),
    models: Array.isArray(settings.model?.models)
      ? settings.model.models
      : DEFAULT_SETTINGS.model.models,
    moduleBindings: {
      ...DEFAULT_SETTINGS.model.moduleBindings,
      ...(settings.model?.moduleBindings || {}),
    },
  });

  return {
    database: {
      ...DEFAULT_SETTINGS.database,
      ...(settings.database || {}),
    },
    model: {
      activeModelId: modelSettings.activeModelId,
      moduleBindings: {
        ...DEFAULT_SETTINGS.model.moduleBindings,
        ...(settings.model?.moduleBindings || {}),
      },
      models: Array.isArray(settings.model?.models)
        ? settings.model.models.map((item) => ({
            id: item.id,
            label: item.label,
            enabled: item.enabled !== false,
            modelProvider: item.modelProvider,
            modelName: item.modelName,
            baseUrl: item.baseUrl,
            timeout: item.timeout,
            hasApiKey: Boolean(item.apiKey),
          }))
        : [],
    },
    strategy: {
      ...DEFAULT_SETTINGS.strategy,
      ...(settings.strategy || {}),
    },
    assistant: {
      activeAssistantId: activeAssistantId,
      activePromptId: settings.assistant?.activePromptId || activeAnalyzePrompt?.id || null,
    },
    search: buildSearchConnectorConfigSummary(settings),
    pythonRuntime: sanitizePythonRuntimeSettingsForClient(
      settings.pythonRuntime || DEFAULT_SETTINGS.pythonRuntime,
      settings.model || DEFAULT_SETTINGS.model,
    ),
    embeddedModel: buildEmbeddedModelConfigSummary(resolveEmbeddedModelSettingsForSummary(settings)),
    workflowRelease: normalizeWorkflowReleaseSettings(
      settings.workflowRelease || DEFAULT_SETTINGS.workflowRelease,
    ),
    governance: normalizeSettingsGovernance(
      settings.governance || DEFAULT_SETTINGS.governance,
    ),
  };
};

export const getSettingsStatusSummary = (settingsInput = null) => {
  const settings = settingsInput || readSettings();
  const assistantSettings = normalizeAssistantSettings(settings.assistant || {});
  const activeAssistantId =
    assistantSettings.activeAssistantId ||
    getDefaultAssistantProfile()?.id ||
    DEFAULT_SETTINGS.assistant.activeAssistantId;
  const activeAnalyzePrompt = getPromptForModule(activeAssistantId, 'analyze');
  const modelSettings = getResolvedActiveModelSnapshot({
    ...DEFAULT_SETTINGS.model,
    ...(settings.model || {}),
    models: Array.isArray(settings.model?.models)
      ? settings.model.models
      : DEFAULT_SETTINGS.model.models,
  });

  const executionContextSeed = isPlainObject(assistantSettings.executionContext)
    ? assistantSettings.executionContext
    : {
        assistantId: activeAssistantId,
        activeAssistantId: activeAssistantId,
        activePromptId: assistantSettings.activePromptId || activeAnalyzePrompt?.id || null,
      };

  const executionContext = getResolvedExecutionContextForModule('analyze', executionContextSeed, {
    modulePrompt: {
      promptId: activeAnalyzePrompt?.id || '',
      promptVersion: activeAnalyzePrompt?.version || '',
    },
  });
  const workflowRelease = normalizeWorkflowReleaseSettings(
    settings.workflowRelease || DEFAULT_SETTINGS.workflowRelease,
  );
  const workflowReleaseRoutes = Object.values(workflowRelease.routes || {});
  const canaryRoutes = workflowReleaseRoutes.filter((item) => Boolean(item.canaryPluginId));
  const canaryEnabledRoutes = canaryRoutes.filter(
    (item) => item.enabled !== false && Number(item.trafficPercent || 0) > 0,
  );

  return {
    assistantActivationSummary: {
      activeAssistantId: activeAssistantId,
      activePromptId: assistantSettings.activePromptId || activeAnalyzePrompt?.id || null,
      assistantVersion: assistantSettings.assistantVersion || executionContext?.resolvedAssistant?.assistantVersion || null,
      promptVersion:
        assistantSettings.promptVersion ||
        activeAnalyzePrompt?.version ||
        executionContext?.resolvedPrompt?.promptVersion ||
        null,
    },
    modelStatusSummary: {
      activeModelId: modelSettings.activeModelId,
      modelProvider: modelSettings.modelProvider,
      modelName: modelSettings.modelName,
      baseUrl: modelSettings.baseUrl,
      hasApiKey: Boolean(modelSettings.apiKey),
      timeout: modelSettings.timeout,
    },
    executionContextSummary: executionContext?.summary || null,
    workflowReleaseSummary: {
      routeCount: workflowReleaseRoutes.length,
      canaryRouteCount: canaryRoutes.length,
      canaryEnabledRouteCount: canaryEnabledRoutes.length,
    },
  };
};
