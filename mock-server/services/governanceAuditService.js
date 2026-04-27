import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile } from './jsonDataService.js';
import { nowLocalIso } from '../utils/localTime.js';

const GOVERNANCE_AUDIT_FILE = 'governanceAuditLog.json';
const MAX_CHANGED_FIELDS = 12;
const MAX_VALUE_LENGTH = 180;

const now = nowLocalIso;

const toNonEmptyString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const truncateText = (value = '', maxLength = MAX_VALUE_LENGTH) => {
  const normalizedValue = String(value || '');
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength)}...`;
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toNonEmptyString(item))
      .filter(Boolean);
  }

  const normalizedValue = toNonEmptyString(value);
  return normalizedValue ? [normalizedValue] : [];
};

const flattenRecord = (value = {}, prefix = '', result = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) {
      result[prefix] = value;
    }
    return result;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (childValue && typeof childValue === 'object' && !Array.isArray(childValue)) {
      flattenRecord(childValue, nextKey, result);
      return;
    }

    result[nextKey] = childValue;
  });

  return result;
};

const formatFieldValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return truncateText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncateText(value.join(', '));
  }

  return truncateText(JSON.stringify(value));
};

const buildChangedFields = (beforeSnapshot = null, afterSnapshot = null) => {
  const flattenedBefore = flattenRecord(beforeSnapshot || {});
  const flattenedAfter = flattenRecord(afterSnapshot || {});
  const fieldNames = Array.from(
    new Set([...Object.keys(flattenedBefore), ...Object.keys(flattenedAfter)]),
  );

  return fieldNames
    .filter((fieldName) => {
      return JSON.stringify(flattenedBefore[fieldName] ?? null) !== JSON.stringify(flattenedAfter[fieldName] ?? null);
    })
    .slice(0, MAX_CHANGED_FIELDS)
    .map((fieldName) => ({
      field: fieldName,
      before: formatFieldValue(flattenedBefore[fieldName]),
      after: formatFieldValue(flattenedAfter[fieldName]),
    }));
};

const sanitizeAssistantSnapshot = (assistant = null) => {
  if (!assistant || typeof assistant !== 'object') {
    return null;
  }

  return {
    assistantId: assistant.id || assistant.assistantId || '',
    assistantName: assistant.assistantName || assistant.name || '',
    description: toNonEmptyString(assistant.description),
    industryType: toNonEmptyString(assistant.industryType),
    enabled: assistant.enabled !== false,
    publishState: toNonEmptyString(assistant.publishState || assistant.status),
    version: Number(assistant.version || 0) || 0,
    defaultTaskContext: toNonEmptyString(assistant.defaultTaskContext),
    defaultSubjectHint: toNonEmptyString(assistant.defaultSubjectHint),
    defaultCustomerType: toNonEmptyString(assistant.defaultCustomerType),
    defaultProductDirection: toNonEmptyString(assistant.defaultProductDirection),
    defaultVariables: assistant.defaultVariables || {},
    variableSchema: Array.isArray(assistant.variableSchema) ? assistant.variableSchema : [],
    defaultModuleBindings: {
      analyze: toNonEmptyString(assistant.defaultModuleBindings?.analyze),
      search: toNonEmptyString(assistant.defaultModuleBindings?.search),
      script: toNonEmptyString(assistant.defaultModuleBindings?.script),
    },
    defaultStrategies: {
      analyzeStrategy: toNonEmptyString(assistant.defaultStrategies?.analyzeStrategy),
      searchStrategy: toNonEmptyString(assistant.defaultStrategies?.searchStrategy),
      scriptStrategy: toNonEmptyString(assistant.defaultStrategies?.scriptStrategy),
    },
    dataScopes: {
      rulesScope: normalizeStringArray(assistant.dataScopes?.rulesScope),
      productScope: normalizeStringArray(assistant.dataScopes?.productScope),
      docScope: normalizeStringArray(assistant.dataScopes?.docScope),
    },
  };
};

const sanitizePromptSnapshot = (prompt = null) => {
  if (!prompt || typeof prompt !== 'object') {
    return null;
  }

  const promptContent = typeof prompt.content === 'string' ? prompt.content : '';

  return {
    promptId: prompt.id || prompt.promptId || '',
    name: prompt.name || prompt.promptName || '',
    module: toNonEmptyString(prompt.module),
    description: toNonEmptyString(prompt.description),
    version: toNonEmptyString(prompt.version),
    recordVersion: Number(prompt.recordVersion || 0) || 0,
    publishState: toNonEmptyString(prompt.publishState || prompt.status),
    enabled: prompt.enabled !== false,
    industryType: toNonEmptyString(prompt.industryType),
    assistantId: toNonEmptyString(prompt.assistantId),
    tags: normalizeStringArray(prompt.tags),
    contentPreview: truncateText(promptContent, 240),
    contentLength: promptContent.length,
  };
};

const sanitizePluginManifestSnapshot = (manifest = null) => {
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  const workflowNodes = Array.isArray(manifest.workflow?.nodes)
    ? manifest.workflow.nodes
    : [];
  const connectors = Array.isArray(manifest.connectors) ? manifest.connectors : [];

  return {
    pluginId: toNonEmptyString(manifest.pluginId),
    displayName: toNonEmptyString(manifest.displayName),
    kind: toNonEmptyString(manifest.kind),
    route: toNonEmptyString(manifest.route),
    enabled: manifest.enabled !== false,
    defaultPlugin: manifest.defaultPlugin === true,
    order: Number(manifest.order || 0) || 0,
    release: {
      stage: toNonEmptyString(manifest.release?.stage || 'stable'),
      trafficPercent: Number(manifest.release?.trafficPercent || 0) || 0,
      rollbackOnError: manifest.release?.rollbackOnError === true,
      bucketBy: toNonEmptyString(manifest.release?.bucketBy || 'sessionId'),
      stablePluginId: toNonEmptyString(manifest.release?.stablePluginId),
    },
    workflow: {
      entryNodeId: toNonEmptyString(manifest.workflow?.entryNodeId),
      nodeCount: workflowNodes.length,
      nodeTypes: workflowNodes
        .map((item) => toNonEmptyString(item?.type))
        .filter(Boolean),
      nodeIds: workflowNodes
        .map((item) => toNonEmptyString(item?.id))
        .filter(Boolean),
    },
    connectors: connectors.map((item) => ({
      id: toNonEmptyString(item?.id),
      connectorType: toNonEmptyString(item?.connectorType),
      required: item?.required === true,
      settingsPath: toNonEmptyString(item?.settingsPath),
    })),
    outputBinding: {
      nodeId: toNonEmptyString(manifest.outputBinding?.nodeId),
      path: toNonEmptyString(manifest.outputBinding?.path),
    },
  };
};

const sanitizeSnapshotByEntityType = (entityType = '', snapshot = null) => {
  if (entityType === 'assistant') {
    return sanitizeAssistantSnapshot(snapshot);
  }

  if (entityType === 'prompt') {
    return sanitizePromptSnapshot(snapshot);
  }

  if (entityType === 'plugin_manifest') {
    return sanitizePluginManifestSnapshot(snapshot);
  }

  return null;
};

const buildAuditSummary = ({
  entityType = '',
  action = '',
  targetName = '',
  targetId = '',
  metadata = {},
} = {}) => {
  const entityLabelMap = {
    assistant: 'Assistant',
    prompt: 'Prompt',
    plugin_manifest: 'PluginManifest',
  };
  const entityLabel = entityLabelMap[entityType] || 'GovernanceObject';
  const displayName = targetName || targetId || entityLabel;

  if (action === 'create') {
    return `创建${entityLabel}「${displayName}」`;
  }

  if (action === 'update') {
    return `更新${entityLabel}「${displayName}」`;
  }

  if (action === 'publish') {
    return `发布${entityLabel}「${displayName}」`;
  }

  if (action === 'activate') {
    const previousActiveAssistantId = toNonEmptyString(metadata.previousActiveAssistantId);
    return previousActiveAssistantId
      ? `激活Assistant「${displayName}」，替换 ${previousActiveAssistantId}`
      : `激活Assistant「${displayName}」`;
  }

  if (action === 'delete') {
    return `删除${entityLabel}「${displayName}」`;
  }

  return `${entityLabel} 发生治理变更`;
};

const normalizeAuditEntry = (entry = {}, index = 0) => ({
  id: toNonEmptyString(entry.id) || `governance-audit-${index + 1}`,
  entityType:
    entry.entityType === 'assistant' ||
    entry.entityType === 'prompt' ||
    entry.entityType === 'plugin_manifest'
      ? entry.entityType
      : 'assistant',
  action: toNonEmptyString(entry.action) || 'update',
  actor: toNonEmptyString(entry.actor) || 'assistant-center',
  targetId: toNonEmptyString(entry.targetId),
  targetName: toNonEmptyString(entry.targetName),
  createdAt: toNonEmptyString(entry.createdAt) || null,
  summary: toNonEmptyString(entry.summary),
  changeCount: Number(entry.changeCount || 0) || 0,
  changedFields: Array.isArray(entry.changedFields)
    ? entry.changedFields.map((item) => ({
        field: toNonEmptyString(item?.field),
        before: typeof item?.before === 'string' ? item.before : '',
        after: typeof item?.after === 'string' ? item.after : '',
      }))
    : [],
  metadata:
    entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
      ? entry.metadata
      : {},
  beforeSnapshot:
    entry.beforeSnapshot && typeof entry.beforeSnapshot === 'object' ? entry.beforeSnapshot : null,
  afterSnapshot:
    entry.afterSnapshot && typeof entry.afterSnapshot === 'object' ? entry.afterSnapshot : null,
});

const sortByCreatedAtDesc = (items = []) =>
  [...items].sort((leftItem, rightItem) => {
    const leftValue = Date.parse(leftItem?.createdAt || '') || 0;
    const rightValue = Date.parse(rightItem?.createdAt || '') || 0;
    return rightValue - leftValue;
  });

export const listGovernanceAuditEntries = ({
  entityType = '',
  targetId = '',
  action = '',
  limit = 20,
} = {}) => {
  const normalizedEntityType =
    entityType === 'assistant' ||
    entityType === 'prompt' ||
    entityType === 'plugin_manifest'
      ? entityType
      : '';
  const normalizedTargetId = toNonEmptyString(targetId);
  const normalizedAction = toNonEmptyString(action);
  const numericLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 20;

  return sortByCreatedAtDesc(
    readJsonFile(GOVERNANCE_AUDIT_FILE, []).map((item, index) => normalizeAuditEntry(item, index)),
  )
    .filter((item) => {
      if (normalizedEntityType && item.entityType !== normalizedEntityType) {
        return false;
      }

      if (normalizedTargetId && item.targetId !== normalizedTargetId) {
        return false;
      }

      if (normalizedAction && item.action !== normalizedAction) {
        return false;
      }

      return true;
    })
    .slice(0, numericLimit);
};

export const recordGovernanceAuditEntry = ({
  entityType = 'assistant',
  targetId = '',
  targetName = '',
  action = 'update',
  actor = 'assistant-center',
  before = null,
  after = null,
  metadata = {},
} = {}) => {
  const normalizedEntityType =
    entityType === 'prompt' || entityType === 'plugin_manifest'
      ? entityType
      : 'assistant';
  const beforeSnapshot = sanitizeSnapshotByEntityType(normalizedEntityType, before);
  const afterSnapshot = sanitizeSnapshotByEntityType(normalizedEntityType, after);
  const changedFields = buildChangedFields(beforeSnapshot, afterSnapshot);

  const entry = normalizeAuditEntry({
    id: randomUUID(),
    entityType: normalizedEntityType,
    action: toNonEmptyString(action) || 'update',
    actor: toNonEmptyString(actor) || 'assistant-center',
    targetId: toNonEmptyString(targetId),
    targetName: toNonEmptyString(targetName),
    createdAt: now(),
    summary: buildAuditSummary({
      entityType: normalizedEntityType,
      action,
      targetName,
      targetId,
      metadata,
    }),
    changeCount: changedFields.length,
    changedFields,
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    beforeSnapshot,
    afterSnapshot,
  });

  const currentEntries = readJsonFile(GOVERNANCE_AUDIT_FILE, []);
  writeJsonFile(GOVERNANCE_AUDIT_FILE, [entry, ...currentEntries]);
  return entry;
};
