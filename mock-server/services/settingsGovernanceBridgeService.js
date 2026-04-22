import {
  buildAssistantGovernanceDetail,
  listAssistantGovernanceItems,
  resolveActiveAssistantId,
} from './assistantGovernanceService.js';
import { buildDatabaseReference } from './databaseService.js';
import { listGovernanceAuditEntries } from './governanceAuditService.js';
import { getAssistantById, getPromptForAssistantModule } from './governanceRegistryService.js';

const toNonEmptyString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
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

export const syncAssistantGovernanceSettings = (settings = {}) => {
  const activeAssistantId = resolveActiveAssistantId(settings);
  const assistant = activeAssistantId ? getAssistantById(activeAssistantId) : null;
  const activeAnalyzePrompt = activeAssistantId
    ? getPromptForAssistantModule(activeAssistantId, 'analyze')
    : null;

  return {
    ...settings,
    assistant: {
      ...(settings.assistant || {}),
      activeAssistantId: activeAssistantId || null,
      assistantVersion: assistant ? String(assistant.version || 1) : settings.assistant?.assistantVersion || null,
      activePromptId: activeAnalyzePrompt?.id || null,
      promptVersion: activeAnalyzePrompt?.version || null,
      executionContext:
        settings.assistant?.executionContext === undefined
          ? null
          : settings.assistant.executionContext,
    },
  };
};

const buildDatabaseBindingSummary = (settings = {}) => {
  const activeDatabaseConfig =
    settings.database && typeof settings.database === 'object' ? settings.database : {};
  const databaseConfigs = Array.isArray(settings.databases) ? settings.databases : [];
  const activeDatabaseReference = buildDatabaseReference(activeDatabaseConfig);
  const matchedDatabase =
    databaseConfigs.find(
      (item) => buildDatabaseReference(item).databaseId === activeDatabaseReference.databaseId,
    ) || activeDatabaseConfig;
  const lightBindingSummary =
    matchedDatabase?.lightBindingSummary &&
    typeof matchedDatabase.lightBindingSummary === 'object' &&
    !Array.isArray(matchedDatabase.lightBindingSummary)
      ? matchedDatabase.lightBindingSummary
      : {};
  const visibleDatabases = normalizeStringArray(lightBindingSummary.visibleDatabases);

  return {
    activeDatabaseId: activeDatabaseReference.databaseId,
    databaseName:
      toNonEmptyString(matchedDatabase.databaseName) ||
      toNonEmptyString(activeDatabaseConfig.databaseName) ||
      activeDatabaseReference.databaseId,
    databaseType:
      toNonEmptyString(matchedDatabase.databaseType) ||
      toNonEmptyString(matchedDatabase.dbType) ||
      toNonEmptyString(activeDatabaseConfig.databaseType) ||
      toNonEmptyString(activeDatabaseConfig.dbType) ||
      'sqlite',
    relationSource:
      toNonEmptyString(lightBindingSummary.relationSource) ||
      toNonEmptyString(matchedDatabase.relationSource) ||
      toNonEmptyString(matchedDatabase.bindingSource) ||
      'settings.database.active-config',
    defaultAssociatedDatabase:
      toNonEmptyString(lightBindingSummary.defaultAssociatedDatabase) ||
      activeDatabaseReference.databaseId,
    visibleDatabases: visibleDatabases.length > 0 ? visibleDatabases : [activeDatabaseReference.databaseId],
    availableDatabaseCount: databaseConfigs.length > 0 ? databaseConfigs.length : 1,
  };
};

export const buildSettingsGovernanceSummary = (settings = {}) => {
  const syncedSettings = syncAssistantGovernanceSettings(settings);
  const activeAssistantId = resolveActiveAssistantId(syncedSettings);
  const activeAssistantDetail = activeAssistantId
    ? buildAssistantGovernanceDetail(activeAssistantId)
    : null;
  const activeAnalyzePrompt = activeAssistantId
    ? getPromptForAssistantModule(activeAssistantId, 'analyze')
    : null;

  return {
    assistantOptions: listAssistantGovernanceItems().map((item) => ({
      assistantId: item.assistantId,
      assistantName: item.assistantName,
      status: item.status,
      currentVersion: item.currentVersion,
      industryType: item.industryType || '',
      activeFlag: item.activeFlag === true,
    })),
    activeAssistantId,
    activeAssistantSummary: activeAssistantDetail
      ? {
          assistantId: activeAssistantDetail.assistantId,
          assistantName: activeAssistantDetail.assistantName,
          status: activeAssistantDetail.status,
          currentVersion: activeAssistantDetail.currentVersion,
          industryType: activeAssistantDetail.industryType || '',
          defaultModuleBindings: activeAssistantDetail.defaultModuleBindings || {},
          defaultStrategies: activeAssistantDetail.defaultStrategies || {},
          dataScopes: activeAssistantDetail.dataScopes || {},
          currentPublishedPrompt: activeAssistantDetail.currentPublishedPrompt || '',
          currentPublishedPromptVersion: activeAssistantDetail.currentPublishedPromptVersion || '',
          currentPublishedStrategy: activeAssistantDetail.currentPublishedStrategy || '',
        }
      : null,
    activeAnalyzePromptSummary: activeAnalyzePrompt
      ? {
          promptId: activeAnalyzePrompt.id,
          name: activeAnalyzePrompt.name,
          module: activeAnalyzePrompt.module,
          version: activeAnalyzePrompt.version,
          status: activeAnalyzePrompt.publishState || 'draft',
        }
      : null,
    databaseBindingSummary: buildDatabaseBindingSummary(syncedSettings),
    recentHistory: {
      assistant: activeAssistantId
        ? listGovernanceAuditEntries({
            entityType: 'assistant',
            targetId: activeAssistantId,
            limit: 6,
          })
        : [],
      analyzePrompt: activeAnalyzePrompt?.id
        ? listGovernanceAuditEntries({
            entityType: 'prompt',
            targetId: activeAnalyzePrompt.id,
            limit: 6,
          })
        : [],
    },
  };
};
