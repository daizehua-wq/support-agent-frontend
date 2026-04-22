const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value = '') => String(value || '').trim();

const toNumberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toClampedPercent = (value, fallback = 0) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const ensureNonEmptyString = (value, fieldName, context) => {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    throw new Error(`[platform-contract] ${context}.${fieldName} must be a non-empty string`);
  }

  return normalizedValue;
};

const ensureStringArray = (value, fieldName, context) => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`[platform-contract] ${context}.${fieldName} must be an array of strings`);
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
};

const getValueByPath = (source = {}, path = '') => {
  const normalizedPath = normalizeString(path);

  if (!normalizedPath || !isPlainObject(source)) {
    return undefined;
  }

  return normalizedPath
    .split('.')
    .filter(Boolean)
    .reduce((cursor, segment) => {
      if (!isPlainObject(cursor)) {
        return undefined;
      }

      return cursor[segment];
    }, source);
};

const deriveModuleFromNodeType = (nodeType = '') => {
  const parts = normalizeString(nodeType).split('.').filter(Boolean);
  return parts[0] || '';
};

const deriveOperationFromNodeType = (nodeType = '') => {
  const parts = normalizeString(nodeType).split('.').filter(Boolean);

  if (parts.length <= 1) {
    return '';
  }

  if (parts.length === 2) {
    return parts[1];
  }

  return parts.slice(1, -1).join('.') || 'execute';
};

export const PLATFORM_CONTRACT_VERSION = 'platform-contract/v1';
export const CONNECTOR_SPEC_VERSION = 'connector-spec/v1';
export const PLUGIN_SPEC_VERSION = 'plugin-spec/v1';
export const WORKFLOW_NODE_SPEC_VERSION = 'workflow-node-spec/v1';
export const EVENT_SCHEMA_VERSION = 'event-schema/v1';
export const TRACE_SCHEMA_VERSION = 'trace-schema/v1';
export const PLUGIN_RELEASE_SPEC_VERSION = 'plugin-release-spec/v1';

export const SUPPORTED_PLUGIN_KINDS = Object.freeze(['analyze', 'search', 'output']);
export const SUPPORTED_WORKFLOW_NODE_TYPES = Object.freeze([
  'analyze.customer.v1',
  'search.documents.v1',
  'output.script.v1',
]);
export const SUPPORTED_PLUGIN_RELEASE_STAGES = Object.freeze(['stable', 'canary']);

const DEFAULT_EVENT_TYPES = Object.freeze([
  'plugin.execution.start',
  'workflow.node.start',
  'workflow.node.retry',
  'workflow.node.complete',
  'workflow.node.error',
  'plugin.execution.complete',
  'plugin.execution.error',
  'plugin.rollback.start',
  'plugin.rollback.complete',
  'plugin.rollback.error',
]);

const DEFAULT_EVENT_REQUIRED_FIELDS = Object.freeze([
  'eventId',
  'eventType',
  'occurredAt',
  'pluginId',
  'route',
  'nodeId',
]);

const DEFAULT_TRACE_REQUIRED_SECTIONS = Object.freeze([
  'plugin',
  'workflow',
  'events',
  'timing',
  'result',
]);

const DEFAULT_NODE_META = Object.freeze({
  'analyze.customer.v1': {
    module: 'analyze',
    operation: 'analyzeCustomer',
  },
  'search.documents.v1': {
    module: 'search',
    operation: 'searchDocuments',
  },
  'output.script.v1': {
    module: 'output',
    operation: 'generateScript',
  },
});

const DEFAULT_RELEASE_SPEC = Object.freeze({
  specVersion: PLUGIN_RELEASE_SPEC_VERSION,
  stage: 'stable',
  trafficPercent: 100,
  stablePluginId: '',
  rollbackOnError: false,
  bucketBy: 'sessionId',
});

export const buildPlatformContractSummary = () => ({
  contractVersion: PLATFORM_CONTRACT_VERSION,
  connectorSpecVersion: CONNECTOR_SPEC_VERSION,
  pluginSpecVersion: PLUGIN_SPEC_VERSION,
  workflowNodeSpecVersion: WORKFLOW_NODE_SPEC_VERSION,
  eventSchemaVersion: EVENT_SCHEMA_VERSION,
  traceSchemaVersion: TRACE_SCHEMA_VERSION,
  pluginReleaseSpecVersion: PLUGIN_RELEASE_SPEC_VERSION,
});

export const validateConnectorSpec = (connector = {}, context = 'plugin.connectors[]') => {
  if (!isPlainObject(connector)) {
    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(connector.specVersion || CONNECTOR_SPEC_VERSION);

  if (specVersion !== CONNECTOR_SPEC_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${CONNECTOR_SPEC_VERSION}"`,
    );
  }

  const id = ensureNonEmptyString(connector.id, 'id', context);
  const connectorType = ensureNonEmptyString(connector.connectorType, 'connectorType', context);
  const adapterType = normalizeString(connector.adapterType || connectorType) || connectorType;

  return {
    specVersion,
    id,
    connectorType,
    adapterType,
    required: connector.required === true,
    settingsPath: normalizeString(connector.settingsPath),
    whitelistKeys: ensureStringArray(connector.whitelistKeys, 'whitelistKeys', context),
    limitsKeys: ensureStringArray(connector.limitsKeys, 'limitsKeys', context),
    capabilities: ensureStringArray(connector.capabilities, 'capabilities', context),
  };
};

export const validateWorkflowNodeHandlerSpec = ({
  handler = {},
  nodeType = '',
  context = 'plugin.workflow.nodes[]',
} = {}) => {
  const isCoreType = SUPPORTED_WORKFLOW_NODE_TYPES.includes(nodeType);

  if (isCoreType) {
    return null;
  }

  if (!isPlainObject(handler)) {
    throw new Error(
      `[platform-contract] ${context}.handler must be defined for custom node type "${nodeType}"`,
    );
  }

  const modulePath = ensureNonEmptyString(handler.modulePath, 'handler.modulePath', context);

  return {
    modulePath,
    exportName: normalizeString(handler.exportName || 'default') || 'default',
  };
};

export const validateWorkflowNodeSpec = (node = {}, context = 'plugin.workflow.nodes[]') => {
  if (!isPlainObject(node)) {
    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(node.specVersion || WORKFLOW_NODE_SPEC_VERSION);

  if (specVersion !== WORKFLOW_NODE_SPEC_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${WORKFLOW_NODE_SPEC_VERSION}"`,
    );
  }

  const id = ensureNonEmptyString(node.id, 'id', context);
  const type = ensureNonEmptyString(node.type, 'type', context);
  const handler = validateWorkflowNodeHandlerSpec({
    handler: node.handler,
    nodeType: type,
    context,
  });

  const defaultMeta = DEFAULT_NODE_META[type] || {};
  const module = normalizeString(node.module || defaultMeta.module || deriveModuleFromNodeType(type));
  const operation = normalizeString(
    node.operation || defaultMeta.operation || deriveOperationFromNodeType(type) || 'execute',
  );

  if (!module || !operation) {
    throw new Error(
      `[platform-contract] ${context} must define module/operation for type "${type}"`,
    );
  }

  const inputMode = normalizeString(node.inputMode || 'request');

  if (
    inputMode !== 'request' &&
    inputMode !== 'previous-node' &&
    inputMode !== 'dependency-map'
  ) {
    throw new Error(
      `[platform-contract] ${context}.inputMode must be "request", "previous-node" or "dependency-map"`,
    );
  }

  const emitEvents = ensureStringArray(node.emitEvents, 'emitEvents', context);
  const dependsOn = ensureStringArray(node.dependsOn, 'dependsOn', context);
  const connectorRefs = ensureStringArray(node.connectorRefs, 'connectorRefs', context);
  const rawCondition = isPlainObject(node.condition) ? node.condition : {};
  const conditionPath = normalizeString(rawCondition.path);
  const hasEquals = Object.prototype.hasOwnProperty.call(rawCondition, 'equals');
  const hasNotEquals = Object.prototype.hasOwnProperty.call(rawCondition, 'notEquals');
  const hasExists = Object.prototype.hasOwnProperty.call(rawCondition, 'exists');
  const condition = conditionPath
    ? {
        path: conditionPath,
        ...(hasEquals ? { equals: rawCondition.equals } : {}),
        ...(hasNotEquals ? { notEquals: rawCondition.notEquals } : {}),
        ...(hasExists ? { exists: rawCondition.exists === true } : {}),
      }
    : null;
  const rawRetryPolicy = isPlainObject(node.retryPolicy) ? node.retryPolicy : {};
  const retryPolicy = {
    maxRetries: Math.max(0, toNumberOrDefault(rawRetryPolicy.maxRetries, 0)),
    backoffMs: Math.max(0, toNumberOrDefault(rawRetryPolicy.backoffMs, 0)),
  };

  return {
    specVersion,
    id,
    type,
    module,
    operation,
    inputMode,
    timeoutMs: toNumberOrDefault(node.timeoutMs, 90000),
    continueOnError: node.continueOnError === true,
    emitEvents: emitEvents.length > 0 ? emitEvents : ['workflow.node.start', 'workflow.node.complete'],
    dependsOn,
    connectorRefs,
    condition,
    retryPolicy,
    inputOverrides: isPlainObject(node.inputOverrides) ? node.inputOverrides : {},
    runtimeProvider: handler ? 'custom' : 'core',
    handler,
  };
};

export const validatePluginReleaseSpec = (release = {}, context = 'plugin.release') => {
  if (!isPlainObject(release)) {
    if (release === undefined || release === null) {
      return { ...DEFAULT_RELEASE_SPEC };
    }

    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(release.specVersion || PLUGIN_RELEASE_SPEC_VERSION);

  if (specVersion !== PLUGIN_RELEASE_SPEC_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${PLUGIN_RELEASE_SPEC_VERSION}"`,
    );
  }

  const stage = normalizeString(release.stage || DEFAULT_RELEASE_SPEC.stage).toLowerCase();

  if (!SUPPORTED_PLUGIN_RELEASE_STAGES.includes(stage)) {
    throw new Error(
      `[platform-contract] ${context}.stage must be one of ${SUPPORTED_PLUGIN_RELEASE_STAGES.join(', ')}`,
    );
  }

  const trafficPercent =
    stage === 'canary'
      ? toClampedPercent(release.trafficPercent, 0)
      : DEFAULT_RELEASE_SPEC.trafficPercent;
  const stablePluginId = normalizeString(release.stablePluginId || release.baselinePluginId);
  const rollbackOnError = stage === 'canary' ? release.rollbackOnError !== false : false;
  const bucketBy = normalizeString(release.bucketBy || DEFAULT_RELEASE_SPEC.bucketBy);

  return {
    specVersion,
    stage,
    trafficPercent,
    stablePluginId,
    rollbackOnError,
    bucketBy: bucketBy || DEFAULT_RELEASE_SPEC.bucketBy,
  };
};

export const resolvePluginReleaseBucketKey = ({
  release = {},
  requestPayload = {},
} = {}) => {
  const bucketBy = normalizeString(release.bucketBy || DEFAULT_RELEASE_SPEC.bucketBy);

  if (!bucketBy) {
    return '';
  }

  if (bucketBy === 'sessionId') {
    return normalizeString(requestPayload?.sessionId || '');
  }

  if (bucketBy === 'requestHash') {
    return JSON.stringify(requestPayload || {});
  }

  const resolvedByPath = getValueByPath(requestPayload, bucketBy);
  return normalizeString(resolvedByPath);
};

export const validateEventSchema = (eventSchema = {}, context = 'plugin.eventSchema') => {
  if (!isPlainObject(eventSchema)) {
    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(eventSchema.specVersion || EVENT_SCHEMA_VERSION);

  if (specVersion !== EVENT_SCHEMA_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${EVENT_SCHEMA_VERSION}"`,
    );
  }

  const eventTypes = ensureStringArray(eventSchema.eventTypes, 'eventTypes', context);
  const requiredFields = ensureStringArray(
    eventSchema.requiredFields,
    'requiredFields',
    context,
  );

  return {
    specVersion,
    eventTypes: eventTypes.length > 0 ? eventTypes : [...DEFAULT_EVENT_TYPES],
    requiredFields:
      requiredFields.length > 0 ? requiredFields : [...DEFAULT_EVENT_REQUIRED_FIELDS],
  };
};

export const validateTraceSchema = (traceSchema = {}, context = 'plugin.traceSchema') => {
  if (!isPlainObject(traceSchema)) {
    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(traceSchema.specVersion || TRACE_SCHEMA_VERSION);

  if (specVersion !== TRACE_SCHEMA_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${TRACE_SCHEMA_VERSION}"`,
    );
  }

  const requiredSections = ensureStringArray(
    traceSchema.requiredSections,
    'requiredSections',
    context,
  );

  return {
    specVersion,
    requiredSections:
      requiredSections.length > 0 ? requiredSections : [...DEFAULT_TRACE_REQUIRED_SECTIONS],
    compatibility: ensureStringArray(traceSchema.compatibility, 'compatibility', context),
  };
};

export const validatePluginSpec = (pluginSpec = {}, options = {}) => {
  const { manifestPath = '' } = options;
  const context = manifestPath ? `manifest(${manifestPath})` : 'plugin';

  if (!isPlainObject(pluginSpec)) {
    throw new Error(`[platform-contract] ${context} must be an object`);
  }

  const specVersion = normalizeString(pluginSpec.specVersion || PLUGIN_SPEC_VERSION);

  if (specVersion !== PLUGIN_SPEC_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.specVersion must be "${PLUGIN_SPEC_VERSION}"`,
    );
  }

  const pluginId = ensureNonEmptyString(pluginSpec.pluginId, 'pluginId', context);
  const displayName = ensureNonEmptyString(pluginSpec.displayName || pluginId, 'displayName', context);
  const kind = ensureNonEmptyString(pluginSpec.kind, 'kind', context);
  const route = ensureNonEmptyString(pluginSpec.route, 'route', context);

  if (!SUPPORTED_PLUGIN_KINDS.includes(kind)) {
    throw new Error(
      `[platform-contract] ${context}.kind "${kind}" is unsupported; expected one of ${SUPPORTED_PLUGIN_KINDS.join(', ')}`,
    );
  }

  const workflow = isPlainObject(pluginSpec.workflow) ? pluginSpec.workflow : {};
  const workflowSpecVersion = normalizeString(
    workflow.specVersion || WORKFLOW_NODE_SPEC_VERSION,
  );

  if (workflowSpecVersion !== WORKFLOW_NODE_SPEC_VERSION) {
    throw new Error(
      `[platform-contract] ${context}.workflow.specVersion must be "${WORKFLOW_NODE_SPEC_VERSION}"`,
    );
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`[platform-contract] ${context}.workflow.nodes must be a non-empty array`);
  }

  const nodes = workflow.nodes.map((node, index) =>
    validateWorkflowNodeSpec(node, `${context}.workflow.nodes[${index}]`),
  );
  const entryNodeId =
    normalizeString(workflow.entryNodeId) || nodes[0]?.id || '';

  if (!nodes.some((node) => node.id === entryNodeId)) {
    throw new Error(
      `[platform-contract] ${context}.workflow.entryNodeId "${entryNodeId}" does not exist`,
    );
  }

  const connectors = Array.isArray(pluginSpec.connectors)
    ? pluginSpec.connectors.map((connector, index) =>
        validateConnectorSpec(connector, `${context}.connectors[${index}]`),
      )
    : [];
  const connectorIds = new Set(connectors.map((item) => item.id));

  nodes.forEach((node) => {
    node.dependsOn.forEach((dependencyNodeId) => {
      if (dependencyNodeId === node.id) {
        throw new Error(
          `[platform-contract] ${context}.workflow.nodes["${node.id}"].dependsOn cannot reference itself`,
        );
      }

      if (!nodes.some((candidateNode) => candidateNode.id === dependencyNodeId)) {
        throw new Error(
          `[platform-contract] ${context}.workflow.nodes["${node.id}"].dependsOn references unknown node "${dependencyNodeId}"`,
        );
      }
    });

    node.connectorRefs.forEach((connectorId) => {
      if (!connectorIds.has(connectorId)) {
        throw new Error(
          `[platform-contract] ${context}.workflow.nodes["${node.id}"].connectorRefs references unknown connector "${connectorId}"`,
        );
      }
    });
  });

  const eventSchema = validateEventSchema(
    isPlainObject(pluginSpec.eventSchema) ? pluginSpec.eventSchema : {},
    `${context}.eventSchema`,
  );
  const traceSchema = validateTraceSchema(
    isPlainObject(pluginSpec.traceSchema) ? pluginSpec.traceSchema : {},
    `${context}.traceSchema`,
  );
  const release = validatePluginReleaseSpec(
    isPlainObject(pluginSpec.release) ? pluginSpec.release : {},
    `${context}.release`,
  );

  const outputBinding = isPlainObject(pluginSpec.outputBinding)
    ? pluginSpec.outputBinding
    : {};
  const outputNodeId =
    normalizeString(outputBinding.nodeId) || nodes[nodes.length - 1]?.id || '';

  if (!nodes.some((node) => node.id === outputNodeId)) {
    throw new Error(
      `[platform-contract] ${context}.outputBinding.nodeId "${outputNodeId}" does not exist`,
    );
  }

  return {
    specVersion,
    pluginId,
    displayName,
    description: normalizeString(pluginSpec.description),
    kind,
    route,
    enabled: pluginSpec.enabled !== false,
    defaultPlugin: pluginSpec.defaultPlugin === true,
    order: toNumberOrDefault(pluginSpec.order, 100),
    workflow: {
      specVersion: workflowSpecVersion,
      entryNodeId,
      nodes,
    },
    connectors,
    eventSchema,
    traceSchema,
    release,
    outputBinding: {
      nodeId: outputNodeId,
      path: normalizeString(outputBinding.path || '$'),
    },
    manifestPath: normalizeString(manifestPath),
  };
};
