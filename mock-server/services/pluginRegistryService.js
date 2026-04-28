import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  PLATFORM_CONTRACT_VERSION,
  WORKFLOW_NODE_SPEC_VERSION,
  buildPlatformContractSummary,
  validatePluginSpec,
  resolvePluginReleaseBucketKey,
} from '../contracts/platformContracts.js';
import {
  executeWorkflowNode,
  listSupportedWorkflowNodeTypes,
} from './workflowNodeRegistry.js';
import {
  getPluginExecutionMetricsSnapshot,
  recordPluginExecutionMetrics,
  shouldGuardCanaryByMetrics,
} from './pluginRuntimeMetricsService.js';
import { recordWorkflowObservation } from './opsObservabilityService.js';
import { nowLocalIso, toLocalIso } from '../utils/localTime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const pluginManifestDirectory = path.join(projectRoot, 'plugins', 'manifests');

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value = '') => String(value || '').trim();

const normalizePercent = (value = 0) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isWorkflowTimeoutError = (error = null) => {
  return /timed out after \d+ms/i.test(normalizeString(error?.message || ''));
};

const getValueByPath = (source = {}, targetPath = '') => {
  const normalizedPath = normalizeString(targetPath);

  if (!normalizedPath || !isPlainObject(source)) {
    return undefined;
  }

  return normalizedPath
    .split('.')
    .filter(Boolean)
    .reduce((cursor, segment) => {
      if (!isPlainObject(cursor) && !Array.isArray(cursor)) {
        return undefined;
      }

      return cursor?.[segment];
    }, source);
};

const toRelativePath = (targetPath = '') => {
  if (!targetPath) {
    return '';
  }

  return path.relative(projectRoot, targetPath) || targetPath;
};

const resolveOutputModelRuntime = (outputPayload = null) => {
  if (!isPlainObject(outputPayload)) {
    return null;
  }

  if (isPlainObject(outputPayload.modelRuntime)) {
    return outputPayload.modelRuntime;
  }

  if (isPlainObject(outputPayload.finalResult?.modelRuntime)) {
    return outputPayload.finalResult.modelRuntime;
  }

  return null;
};

const resolveOutputFallbackReason = (outputPayload = null) => {
  if (!isPlainObject(outputPayload)) {
    return '';
  }

  const fallbackReason =
    outputPayload.fallbackReason ||
    outputPayload.finalResult?.fallbackReason ||
    '';

  if (typeof fallbackReason === 'string') {
    return normalizeString(fallbackReason);
  }

  if (isPlainObject(fallbackReason)) {
    return normalizeString(JSON.stringify(fallbackReason));
  }

  return '';
};

const safeRecordWorkflowObservation = (payload = {}) => {
  try {
    return recordWorkflowObservation(payload);
  } catch (error) {
    console.warn('[plugin-registry] ops observation record failed:', error.message);
    return null;
  }
};

const buildStableTrafficHash = (seed = '') => {
  const normalizedSeed = normalizeString(seed) || 'default-release-bucket';
  let hash = 2166136261;

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return (hash >>> 0) % 100;
};

const createExecutionEvent = ({
  eventType = '',
  plugin = null,
  route = '',
  nodeId = '',
  sessionId = '',
  payload = null,
} = {}) => ({
  eventId: randomUUID(),
  eventType,
  occurredAt: nowLocalIso(),
  pluginId: plugin?.pluginId || '',
  route: route || plugin?.route || '',
  nodeId,
  sessionId,
  payload: isPlainObject(payload) ? payload : null,
});

const emitEvent = ({
  events = [],
  plugin = null,
  eventType = '',
  route = '',
  nodeId = '',
  sessionId = '',
  payload = null,
} = {}) => {
  const allowedEvents = Array.isArray(plugin?.eventSchema?.eventTypes)
    ? plugin.eventSchema.eventTypes
    : [];

  if (allowedEvents.length > 0 && !allowedEvents.includes(eventType)) {
    return events;
  }

  events.push(
    createExecutionEvent({
      eventType,
      plugin,
      route,
      nodeId,
      sessionId,
      payload,
    }),
  );

  return events;
};

const buildPluginSummary = (plugin = null) => ({
  pluginId: plugin?.pluginId || '',
  displayName: plugin?.displayName || '',
  kind: plugin?.kind || '',
  route: plugin?.route || '',
  specVersion: plugin?.specVersion || '',
  workflowSpecVersion: plugin?.workflow?.specVersion || '',
  release: {
    stage: plugin?.release?.stage || 'stable',
    trafficPercent: normalizePercent(plugin?.release?.trafficPercent),
    stablePluginId: plugin?.release?.stablePluginId || '',
    rollbackOnError: plugin?.release?.rollbackOnError === true,
    bucketBy: plugin?.release?.bucketBy || 'sessionId',
    guardEnabled: plugin?.release?.guardEnabled === true,
    minSampleSize: Number(plugin?.release?.minSampleSize || 20),
    maxErrorRatePercent: Number(plugin?.release?.maxErrorRatePercent || 20),
    maxP95LatencyMs: Number(plugin?.release?.maxP95LatencyMs || 25000),
  },
  manifestPath: plugin?.manifestPath || '',
});

const buildRuntimePluginSummary = ({
  selectedPlugin = null,
  executedPlugin = null,
  requestedPluginId = '',
  route = '',
  kind = '',
  resolution = null,
  rollback = null,
  connectorRuntime = {},
  metricsSnapshot = null,
  opsObservation = null,
} = {}) => ({
  ...buildPluginSummary(executedPlugin),
  route: route || executedPlugin?.route || selectedPlugin?.route || '',
  kind: kind || executedPlugin?.kind || selectedPlugin?.kind || '',
  selectedPlugin: buildPluginSummary(selectedPlugin),
  selectedPluginId: selectedPlugin?.pluginId || '',
  executedPluginId: executedPlugin?.pluginId || '',
  requestedPluginId: normalizeString(requestedPluginId),
  resolution: resolution || null,
  connectorRuntime: Object.values(connectorRuntime || {}).map((item) => ({
    id: item.id,
    connectorType: item.connectorType,
    adapterType: item.adapterType,
    required: item.required === true,
    available: item.available === true,
    settingsPath: item.settingsPath || '',
  })),
  metrics: metricsSnapshot || null,
  ops: opsObservation || null,
  rollback: rollback || {
    triggered: false,
  },
});

const readPluginManifestFiles = () => {
  if (!fs.existsSync(pluginManifestDirectory)) {
    return [];
  }

  return fs
    .readdirSync(pluginManifestDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(pluginManifestDirectory, entry.name))
    .sort((a, b) => a.localeCompare(b));
};

export const loadPluginRegistry = () => {
  const manifestFiles = readPluginManifestFiles();
  const plugins = [];
  const errors = [];

  manifestFiles.forEach((manifestFile) => {
    try {
      const rawContent = fs.readFileSync(manifestFile, 'utf-8');
      const parsedManifest = JSON.parse(rawContent);
      const normalizedPlugin = validatePluginSpec(parsedManifest, {
        manifestPath: toRelativePath(manifestFile),
      });
      plugins.push(normalizedPlugin);
    } catch (error) {
      errors.push({
        manifestPath: toRelativePath(manifestFile),
        message: error.message,
      });
    }
  });

  return {
    loadedAt: nowLocalIso(),
    manifestDirectory: toRelativePath(pluginManifestDirectory),
    contract: buildPlatformContractSummary(),
    supportedNodeTypes: listSupportedWorkflowNodeTypes(),
    plugins,
    errors,
  };
};

const filterExecutablePlugins = ({
  registry = null,
  kind = '',
  route = '',
} = {}) => {
  return (Array.isArray(registry?.plugins) ? registry.plugins : [])
    .filter((plugin) => plugin.enabled !== false)
    .filter((plugin) => plugin.kind === kind)
    .filter((plugin) => plugin.route === route)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
};

const resolveStablePluginCandidate = (candidates = []) => {
  const stableCandidates = candidates.filter((plugin) => plugin?.release?.stage !== 'canary');

  if (stableCandidates.length > 0) {
    return (
      stableCandidates.find((plugin) => plugin.defaultPlugin === true) || stableCandidates[0]
    );
  }

  return candidates.find((plugin) => plugin.defaultPlugin === true) || candidates[0] || null;
};

const resolveRollbackPluginCandidate = ({
  candidates = [],
  canaryPlugin = null,
  stablePlugin = null,
} = {}) => {
  if (!canaryPlugin || canaryPlugin.release?.rollbackOnError !== true) {
    return null;
  }

  const configuredStablePluginId = normalizeString(canaryPlugin.release?.stablePluginId);

  if (configuredStablePluginId) {
    const matchedConfiguredStable = candidates.find(
      (plugin) => plugin.pluginId === configuredStablePluginId,
    );

    if (matchedConfiguredStable) {
      return matchedConfiguredStable;
    }
  }

  if (stablePlugin && stablePlugin.pluginId !== canaryPlugin.pluginId) {
    return stablePlugin;
  }

  return null;
};

const resolveCanaryPluginCandidate = ({
  candidates = [],
  stablePlugin = null,
} = {}) => {
  const stablePluginId = stablePlugin?.pluginId || '';

  return (
    candidates
      .filter((plugin) => plugin?.release?.stage === 'canary')
      .filter((plugin) => normalizePercent(plugin?.release?.trafficPercent) > 0)
      .find((plugin) => {
        const configuredStablePluginId = normalizeString(plugin?.release?.stablePluginId);
        return !configuredStablePluginId || configuredStablePluginId === stablePluginId;
      }) || null
  );
};

const getRouteReleaseSettings = ({
  runtimeSettings = {},
  kind = '',
  route = '',
} = {}) => {
  const normalizedKind = normalizeString(kind);
  const normalizedRoute = normalizeString(route);
  const workflowRelease = isPlainObject(runtimeSettings?.workflowRelease)
    ? runtimeSettings.workflowRelease
    : {};
  const routeConfigs = isPlainObject(workflowRelease.routes) ? workflowRelease.routes : {};
  const routeKey = `${normalizedKind}:${normalizedRoute}`;
  const matchedRouteConfig =
    routeConfigs[routeKey] ||
    Object.values(routeConfigs).find((item) => {
      return (
        normalizeString(item?.kind) === normalizedKind &&
        normalizeString(item?.route) === normalizedRoute
      );
    }) ||
    null;

  if (!isPlainObject(matchedRouteConfig)) {
    return null;
  }

  return {
    routeKey,
    kind: normalizeString(matchedRouteConfig.kind) || normalizedKind,
    route: normalizeString(matchedRouteConfig.route) || normalizedRoute,
    displayName: normalizeString(matchedRouteConfig.displayName),
    stablePluginId: normalizeString(matchedRouteConfig.stablePluginId),
    canaryPluginId: normalizeString(matchedRouteConfig.canaryPluginId),
    trafficPercent: normalizePercent(matchedRouteConfig.trafficPercent),
    rollbackOnError: matchedRouteConfig.rollbackOnError === true,
    bucketBy: normalizeString(matchedRouteConfig.bucketBy) || 'sessionId',
    guardEnabled: matchedRouteConfig.guardEnabled === true,
    minSampleSize: Math.max(1, toNumber(matchedRouteConfig.minSampleSize, 20)),
    maxErrorRatePercent: normalizePercent(matchedRouteConfig.maxErrorRatePercent ?? 20),
    maxP95LatencyMs: Math.max(0, toNumber(matchedRouteConfig.maxP95LatencyMs, 25000)),
    enabled: matchedRouteConfig.enabled !== false,
    source: 'settings.workflowRelease.routes',
  };
};

const applyReleaseConfigToPlugin = ({
  plugin = null,
  releaseConfig = null,
  stablePluginId = '',
  stage = 'stable',
} = {}) => {
  if (!plugin) {
    return null;
  }

  if (!releaseConfig) {
    return plugin;
  }

  return {
    ...plugin,
    release: {
      ...(plugin.release || {}),
      stage,
      trafficPercent:
        stage === 'canary'
          ? normalizePercent(releaseConfig.trafficPercent)
          : normalizePercent(plugin?.release?.trafficPercent),
      stablePluginId:
        stage === 'canary'
          ? normalizeString(releaseConfig.stablePluginId || stablePluginId)
          : normalizeString(stablePluginId || plugin?.release?.stablePluginId),
      rollbackOnError:
        stage === 'canary'
          ? releaseConfig.rollbackOnError === true
          : false,
      bucketBy:
        stage === 'canary'
          ? releaseConfig.bucketBy || plugin?.release?.bucketBy || 'sessionId'
          : plugin?.release?.bucketBy || releaseConfig.bucketBy || 'sessionId',
      guardEnabled:
        stage === 'canary'
          ? releaseConfig.guardEnabled === true
          : plugin?.release?.guardEnabled === true,
      minSampleSize: Math.max(
        1,
        toNumber(
          stage === 'canary' ? releaseConfig.minSampleSize : plugin?.release?.minSampleSize,
          20,
        ),
      ),
      maxErrorRatePercent: normalizePercent(
        stage === 'canary' ? releaseConfig.maxErrorRatePercent : plugin?.release?.maxErrorRatePercent,
      ),
      maxP95LatencyMs: Math.max(
        0,
        toNumber(
          stage === 'canary' ? releaseConfig.maxP95LatencyMs : plugin?.release?.maxP95LatencyMs,
          25000,
        ),
      ),
    },
  };
};

const resolveReleaseBucketSeed = ({
  canaryPlugin = null,
  requestPayload = {},
  kind = '',
  route = '',
} = {}) => {
  const releaseBucketSeed = normalizeString(
    resolvePluginReleaseBucketKey({
      release: canaryPlugin?.release || {},
      requestPayload,
    }),
  );

  if (releaseBucketSeed) {
    return releaseBucketSeed;
  }

  const fallbackSessionId = normalizeString(requestPayload?.sessionId);

  if (fallbackSessionId) {
    return fallbackSessionId;
  }

  return JSON.stringify({
    kind: normalizeString(kind),
    route: normalizeString(route),
    requestPayload: isPlainObject(requestPayload) ? requestPayload : {},
  });
};

const resolveConnectorValueFromSettings = ({
  settings = {},
  settingsPath = '',
} = {}) => {
  const normalizedPath = normalizeString(settingsPath);

  if (!normalizedPath) {
    return undefined;
  }

  if (normalizedPath.startsWith('settings.')) {
    return getValueByPath(settings, normalizedPath.slice('settings.'.length));
  }

  return getValueByPath(settings, normalizedPath);
};

const resolvePluginConnectorRuntime = ({
  plugin = null,
  settings = {},
} = {}) => {
  const connectors = Array.isArray(plugin?.connectors) ? plugin.connectors : [];
  const runtimeById = {};

  connectors.forEach((connector) => {
    const runtimeValue = resolveConnectorValueFromSettings({
      settings,
      settingsPath: connector.settingsPath,
    });

    runtimeById[connector.id] = {
      ...connector,
      available: runtimeValue !== undefined && runtimeValue !== null,
      runtimeValue,
    };
  });

  return runtimeById;
};

const buildWorkflowDependencyGraph = (plugin = null) => {
  const nodes = Array.isArray(plugin?.workflow?.nodes) ? plugin.workflow.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const dependencies = new Map();

  nodes.forEach((node, index) => {
    const explicitDependencies = Array.isArray(node.dependsOn) ? node.dependsOn : [];
    const resolvedDependencies =
      explicitDependencies.length > 0
        ? explicitDependencies.filter((dependencyId) => nodeMap.has(dependencyId))
        : index === 0
          ? []
          : [nodes[index - 1]?.id].filter(Boolean);
    dependencies.set(node.id, [...new Set(resolvedDependencies)]);
  });

  return {
    nodes,
    dependencies,
  };
};

const evaluateNodeCondition = ({
  nodeSpec = {},
  requestPayload = {},
  nodeOutputs = {},
  context = {},
} = {}) => {
  const condition = isPlainObject(nodeSpec.condition) ? nodeSpec.condition : null;

  if (!condition || !normalizeString(condition.path)) {
    return {
      matched: true,
      reason: 'condition-not-configured',
    };
  }

  const conditionPath = normalizeString(condition.path);
  const conditionContext = {
    request: isPlainObject(requestPayload) ? requestPayload : {},
    outputs: isPlainObject(nodeOutputs) ? nodeOutputs : {},
    context: isPlainObject(context) ? context : {},
  };
  const currentValue =
    getValueByPath(conditionContext, conditionPath) ??
    getValueByPath(conditionContext.request, conditionPath);

  if (Object.prototype.hasOwnProperty.call(condition, 'exists')) {
    const shouldExist = condition.exists === true;
    const exists = currentValue !== undefined && currentValue !== null && currentValue !== '';

    if (exists !== shouldExist) {
      return {
        matched: false,
        reason: shouldExist ? 'condition-exists-not-met' : 'condition-exists-violation',
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    if (currentValue !== condition.equals) {
      return {
        matched: false,
        reason: 'condition-equals-not-met',
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
    if (currentValue === condition.notEquals) {
      return {
        matched: false,
        reason: 'condition-not-equals-not-met',
      };
    }
  }

  return {
    matched: true,
    reason: 'condition-matched',
  };
};

const sleep = async (durationMs = 0) => {
  const normalizedDuration = Math.max(0, toNumber(durationMs, 0));

  if (normalizedDuration <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, normalizedDuration);
  });
};

export const resolveRuntimePlugin = ({
  registry = null,
  kind = '',
  route = '',
  requestedPluginId = '',
  requestPayload = {},
  runtimeSettings = {},
} = {}) => {
  const normalizedPluginId = normalizeString(requestedPluginId);
  const normalizedKind = normalizeString(kind);
  const normalizedRoute = normalizeString(route);
  const configuredRelease = getRouteReleaseSettings({
    runtimeSettings,
    kind: normalizedKind,
    route: normalizedRoute,
  });
  const candidates = filterExecutablePlugins({
    registry,
    kind: normalizedKind,
    route: normalizedRoute,
  });

  if (candidates.length === 0) {
    throw new Error(
      `[plugin-registry] No enabled plugin for kind="${kind}" route="${route}"`,
    );
  }

  if (normalizedPluginId) {
    const matchedPlugin = candidates.find((plugin) => plugin.pluginId === normalizedPluginId);

    if (!matchedPlugin) {
      throw new Error(
        `[plugin-registry] Plugin "${normalizedPluginId}" not found for kind="${kind}" route="${route}"`,
      );
    }

    return {
      plugin: matchedPlugin,
      rollbackPlugin: null,
      candidates,
      resolution: {
        mode: 'manual',
        selectedByTraffic: false,
        trafficPercent: normalizePercent(matchedPlugin?.release?.trafficPercent),
        trafficBucket: null,
        stablePluginId: normalizeString(matchedPlugin?.release?.stablePluginId),
        canaryPluginId: matchedPlugin?.release?.stage === 'canary' ? matchedPlugin.pluginId : '',
        selectedPluginId: matchedPlugin.pluginId,
        bucketBy: matchedPlugin?.release?.bucketBy || 'sessionId',
        releaseSource: configuredRelease?.source || 'manifest.plugin.release',
        releaseConfig: configuredRelease,
      },
    };
  }

  let stablePlugin = resolveStablePluginCandidate(candidates);

  if (configuredRelease?.stablePluginId) {
    const configuredStablePlugin = candidates.find(
      (plugin) => plugin.pluginId === configuredRelease.stablePluginId,
    );

    if (configuredStablePlugin) {
      stablePlugin = configuredStablePlugin;
    }
  }

  let canaryPlugin = null;

  if (configuredRelease?.enabled !== false) {
    if (configuredRelease?.canaryPluginId) {
      canaryPlugin =
        candidates.find((plugin) => plugin.pluginId === configuredRelease.canaryPluginId) ||
        null;
    }

    if (!canaryPlugin) {
      canaryPlugin = resolveCanaryPluginCandidate({
        candidates,
        stablePlugin,
      });
    }
  }

  if (canaryPlugin && canaryPlugin.pluginId === stablePlugin?.pluginId) {
    canaryPlugin = null;
  }

  const effectiveStablePlugin = applyReleaseConfigToPlugin({
    plugin: stablePlugin,
    releaseConfig: configuredRelease,
    stablePluginId: stablePlugin?.pluginId || '',
    stage: 'stable',
  });
  const effectiveCanaryPlugin = canaryPlugin
    ? applyReleaseConfigToPlugin({
        plugin: canaryPlugin,
        releaseConfig: configuredRelease,
        stablePluginId: effectiveStablePlugin?.pluginId || stablePlugin?.pluginId || '',
        stage: 'canary',
      })
    : null;
  const trafficPercent = normalizePercent(
    configuredRelease?.trafficPercent ?? effectiveCanaryPlugin?.release?.trafficPercent,
  );
  const canaryEnabled =
    Boolean(effectiveCanaryPlugin) &&
    (configuredRelease ? configuredRelease.enabled !== false : true) &&
    trafficPercent > 0;

  if (!canaryEnabled || !effectiveCanaryPlugin) {
    return {
      plugin: effectiveStablePlugin,
      rollbackPlugin: null,
      candidates,
      resolution: {
        mode: 'stable',
        selectedByTraffic: false,
        trafficPercent,
        trafficBucket: null,
        stablePluginId: effectiveStablePlugin?.pluginId || '',
        canaryPluginId: '',
        selectedPluginId: effectiveStablePlugin?.pluginId || '',
        bucketBy:
          configuredRelease?.bucketBy ||
          effectiveStablePlugin?.release?.bucketBy ||
          'sessionId',
        releaseSource: configuredRelease?.source || 'manifest.plugin.release',
        releaseConfig: configuredRelease,
      },
    };
  }

  const bucketSeed = resolveReleaseBucketSeed({
    canaryPlugin: effectiveCanaryPlugin,
    requestPayload,
    kind: normalizedKind,
    route: normalizedRoute,
  });
  const trafficBucket = buildStableTrafficHash(
    `${normalizedKind}:${normalizedRoute}:${bucketSeed}`,
  );
  let selectedByTraffic = trafficBucket < trafficPercent;
  let selectedPlugin = selectedByTraffic ? effectiveCanaryPlugin : effectiveStablePlugin;
  let rollbackPlugin = selectedByTraffic
    ? resolveRollbackPluginCandidate({
        candidates,
        canaryPlugin: effectiveCanaryPlugin,
        stablePlugin: effectiveStablePlugin,
      })
    : null;
  let guardDecision = null;

  if (selectedByTraffic && selectedPlugin?.pluginId === effectiveCanaryPlugin?.pluginId) {
    const metricsSnapshot = getPluginExecutionMetricsSnapshot({
      kind: normalizedKind,
      route: normalizedRoute,
      pluginId: effectiveCanaryPlugin?.pluginId || '',
    });

    guardDecision = shouldGuardCanaryByMetrics({
      metrics: metricsSnapshot,
      releaseConfig: effectiveCanaryPlugin?.release || configuredRelease,
    });

    if (guardDecision.triggered) {
      selectedByTraffic = false;
      selectedPlugin = effectiveStablePlugin;
      rollbackPlugin = null;
    }
  }

  return {
    plugin: selectedPlugin,
    rollbackPlugin,
    candidates,
    resolution: {
      mode: guardDecision?.triggered === true ? 'guarded-stable' : selectedByTraffic ? 'canary' : 'stable',
      selectedByTraffic,
      trafficPercent,
      trafficBucket,
      stablePluginId: effectiveStablePlugin?.pluginId || '',
      canaryPluginId: effectiveCanaryPlugin.pluginId,
      selectedPluginId: selectedPlugin?.pluginId || '',
      bucketBy:
        configuredRelease?.bucketBy ||
        effectiveCanaryPlugin?.release?.bucketBy ||
        'sessionId',
      guardDecision: guardDecision || null,
      releaseSource: configuredRelease?.source || 'manifest.plugin.release',
      releaseConfig: configuredRelease,
    },
  };
};

const resolveNodeInput = ({
  nodeSpec = {},
  requestPayload = {},
  dependencyOutputs = {},
  previousNodeOutput = {},
} = {}) => {
  if (nodeSpec.inputMode === 'dependency-map') {
    return isPlainObject(dependencyOutputs) ? dependencyOutputs : {};
  }

  if (nodeSpec.inputMode === 'previous-node') {
    return isPlainObject(previousNodeOutput) ? previousNodeOutput : {};
  }

  return isPlainObject(requestPayload) ? requestPayload : {};
};

const resolvePluginOutput = ({
  plugin = null,
  nodeOutputs = {},
  lastNodeOutput = null,
} = {}) => {
  const outputNodeId = plugin?.outputBinding?.nodeId || '';

  if (outputNodeId && Object.prototype.hasOwnProperty.call(nodeOutputs, outputNodeId)) {
    return {
      outputNodeId,
      output: nodeOutputs[outputNodeId],
    };
  }

  return {
    outputNodeId: outputNodeId || '',
    output: lastNodeOutput,
  };
};

const buildExecutionTrace = ({
  plugin = null,
  route = '',
  events = [],
  nodeExecutions = [],
  nodePlan = null,
  connectorRuntime = {},
  startedAt = 0,
  completedAt = 0,
  outputNodeId = '',
  status = 'success',
  errorMessage = '',
  releaseResolution = null,
  rollback = null,
} = {}) => ({
  specVersion: plugin?.traceSchema?.specVersion || '',
  contractVersion: PLATFORM_CONTRACT_VERSION,
  requiredSections: plugin?.traceSchema?.requiredSections || [],
  compatibility: plugin?.traceSchema?.compatibility || [],
  plugin: buildPluginSummary(plugin),
  workflow: {
    specVersion: WORKFLOW_NODE_SPEC_VERSION,
    entryNodeId: plugin?.workflow?.entryNodeId || '',
    nodeCount: Array.isArray(plugin?.workflow?.nodes) ? plugin.workflow.nodes.length : 0,
    executedNodeIds: nodeExecutions.map((item) => item.nodeId),
    dependencyGraph: nodePlan?.dependencies || null,
    route: route || plugin?.route || '',
  },
  connectors: Object.values(connectorRuntime || {}).map((item) => ({
    id: item.id,
    connectorType: item.connectorType,
    adapterType: item.adapterType,
    required: item.required === true,
    available: item.available === true,
    settingsPath: item.settingsPath || '',
  })),
  events,
  timing: {
    startedAt: startedAt ? toLocalIso(new Date(startedAt)) : '',
    completedAt: completedAt ? toLocalIso(new Date(completedAt)) : '',
    durationMs: Math.max(0, completedAt - startedAt),
    nodes: nodeExecutions.map((item) => ({
      nodeId: item.nodeId,
      nodeType: item.nodeType,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      durationMs: item.durationMs,
      continuedOnError: item.continuedOnError === true,
      skipped: item.skipped === true,
      attemptCount: Number(item.attemptCount || 1),
      errorMessage: item.errorMessage || '',
    })),
  },
  result: {
    status,
    outputNodeId,
    errorMessage: errorMessage || '',
  },
  releaseResolution: releaseResolution || null,
  rollback: rollback || null,
});

const buildRegistrySummary = ({
  registry = null,
  routeCandidates = [],
  selectedPlugin = null,
  resolution = null,
  rollbackPlugin = null,
} = {}) => ({
  loadedAt: registry?.loadedAt || '',
  manifestDirectory: registry?.manifestDirectory || '',
  contract: registry?.contract || buildPlatformContractSummary(),
  pluginCount: routeCandidates.length,
  selectedPlugin: buildPluginSummary(selectedPlugin),
  rollbackPlugin: rollbackPlugin ? buildPluginSummary(rollbackPlugin) : null,
  resolution: resolution || null,
  candidates: routeCandidates.map((item) => ({
    pluginId: item.pluginId,
    displayName: item.displayName,
    defaultPlugin: item.defaultPlugin === true,
    order: Number(item.order || 0),
    releaseStage: item?.release?.stage || 'stable',
    trafficPercent: normalizePercent(item?.release?.trafficPercent),
  })),
  errors: Array.isArray(registry?.errors) ? registry.errors : [],
});

const executePluginWorkflow = async ({
  plugin = null,
  route = '',
  requestedPluginId = '',
  requestPayload = {},
  context = {},
  releaseResolution = null,
  executionTag = 'primary',
  rollbackFromPluginId = '',
} = {}) => {
  const normalizedRoute = normalizeString(route || plugin?.route);
  const sessionId = normalizeString(requestPayload?.sessionId);

  const events = [];
  const nodeExecutions = [];
  const nodeOutputs = {};
  const nodePlan = buildWorkflowDependencyGraph(plugin);
  const nodeStates = new Map(nodePlan.nodes.map((node) => [node.id, 'pending']));
  const connectorRuntime = resolvePluginConnectorRuntime({
    plugin,
    settings: context.settings || {},
  });
  let previousNodeOutput = isPlainObject(requestPayload) ? requestPayload : {};
  const startedAt = Date.now();

  emitEvent({
    events,
    plugin,
    eventType: executionTag === 'rollback' ? 'plugin.rollback.start' : 'plugin.execution.start',
    route: normalizedRoute,
    nodeId: plugin?.workflow?.entryNodeId || '',
    sessionId,
    payload: {
      nodeCount: nodePlan.nodes.length,
      requestedPluginId: normalizeString(requestedPluginId),
      executionTag,
      rollbackFromPluginId: rollbackFromPluginId || '',
      releaseStage: plugin?.release?.stage || 'stable',
      connectorCount: Object.keys(connectorRuntime).length,
    },
  });

  try {
    const canExecuteNode = (nodeSpec = {}) => {
      const dependencies = nodePlan.dependencies.get(nodeSpec.id) || [];

      return dependencies.every((dependencyNodeId) => {
        const dependencyState = nodeStates.get(dependencyNodeId);
        return dependencyState === 'completed' || dependencyState === 'skipped';
      });
    };

    const runNode = async (nodeSpec = {}) => {
      const dependencies = nodePlan.dependencies.get(nodeSpec.id) || [];
      const dependencyOutputs = dependencies.reduce((accumulator, dependencyNodeId) => {
        accumulator[dependencyNodeId] = nodeOutputs[dependencyNodeId];
        return accumulator;
      }, {});
      const dependencyOutputCandidates = dependencies
        .map((dependencyNodeId) => nodeOutputs[dependencyNodeId])
        .filter((item) => item !== undefined);
      const previousDependencyOutput =
        dependencyOutputCandidates[dependencyOutputCandidates.length - 1] ?? previousNodeOutput;
      const conditionDecision = evaluateNodeCondition({
        nodeSpec,
        requestPayload,
        nodeOutputs,
        context,
      });

      if (!conditionDecision.matched) {
        const skippedAt = nowLocalIso();
        const skippedExecution = {
          nodeId: nodeSpec.id,
          nodeType: nodeSpec.type,
          startedAt: skippedAt,
          completedAt: skippedAt,
          durationMs: 0,
          output: previousDependencyOutput,
          skipped: true,
          continueOnError: false,
          errorMessage: '',
          attemptCount: 0,
          conditionReason: conditionDecision.reason,
        };

        emitEvent({
          events,
          plugin,
          eventType: 'workflow.node.complete',
          route: normalizedRoute,
          nodeId: nodeSpec.id,
          sessionId,
          payload: {
            skipped: true,
            conditionReason: conditionDecision.reason,
            executionTag,
          },
        });

        return {
          nodeExecution: skippedExecution,
          output: previousDependencyOutput,
          state: 'skipped',
        };
      }

      const connectorRefs = Array.isArray(nodeSpec.connectorRefs) ? nodeSpec.connectorRefs : [];
      const nodeConnectorRuntime = connectorRefs.reduce((accumulator, connectorId) => {
        if (connectorRuntime[connectorId]) {
          accumulator[connectorId] = connectorRuntime[connectorId];
        }

        return accumulator;
      }, {});

      for (const connectorId of connectorRefs) {
        if (!nodeConnectorRuntime[connectorId]) {
          const connectorReferenceError = new Error(
            `[workflow-node] connectorRef "${connectorId}" is unresolved for node "${nodeSpec.id}"`,
          );
          connectorReferenceError.workflowNodeId = nodeSpec.id;
          throw connectorReferenceError;
        }
      }

      for (const connectorId of Object.keys(nodeConnectorRuntime)) {
        const connector = nodeConnectorRuntime[connectorId];

        if (connector.required === true && connector.available !== true) {
          const connectorError = new Error(
            `[workflow-node] Required connector "${connectorId}" is unavailable for node "${nodeSpec.id}"`,
          );
          connectorError.workflowNodeId = nodeSpec.id;
          throw connectorError;
        }
      }

      const nodeInput = resolveNodeInput({
        nodeSpec,
        requestPayload,
        dependencyOutputs,
        previousNodeOutput: previousDependencyOutput,
      });
      const maxRetries = Math.max(0, toNumber(nodeSpec.retryPolicy?.maxRetries, 0));
      const backoffMs = Math.max(0, toNumber(nodeSpec.retryPolicy?.backoffMs, 0));
      let attempt = 0;

      while (attempt <= maxRetries) {
        attempt += 1;

        emitEvent({
          events,
          plugin,
          eventType: 'workflow.node.start',
          route: normalizedRoute,
          nodeId: nodeSpec.id,
          sessionId,
          payload: {
            executionTag,
            attempt,
            maxRetries,
          },
        });

        const nodeStartedAt = Date.now();

        try {
          const nodeExecution = await executeWorkflowNode({
            nodeSpec,
            inputPayload: nodeInput,
            context: {
              ...context,
              pluginSummary: buildPluginSummary(plugin),
              releaseResolution,
              executionTag,
              requestPayload: isPlainObject(requestPayload) ? requestPayload : {},
              dependencyOutputs,
              connectorRuntime,
              nodeConnectorRuntime,
            },
          });

          const finalizedNodeExecution = {
            ...nodeExecution,
            attemptCount: attempt,
          };

          emitEvent({
            events,
            plugin,
            eventType: 'workflow.node.complete',
            route: normalizedRoute,
            nodeId: nodeSpec.id,
            sessionId,
            payload: {
              durationMs: finalizedNodeExecution.durationMs,
              executionTag,
              attempt,
            },
          });

          return {
            nodeExecution: finalizedNodeExecution,
            output: finalizedNodeExecution.output,
            state: 'completed',
          };
        } catch (error) {
          const nodeCompletedAt = Date.now();
          const isTimeoutError = isWorkflowTimeoutError(error);

          emitEvent({
            events,
            plugin,
            eventType: 'workflow.node.error',
            route: normalizedRoute,
            nodeId: nodeSpec.id,
            sessionId,
            payload: {
              durationMs: Math.max(0, nodeCompletedAt - nodeStartedAt),
              message: error.message,
              continueOnError: nodeSpec.continueOnError === true,
              executionTag,
              attempt,
              maxRetries,
            },
          });

          if (attempt <= maxRetries && !isTimeoutError) {
            emitEvent({
              events,
              plugin,
              eventType: 'workflow.node.retry',
              route: normalizedRoute,
              nodeId: nodeSpec.id,
              sessionId,
              payload: {
                attempt,
                maxRetries,
                backoffMs,
              },
            });
            await sleep(backoffMs * attempt);
            continue;
          }

          if (nodeSpec.continueOnError === true) {
            const continuedNodeExecution = {
              nodeId: nodeSpec.id,
              nodeType: nodeSpec.type,
              startedAt: toLocalIso(new Date(nodeStartedAt)),
              completedAt: toLocalIso(new Date(nodeCompletedAt)),
              durationMs: Math.max(0, nodeCompletedAt - nodeStartedAt),
              output: previousDependencyOutput,
              continuedOnError: true,
              errorMessage: error.message,
              attemptCount: attempt,
            };

            return {
              nodeExecution: continuedNodeExecution,
              output: previousDependencyOutput,
              state: 'completed',
            };
          }

          error.workflowNodeId = nodeSpec.id;
          throw error;
        }
      }

      const fallbackError = new Error(`[workflow-node] node "${nodeSpec.id}" reached unreachable retry state`);
      fallbackError.workflowNodeId = nodeSpec.id;
      throw fallbackError;
    };

    while ([...nodeStates.values()].some((state) => state === 'pending')) {
      const readyNodes = nodePlan.nodes
        .filter((nodeSpec) => nodeStates.get(nodeSpec.id) === 'pending')
        .filter((nodeSpec) => canExecuteNode(nodeSpec));

      if (readyNodes.length === 0) {
        throw new Error('[workflow-node] no executable nodes found; check dependsOn graph');
      }

      const batchResults = await Promise.allSettled(
        readyNodes.map((nodeSpec) => runNode(nodeSpec)),
      );

      let firstError = null;

      batchResults.forEach((batchResult, index) => {
        const targetNode = readyNodes[index];

        if (batchResult.status === 'fulfilled') {
          const { nodeExecution, output, state } = batchResult.value;
          nodeExecutions.push(nodeExecution);
          nodeOutputs[targetNode.id] = output;
          previousNodeOutput = output;
          nodeStates.set(targetNode.id, state === 'skipped' ? 'skipped' : 'completed');
          return;
        }

        nodeStates.set(targetNode.id, 'failed');
        if (!firstError) {
          firstError = batchResult.reason;
        }
      });

      if (firstError) {
        throw firstError;
      }
    }

    const completion = resolvePluginOutput({
      plugin,
      nodeOutputs,
      lastNodeOutput: previousNodeOutput,
    });
    const completedAt = Date.now();

    emitEvent({
      events,
      plugin,
      eventType: executionTag === 'rollback' ? 'plugin.rollback.complete' : 'plugin.execution.complete',
      route: normalizedRoute,
      nodeId: completion.outputNodeId,
      sessionId,
      payload: {
        durationMs: Math.max(0, completedAt - startedAt),
        executedNodeCount: nodeExecutions.length,
        executionTag,
      },
    });

    return {
      output: completion.output,
      plugin: buildPluginSummary(plugin),
      trace: buildExecutionTrace({
        plugin,
        route: normalizedRoute,
        events,
        nodeExecutions,
        nodePlan: {
          dependencies: Object.fromEntries(nodePlan.dependencies),
        },
        connectorRuntime,
        startedAt,
        completedAt,
        outputNodeId: completion.outputNodeId,
        status: 'success',
        releaseResolution,
      }),
    };
  } catch (error) {
    const completedAt = Date.now();

    emitEvent({
      events,
      plugin,
      eventType: executionTag === 'rollback' ? 'plugin.rollback.error' : 'plugin.execution.error',
      route: normalizedRoute,
      nodeId: '',
      sessionId,
      payload: {
        message: error.message,
        executionTag,
      },
    });

    error.platformTrace = buildExecutionTrace({
      plugin,
      route: normalizedRoute,
      events,
      nodeExecutions,
      nodePlan: {
        dependencies: Object.fromEntries(nodePlan.dependencies),
      },
      connectorRuntime,
      startedAt,
      completedAt,
      outputNodeId: '',
      status: 'failed',
      errorMessage: error.message,
      releaseResolution,
    });

    throw error;
  }
};

export const executeManifestPlugin = async ({
  kind = '',
  route = '',
  requestedPluginId = '',
  requestPayload = {},
  context = {},
} = {}) => {
  const registry = loadPluginRegistry();
  const normalizedRoute = normalizeString(route);
  const normalizedKind = normalizeString(kind);
  const resolved = resolveRuntimePlugin({
    registry,
    kind: normalizedKind,
    route: normalizedRoute,
    requestedPluginId,
    requestPayload,
    runtimeSettings: context.settings || {},
  });

  const { plugin, rollbackPlugin, candidates, resolution } = resolved;
  const connectorRuntime = resolvePluginConnectorRuntime({
    plugin,
    settings: context.settings || {},
  });
  const registrySummary = buildRegistrySummary({
    registry,
    routeCandidates: candidates,
    selectedPlugin: plugin,
    resolution,
    rollbackPlugin,
  });

  try {
    const primaryExecution = await executePluginWorkflow({
      plugin,
      route: normalizedRoute,
      requestedPluginId,
      requestPayload,
      context: {
        ...context,
        connectorRuntime,
      },
      releaseResolution: resolution,
      executionTag: 'primary',
    });
    const primaryMetrics = recordPluginExecutionMetrics({
      kind: normalizedKind,
      route: normalizedRoute,
      pluginId: plugin?.pluginId || '',
      success: true,
      durationMs: primaryExecution.trace?.timing?.durationMs || 0,
    });
    const primaryOutput = isPlainObject(primaryExecution.output)
      ? primaryExecution.output
      : {};
    const primaryModelRuntime = resolveOutputModelRuntime(primaryOutput);
    const primaryFallbackReason = resolveOutputFallbackReason(primaryOutput);
    const opsObservation = safeRecordWorkflowObservation({
      kind: normalizedKind,
      route: normalizedRoute,
      pluginId: plugin?.pluginId || '',
      success: true,
      durationMs: primaryExecution.trace?.timing?.durationMs || 0,
      requestPayload,
      outputPayload: primaryOutput,
      modelRuntime: primaryModelRuntime,
      resolutionMode: resolution?.mode || '',
      fallbackReason: primaryFallbackReason,
    });

    return {
      output: primaryExecution.output,
      plugin: buildRuntimePluginSummary({
        selectedPlugin: plugin,
        executedPlugin: plugin,
        requestedPluginId,
        route: normalizedRoute,
        kind: normalizedKind,
        resolution,
        connectorRuntime,
        metricsSnapshot: primaryMetrics,
        opsObservation,
        rollback: {
          triggered: false,
        },
      }),
      trace: {
        ...primaryExecution.trace,
        rollback: {
          triggered: false,
        },
      },
      registrySummary,
    };
  } catch (primaryError) {
    const primaryFailureMetrics = recordPluginExecutionMetrics({
      kind: normalizedKind,
      route: normalizedRoute,
      pluginId: plugin?.pluginId || '',
      success: false,
      durationMs: primaryError?.platformTrace?.timing?.durationMs || 0,
    });
    const shouldRollback =
      plugin?.release?.stage === 'canary' &&
      plugin?.release?.rollbackOnError === true &&
      rollbackPlugin &&
      rollbackPlugin.pluginId !== plugin.pluginId;
    safeRecordWorkflowObservation({
      kind: normalizedKind,
      route: normalizedRoute,
      pluginId: plugin?.pluginId || '',
      success: false,
      durationMs: primaryError?.platformTrace?.timing?.durationMs || 0,
      requestPayload,
      outputPayload: {
        error: primaryError.message,
      },
      modelRuntime: null,
      resolutionMode: resolution?.mode || '',
      fallbackReason: primaryError.message,
    });

    if (!shouldRollback) {
      primaryError.pluginRegistrySummary = registrySummary;
      primaryError.pluginRuntimeSummary = buildRuntimePluginSummary({
        selectedPlugin: plugin,
        executedPlugin: plugin,
        requestedPluginId,
        route: normalizedRoute,
        kind: normalizedKind,
        resolution,
        connectorRuntime,
        metricsSnapshot: primaryFailureMetrics,
        rollback: {
          triggered: false,
        },
      });
      throw primaryError;
    }

    try {
      const rollbackConnectorRuntime = resolvePluginConnectorRuntime({
        plugin: rollbackPlugin,
        settings: context.settings || {},
      });
      const rollbackExecution = await executePluginWorkflow({
        plugin: rollbackPlugin,
        route: normalizedRoute,
        requestedPluginId,
        requestPayload,
        context: {
          ...context,
          connectorRuntime: rollbackConnectorRuntime,
        },
        releaseResolution: {
          ...resolution,
          mode: 'rollback',
          selectedPluginId: rollbackPlugin.pluginId,
        },
        executionTag: 'rollback',
        rollbackFromPluginId: plugin.pluginId,
      });
      const rollbackMetrics = recordPluginExecutionMetrics({
        kind: normalizedKind,
        route: normalizedRoute,
        pluginId: rollbackPlugin?.pluginId || '',
        success: true,
        durationMs: rollbackExecution.trace?.timing?.durationMs || 0,
      });
      const rollbackOutput = isPlainObject(rollbackExecution.output)
        ? rollbackExecution.output
        : {};
      const rollbackModelRuntime = resolveOutputModelRuntime(rollbackOutput);
      const rollbackFallbackReason = resolveOutputFallbackReason(rollbackOutput);
      const rollbackOpsObservation = safeRecordWorkflowObservation({
        kind: normalizedKind,
        route: normalizedRoute,
        pluginId: rollbackPlugin?.pluginId || '',
        success: true,
        durationMs: rollbackExecution.trace?.timing?.durationMs || 0,
        requestPayload,
        outputPayload: rollbackOutput,
        modelRuntime: rollbackModelRuntime,
        resolutionMode: 'rollback',
        fallbackReason: rollbackFallbackReason || primaryError.message,
      });

      const rollbackSummary = {
        triggered: true,
        fromPluginId: plugin.pluginId,
        toPluginId: rollbackPlugin.pluginId,
        reason: primaryError.message,
        succeeded: true,
      };

      return {
        output: rollbackExecution.output,
        plugin: buildRuntimePluginSummary({
          selectedPlugin: plugin,
          executedPlugin: rollbackPlugin,
          requestedPluginId,
          route: normalizedRoute,
          kind: normalizedKind,
          resolution: {
            ...resolution,
            mode: 'rollback',
            selectedPluginId: rollbackPlugin.pluginId,
          },
          connectorRuntime: rollbackConnectorRuntime,
          metricsSnapshot: rollbackMetrics,
          opsObservation: rollbackOpsObservation,
          rollback: rollbackSummary,
        }),
        trace: {
          ...rollbackExecution.trace,
          rollback: {
            ...rollbackSummary,
            sourceTrace: primaryError.platformTrace || null,
          },
        },
        registrySummary: {
          ...registrySummary,
          resolution: {
            ...resolution,
            mode: 'rollback',
            selectedPluginId: rollbackPlugin.pluginId,
          },
          rollback: rollbackSummary,
        },
      };
    } catch (rollbackError) {
      recordPluginExecutionMetrics({
        kind: normalizedKind,
        route: normalizedRoute,
        pluginId: rollbackPlugin?.pluginId || '',
        success: false,
        durationMs: rollbackError?.platformTrace?.timing?.durationMs || 0,
      });
      safeRecordWorkflowObservation({
        kind: normalizedKind,
        route: normalizedRoute,
        pluginId: rollbackPlugin?.pluginId || '',
        success: false,
        durationMs: rollbackError?.platformTrace?.timing?.durationMs || 0,
        requestPayload,
        outputPayload: {
          error: rollbackError.message,
        },
        modelRuntime: null,
        resolutionMode: 'rollback-failed',
        fallbackReason: rollbackError.message,
      });
      rollbackError.message =
        `[plugin-registry] Canary plugin "${plugin.pluginId}" failed and rollback plugin "${rollbackPlugin.pluginId}" failed: ${rollbackError.message}`;
      rollbackError.pluginRegistrySummary = {
        ...registrySummary,
        rollback: {
          triggered: true,
          fromPluginId: plugin.pluginId,
          toPluginId: rollbackPlugin.pluginId,
          reason: primaryError.message,
          succeeded: false,
          rollbackErrorMessage: rollbackError.message,
        },
      };
      rollbackError.primaryPlatformTrace = primaryError.platformTrace || null;

      throw rollbackError;
    }
  }
};

export const getPluginManifestDirectory = () => pluginManifestDirectory;
