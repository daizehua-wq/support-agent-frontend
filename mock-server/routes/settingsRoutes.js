import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  getSettingsFromDatabase,
  saveSettingsToDatabase,
  testDatabaseConnection,
} from '../services/databaseService.js';
import { testModelConnection } from '../services/modelTestService.js';
import {
  getDefaultSettings,
  readSettings,
  saveSettings,
  sanitizeSettingsForClient,
  mergeSettingsPreserveApiKeys,
  getActiveDatabaseConfig,
  getSettingsConfigSummary,
  getSettingsStatusSummary,
  getResolvedExecutionContextForModule,
  buildExecutionContextContract,
  buildSettingsPrimaryContract,
  getWorkflowReleaseSettings,
  getWorkflowManifestGovernanceSettings,
  getSettingsReleaseControlSettings,
  getSettingsSecuritySettings,
  getSettingsTenantIsolationSettings,
  shouldIncludeLegacySettingsInResponse,
} from '../services/settingsService.js';
import { getAssistantById } from '../services/governanceRegistryService.js';
import { recordGovernanceAuditEntry } from '../services/governanceAuditService.js';
import {
  buildSettingsGovernanceSummary,
  syncAssistantGovernanceSettings,
} from '../services/settingsGovernanceBridgeService.js';
import {
  sendSuccess,
  sendFailure,
} from '../services/responseService.js';
import { validatePluginSpec } from '../contracts/platformContracts.js';
import {
  loadPluginRegistry,
  getPluginManifestDirectory,
} from '../services/pluginRegistryService.js';
import {
  getAllPluginExecutionMetrics,
  getPluginExecutionMetricsPersistenceSummary,
} from '../services/pluginRuntimeMetricsService.js';
import {
  acknowledgeOpsAlert,
  getOpsDashboardSnapshot,
  getOpsObservabilityPersistenceSummary,
  recordOpsProcessEvent,
} from '../services/opsObservabilityService.js';
import { getOrCreateSession, appendSessionStep, updateSession } from '../services/sessionService.js';
import { getAssistantExecutionContext } from '../services/assistantContextService.js';
import { resolveActiveAssistantId } from '../services/assistantGovernanceService.js';
import {
  evaluateSettingsPermission,
  getSettingsGovernanceHistory,
  getSettingsGovernanceOverview,
  getTenantActiveSettingsSnapshot,
  publishTenantSettingsVersion,
  recordSettingsMutationVersion,
  resolveSettingsGovernanceContext,
  rollbackTenantSettingsVersion,
} from '../services/settingsGovernanceService.js';
import {
  getPythonRuntimeHealthSnapshot,
  probePythonRuntimeHealth,
} from '../services/pythonRuntimeAdapterService.js';
import { getSecretVaultSummary } from '../services/secretVaultService.js';
import { nowLocalIso, toLocalFileStamp, toLocalIso } from '../utils/localTime.js';

const router = Router();
const DEFAULT_SETTINGS = getDefaultSettings();

const buildResolvedSettingsExecutionContext = (settings = {}) => {
  const assistantSettings = settings.assistant || {};
  const hasExecutionContextObject =
    assistantSettings.executionContext &&
    typeof assistantSettings.executionContext === 'object' &&
    !Array.isArray(assistantSettings.executionContext);

  const executionContextSeed = hasExecutionContextObject
    ? assistantSettings.executionContext
    : {
        assistantId: assistantSettings.activeAssistantId || '',
        activeAssistantId: assistantSettings.activeAssistantId || '',
        activePromptId: assistantSettings.activePromptId || null,
      };

  return getResolvedExecutionContextForModule('analyze', executionContextSeed);
};

const attachExecutionContextToSettings = (settings = {}, resolvedExecutionContext = null) => ({
  ...settings,
  assistant: {
    ...(settings.assistant || {}),
    executionContext: resolvedExecutionContext || null,
  },
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractPrimarySettingsWritePayload = (payload = {}) => {
  const primaryContract =
    payload && typeof payload === 'object' && isPlainObject(payload.primaryContract)
      ? payload.primaryContract
      : null;
  const settingsPayload = primaryContract && isPlainObject(primaryContract.settings)
    ? primaryContract.settings
    : null;

  return {
    contractVersion:
      typeof primaryContract?.contractVersion === 'string'
        ? primaryContract.contractVersion.trim()
        : '',
    settingsPayload,
  };
};

const buildSettingsResponseData = (settings = {}, options = {}) => {
  const includeLegacySettings =
    options.includeLegacySettings === true;
  const governanceSyncedSettings = syncAssistantGovernanceSettings(settings);
  const sanitizedSettings = sanitizeSettingsForClient(governanceSyncedSettings);
  const resolvedExecutionContext = buildResolvedSettingsExecutionContext(sanitizedSettings);
  const settingsWithExecutionContext = attachExecutionContextToSettings(
    sanitizedSettings,
    resolvedExecutionContext,
  );
  const summarySourceSettings = {
    ...governanceSyncedSettings,
    assistant: {
      ...(governanceSyncedSettings.assistant || {}),
      executionContext: resolvedExecutionContext || null,
    },
  };

  const configSummary = getSettingsConfigSummary(summarySourceSettings);
  const statusSummary = getSettingsStatusSummary(summarySourceSettings);
  const governanceSummary = buildSettingsGovernanceSummary(summarySourceSettings);
  const primaryContract = buildSettingsPrimaryContract({
    configSummary,
    executionContextContract: buildExecutionContextContract(resolvedExecutionContext, 'analyze'),
    governanceSummary,
  });
  const compatSettings = settingsWithExecutionContext;
  const responsePayload = {
    primaryContract,

    // 正式主口径
    configSummary,
    statusSummary,
    governanceSummary,

    // 代码化兼容 / 退场策略
    responseContract: {
      primary: ['primaryContract', 'configSummary', 'statusSummary', 'governanceSummary'],
      compatibility: includeLegacySettings ? ['compatSettings'] : [],
      frozenLegacyTopLevel: ['database', 'model', 'strategy', 'assistant'],
      retirementPlanned: ['compatSettings', 'database', 'model', 'strategy', 'assistant'],
    },
    compatibilityMode: includeLegacySettings ? 'legacy-opt-in' : 'primary-only',

    deprecatedFields: {
      database: 'legacy-top-level-field-frozen',
      model: 'legacy-top-level-field-frozen',
      strategy: 'legacy-top-level-field-frozen',
      assistant: 'legacy-top-level-field-frozen',
    },
  };

  if (includeLegacySettings) {
    responsePayload.compatSettings = compatSettings;
    responsePayload.database = compatSettings.database;
    responsePayload.model = compatSettings.model;
    responsePayload.strategy = compatSettings.strategy;
    responsePayload.assistant = compatSettings.assistant;
    responsePayload.search = compatSettings.search;
    responsePayload.workflowRelease = compatSettings.workflowRelease;
    responsePayload.governance = compatSettings.governance;
  }

  return responsePayload;
};

const buildWorkflowReleaseOptions = () => {
  const registry = loadPluginRegistry();
  const settings = readSettings();
  const workflowRelease = getWorkflowReleaseSettings(settings);
  const pluginGroups = new Map();

  (registry.plugins || [])
    .filter((plugin) => plugin?.enabled !== false)
    .forEach((plugin) => {
      const routeKey = `${plugin.kind}:${plugin.route}`;

      if (!pluginGroups.has(routeKey)) {
        pluginGroups.set(routeKey, []);
      }

      pluginGroups.get(routeKey).push(plugin);
    });

  const routes = [...pluginGroups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([routeKey, routePlugins]) => {
      const [kind = '', route = ''] = routeKey.split(':');
      const sortedPlugins = [...routePlugins].sort(
        (left, right) => Number(left.order || 0) - Number(right.order || 0),
      );
      const candidates = sortedPlugins.map((plugin) => ({
        pluginId: plugin.pluginId,
        displayName: plugin.displayName,
        releaseStage: plugin?.release?.stage || 'stable',
        defaultPlugin: plugin.defaultPlugin === true,
        order: Number(plugin.order || 0),
        manifestPath: plugin.manifestPath || '',
      }));
      const stableCandidate =
        sortedPlugins.find((plugin) => plugin?.release?.stage !== 'canary' && plugin.defaultPlugin === true) ||
        sortedPlugins.find((plugin) => plugin?.release?.stage !== 'canary') ||
        sortedPlugins[0] ||
        null;
      const canaryCandidate =
        sortedPlugins.find((plugin) => plugin?.release?.stage === 'canary') || null;
      const currentRouteConfig =
        workflowRelease.routes?.[routeKey] ||
        Object.values(workflowRelease.routes || {}).find(
          (item) => item?.kind === kind && item?.route === route,
        ) ||
        null;

      return {
        routeKey,
        kind,
        route,
        displayName: currentRouteConfig?.displayName || `${kind} / ${route}`,
        stablePluginId:
          currentRouteConfig?.stablePluginId || stableCandidate?.pluginId || '',
        canaryPluginId:
          currentRouteConfig?.canaryPluginId || canaryCandidate?.pluginId || '',
        trafficPercent: Number(currentRouteConfig?.trafficPercent || 0),
        rollbackOnError: currentRouteConfig?.rollbackOnError === true,
        bucketBy: currentRouteConfig?.bucketBy || 'sessionId',
        enabled: currentRouteConfig?.enabled !== false,
        guardEnabled: currentRouteConfig?.guardEnabled === true,
        minSampleSize: Number(currentRouteConfig?.minSampleSize || 20),
        maxErrorRatePercent: Number(currentRouteConfig?.maxErrorRatePercent || 20),
        maxP95LatencyMs: Number(currentRouteConfig?.maxP95LatencyMs || 25000),
        candidates,
      };
    });

  return {
    contractVersion: 'workflow-release-options/v1',
    loadedAt: registry.loadedAt,
    manifestDirectory: registry.manifestDirectory,
    routes,
    errors: Array.isArray(registry.errors) ? registry.errors : [],
  };
};

const sanitizeManifestFileName = (fileName = '') => {
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedFileName) {
    return '';
  }

  const baseName = path.basename(normalizedFileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!baseName.endsWith('.json')) {
    return `${baseName}.json`;
  }

  return baseName;
};

const getManifestPathByPluginId = (pluginId = '') => {
  const normalizedPluginId = String(pluginId || '').trim();
  const manifestFileName = sanitizeManifestFileName(normalizedPluginId.replace(/\./g, '-'));
  return path.join(getPluginManifestDirectory(), manifestFileName || 'plugin.json');
};

const buildWorkflowManifestList = () => {
  const registry = loadPluginRegistry();
  const manifestDirectory = getPluginManifestDirectory();
  const settings = readSettings();
  const governancePolicy = getWorkflowManifestGovernanceSettings(settings);
  const manifestFiles = fs.existsSync(manifestDirectory)
    ? fs.readdirSync(manifestDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
    : [];

  return {
    contractVersion: 'workflow-manifests/v1',
    manifestDirectory,
    manifestFiles,
    plugins: (registry.plugins || []).map((plugin) => ({
      pluginId: plugin.pluginId,
      displayName: plugin.displayName,
      kind: plugin.kind,
      route: plugin.route,
      manifestPath: plugin.manifestPath || '',
      defaultPlugin: plugin.defaultPlugin === true,
      release: plugin.release || null,
      workflow: {
        entryNodeId: plugin.workflow?.entryNodeId || '',
        nodeCount: Array.isArray(plugin.workflow?.nodes) ? plugin.workflow.nodes.length : 0,
      },
    })),
    errors: registry.errors || [],
    governancePolicy: {
      contractVersion: governancePolicy.contractVersion,
      enabled: governancePolicy.enabled !== false,
      requiredApprovals: governancePolicy.requiredApprovals || 1,
      requireApprovalToken: governancePolicy.requireApprovalToken === true,
      approvalTokenEnvVar:
        normalizeText(governancePolicy.approvalTokenEnvVar) ||
        'WORKFLOW_MANIFEST_ADMIN_TOKEN',
      requireChangeTicket: governancePolicy.requireChangeTicket === true,
      allowedRoles: Array.isArray(governancePolicy.allowedRoles)
        ? governancePolicy.allowedRoles
        : [],
      allowDelete: governancePolicy.allowDelete !== false,
      allowRollback: governancePolicy.allowRollback !== false,
    },
  };
};

const normalizeText = (value = '') => String(value || '').trim();

const readFirstHeaderValue = (req = {}, headerName = '') => {
  const normalizedHeader = normalizeText(headerName).toLowerCase();

  if (!normalizedHeader || !req?.headers || typeof req.headers !== 'object') {
    return '';
  }

  const headerValue = req.headers[normalizedHeader];

  if (typeof headerValue === 'string') {
    return normalizeText(headerValue);
  }

  if (Array.isArray(headerValue) && headerValue.length > 0) {
    return normalizeText(headerValue[0]);
  }

  return '';
};

const isOpsProcessEventAuthorized = (req = {}) => {
  const expectedToken = normalizeText(process.env.OPS_EVENT_TOKEN);

  if (!expectedToken) {
    return true;
  }

  const requestToken =
    readFirstHeaderValue(req, 'x-ops-token') ||
    readFirstHeaderValue(req, 'authorization').replace(/^Bearer\\s+/i, '');

  return requestToken === expectedToken;
};

const MANIFEST_HISTORY_CONTRACT_VERSION = 'workflow-manifest-history/v1';

const getManifestHistoryDirectory = () => {
  return path.join(getPluginManifestDirectory(), '_history');
};

const sanitizePathSegment = (value = '') => {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]/g, '-');
};

const resolveManifestPathByFileName = (fileName = '') => {
  const normalizedFileName = sanitizeManifestFileName(fileName);

  if (!normalizedFileName) {
    return '';
  }

  return path.join(getPluginManifestDirectory(), normalizedFileName);
};

const readManifestFromPath = (manifestPath = '') => {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return null;
  }

  const rawText = fs.readFileSync(manifestPath, 'utf-8');

  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      `manifest parse failed at ${manifestPath}: ${error.message}`,
    );
  }
};

const backupManifestFile = ({
  manifestPath = '',
  pluginId = '',
  action = 'upsert',
} = {}) => {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return null;
  }

  const historyDirectory = getManifestHistoryDirectory();
  const pluginKey =
    sanitizePathSegment(pluginId) ||
    sanitizePathSegment(path.basename(manifestPath, '.json')) ||
    'unknown-plugin';
  const timestamp = toLocalFileStamp();
  const backupFile = `${timestamp}__${sanitizePathSegment(action || 'upsert')}.json`;
  const pluginHistoryDirectory = path.join(historyDirectory, pluginKey);
  const backupPath = path.join(pluginHistoryDirectory, backupFile);
  const backupContent = fs.readFileSync(manifestPath, 'utf-8');

  fs.mkdirSync(pluginHistoryDirectory, { recursive: true });
  fs.writeFileSync(backupPath, backupContent, 'utf-8');

  return {
    contractVersion: MANIFEST_HISTORY_CONTRACT_VERSION,
    pluginId: pluginId || pluginKey,
    backupFile,
    backupPath,
    sourceManifestPath: manifestPath,
    action,
    backedUpAt: nowLocalIso(),
  };
};

const listManifestHistoryEntries = (pluginId = '') => {
  const historyDirectory = getManifestHistoryDirectory();
  const normalizedPluginId = sanitizePathSegment(pluginId);

  if (!fs.existsSync(historyDirectory)) {
    return [];
  }

  const pluginDirectories = normalizedPluginId
    ? [normalizedPluginId]
    : fs
        .readdirSync(historyDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

  return pluginDirectories
    .flatMap((pluginKey) => {
      const pluginHistoryDirectory = path.join(historyDirectory, pluginKey);

      if (!fs.existsSync(pluginHistoryDirectory)) {
        return [];
      }

      return fs
        .readdirSync(pluginHistoryDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => {
          const backupPath = path.join(pluginHistoryDirectory, entry.name);
          const createdAt = fs.existsSync(backupPath)
            ? toLocalIso(fs.statSync(backupPath).mtime)
            : '';
          return {
            pluginKey,
            backupFile: entry.name,
            backupPath,
            createdAt,
          };
        });
    })
    .sort((left, right) => right.backupFile.localeCompare(left.backupFile));
};

const resolveManifestHistoryPath = ({
  pluginId = '',
  backupFile = '',
} = {}) => {
  const pluginKey = sanitizePathSegment(pluginId);
  const normalizedBackupFile = sanitizeManifestFileName(backupFile);

  if (!pluginKey || !normalizedBackupFile) {
    return '';
  }

  return path.join(getManifestHistoryDirectory(), pluginKey, normalizedBackupFile);
};

const resolveManifestGovernanceContext = ({
  req,
  payload = {},
  action = 'upsert',
  settings = {},
} = {}) => {
  const governancePolicy = getWorkflowManifestGovernanceSettings(settings);
  const actor = isPlainObject(payload.actor) ? payload.actor : {};
  const approvalsSeed = Array.isArray(payload.approvals)
    ? payload.approvals
    : payload.approval
      ? [payload.approval]
      : [];
  const approvals = approvalsSeed
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      approvedBy: normalizeText(item.approvedBy),
      approvedAt: normalizeText(item.approvedAt) || nowLocalIso(),
      note: normalizeText(item.note),
    }))
    .filter((item) => item.approvedBy);
  const role =
    normalizeText(actor.role) ||
    normalizeText(req.headers['x-platform-role']) ||
    normalizeText(req.headers['x-user-role']) ||
    normalizeText(payload.role);
  const actorId =
    normalizeText(actor.id) ||
    normalizeText(req.headers['x-platform-actor']) ||
    normalizeText(req.headers['x-user-id']) ||
    normalizeText(payload.actorId) ||
    'settings-workflow-manifest';
  const changeTicket =
    normalizeText(payload.changeTicket) ||
    normalizeText(req.headers['x-change-ticket']) ||
    normalizeText(payload.ticketId);
  const approvalToken =
    normalizeText(payload.approvalToken) ||
    normalizeText(payload.approval?.token) ||
    normalizeText(req.headers['x-approval-token']);
  const requiredRoles = Array.isArray(governancePolicy.allowedRoles)
    ? governancePolicy.allowedRoles.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const approvalTokenEnvVar =
    normalizeText(governancePolicy.approvalTokenEnvVar) || 'WORKFLOW_MANIFEST_ADMIN_TOKEN';
  const expectedApprovalToken = normalizeText(process.env[approvalTokenEnvVar]);
  const failures = [];

  if (governancePolicy.enabled === false) {
    failures.push('workflow-manifest-governance-disabled');
  }

  if (action === 'delete' && governancePolicy.allowDelete === false) {
    failures.push('workflow-manifest-delete-disabled');
  }

  if (action === 'rollback' && governancePolicy.allowRollback === false) {
    failures.push('workflow-manifest-rollback-disabled');
  }

  if (requiredRoles.length > 0 && (!role || !requiredRoles.includes(role))) {
    failures.push('workflow-manifest-role-not-allowed');
  }

  if (governancePolicy.requireChangeTicket === true && !changeTicket) {
    failures.push('workflow-manifest-change-ticket-required');
  }

  if (approvals.length < Number(governancePolicy.requiredApprovals || 1)) {
    failures.push('workflow-manifest-approval-count-not-enough');
  }

  if (governancePolicy.requireApprovalToken === true) {
    if (!expectedApprovalToken) {
      failures.push('workflow-manifest-approval-token-env-missing');
    } else if (approvalToken !== expectedApprovalToken) {
      failures.push('workflow-manifest-approval-token-invalid');
    }
  }

  return {
    allowed: failures.length === 0,
    failures,
    actor: {
      id: actorId,
      role,
    },
    approvals,
    changeTicket,
    governancePolicy: {
      contractVersion: governancePolicy.contractVersion,
      requiredApprovals: governancePolicy.requiredApprovals,
      requireApprovalToken: governancePolicy.requireApprovalToken === true,
      approvalTokenEnvVar,
      requireChangeTicket: governancePolicy.requireChangeTicket === true,
      allowedRoles: requiredRoles,
      allowDelete: governancePolicy.allowDelete !== false,
      allowRollback: governancePolicy.allowRollback !== false,
    },
  };
};

const safeRecordManifestAudit = (payload = {}) => {
  try {
    recordGovernanceAuditEntry(payload);
  } catch (error) {
    console.warn(
      '[settings] workflow manifest governance audit record failed:',
      error.message,
    );
  }
};


const appendSettingsStepIfNeeded = ({
  sessionId = '',
  action = '',
  stepType = 'settings',
  inputPayload = null,
  outputPayload = null,
  summary = '',
  route = 'settings',
} = {}) => {
  const session = getOrCreateSession({
    sessionId,
    title: 'settings｜当前配置会话',
    customerType: '服务支持会话',
    sourceModule: 'settings',
    currentStage: 'settings',
    currentGoal: action || 'settings_update',
  });

  appendSessionStep({
    sessionId: session.id,
    stepType,
    inputPayload,
    outputPayload,
    summary,
    route,
    strategy: 'settings',
    executionStrategy: 'settings',
    outboundAllowed: false,
    outboundReason: 'settings-local-only',
    modelName: '',
  });

  updateSession(session.id, {
    sourceModule: 'settings',
    currentStage: 'settings',
    currentGoal: action || 'settings_update',
    title: 'settings｜当前配置会话',
  });

  return session;
};

const resolveIncludeLegacySettingsFlag = (req, settings = {}) => {
  const queryValue = normalizeText(req?.query?.includeLegacy);
  const queryCompatMode = normalizeText(req?.query?.compat);
  const queryEnabled = queryValue === '1' || queryValue.toLowerCase() === 'true';
  const queryCompatEnabled = queryCompatMode === 'legacy';

  if (queryEnabled || queryCompatEnabled) {
    return true;
  }

  return shouldIncludeLegacySettingsInResponse(settings);
};

const buildSettingsPermissionFailurePayload = ({
  permission = 'settings:read',
  context = {},
  permissionResult = {},
} = {}) => {
  return {
    status: 403,
    message: 'settings governance permission denied',
    error:
      permissionResult.reason ||
      `permission ${permission} is required for role ${context?.actor?.role || 'unknown'}`,
    data: {
      permission,
      tenantId: context?.tenantId || '',
      traceId: context?.traceId || '',
      actor: context?.actor || {},
      expectedRoles: permissionResult.expectedRoles || [],
      rolePermissions: permissionResult.rolePermissions || {},
      knownTenants: permissionResult.knownTenants || [],
      code: permissionResult.code || 'permission-denied',
    },
  };
};

const evaluateSettingsPermissionForRequest = ({
  permission = 'settings:read',
  context = {},
  settings = null,
} = {}) => {
  return evaluateSettingsPermission({
    tenantId: context.tenantId,
    role: context.actor?.role,
    permission,
    settings,
  });
};

const applyTenantSettingsSnapshotIfNeeded = async ({
  tenantId = '',
  settingsSnapshot = {},
} = {}) => {
  const normalizedTenantId = normalizeText(tenantId) || 'default';
  const normalizedSnapshot =
    settingsSnapshot && typeof settingsSnapshot === 'object' && !Array.isArray(settingsSnapshot)
      ? settingsSnapshot
      : {};

  if (normalizedTenantId !== 'default') {
    return {
      settings: normalizedSnapshot,
      persistedToDatabase: false,
      persistedToLocal: false,
    };
  }

  const databaseConfig = {
    ...getActiveDatabaseConfig(),
    ...(normalizedSnapshot.database || {}),
  };
  let persistedSettings = normalizedSnapshot;
  let persistedToDatabase = false;

  try {
    const savedSettings = await saveSettingsToDatabase(
      normalizedSnapshot,
      DEFAULT_SETTINGS,
      databaseConfig,
    );
    persistedSettings = syncAssistantGovernanceSettings(
      mergeSettingsPreserveApiKeys(savedSettings, normalizedSnapshot),
    );
    persistedToDatabase = true;
  } catch (error) {
    console.warn(
      '[settings] apply tenant snapshot to database failed, fallback to local only:',
      error.message,
    );
  }

  saveSettings(persistedSettings);

  return {
    settings: persistedSettings,
    persistedToDatabase,
    persistedToLocal: true,
  };
};


// =========================
// 配置接口｜Settings
// 当前阶段继续承接配置读取 / 保存 / 测试，
// 但正式主口径开始切到：
// - primaryContract
// - configSummary
// - statusSummary
// compatSettings 作为兼容层保留；旧顶层 database / model / strategy / assistant
// 进入只读冻结状态，不再继续扩字段，也不再作为写入口。
// =========================
router.get('/', async (req, res) => {
  try {
    const databaseConfig = getActiveDatabaseConfig();
    const settings = await getSettingsFromDatabase(DEFAULT_SETTINGS, databaseConfig);
    const localSettings = readSettings();
    const mergedSettings = mergeSettingsPreserveApiKeys(settings, localSettings);
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload: req.query || {},
      settings: mergedSettings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:read',
      context: governanceContext,
      settings: mergedSettings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:read',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    const tenantSettings = getTenantActiveSettingsSnapshot({
      tenantId: governanceContext.tenantId,
      fallbackSettings: mergedSettings,
      settings: mergedSettings,
    });
    const effectiveSettings = tenantSettings.settingsSnapshot || mergedSettings;
    const includeLegacySettings = resolveIncludeLegacySettingsFlag(req, effectiveSettings);

    return sendSuccess(res, {
      message: 'settings loaded',
      data: buildSettingsResponseData(effectiveSettings, {
        includeLegacySettings,
      }),
      meta: {
        governance: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          activeVersion: tenantSettings.activeVersion || null,
          pointers: tenantSettings.pointers || null,
        },
      },
    });
  } catch (error) {
    const fallbackSettings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload: req.query || {},
      settings: fallbackSettings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:read',
      context: governanceContext,
      settings: fallbackSettings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:read',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    const tenantSettings = getTenantActiveSettingsSnapshot({
      tenantId: governanceContext.tenantId,
      fallbackSettings,
      settings: fallbackSettings,
    });
    const effectiveSettings = tenantSettings.settingsSnapshot || fallbackSettings;
    const includeLegacySettings = resolveIncludeLegacySettingsFlag(req, effectiveSettings);

    return sendSuccess(res, {
      message: 'settings loaded from local fallback',
      data: buildSettingsResponseData(effectiveSettings, {
        includeLegacySettings,
      }),
      meta: {
        governance: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          activeVersion: tenantSettings.activeVersion || null,
          pointers: tenantSettings.pointers || null,
          source: 'local-fallback',
        },
      },
    });
  }
});

router.get('/workflow-release-options', async (req, res) => {
  try {
    return sendSuccess(res, {
      message: 'workflow release options loaded',
      data: buildWorkflowReleaseOptions(),
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow release options load failed',
      error: error.message,
    });
  }
});

router.get('/workflow-manifests', async (req, res) => {
  try {
    return sendSuccess(res, {
      message: 'workflow manifests loaded',
      data: buildWorkflowManifestList(),
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow manifests load failed',
      error: error.message,
    });
  }
});

router.get('/workflow-manifests/history', async (req, res) => {
  try {
    const pluginId = normalizeText(req.query.pluginId);
    const entries = listManifestHistoryEntries(pluginId);

    return sendSuccess(res, {
      message: 'workflow manifest history loaded',
      data: {
        contractVersion: MANIFEST_HISTORY_CONTRACT_VERSION,
        pluginId,
        itemCount: entries.length,
        items: entries,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow manifest history load failed',
      error: error.message,
    });
  }
});

router.post('/workflow-manifests/upsert', async (req, res) => {
  try {
    const payload = req.body || {};
    const manifest = isPlainObject(payload.manifest) ? payload.manifest : null;
    const settings = readSettings();
    const governanceContext = resolveManifestGovernanceContext({
      req,
      payload,
      action: 'upsert',
      settings,
    });

    if (!governanceContext.allowed) {
      return sendFailure(res, {
        status: 403,
        message: 'workflow manifest upsert blocked',
        error: governanceContext.failures.join(', '),
        data: {
          governance: governanceContext,
        },
      });
    }

    if (!manifest) {
      return sendFailure(res, {
        status: 400,
        message: 'workflow manifest upsert failed',
        error: 'manifest must be an object',
      });
    }

    const normalizedManifest = validatePluginSpec(manifest, {
      manifestPath: 'runtime-upsert',
    });
    const requestedFileName = sanitizeManifestFileName(payload.fileName);
    const manifestPath = requestedFileName
      ? path.join(getPluginManifestDirectory(), requestedFileName)
      : getManifestPathByPluginId(normalizedManifest.pluginId);
    const previousManifest = readManifestFromPath(manifestPath);
    const historyBackup = backupManifestFile({
      manifestPath,
      pluginId: normalizedManifest.pluginId,
      action: 'upsert-before',
    });

    fs.mkdirSync(getPluginManifestDirectory(), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    const registry = loadPluginRegistry();
    const savedPlugin = (registry.plugins || []).find(
      (item) => item.pluginId === normalizedManifest.pluginId,
    );

    safeRecordManifestAudit({
      entityType: 'plugin_manifest',
      targetId: normalizedManifest.pluginId,
      targetName: normalizedManifest.displayName || normalizedManifest.pluginId,
      action: previousManifest ? 'update' : 'create',
      actor: governanceContext.actor.id,
      before: previousManifest,
      after: savedPlugin || normalizedManifest,
      metadata: {
        route: 'settings.workflow-manifests.upsert',
        manifestPath,
        changeTicket: governanceContext.changeTicket,
        role: governanceContext.actor.role,
        approvals: governanceContext.approvals,
        historyBackup,
      },
    });

    return sendSuccess(res, {
      message: 'workflow manifest upserted',
      data: {
        pluginId: normalizedManifest.pluginId,
        manifestPath,
        plugin: savedPlugin || normalizedManifest,
        governance: governanceContext,
        historyBackup,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 400,
      message: 'workflow manifest upsert failed',
      error: error.message,
    });
  }
});

router.post('/workflow-manifests/delete', async (req, res) => {
  try {
    const payload = req.body || {};
    const pluginId = String(payload.pluginId || '').trim();
    const fileName = sanitizeManifestFileName(payload.fileName);
    const settings = readSettings();
    const governanceContext = resolveManifestGovernanceContext({
      req,
      payload,
      action: 'delete',
      settings,
    });

    if (!governanceContext.allowed) {
      return sendFailure(res, {
        status: 403,
        message: 'workflow manifest delete blocked',
        error: governanceContext.failures.join(', '),
        data: {
          governance: governanceContext,
        },
      });
    }

    if (!pluginId && !fileName) {
      return sendFailure(res, {
        status: 400,
        message: 'workflow manifest delete failed',
        error: 'pluginId or fileName is required',
      });
    }

    const manifestPath = fileName
      ? path.join(getPluginManifestDirectory(), fileName)
      : getManifestPathByPluginId(pluginId);
    const previousManifest = readManifestFromPath(manifestPath);

    if (!fs.existsSync(manifestPath)) {
      return sendFailure(res, {
        status: 404,
        message: 'workflow manifest delete failed',
        error: 'manifest file not found',
      });
    }

    const historyBackup = backupManifestFile({
      manifestPath,
      pluginId: previousManifest?.pluginId || pluginId,
      action: 'delete-before',
    });

    fs.unlinkSync(manifestPath);

    safeRecordManifestAudit({
      entityType: 'plugin_manifest',
      targetId: previousManifest?.pluginId || pluginId,
      targetName:
        previousManifest?.displayName ||
        previousManifest?.pluginId ||
        pluginId,
      action: 'delete',
      actor: governanceContext.actor.id,
      before: previousManifest,
      after: null,
      metadata: {
        route: 'settings.workflow-manifests.delete',
        manifestPath,
        changeTicket: governanceContext.changeTicket,
        role: governanceContext.actor.role,
        approvals: governanceContext.approvals,
        historyBackup,
      },
    });

    return sendSuccess(res, {
      message: 'workflow manifest deleted',
      data: {
        pluginId,
        manifestPath,
        governance: governanceContext,
        historyBackup,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow manifest delete failed',
      error: error.message,
    });
  }
});

router.post('/workflow-manifests/rollback', async (req, res) => {
  try {
    const payload = req.body || {};
    const pluginId = normalizeText(payload.pluginId);
    const backupFile = normalizeText(payload.backupFile);
    const settings = readSettings();
    const governanceContext = resolveManifestGovernanceContext({
      req,
      payload,
      action: 'rollback',
      settings,
    });

    if (!governanceContext.allowed) {
      return sendFailure(res, {
        status: 403,
        message: 'workflow manifest rollback blocked',
        error: governanceContext.failures.join(', '),
        data: {
          governance: governanceContext,
        },
      });
    }

    if (!pluginId || !backupFile) {
      return sendFailure(res, {
        status: 400,
        message: 'workflow manifest rollback failed',
        error: 'pluginId and backupFile are required',
      });
    }

    const backupPath = resolveManifestHistoryPath({
      pluginId,
      backupFile,
    });

    if (!backupPath || !fs.existsSync(backupPath)) {
      return sendFailure(res, {
        status: 404,
        message: 'workflow manifest rollback failed',
        error: 'backup file not found',
      });
    }

    const backupManifest = readManifestFromPath(backupPath);

    if (!backupManifest) {
      return sendFailure(res, {
        status: 400,
        message: 'workflow manifest rollback failed',
        error: 'backup manifest is invalid',
      });
    }

    const normalizedBackupManifest = validatePluginSpec(backupManifest, {
      manifestPath: `history-rollback:${backupFile}`,
    });
    const manifestPath = getManifestPathByPluginId(
      normalizedBackupManifest.pluginId || pluginId,
    );
    const previousManifest = readManifestFromPath(manifestPath);
    const historyBackup = backupManifestFile({
      manifestPath,
      pluginId: normalizedBackupManifest.pluginId || pluginId,
      action: 'rollback-before',
    });

    fs.mkdirSync(getPluginManifestDirectory(), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(backupManifest, null, 2)}\n`,
      'utf-8',
    );

    const registry = loadPluginRegistry();
    const restoredPlugin = (registry.plugins || []).find(
      (item) => item.pluginId === normalizedBackupManifest.pluginId,
    );

    safeRecordManifestAudit({
      entityType: 'plugin_manifest',
      targetId: normalizedBackupManifest.pluginId,
      targetName:
        restoredPlugin?.displayName ||
        normalizedBackupManifest.displayName ||
        normalizedBackupManifest.pluginId,
      action: 'rollback',
      actor: governanceContext.actor.id,
      before: previousManifest,
      after: restoredPlugin || normalizedBackupManifest,
      metadata: {
        route: 'settings.workflow-manifests.rollback',
        manifestPath,
        sourceBackupFile: backupFile,
        sourceBackupPath: backupPath,
        changeTicket: governanceContext.changeTicket,
        role: governanceContext.actor.role,
        approvals: governanceContext.approvals,
        historyBackup,
      },
    });

    return sendSuccess(res, {
      message: 'workflow manifest rolled back',
      data: {
        pluginId: normalizedBackupManifest.pluginId,
        manifestPath,
        restoredFrom: {
          backupFile,
          backupPath,
        },
        plugin: restoredPlugin || normalizedBackupManifest,
        governance: governanceContext,
        historyBackup,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow manifest rollback failed',
      error: error.message,
    });
  }
});

router.get('/workflow-runtime-metrics', async (req, res) => {
  try {
    return sendSuccess(res, {
      message: 'workflow runtime metrics loaded',
      data: {
        persistence: getPluginExecutionMetricsPersistenceSummary(),
        metrics: getAllPluginExecutionMetrics(),
        ops: getOpsDashboardSnapshot(),
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'workflow runtime metrics load failed',
      error: error.message,
    });
  }
});

router.get('/ops-dashboard', async (req, res) => {
  try {
    return sendSuccess(res, {
      message: 'ops dashboard loaded',
      data: getOpsDashboardSnapshot(),
      meta: {
        persistence: getOpsObservabilityPersistenceSummary(),
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'ops dashboard load failed',
      error: error.message,
    });
  }
});

router.get('/python-runtime/health', async (req, res) => {
  try {
    const settings = readSettings();
    const forceProbe = normalizeText(req.query?.force) === 'true';
    const healthProbe = await probePythonRuntimeHealth({
      runtimeSettings: settings,
      force: forceProbe,
    });

    return sendSuccess(res, {
      message: 'python runtime health loaded',
      data: {
        healthProbe,
        snapshot: getPythonRuntimeHealthSnapshot(),
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'python runtime health load failed',
      error: error.message,
      data: {
        snapshot: getPythonRuntimeHealthSnapshot(),
      },
    });
  }
});

router.get('/security/posture', async (req, res) => {
  try {
    const settings = readSettings();
    const securitySettings = getSettingsSecuritySettings(settings);
    const tenantIsolationSettings = getSettingsTenantIsolationSettings(settings);
    const vaultSummary = getSecretVaultSummary({
      settings,
    });

    return sendSuccess(res, {
      message: 'security posture loaded',
      data: {
        contractVersion: 'settings-security-posture/v1',
        security: securitySettings,
        tenantIsolation: tenantIsolationSettings,
        secretVault: vaultSummary,
        requestSecurityContext: req.securityContext || null,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'security posture load failed',
      error: error.message,
    });
  }
});

router.post('/ops-alerts/:alertId/ack', async (req, res) => {
  try {
    const alertId = normalizeText(req.params.alertId);
    const actorId =
      normalizeText(req.body?.actorId) ||
      readFirstHeaderValue(req, 'x-user-id') ||
      'ops-console';
    const acknowledged = acknowledgeOpsAlert({
      alertId,
      actorId,
    });

    if (!acknowledged) {
      return sendFailure(res, {
        status: 404,
        message: 'ops alert not found',
        error: `alert ${alertId || 'unknown'} not found`,
      });
    }

    return sendSuccess(res, {
      message: 'ops alert acknowledged',
      data: acknowledged,
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'ops alert acknowledge failed',
      error: error.message,
    });
  }
});

router.post('/ops/process-events', async (req, res) => {
  try {
    if (!isOpsProcessEventAuthorized(req)) {
      return sendFailure(res, {
        status: 403,
        message: 'ops process event rejected',
        error: 'OPS_EVENT_TOKEN mismatch',
      });
    }

    const payload = req.body || {};
    const event = recordOpsProcessEvent({
      processName: normalizeText(payload.processName),
      eventType: normalizeText(payload.eventType),
      message: normalizeText(payload.message),
      metadata: isPlainObject(payload.metadata) ? payload.metadata : {},
    });

    return sendSuccess(res, {
      message: 'ops process event recorded',
      data: event,
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'ops process event record failed',
      error: error.message,
    });
  }
});

router.get('/governance/overview', async (req, res) => {
  try {
    const settings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload: req.query || {},
      settings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:read',
      context: governanceContext,
      settings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:read',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    return sendSuccess(res, {
      message: 'settings governance overview loaded',
      data: getSettingsGovernanceOverview({
        tenantId: governanceContext.tenantId,
        settings,
      }),
      meta: {
        governance: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          actor: governanceContext.actor,
        },
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'settings governance overview load failed',
      error: error.message,
    });
  }
});

router.get('/governance/history', async (req, res) => {
  try {
    const settings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload: req.query || {},
      settings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:audit',
      context: governanceContext,
      settings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:audit',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    return sendSuccess(res, {
      message: 'settings governance history loaded',
      data: getSettingsGovernanceHistory({
        tenantId: governanceContext.tenantId,
        limit: Number(req.query?.limit || 20) || 20,
        includeSnapshots: normalizeText(req.query?.includeSnapshots) === 'true',
        settings,
      }),
      meta: {
        governance: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          actor: governanceContext.actor,
        },
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'settings governance history load failed',
      error: error.message,
    });
  }
});

router.post('/governance/release', async (req, res) => {
  try {
    const payload = req.body || {};
    const settings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload,
      settings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:publish',
      context: governanceContext,
      settings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:publish',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    const releaseControl = getSettingsReleaseControlSettings(settings);
    if (releaseControl.requireChangeTicket === true && !governanceContext.changeTicket) {
      return sendFailure(res, {
        status: 400,
        message: 'settings release blocked',
        error: 'changeTicket is required by releaseControl policy',
        data: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          releaseControl,
        },
      });
    }

    const releaseResult = publishTenantSettingsVersion({
      tenantId: governanceContext.tenantId,
      versionId: normalizeText(payload.versionId),
      context: governanceContext,
      reason: normalizeText(payload.reason),
      metadata: {
        route: 'settings.governance.release',
      },
    });
    const appliedResult = await applyTenantSettingsSnapshotIfNeeded({
      tenantId: governanceContext.tenantId,
      settingsSnapshot: releaseResult.publishedVersion?.settingsSnapshot || {},
    });
    const includeLegacySettings = resolveIncludeLegacySettingsFlag(
      req,
      appliedResult.settings || {},
    );

    return sendSuccess(res, {
      message: 'settings released',
      data: {
        contractVersion: 'settings-governance-release/v1',
        tenantId: governanceContext.tenantId,
        traceId: governanceContext.traceId,
        publishedVersion: releaseResult.publishedVersion,
        previousPublishedVersion: releaseResult.previousPublishedVersion,
        pointers: releaseResult.pointers,
        changedFields: releaseResult.changedFields,
        releaseControl: releaseResult.releaseControl,
        settings: buildSettingsResponseData(appliedResult.settings || {}, {
          includeLegacySettings,
        }),
        persistence: {
          persistedToDatabase: appliedResult.persistedToDatabase === true,
          persistedToLocal: appliedResult.persistedToLocal === true,
        },
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'settings release failed',
      error: error.message,
    });
  }
});

router.post('/governance/rollback', async (req, res) => {
  try {
    const payload = req.body || {};
    const settings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload,
      settings,
    });
    const permissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:rollback',
      context: governanceContext,
      settings,
    });

    if (!permissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:rollback',
          context: governanceContext,
          permissionResult,
        }),
      );
    }

    const releaseControl = getSettingsReleaseControlSettings(settings);
    if (releaseControl.requireChangeTicket === true && !governanceContext.changeTicket) {
      return sendFailure(res, {
        status: 400,
        message: 'settings rollback blocked',
        error: 'changeTicket is required by releaseControl policy',
        data: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          releaseControl,
        },
      });
    }

    const rollbackResult = rollbackTenantSettingsVersion({
      tenantId: governanceContext.tenantId,
      targetVersionId: normalizeText(payload.targetVersionId || payload.versionId),
      context: governanceContext,
      reason: normalizeText(payload.reason),
      metadata: {
        route: 'settings.governance.rollback',
      },
    });
    const appliedResult = await applyTenantSettingsSnapshotIfNeeded({
      tenantId: governanceContext.tenantId,
      settingsSnapshot: rollbackResult.rollbackVersion?.settingsSnapshot || {},
    });
    const includeLegacySettings = resolveIncludeLegacySettingsFlag(
      req,
      appliedResult.settings || {},
    );

    if (rollbackResult.rollbackSlaMet !== true) {
      return sendFailure(res, {
        status: 500,
        message: 'settings rollback exceeded SLA',
        error: `rollback took ${rollbackResult.rollbackDurationMs}ms, SLA is ${rollbackResult.rollbackSlaMs}ms`,
        data: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          rollbackDurationMs: rollbackResult.rollbackDurationMs,
          rollbackSlaMs: rollbackResult.rollbackSlaMs,
        },
      });
    }

    return sendSuccess(res, {
      message: 'settings rolled back',
      data: {
        contractVersion: 'settings-governance-rollback/v1',
        tenantId: governanceContext.tenantId,
        traceId: governanceContext.traceId,
        rollbackVersion: rollbackResult.rollbackVersion,
        restoredFromVersion: rollbackResult.restoredFromVersion,
        replacedVersion: rollbackResult.replacedVersion,
        pointers: rollbackResult.pointers,
        changedFields: rollbackResult.changedFields,
        rollbackDurationMs: rollbackResult.rollbackDurationMs,
        rollbackSlaMs: rollbackResult.rollbackSlaMs,
        rollbackSlaMet: rollbackResult.rollbackSlaMet,
        releaseControl: rollbackResult.releaseControl,
        settings: buildSettingsResponseData(appliedResult.settings || {}, {
          includeLegacySettings,
        }),
        persistence: {
          persistedToDatabase: appliedResult.persistedToDatabase === true,
          persistedToLocal: appliedResult.persistedToLocal === true,
        },
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'settings rollback failed',
      error: error.message,
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const sessionId = payload.sessionId || '';
    const { contractVersion, settingsPayload } = extractPrimarySettingsWritePayload(payload);

    if (!settingsPayload) {
      return sendFailure(res, {
        status: 400,
        message: 'settings save blocked',
        error: 'settings-write-requires-primaryContract.settings',
        data: {
          acceptedWriteContract: 'primaryContract.settings',
          compatibilityMode: 'read-only-frozen',
        },
      });
    }

    const localSettings = readSettings();
    const governanceContext = resolveSettingsGovernanceContext({
      req,
      payload,
      settings: localSettings,
    });
    const updatePermissionResult = evaluateSettingsPermissionForRequest({
      permission: 'settings:update',
      context: governanceContext,
      settings: localSettings,
    });

    if (!updatePermissionResult.allowed) {
      return sendFailure(
        res,
        buildSettingsPermissionFailurePayload({
          permission: 'settings:update',
          context: governanceContext,
          permissionResult: updatePermissionResult,
        }),
      );
    }

    const databaseConfig = {
      ...getActiveDatabaseConfig(),
      ...(settingsPayload.database || {}),
    };
    let currentSettings = localSettings;

    if (governanceContext.tenantId === 'default') {
      try {
        currentSettings = await getSettingsFromDatabase(DEFAULT_SETTINGS, databaseConfig);
      } catch (readError) {
        console.warn(
          '[settings] preload from database failed, fallback to local settings:',
          readError.message,
        );
      }
    }

    const mergedCurrentSettings = mergeSettingsPreserveApiKeys(currentSettings, localSettings);
    const tenantSeedSettings = getTenantActiveSettingsSnapshot({
      tenantId: governanceContext.tenantId,
      fallbackSettings: mergedCurrentSettings,
      settings: mergedCurrentSettings,
    }).settingsSnapshot || mergedCurrentSettings;
    const mergedPayload = mergeSettingsPreserveApiKeys(tenantSeedSettings, settingsPayload);
    const governanceSyncedPayload = syncAssistantGovernanceSettings(mergedPayload);

    let persistedSettings = governanceSyncedPayload;
    let persistedToDatabase = false;
    let persistedToLocal = false;

    if (governanceContext.tenantId === 'default') {
      try {
        const savedSettings = await saveSettingsToDatabase(
          governanceSyncedPayload,
          DEFAULT_SETTINGS,
          databaseConfig,
        );
        persistedSettings = syncAssistantGovernanceSettings(
          mergeSettingsPreserveApiKeys(savedSettings, governanceSyncedPayload),
        );
        persistedToDatabase = true;
      } catch (saveError) {
        console.warn(
          '[settings] save to database failed, fallback to local only:',
          saveError.message,
        );
      }

      saveSettings(persistedSettings);
      persistedToLocal = true;
    }

    const versionResult = recordSettingsMutationVersion({
      settingsSnapshot: persistedSettings,
      context: governanceContext,
      reason: 'settings save',
      metadata: {
        route: 'settings.save',
        writeContract: 'primaryContract.settings',
        writeContractVersion: contractVersion || 'settings-primary/v1',
      },
    });

    const releaseControl = getSettingsReleaseControlSettings(persistedSettings);
    let autoRelease = null;

    if (releaseControl.autoPublishOnSave === true) {
      const publishPermission = evaluateSettingsPermissionForRequest({
        permission: 'settings:publish',
        context: governanceContext,
        settings: persistedSettings,
      });

      if (publishPermission.allowed) {
        autoRelease = publishTenantSettingsVersion({
          tenantId: governanceContext.tenantId,
          versionId: versionResult.version?.versionId || '',
          context: governanceContext,
          reason: 'auto publish on save',
          metadata: {
            route: 'settings.save.auto-release',
          },
        });
      }
    }

    const includeLegacySettings = resolveIncludeLegacySettingsFlag(req, persistedSettings);
    const settingsResponseData = buildSettingsResponseData(persistedSettings, {
      includeLegacySettings,
    });
    const settingsExecutionContext = settingsResponseData.assistant?.executionContext || null;
    const requestedAssistantId =
      typeof settingsPayload.assistant?.activeAssistantId === 'string'
        ? settingsPayload.assistant.activeAssistantId.trim()
        : '';
    const previousActiveAssistantId = resolveActiveAssistantId(tenantSeedSettings);
    const nextActiveAssistantId = resolveActiveAssistantId(persistedSettings);

    if (requestedAssistantId && requestedAssistantId !== previousActiveAssistantId) {
      try {
        recordGovernanceAuditEntry({
          entityType: 'assistant',
          targetId: nextActiveAssistantId,
          targetName:
            getAssistantById(nextActiveAssistantId)?.assistantName ||
            getAssistantById(nextActiveAssistantId)?.name ||
            nextActiveAssistantId,
          action: 'activate',
          actor: governanceContext.actor?.id || 'settings',
          before: getAssistantById(previousActiveAssistantId),
          after: getAssistantById(nextActiveAssistantId),
          metadata: {
            previousActiveAssistantId,
            nextActiveAssistantId,
            activeAnalyzePromptId: persistedSettings.assistant?.activePromptId || null,
            route: 'settings',
            tenantId: governanceContext.tenantId,
            traceId: governanceContext.traceId,
          },
        });
      } catch (auditError) {
        console.warn('[settings] governance audit record failed:', auditError.message);
      }
    }

    const session = appendSettingsStepIfNeeded({
      sessionId,
      action: 'settings_save',
      stepType: 'settings_save',
      inputPayload: {
        hasDatabasePayload: Boolean(settingsPayload.database),
        hasModelPayload: Boolean(settingsPayload.model),
        hasStrategyPayload: Boolean(settingsPayload.strategy),
        hasAssistantPayload: Boolean(settingsPayload.assistant),
        hasSearchPayload: Boolean(settingsPayload.search),
        hasWorkflowReleasePayload: Boolean(settingsPayload.workflowRelease),
        hasGovernancePayload: Boolean(settingsPayload.governance),
        assistantId: persistedSettings.assistant?.activeAssistantId || '',
        executionContext: settingsExecutionContext,
        writeContract: 'primaryContract.settings',
        writeContractVersion: contractVersion || 'settings-primary/v1',
        tenantId: governanceContext.tenantId,
        traceId: governanceContext.traceId,
        settingsVersionId: versionResult.version?.versionId || '',
      },
      outputPayload: settingsResponseData,
      summary: '已保存当前系统配置。',
      route: 'settings-save',
    });

    return sendSuccess(res, {
      message: 'settings saved',
      data: settingsResponseData,
      meta: {
        sessionId: session?.id || sessionId,
        governance: {
          tenantId: governanceContext.tenantId,
          traceId: governanceContext.traceId,
          actor: governanceContext.actor,
          settingsVersion: versionResult.version || null,
          pointers: versionResult.pointers || null,
          autoRelease: autoRelease
            ? {
                publishedVersion: autoRelease.publishedVersion || null,
                pointers: autoRelease.pointers || null,
              }
            : null,
          persistence: {
            persistedToDatabase,
            persistedToLocal,
          },
        },
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'settings save failed',
      error: error.message,
    });
  }
});

router.post('/test-database', async (req, res) => {
  try {
    const payload = req.body || {};
    const sessionId = payload.sessionId || '';
    const databaseConfig = {
      ...getActiveDatabaseConfig(),
      ...(payload.database || {}),
    };

    const assistantSettings = {
      ...readSettings(),
      assistant: {
        ...(readSettings().assistant || {}),
        ...(payload.assistant || {}),
      },
    };
    const assistantContext = getAssistantExecutionContext(assistantSettings);

    const result = await testDatabaseConnection(databaseConfig);

    const session = appendSettingsStepIfNeeded({
      sessionId,
      action: 'settings_test_database',
      stepType: 'settings_test_database',
      inputPayload: {
        databaseType: databaseConfig.databaseType || '',
        path: databaseConfig.path || '',
        assistantId: assistantContext.assistantId || '',
        executionContext: assistantContext.executionContext || null,
      },
      outputPayload: {
        ...result,
        executionContext: assistantContext.executionContext || null,
      },
      summary: '数据库连接测试通过。',
      route: 'settings-test-database',
    });

    return sendSuccess(res, {
      message: 'database connection test passed',
      data: result,
      meta: {
        sessionId: session?.id || sessionId,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'database connection test failed',
      error: error.message,
    });
  }
});

router.post('/test-model', async (req, res) => {
  try {
    const payload = req.body || {};
    const sessionId = payload.sessionId || '';
    const localSettings = readSettings();
    const mergedSettingsForTest = mergeSettingsPreserveApiKeys(
      {
        model: localSettings.model || DEFAULT_SETTINGS.model,
      },
      {
        model: payload.model || {},
      },
    );
    const modelConfig = {
      ...DEFAULT_SETTINGS.model,
      ...(mergedSettingsForTest.model || {}),
    };

    const modelPool = Array.isArray(modelConfig.models) ? modelConfig.models : [];
    const preferredModelId = payload.model?.id || modelConfig.activeModelId || '';
    const selectedModel = modelPool.find((item) => item.id === preferredModelId) || null;
    const testTargetConfig = selectedModel
      ? {
          ...modelConfig,
          ...selectedModel,
          modelProvider: selectedModel.modelProvider || modelConfig.modelProvider || '',
          baseUrl: selectedModel.baseUrl || modelConfig.baseUrl || modelConfig.apiBaseUrl || '',
          modelName: selectedModel.modelName || modelConfig.modelName || '',
          apiKey: selectedModel.apiKey || modelConfig.apiKey || '',
        }
      : modelConfig;

    const resolvedModel = {
      resolvedModelId: selectedModel?.id || preferredModelId || '',
      resolvedProvider: testTargetConfig.modelProvider || '',
      resolvedBaseUrl: testTargetConfig.baseUrl || testTargetConfig.apiBaseUrl || '',
      resolvedModelName: testTargetConfig.modelName || '',
      source: selectedModel ? 'model-pool-selection' : 'direct-test-config',
      isResolved: Boolean(
        (selectedModel?.id || preferredModelId || '') &&
          (testTargetConfig.modelProvider || '') &&
          (testTargetConfig.baseUrl || testTargetConfig.apiBaseUrl || '') &&
          (testTargetConfig.modelName || ''),
      ),
    };

    const resolvedModelProvider = resolvedModel.resolvedProvider;
    const resolvedBaseUrl = resolvedModel.resolvedBaseUrl;
    const resolvedModelName = resolvedModel.resolvedModelName;
    const source = resolvedModel.source || '';

    const assistantSettings = {
      ...localSettings,
      assistant: {
        ...(localSettings.assistant || {}),
        ...(payload.assistant || {}),
      },
    };
    const assistantContext = getAssistantExecutionContext(assistantSettings);

    const result = await testModelConnection({
      ...testTargetConfig,
      resolvedModel,
      source,
    });

    const session = appendSettingsStepIfNeeded({
      sessionId,
      action: 'settings_test_model',
      stepType: 'settings_test_model',
      inputPayload: {
        modelProvider: resolvedModelProvider,
        modelName: resolvedModelName,
        baseUrl: resolvedBaseUrl,
        assistantId: assistantContext.assistantId || '',
        executionContext: assistantContext.executionContext || null,
        resolvedModel,
      },
      outputPayload: {
        ...result,
        executionContext: assistantContext.executionContext || null,
        resolvedModel,
        source,
      },
      summary: '模型连接测试通过。',
      route: 'settings-test-model',
    });

    return sendSuccess(res, {
      message: 'model connection test passed',
      data: {
        ...result,
        resolvedModel,
        source,
      },
      meta: {
        sessionId: session?.id || sessionId,
        modelProvider: result.provider || resolvedModelProvider,
        baseUrl: result.baseUrl || resolvedBaseUrl,
        endpoint: result.endpoint || '',
        modelName: result.modelName || resolvedModelName,
        resolvedModel,
        source,
      },
    });
  } catch (error) {
    return sendFailure(res, {
      status: 500,
      message: 'model connection test failed',
      error: error.message,
    });
  }
});

export default router;
