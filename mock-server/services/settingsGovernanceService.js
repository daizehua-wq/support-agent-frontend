import { createHash, randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile } from './jsonDataService.js';
import { nowLocalIso } from '../utils/localTime.js';
import {
  getSettingsRbacSettings,
  getSettingsReleaseControlSettings,
  getSettingsTenantIsolationSettings,
} from './settingsService.js';

const SETTINGS_GOVERNANCE_REGISTRY_FILE = 'settingsGovernanceRegistry.json';
const SETTINGS_GOVERNANCE_AUDIT_FILE = 'settingsGovernanceAuditLog.json';

const SETTINGS_GOVERNANCE_REGISTRY_CONTRACT = 'settings-governance-registry/v1';
const SETTINGS_GOVERNANCE_AUDIT_CONTRACT = 'settings-governance-audit/v1';
const SETTINGS_GOVERNANCE_HISTORY_CONTRACT = 'settings-governance-history/v1';
const SETTINGS_GOVERNANCE_OVERVIEW_CONTRACT = 'settings-governance-overview/v1';
const SETTINGS_GOVERNANCE_RBAC_CONTRACT = 'settings-governance-rbac/v1';
const SETTINGS_GOVERNANCE_VERSION_CONTRACT = 'settings-governance-version/v1';

const DEFAULT_TENANT_ID = 'default';
const MAX_CHANGED_FIELDS = 60;
const MAX_VERSION_PER_TENANT = 500;
const MAX_AUDIT_ENTRIES = 5000;
const DEFAULT_ROLLBACK_SLA_MINUTES = 5;

const SENSITIVE_FIELD_PATTERN = /(password|apiKey|token|secret|credential)/i;

const now = nowLocalIso;

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
};

const toText = (value = '') => String(value || '').trim();

const normalizeStringArray = (value = [], fallback = []) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => toText(item))
    .filter(Boolean);
};

const normalizeRolePermissionMap = (value = {}, fallback = {}) => {
  const fallbackRecord =
    fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      ? fallback
      : {};
  const inputRecord =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  const normalizedRecord = {};

  Object.entries(fallbackRecord).forEach(([role, permissions]) => {
    const normalizedRole = toText(role);
    if (!normalizedRole) {
      return;
    }

    normalizedRecord[normalizedRole] = normalizeStringArray(permissions, []);
  });

  Object.entries(inputRecord).forEach(([role, permissions]) => {
    const normalizedRole = toText(role);
    if (!normalizedRole) {
      return;
    }

    const normalizedPermissions = normalizeStringArray(permissions, []);
    if (normalizedPermissions.length > 0) {
      normalizedRecord[normalizedRole] = [...new Set(normalizedPermissions)];
    }
  });

  return normalizedRecord;
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

const formatFieldValue = (fieldPath = '', value = undefined) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (SENSITIVE_FIELD_PATTERN.test(fieldPath)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 180)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const serialized = value.join(', ');
    return serialized.length > 180 ? `${serialized.slice(0, 180)}...` : serialized;
  }

  const serialized = JSON.stringify(value);
  return serialized.length > 180 ? `${serialized.slice(0, 180)}...` : serialized;
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
      before: formatFieldValue(fieldName, flattenedBefore[fieldName]),
      after: formatFieldValue(fieldName, flattenedAfter[fieldName]),
    }));
};

const hashSnapshot = (settingsSnapshot = {}) => {
  return createHash('sha256')
    .update(JSON.stringify(settingsSnapshot || {}))
    .digest('hex');
};

const readHeader = (req = {}, headerName = '') => {
  const normalizedHeaderName = toText(headerName).toLowerCase();

  if (!normalizedHeaderName || !req?.headers || typeof req.headers !== 'object') {
    return '';
  }

  const headerValue = req.headers[normalizedHeaderName];

  if (typeof headerValue === 'string') {
    return headerValue.trim();
  }

  if (Array.isArray(headerValue)) {
    return toText(headerValue[0]);
  }

  return '';
};

const buildDefaultRegistry = () => ({
  contractVersion: SETTINGS_GOVERNANCE_REGISTRY_CONTRACT,
  updatedAt: now(),
  tenants: {},
});

const buildDefaultTenantRecord = (tenantId = DEFAULT_TENANT_ID, policies = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const tenantIsolation = policies.tenantIsolation || {};
  const rbac = policies.rbac || {};
  const releaseControl = policies.releaseControl || {};

  return {
    tenantId: normalizedTenantId,
    displayName: normalizedTenantId,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    policies: {
      tenantIsolation: cloneValue(tenantIsolation) || {},
      rbac: {
        contractVersion: SETTINGS_GOVERNANCE_RBAC_CONTRACT,
        enabled: rbac.enabled !== false,
        defaultRole: toText(rbac.defaultRole) || 'platform-owner',
        rolePermissions: normalizeRolePermissionMap(rbac.rolePermissions, {}),
      },
      releaseControl: {
        contractVersion: toText(releaseControl.contractVersion) || 'settings-release-control/v1',
        enabled: releaseControl.enabled !== false,
        requireChangeTicket: releaseControl.requireChangeTicket === true,
        rollbackSlaMinutes: Math.max(
          1,
          Number(releaseControl.rollbackSlaMinutes || DEFAULT_ROLLBACK_SLA_MINUTES) ||
            DEFAULT_ROLLBACK_SLA_MINUTES,
        ),
        autoPublishOnSave: releaseControl.autoPublishOnSave === true,
        allowRollback: releaseControl.allowRollback !== false,
      },
    },
    sequence: {
      nextVersionNumber: 1,
      nextReleaseNumber: 1,
    },
    pointers: {
      activeVersionId: '',
      publishedVersionId: '',
      previousPublishedVersionId: '',
    },
    versions: [],
  };
};

const normalizeVersionEntry = (entry = {}) => {
  const versionId = toText(entry.versionId) || '';
  const versionNumber = Math.max(1, Number(entry.versionNumber || 1) || 1);

  return {
    contractVersion: toText(entry.contractVersion) || SETTINGS_GOVERNANCE_VERSION_CONTRACT,
    versionId,
    versionNumber,
    tenantId: toText(entry.tenantId),
    versionStatus: toText(entry.versionStatus) || 'draft',
    sourceAction: toText(entry.sourceAction) || 'save',
    parentVersionId: toText(entry.parentVersionId),
    restoredFromVersionId: toText(entry.restoredFromVersionId),
    createdAt: toText(entry.createdAt) || now(),
    createdBy: {
      actorId: toText(entry.createdBy?.actorId) || 'settings-governance',
      role: toText(entry.createdBy?.role) || '',
    },
    traceId: toText(entry.traceId) || '',
    changeTicket: toText(entry.changeTicket) || '',
    releaseId: toText(entry.releaseId) || '',
    releaseNumber: Number(entry.releaseNumber || 0) || 0,
    releasedAt: toText(entry.releasedAt) || null,
    releasedBy: {
      actorId: toText(entry.releasedBy?.actorId) || '',
      role: toText(entry.releasedBy?.role) || '',
    },
    releaseNote: toText(entry.releaseNote),
    summary: {
      reason: toText(entry.summary?.reason),
      changedFieldCount: Math.max(0, Number(entry.summary?.changedFieldCount || 0) || 0),
      changedFields: Array.isArray(entry.summary?.changedFields)
        ? entry.summary.changedFields
        : [],
    },
    snapshotHash: toText(entry.snapshotHash),
    settingsSnapshot:
      entry.settingsSnapshot && typeof entry.settingsSnapshot === 'object'
        ? entry.settingsSnapshot
        : {},
  };
};

const normalizeTenantRecord = (record = {}, tenantId = DEFAULT_TENANT_ID, policies = {}) => {
  const fallbackRecord = buildDefaultTenantRecord(tenantId, policies);
  const versions = Array.isArray(record.versions)
    ? record.versions.map((item) => normalizeVersionEntry(item))
    : [];
  const normalizedRbac = {
    contractVersion:
      toText(record.policies?.rbac?.contractVersion) ||
      fallbackRecord.policies.rbac.contractVersion,
    enabled:
      record.policies?.rbac?.enabled === undefined
        ? fallbackRecord.policies.rbac.enabled
        : record.policies.rbac.enabled !== false,
    defaultRole:
      toText(record.policies?.rbac?.defaultRole) ||
      fallbackRecord.policies.rbac.defaultRole,
    rolePermissions: normalizeRolePermissionMap(
      record.policies?.rbac?.rolePermissions,
      fallbackRecord.policies.rbac.rolePermissions,
    ),
  };

  const releaseControlSettings = record.policies?.releaseControl || {};
  const fallbackReleaseControl = fallbackRecord.policies.releaseControl;
  const normalizedReleaseControl = {
    contractVersion:
      toText(releaseControlSettings.contractVersion) ||
      fallbackReleaseControl.contractVersion,
    enabled:
      releaseControlSettings.enabled === undefined
        ? fallbackReleaseControl.enabled
        : releaseControlSettings.enabled !== false,
    requireChangeTicket:
      releaseControlSettings.requireChangeTicket === undefined
        ? fallbackReleaseControl.requireChangeTicket === true
        : releaseControlSettings.requireChangeTicket === true,
    rollbackSlaMinutes: Math.max(
      1,
      Number(
        releaseControlSettings.rollbackSlaMinutes !== undefined
          ? releaseControlSettings.rollbackSlaMinutes
          : fallbackReleaseControl.rollbackSlaMinutes || DEFAULT_ROLLBACK_SLA_MINUTES,
      ) || DEFAULT_ROLLBACK_SLA_MINUTES,
    ),
    autoPublishOnSave:
      releaseControlSettings.autoPublishOnSave === undefined
        ? fallbackReleaseControl.autoPublishOnSave === true
        : releaseControlSettings.autoPublishOnSave === true,
    allowRollback:
      releaseControlSettings.allowRollback === undefined
        ? fallbackReleaseControl.allowRollback !== false
        : releaseControlSettings.allowRollback !== false,
  };

  return {
    tenantId: toText(record.tenantId) || fallbackRecord.tenantId,
    displayName: toText(record.displayName) || fallbackRecord.displayName,
    status: toText(record.status) || fallbackRecord.status,
    createdAt: toText(record.createdAt) || fallbackRecord.createdAt,
    updatedAt: toText(record.updatedAt) || fallbackRecord.updatedAt,
    policies: {
      tenantIsolation:
        record.policies?.tenantIsolation &&
        typeof record.policies.tenantIsolation === 'object'
          ? record.policies.tenantIsolation
          : fallbackRecord.policies.tenantIsolation,
      rbac: normalizedRbac,
      releaseControl: normalizedReleaseControl,
    },
    sequence: {
      nextVersionNumber: Math.max(
        1,
        Number(record.sequence?.nextVersionNumber || versions.length + 1) ||
          versions.length + 1,
      ),
      nextReleaseNumber: Math.max(
        1,
        Number(record.sequence?.nextReleaseNumber || 1) || 1,
      ),
    },
    pointers: {
      activeVersionId: toText(record.pointers?.activeVersionId),
      publishedVersionId: toText(record.pointers?.publishedVersionId),
      previousPublishedVersionId: toText(record.pointers?.previousPublishedVersionId),
    },
    versions,
  };
};

const readSettingsGovernanceRegistry = (policies = {}) => {
  const fallbackRegistry = buildDefaultRegistry();
  const registrySeed = readJsonFile(SETTINGS_GOVERNANCE_REGISTRY_FILE, fallbackRegistry);

  if (!registrySeed || typeof registrySeed !== 'object' || Array.isArray(registrySeed)) {
    return fallbackRegistry;
  }

  const tenantRecordMap =
    registrySeed.tenants && typeof registrySeed.tenants === 'object' && !Array.isArray(registrySeed.tenants)
      ? registrySeed.tenants
      : {};
  const normalizedTenants = {};

  Object.entries(tenantRecordMap).forEach(([tenantId, tenantRecord]) => {
    const normalizedTenantId = toText(tenantId);
    if (!normalizedTenantId) {
      return;
    }

    normalizedTenants[normalizedTenantId] = normalizeTenantRecord(
      tenantRecord,
      normalizedTenantId,
      policies,
    );
  });

  return {
    contractVersion:
      toText(registrySeed.contractVersion) || SETTINGS_GOVERNANCE_REGISTRY_CONTRACT,
    updatedAt: toText(registrySeed.updatedAt) || now(),
    tenants: normalizedTenants,
  };
};

const writeSettingsGovernanceRegistry = (registry = {}) => {
  const payload = {
    contractVersion: SETTINGS_GOVERNANCE_REGISTRY_CONTRACT,
    updatedAt: now(),
    tenants:
      registry.tenants && typeof registry.tenants === 'object' && !Array.isArray(registry.tenants)
        ? registry.tenants
        : {},
  };

  writeJsonFile(SETTINGS_GOVERNANCE_REGISTRY_FILE, payload);
  return payload;
};

const buildSettingsAuditEntry = ({
  tenantId = DEFAULT_TENANT_ID,
  action = 'settings.save',
  actorId = '',
  role = '',
  traceId = '',
  changeTicket = '',
  targetVersionId = '',
  fromVersionId = '',
  toVersionId = '',
  summary = '',
  changedFields = [],
  metadata = {},
} = {}) => {
  return {
    id: randomUUID(),
    contractVersion: SETTINGS_GOVERNANCE_AUDIT_CONTRACT,
    createdAt: now(),
    tenantId: toText(tenantId) || DEFAULT_TENANT_ID,
    action: toText(action) || 'settings.save',
    actorId: toText(actorId) || 'settings-governance',
    role: toText(role),
    traceId: toText(traceId),
    changeTicket: toText(changeTicket),
    targetVersionId: toText(targetVersionId),
    fromVersionId: toText(fromVersionId),
    toVersionId: toText(toVersionId),
    summary: toText(summary),
    changedFieldCount: Array.isArray(changedFields) ? changedFields.length : 0,
    changedFields: Array.isArray(changedFields) ? changedFields : [],
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {},
  };
};

const appendSettingsAuditEntry = (payload = {}) => {
  const entry = buildSettingsAuditEntry(payload);
  const currentEntries = readJsonFile(SETTINGS_GOVERNANCE_AUDIT_FILE, []);
  const normalizedEntries = Array.isArray(currentEntries) ? currentEntries : [];
  const nextEntries = [entry, ...normalizedEntries].slice(0, MAX_AUDIT_ENTRIES);
  writeJsonFile(SETTINGS_GOVERNANCE_AUDIT_FILE, nextEntries);
  return entry;
};

const listSettingsAuditEntries = ({ tenantId = '', limit = 20 } = {}) => {
  const normalizedTenantId = toText(tenantId);
  const normalizedLimit = Math.max(1, Number(limit || 20) || 20);
  const entries = readJsonFile(SETTINGS_GOVERNANCE_AUDIT_FILE, []);

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((item) => {
      if (!normalizedTenantId) {
        return true;
      }
      return toText(item?.tenantId) === normalizedTenantId;
    })
    .slice(0, normalizedLimit);
};

const toVersionSummary = (version = {}, includeSnapshot = false) => {
  const payload = {
    contractVersion: version.contractVersion || SETTINGS_GOVERNANCE_VERSION_CONTRACT,
    versionId: version.versionId || '',
    versionNumber: Number(version.versionNumber || 0) || 0,
    tenantId: version.tenantId || '',
    versionStatus: version.versionStatus || 'draft',
    sourceAction: version.sourceAction || 'save',
    parentVersionId: version.parentVersionId || '',
    restoredFromVersionId: version.restoredFromVersionId || '',
    createdAt: version.createdAt || null,
    createdBy: version.createdBy || {},
    traceId: version.traceId || '',
    changeTicket: version.changeTicket || '',
    releaseId: version.releaseId || '',
    releaseNumber: Number(version.releaseNumber || 0) || 0,
    releasedAt: version.releasedAt || null,
    releasedBy: version.releasedBy || {},
    releaseNote: version.releaseNote || '',
    summary: version.summary || {},
    snapshotHash: version.snapshotHash || '',
  };

  if (includeSnapshot) {
    payload.settingsSnapshot = cloneValue(version.settingsSnapshot) || {};
  }

  return payload;
};

const findVersionById = (tenantRecord = {}, versionId = '') => {
  const normalizedVersionId = toText(versionId);
  if (!normalizedVersionId) {
    return null;
  }

  return (
    (Array.isArray(tenantRecord.versions) ? tenantRecord.versions : []).find(
      (item) => item.versionId === normalizedVersionId,
    ) || null
  );
};

const getLatestVersion = (tenantRecord = {}) => {
  const versions = Array.isArray(tenantRecord.versions) ? tenantRecord.versions : [];
  if (versions.length === 0) {
    return null;
  }

  return [...versions].sort(
    (leftItem, rightItem) => Number(rightItem.versionNumber || 0) - Number(leftItem.versionNumber || 0),
  )[0];
};

const getReleasedVersionsDesc = (tenantRecord = {}) => {
  const versions = Array.isArray(tenantRecord.versions) ? tenantRecord.versions : [];
  return versions
    .filter((item) => item.releaseId)
    .sort((leftItem, rightItem) => {
      const leftReleaseNumber = Number(leftItem.releaseNumber || 0);
      const rightReleaseNumber = Number(rightItem.releaseNumber || 0);
      if (leftReleaseNumber !== rightReleaseNumber) {
        return rightReleaseNumber - leftReleaseNumber;
      }

      return Number(rightItem.versionNumber || 0) - Number(leftItem.versionNumber || 0);
    });
};

const resolveGovernancePolicies = (settingsInput = null) => {
  return {
    tenantIsolation: getSettingsTenantIsolationSettings(settingsInput),
    rbac: getSettingsRbacSettings(settingsInput),
    releaseControl: getSettingsReleaseControlSettings(settingsInput),
  };
};

const ensureTenantRecord = ({
  registry,
  tenantId = DEFAULT_TENANT_ID,
  policies = {},
} = {}) => {
  if (!registry || typeof registry !== 'object') {
    throw new Error('settings governance registry is invalid');
  }

  if (!registry.tenants || typeof registry.tenants !== 'object' || Array.isArray(registry.tenants)) {
    registry.tenants = {};
  }

  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const currentRecord = registry.tenants[normalizedTenantId];
  const nextRecord = normalizeTenantRecord(currentRecord || {}, normalizedTenantId, policies);
  registry.tenants[normalizedTenantId] = nextRecord;
  return nextRecord;
};

const evaluateKnownTenantGuard = ({ tenantId = DEFAULT_TENANT_ID, policies = {} } = {}) => {
  const tenantIsolationSettings = policies.tenantIsolation || {};
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const knownTenants = normalizeStringArray(tenantIsolationSettings.knownTenants, [DEFAULT_TENANT_ID]);

  if (tenantIsolationSettings.enabled === false) {
    return {
      allowed: true,
      reason: '',
      knownTenants,
    };
  }

  if (tenantIsolationSettings.enforceKnownTenants !== true) {
    return {
      allowed: true,
      reason: '',
      knownTenants,
    };
  }

  if (knownTenants.includes(normalizedTenantId)) {
    return {
      allowed: true,
      reason: '',
      knownTenants,
    };
  }

  return {
    allowed: false,
    reason: 'tenant-not-allowed',
    knownTenants,
  };
};

export const resolveSettingsGovernanceContext = ({
  req = {},
  payload = {},
  settings = null,
} = {}) => {
  const normalizedPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const policies = resolveGovernancePolicies(settings);
  const tenantHeaderName = toText(policies.tenantIsolation?.tenantHeader) || 'x-tenant-id';
  const actorHeaderName = toText(policies.tenantIsolation?.actorHeader) || 'x-user-id';
  const roleHeaderName = toText(policies.tenantIsolation?.roleHeader) || 'x-user-role';
  const actorSeed =
    normalizedPayload.actor && typeof normalizedPayload.actor === 'object' && !Array.isArray(normalizedPayload.actor)
      ? normalizedPayload.actor
      : {};
  const tenantId =
    toText(normalizedPayload.tenantId) ||
    toText(actorSeed.tenantId) ||
    readHeader(req, tenantHeaderName) ||
    toText(req?.query?.tenantId) ||
    toText(policies.tenantIsolation?.defaultTenantId) ||
    DEFAULT_TENANT_ID;
  const role =
    toText(actorSeed.role) ||
    readHeader(req, roleHeaderName) ||
    readHeader(req, 'x-platform-role') ||
    toText(normalizedPayload.role) ||
    toText(policies.rbac?.defaultRole) ||
    'platform-owner';
  const actorId =
    toText(actorSeed.id) ||
    readHeader(req, actorHeaderName) ||
    readHeader(req, 'x-platform-actor') ||
    toText(normalizedPayload.actorId) ||
    `settings-${role || 'unknown'}`;
  const traceId =
    toText(normalizedPayload.traceId) ||
    readHeader(req, 'x-trace-id') ||
    randomUUID();
  const changeTicket =
    toText(normalizedPayload.changeTicket) ||
    toText(normalizedPayload.ticketId) ||
    readHeader(req, 'x-change-ticket');

  return {
    tenantId,
    traceId,
    changeTicket,
    actor: {
      id: actorId,
      role,
    },
    policies,
  };
};

export const evaluateSettingsPermission = ({
  tenantId = DEFAULT_TENANT_ID,
  role = '',
  permission = 'settings:read',
  settings = null,
} = {}) => {
  const policies = resolveGovernancePolicies(settings);
  const knownTenantGuard = evaluateKnownTenantGuard({
    tenantId,
    policies,
  });

  if (!knownTenantGuard.allowed) {
    return {
      allowed: false,
      code: knownTenantGuard.reason || 'tenant-not-allowed',
      reason: 'tenant is not in the known tenant allowlist',
      expectedRoles: [],
      rolePermissions: policies.rbac?.rolePermissions || {},
      rbacEnabled: policies.rbac?.enabled !== false,
      tenantId: toText(tenantId) || DEFAULT_TENANT_ID,
      knownTenants: knownTenantGuard.knownTenants,
    };
  }

  const normalizedPermission = toText(permission);
  const normalizedRole = toText(role) || toText(policies.rbac?.defaultRole) || '';
  const rolePermissions = normalizeRolePermissionMap(
    policies.rbac?.rolePermissions,
    {},
  );
  const rbacEnabled = policies.rbac?.enabled !== false;

  if (!rbacEnabled) {
    return {
      allowed: true,
      code: '',
      reason: '',
      expectedRoles: [],
      rolePermissions,
      rbacEnabled,
      tenantId: toText(tenantId) || DEFAULT_TENANT_ID,
      knownTenants: knownTenantGuard.knownTenants,
    };
  }

  const matchedPermissions = rolePermissions[normalizedRole] || [];
  const allowed =
    matchedPermissions.includes('*') || matchedPermissions.includes(normalizedPermission);
  const expectedRoles = Object.entries(rolePermissions)
    .filter(([, permissions]) => {
      const normalizedPermissions = normalizeStringArray(permissions, []);
      return (
        normalizedPermissions.includes('*') ||
        normalizedPermissions.includes(normalizedPermission)
      );
    })
    .map(([matchedRole]) => matchedRole);

  return {
    allowed,
    code: allowed ? '' : 'permission-denied',
    reason: allowed
      ? ''
      : `role "${normalizedRole}" does not have permission "${normalizedPermission}"`,
    expectedRoles,
    rolePermissions,
    rbacEnabled,
    tenantId: toText(tenantId) || DEFAULT_TENANT_ID,
    knownTenants: knownTenantGuard.knownTenants,
  };
};

const createVersionEntry = ({
  tenantRecord,
  tenantId = DEFAULT_TENANT_ID,
  sourceAction = 'save',
  versionStatus = 'draft',
  parentVersionId = '',
  restoredFromVersionId = '',
  settingsSnapshot = {},
  actorId = '',
  role = '',
  traceId = '',
  changeTicket = '',
  releaseNote = '',
  reason = '',
  metadata = {},
} = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const snapshot = cloneValue(settingsSnapshot) || {};
  const previousVersion = findVersionById(tenantRecord, parentVersionId) || getLatestVersion(tenantRecord);
  const changedFields = buildChangedFields(previousVersion?.settingsSnapshot || null, snapshot);
  const versionNumber = Math.max(
    1,
    Number(tenantRecord.sequence?.nextVersionNumber || 1) || 1,
  );
  tenantRecord.sequence.nextVersionNumber = versionNumber + 1;
  const versionId = `${normalizedTenantId}-v${String(versionNumber).padStart(4, '0')}`;

  const versionEntry = normalizeVersionEntry({
    contractVersion: SETTINGS_GOVERNANCE_VERSION_CONTRACT,
    versionId,
    versionNumber,
    tenantId: normalizedTenantId,
    versionStatus,
    sourceAction,
    parentVersionId: toText(parentVersionId),
    restoredFromVersionId: toText(restoredFromVersionId),
    createdAt: now(),
    createdBy: {
      actorId: toText(actorId) || 'settings-governance',
      role: toText(role),
    },
    traceId: toText(traceId),
    changeTicket: toText(changeTicket),
    releaseId: '',
    releaseNumber: 0,
    releasedAt: null,
    releasedBy: {
      actorId: '',
      role: '',
    },
    releaseNote: '',
    summary: {
      reason: toText(reason),
      changedFieldCount: changedFields.length,
      changedFields,
    },
    snapshotHash: hashSnapshot(snapshot),
    settingsSnapshot: snapshot,
    metadata,
  });

  tenantRecord.versions.push(versionEntry);
  tenantRecord.versions = tenantRecord.versions
    .sort((leftItem, rightItem) => Number(leftItem.versionNumber || 0) - Number(rightItem.versionNumber || 0))
    .slice(-MAX_VERSION_PER_TENANT);

  return {
    versionEntry,
    changedFields,
    previousVersion,
  };
};

const markVersionPublished = ({
  tenantRecord,
  version,
  actorId = '',
  role = '',
  releaseNote = '',
} = {}) => {
  if (!version) {
    return null;
  }

  const previousPublishedVersion = findVersionById(
    tenantRecord,
    tenantRecord.pointers?.publishedVersionId,
  );

  if (
    previousPublishedVersion &&
    previousPublishedVersion.versionId &&
    previousPublishedVersion.versionId !== version.versionId
  ) {
    previousPublishedVersion.versionStatus = 'superseded';
  }

  const releaseNumber = Math.max(
    1,
    Number(tenantRecord.sequence?.nextReleaseNumber || 1) || 1,
  );
  tenantRecord.sequence.nextReleaseNumber = releaseNumber + 1;
  version.versionStatus = 'published';
  version.releaseNumber = releaseNumber;
  version.releaseId = `${tenantRecord.tenantId}-r${String(releaseNumber).padStart(4, '0')}`;
  version.releasedAt = now();
  version.releasedBy = {
    actorId: toText(actorId),
    role: toText(role),
  };
  version.releaseNote = toText(releaseNote);

  tenantRecord.pointers.previousPublishedVersionId = previousPublishedVersion?.versionId || '';
  tenantRecord.pointers.publishedVersionId = version.versionId;
  tenantRecord.pointers.activeVersionId = version.versionId;

  return {
    previousPublishedVersion,
  };
};

const buildTenantOverview = (tenantRecord = null) => {
  if (!tenantRecord) {
    return {
      tenantId: '',
      status: 'not-found',
      versionCount: 0,
      releaseCount: 0,
      pointers: {
        activeVersionId: '',
        publishedVersionId: '',
        previousPublishedVersionId: '',
      },
      latestVersion: null,
      latestPublishedVersion: null,
      rbac: {
        enabled: true,
        defaultRole: 'platform-owner',
        roles: [],
      },
      releaseControl: {
        enabled: true,
        requireChangeTicket: true,
        rollbackSlaMinutes: DEFAULT_ROLLBACK_SLA_MINUTES,
      },
    };
  }

  const releasedVersions = getReleasedVersionsDesc(tenantRecord);
  const latestVersion = getLatestVersion(tenantRecord);
  const latestPublishedVersion =
    findVersionById(tenantRecord, tenantRecord.pointers?.publishedVersionId) ||
    releasedVersions[0] ||
    null;

  return {
    tenantId: tenantRecord.tenantId,
    status: tenantRecord.status,
    versionCount: Array.isArray(tenantRecord.versions) ? tenantRecord.versions.length : 0,
    releaseCount: releasedVersions.length,
    pointers: tenantRecord.pointers || {},
    latestVersion: latestVersion ? toVersionSummary(latestVersion, false) : null,
    latestPublishedVersion: latestPublishedVersion
      ? toVersionSummary(latestPublishedVersion, false)
      : null,
    rbac: {
      enabled: tenantRecord.policies?.rbac?.enabled !== false,
      defaultRole: tenantRecord.policies?.rbac?.defaultRole || 'platform-owner',
      roles: Object.keys(tenantRecord.policies?.rbac?.rolePermissions || {}),
    },
    releaseControl: tenantRecord.policies?.releaseControl || {},
  };
};

export const recordSettingsMutationVersion = ({
  settingsSnapshot = {},
  context = {},
  reason = '',
  metadata = {},
} = {}) => {
  const tenantId = toText(context.tenantId) || DEFAULT_TENANT_ID;
  const actorId = toText(context.actor?.id) || 'settings-governance';
  const role = toText(context.actor?.role);
  const traceId = toText(context.traceId);
  const changeTicket = toText(context.changeTicket);
  const policies = context.policies || resolveGovernancePolicies(null);

  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = ensureTenantRecord({
    registry,
    tenantId,
    policies,
  });

  const { versionEntry, changedFields, previousVersion } = createVersionEntry({
    tenantRecord,
    tenantId,
    sourceAction: 'save',
    versionStatus: 'draft',
    parentVersionId: tenantRecord.pointers?.activeVersionId || '',
    settingsSnapshot,
    actorId,
    role,
    traceId,
    changeTicket,
    reason: toText(reason) || 'settings saved',
    metadata,
  });

  tenantRecord.pointers.activeVersionId = versionEntry.versionId;
  tenantRecord.updatedAt = now();
  writeSettingsGovernanceRegistry(registry);

  const auditEntry = appendSettingsAuditEntry({
    tenantId,
    action: 'settings.save',
    actorId,
    role,
    traceId,
    changeTicket,
    targetVersionId: versionEntry.versionId,
    fromVersionId: previousVersion?.versionId || '',
    toVersionId: versionEntry.versionId,
    summary: `保存租户 ${tenantId} 配置版本 ${versionEntry.versionId}`,
    changedFields,
    metadata,
  });

  return {
    contractVersion: SETTINGS_GOVERNANCE_VERSION_CONTRACT,
    tenantId,
    version: toVersionSummary(versionEntry, false),
    pointers: cloneValue(tenantRecord.pointers),
    changedFields,
    auditEntry,
    releaseControl: tenantRecord.policies?.releaseControl || {},
  };
};

export const publishTenantSettingsVersion = ({
  tenantId = DEFAULT_TENANT_ID,
  versionId = '',
  context = {},
  reason = '',
  metadata = {},
} = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const actorId = toText(context.actor?.id) || 'settings-governance';
  const role = toText(context.actor?.role);
  const traceId = toText(context.traceId);
  const changeTicket = toText(context.changeTicket);
  const policies = context.policies || resolveGovernancePolicies(null);

  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = ensureTenantRecord({
    registry,
    tenantId: normalizedTenantId,
    policies,
  });
  const targetVersion =
    findVersionById(tenantRecord, versionId) ||
    findVersionById(tenantRecord, tenantRecord.pointers?.activeVersionId) ||
    getLatestVersion(tenantRecord);

  if (!targetVersion) {
    throw new Error(`tenant ${normalizedTenantId} has no settings version to publish`);
  }

  const { previousPublishedVersion } = markVersionPublished({
    tenantRecord,
    version: targetVersion,
    actorId,
    role,
    releaseNote: toText(reason) || 'settings published',
  });

  tenantRecord.updatedAt = now();
  writeSettingsGovernanceRegistry(registry);

  const changedFields = buildChangedFields(
    previousPublishedVersion?.settingsSnapshot || null,
    targetVersion.settingsSnapshot || null,
  );
  const auditEntry = appendSettingsAuditEntry({
    tenantId: normalizedTenantId,
    action: 'settings.publish',
    actorId,
    role,
    traceId,
    changeTicket,
    targetVersionId: targetVersion.versionId,
    fromVersionId: previousPublishedVersion?.versionId || '',
    toVersionId: targetVersion.versionId,
    summary: `发布租户 ${normalizedTenantId} 配置版本 ${targetVersion.versionId}`,
    changedFields,
    metadata,
  });

  return {
    tenantId: normalizedTenantId,
    publishedVersion: toVersionSummary(targetVersion, true),
    previousPublishedVersion: previousPublishedVersion
      ? toVersionSummary(previousPublishedVersion, false)
      : null,
    pointers: cloneValue(tenantRecord.pointers),
    changedFields,
    auditEntry,
    releaseControl: tenantRecord.policies?.releaseControl || {},
  };
};

export const rollbackTenantSettingsVersion = ({
  tenantId = DEFAULT_TENANT_ID,
  targetVersionId = '',
  context = {},
  reason = '',
  metadata = {},
} = {}) => {
  const startedAtMs = Date.now();
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const actorId = toText(context.actor?.id) || 'settings-governance';
  const role = toText(context.actor?.role);
  const traceId = toText(context.traceId);
  const changeTicket = toText(context.changeTicket);
  const policies = context.policies || resolveGovernancePolicies(null);

  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = ensureTenantRecord({
    registry,
    tenantId: normalizedTenantId,
    policies,
  });

  if (tenantRecord.policies?.releaseControl?.allowRollback === false) {
    throw new Error(`tenant ${normalizedTenantId} rollback is disabled by governance policy`);
  }

  const releasedVersions = getReleasedVersionsDesc(tenantRecord);
  const currentPublishedVersion =
    findVersionById(tenantRecord, tenantRecord.pointers?.publishedVersionId) ||
    releasedVersions[0] ||
    null;
  const rollbackTarget = targetVersionId
    ? findVersionById(tenantRecord, targetVersionId)
    : releasedVersions.find((item) => item.versionId !== currentPublishedVersion?.versionId) || null;

  if (!rollbackTarget) {
    throw new Error(`tenant ${normalizedTenantId} has no previous published version for rollback`);
  }

  const { versionEntry, changedFields } = createVersionEntry({
    tenantRecord,
    tenantId: normalizedTenantId,
    sourceAction: 'rollback',
    versionStatus: 'published',
    parentVersionId: currentPublishedVersion?.versionId || tenantRecord.pointers?.activeVersionId || '',
    restoredFromVersionId: rollbackTarget.versionId,
    settingsSnapshot: rollbackTarget.settingsSnapshot || {},
    actorId,
    role,
    traceId,
    changeTicket,
    reason: toText(reason) || `rollback to ${rollbackTarget.versionId}`,
    metadata,
  });

  const { previousPublishedVersion } = markVersionPublished({
    tenantRecord,
    version: versionEntry,
    actorId,
    role,
    releaseNote: toText(reason) || `rollback to ${rollbackTarget.versionId}`,
  });

  tenantRecord.updatedAt = now();
  writeSettingsGovernanceRegistry(registry);

  const durationMs = Date.now() - startedAtMs;
  const rollbackSlaMs =
    Math.max(
      1,
      Number(
        tenantRecord.policies?.releaseControl?.rollbackSlaMinutes ||
          DEFAULT_ROLLBACK_SLA_MINUTES,
      ) || DEFAULT_ROLLBACK_SLA_MINUTES,
    ) * 60 * 1000;

  const auditEntry = appendSettingsAuditEntry({
    tenantId: normalizedTenantId,
    action: 'settings.rollback',
    actorId,
    role,
    traceId,
    changeTicket,
    targetVersionId: versionEntry.versionId,
    fromVersionId: currentPublishedVersion?.versionId || '',
    toVersionId: rollbackTarget.versionId,
    summary: `回滚租户 ${normalizedTenantId} 到版本 ${rollbackTarget.versionId}`,
    changedFields,
    metadata: {
      ...metadata,
      rollbackVersionId: versionEntry.versionId,
      restoredFromVersionId: rollbackTarget.versionId,
      replacedVersionId: currentPublishedVersion?.versionId || '',
      rollbackDurationMs: durationMs,
      rollbackSlaMs,
    },
  });

  return {
    tenantId: normalizedTenantId,
    rollbackVersion: toVersionSummary(versionEntry, true),
    restoredFromVersion: toVersionSummary(rollbackTarget, false),
    replacedVersion: currentPublishedVersion
      ? toVersionSummary(currentPublishedVersion, false)
      : previousPublishedVersion
        ? toVersionSummary(previousPublishedVersion, false)
        : null,
    pointers: cloneValue(tenantRecord.pointers),
    changedFields,
    rollbackDurationMs: durationMs,
    rollbackSlaMs,
    rollbackSlaMet: durationMs <= rollbackSlaMs,
    auditEntry,
    releaseControl: tenantRecord.policies?.releaseControl || {},
  };
};

export const getTenantActiveSettingsSnapshot = ({
  tenantId = DEFAULT_TENANT_ID,
  fallbackSettings = null,
  settings = null,
} = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const policies = resolveGovernancePolicies(settings);
  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = registry.tenants?.[normalizedTenantId];

  if (!tenantRecord) {
    return {
      tenantId: normalizedTenantId,
      source: 'fallback',
      settingsSnapshot: cloneValue(fallbackSettings) || null,
      activeVersion: null,
      pointers: {
        activeVersionId: '',
        publishedVersionId: '',
        previousPublishedVersionId: '',
      },
      releaseControl: policies.releaseControl,
    };
  }

  const activeVersion =
    findVersionById(tenantRecord, tenantRecord.pointers?.activeVersionId) ||
    findVersionById(tenantRecord, tenantRecord.pointers?.publishedVersionId) ||
    getLatestVersion(tenantRecord);

  if (!activeVersion) {
    return {
      tenantId: normalizedTenantId,
      source: 'fallback',
      settingsSnapshot: cloneValue(fallbackSettings) || null,
      activeVersion: null,
      pointers: cloneValue(tenantRecord.pointers),
      releaseControl: tenantRecord.policies?.releaseControl || policies.releaseControl,
    };
  }

  return {
    tenantId: normalizedTenantId,
    source: 'tenant-version',
    settingsSnapshot: cloneValue(activeVersion.settingsSnapshot) || {},
    activeVersion: toVersionSummary(activeVersion, false),
    pointers: cloneValue(tenantRecord.pointers),
    releaseControl: tenantRecord.policies?.releaseControl || policies.releaseControl,
  };
};

export const getSettingsGovernanceOverview = ({
  tenantId = DEFAULT_TENANT_ID,
  settings = null,
} = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const policies = resolveGovernancePolicies(settings);
  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = registry.tenants?.[normalizedTenantId] || null;

  return {
    contractVersion: SETTINGS_GOVERNANCE_OVERVIEW_CONTRACT,
    tenantId: normalizedTenantId,
    registryUpdatedAt: registry.updatedAt,
    tenant: buildTenantOverview(tenantRecord),
    tenantIsolation: policies.tenantIsolation,
  };
};

export const getSettingsGovernanceHistory = ({
  tenantId = DEFAULT_TENANT_ID,
  limit = 20,
  includeSnapshots = false,
  settings = null,
} = {}) => {
  const normalizedTenantId = toText(tenantId) || DEFAULT_TENANT_ID;
  const normalizedLimit = Math.max(1, Number(limit || 20) || 20);
  const policies = resolveGovernancePolicies(settings);
  const registry = readSettingsGovernanceRegistry(policies);
  const tenantRecord = registry.tenants?.[normalizedTenantId] || null;
  const versions = tenantRecord?.versions || [];

  const orderedVersions = [...versions]
    .sort(
      (leftItem, rightItem) => Number(rightItem.versionNumber || 0) - Number(leftItem.versionNumber || 0),
    )
    .slice(0, normalizedLimit)
    .map((item) => toVersionSummary(item, includeSnapshots));

  return {
    contractVersion: SETTINGS_GOVERNANCE_HISTORY_CONTRACT,
    tenantId: normalizedTenantId,
    itemCount: orderedVersions.length,
    versions: orderedVersions,
    audits: listSettingsAuditEntries({
      tenantId: normalizedTenantId,
      limit: normalizedLimit,
    }),
    pointers: tenantRecord?.pointers || {
      activeVersionId: '',
      publishedVersionId: '',
      previousPublishedVersionId: '',
    },
    releaseControl: tenantRecord?.policies?.releaseControl || policies.releaseControl,
  };
};
