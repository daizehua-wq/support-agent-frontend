import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toLocalIso } from '../utils/localTime.js';
import { listGovernanceAuditEntries } from './governanceAuditService.js';
import { readSettings } from './settingsService.js';
import {
  GOVERNANCE_REGISTRY_MODULES,
  getAssistantById,
  getDefaultAssistantProfile,
  getPromptById,
  getPromptUsageSummary,
  listAssistants,
  listPrompts,
} from './governanceRegistryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const dataDir = path.join(projectRoot, 'data');

const STRATEGY_DEFINITIONS = {
  'api-model': {
    strategyId: 'api-model',
    strategyName: 'API 模型生成',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'api-enhanced': {
    strategyId: 'api-enhanced',
    strategyName: 'API Enhanced',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'external-enabled': {
    strategyId: 'external-enabled',
    strategyName: '公开资料补充',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'local-model': {
    strategyId: 'local-model',
    strategyName: '本地模型策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'local-only': {
    strategyId: 'local-only',
    strategyName: '仅本地策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'rules-only': {
    strategyId: 'rules-only',
    strategyName: '规则优先',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  'template-only': {
    strategyId: 'template-only',
    strategyName: '模板优先',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  pcb_docs_first: {
    strategyId: 'pcb_docs_first',
    strategyName: '仅本地策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  pcb_rules_first: {
    strategyId: 'pcb_rules_first',
    strategyName: '规则优先',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  pcb_solution_first: {
    strategyId: 'pcb_solution_first',
    strategyName: '本地模型策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  semiconductor_docs_first: {
    strategyId: 'semiconductor_docs_first',
    strategyName: '仅本地策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  semiconductor_rules_first: {
    strategyId: 'semiconductor_rules_first',
    strategyName: '规则优先',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
  semiconductor_solution_first: {
    strategyId: 'semiconductor_solution_first',
    strategyName: '本地模型策略',
    category: 'runtime-strategy',
    status: 'active',
    source: 'internal-strategy-definition',
  },
};

const toNonEmptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');

const getSourceFileUpdatedAt = (fileName = '') => {
  try {
    return toLocalIso(fs.statSync(path.join(dataDir, fileName)).mtime);
  } catch {
    return null;
  }
};

const getGovernanceSourceUpdatedAt = () => {
  const timestamps = [
    getSourceFileUpdatedAt('assistantProfiles.json'),
    getSourceFileUpdatedAt('promptRegistry.json'),
  ].filter(Boolean);

  return timestamps.length ? timestamps.sort().at(-1) || null : null;
};

const getStrategyDefinition = (strategyId = '') => {
  const normalizedStrategyId = toNonEmptyString(strategyId);
  const matchedDefinition = STRATEGY_DEFINITIONS[normalizedStrategyId];

  if (matchedDefinition) {
    return matchedDefinition;
  }

  return {
    strategyId: normalizedStrategyId,
    strategyName: normalizedStrategyId || '',
    category: 'runtime-strategy',
    status: normalizedStrategyId ? 'fallback' : 'unknown',
    source: 'strategy-definition-fallback',
  };
};

export const resolveActiveAssistantId = (settingsInput = null) => {
  const settings = settingsInput || readSettings();
  return (
    toNonEmptyString(settings.assistant?.activeAssistantId) ||
    toNonEmptyString(getDefaultAssistantProfile()?.id) ||
    ''
  );
};

const getTargetAssistant = (assistantId = '', settingsInput = null) => {
  const settings = settingsInput || readSettings();
  const activeAssistantId =
    toNonEmptyString(assistantId) ||
    resolveActiveAssistantId(settings);

  return (
    (activeAssistantId ? getAssistantById(activeAssistantId) : null) ||
    getDefaultAssistantProfile()
  );
};

const buildPromptStatus = (prompt = null) => {
  if (!prompt) {
    return 'missing';
  }

  return prompt.publishState || (prompt.enabled !== false ? 'published' : 'draft');
};

const buildModuleBindingItem = (assistant, moduleName, settings = {}) => {
  const promptId = assistant?.defaultModuleBindings?.[moduleName] || '';
  const prompt = promptId ? getPromptById(promptId) : null;
  const strategyKey = `${moduleName}Strategy`;
  const strategyId =
    toNonEmptyString(assistant?.defaultStrategies?.[strategyKey]) ||
    toNonEmptyString(settings.strategy?.[strategyKey]) ||
    '';
  const strategyDefinition = getStrategyDefinition(strategyId);

  return {
    moduleName,
    promptId,
    promptName: prompt?.name || '',
    promptVersion: prompt?.version || '',
    promptStatus: buildPromptStatus(prompt),
    strategyId,
    strategyName: strategyDefinition.strategyName,
    strategyDefinitionSource: strategyDefinition.source,
    strategyDefinitionStatus: strategyDefinition.status,
    bindingStatus: promptId ? 'mounted' : 'unbound',
    definitionSource: promptId
      ? 'assistantProfiles.defaultModuleBindings + promptRegistry.version'
      : 'assistantProfiles.defaultModuleBindings',
    strategySource: strategyDefinition.source,
    isDefaultMounted: Boolean(promptId),
    isExplicitBinding: Boolean(promptId),
  };
};

const buildModuleBindings = (assistant, settings = {}) =>
  GOVERNANCE_REGISTRY_MODULES.reduce((result, moduleName) => {
    result[moduleName] = buildModuleBindingItem(assistant, moduleName, settings);
    return result;
  }, {});

const pickPrimaryModuleBinding = (moduleBindings = {}) => {
  for (const moduleName of GOVERNANCE_REGISTRY_MODULES) {
    const binding = moduleBindings[moduleName];
    if (binding?.promptId || binding?.strategyId) {
      return binding;
    }
  }

  return {
    moduleName: '',
    promptId: '',
    promptName: '',
    promptVersion: '',
    promptStatus: 'missing',
    strategyId: '',
    strategyName: '',
  };
};

const buildPublishRecord = (assistant, primaryBinding) => ({
  publishSource: 'governance-registry',
  publishStatus: assistant?.publishState || 'draft',
  recordType: 'registry-governed',
  sourceVersion: primaryBinding?.promptVersion || null,
  sourceUpdatedAt: getGovernanceSourceUpdatedAt(),
  publishedAt: assistant?.publishedAt || null,
  publishedBy: 'assistant-center',
  note: '当前发布记录来自 Assistant / Prompt 治理注册表。',
  isConfigDerived: false,
});

const buildAssistantSummary = (assistant, settings = {}) => {
  const moduleBindings = buildModuleBindings(assistant, settings);
  const primaryBinding = pickPrimaryModuleBinding(moduleBindings);
  const isActiveAssistant =
    resolveActiveAssistantId(settings) === toNonEmptyString(assistant?.id);

  return {
    assistantId: assistant?.id || '',
    assistantName: assistant?.assistantName || assistant?.name || '',
    description: assistant?.description || '',
    status: assistant?.publishState || 'draft',
    currentVersion: String(assistant?.version || 1),
    updatedAt: assistant?.updatedAt || null,
    updatedBy: 'assistant-center',
    industryType: assistant?.industryType || 'other',
    templateOrigin: assistant?.templateOrigin || 'custom',
    templateCategory: assistant?.templateCategory || 'role-template',
    templateRole: assistant?.templateRole || '',
    activeFlag: isActiveAssistant,
    defaultTaskContext:
      assistant?.defaultTaskContext || assistant?.defaultCustomerType || '',
    defaultSubjectHint:
      assistant?.defaultSubjectHint || assistant?.defaultProductDirection || '',
    defaultVariables: assistant?.defaultVariables || {},
    variableSchema: assistant?.variableSchema || [],
    defaultCustomerType: assistant?.defaultCustomerType || '',
    defaultProductDirection: assistant?.defaultProductDirection || '',
    dataScopes: assistant?.dataScopes || {
      rulesScope: [],
      productScope: [],
      docScope: [],
    },
    defaultStrategies: assistant?.defaultStrategies || {
      analyzeStrategy: '',
      searchStrategy: '',
      scriptStrategy: '',
    },
    defaultModuleBindings: assistant?.defaultModuleBindings || {
      analyze: '',
      search: '',
      script: '',
    },
    currentPublishedAssistant: assistant?.assistantName || assistant?.name || '',
    currentPublishedPrompt: primaryBinding?.promptName || '',
    currentPublishedPromptVersion: primaryBinding?.promptVersion || '',
    currentPublishedStrategy: primaryBinding?.strategyName || '',
    publishRecord: buildPublishRecord(assistant, primaryBinding),
    moduleBindings,
    governanceDefinition: {
      assistantId: assistant?.id || '',
      assistantVersion: String(assistant?.version || 1),
      promptId: primaryBinding?.promptId || '',
      promptVersion: primaryBinding?.promptVersion || '',
      strategyId: primaryBinding?.strategyId || '',
      strategyName: primaryBinding?.strategyName || '',
      definitionSource: 'governance-registry',
      definitionStatus: assistant?.publishState || 'draft',
      analyzeStrategy: assistant?.defaultStrategies?.analyzeStrategy || '',
      searchStrategy: assistant?.defaultStrategies?.searchStrategy || '',
      scriptStrategy: assistant?.defaultStrategies?.scriptStrategy || '',
    },
  };
};

const buildDefinitionRecord = ({
  definitionSource = 'governance-registry',
  definitionStatus = 'draft',
  sourceVersion = null,
} = {}) => ({
  definitionSource,
  definitionStatus,
  sourceVersion,
  sourceUpdatedAt: getGovernanceSourceUpdatedAt(),
  isConfigDerived: false,
});

export const listAssistantGovernanceItems = () => {
  const settings = readSettings();
  return listAssistants().map((assistant) => buildAssistantSummary(assistant, settings));
};

export const buildAssistantGovernanceDetail = (assistantId = '') => {
  const settings = readSettings();
  const assistant = getTargetAssistant(assistantId, settings);

  if (!assistant) {
    return null;
  }

  const summary = buildAssistantSummary(assistant, settings);
  const moduleBindings = buildModuleBindings(assistant, settings);
  const primaryBinding = pickPrimaryModuleBinding(moduleBindings);
  const primaryPrompt = primaryBinding.promptId ? getPromptById(primaryBinding.promptId) : null;
  const primaryStrategyDefinition = getStrategyDefinition(primaryBinding.strategyId);

  return {
    ...summary,
    currentPublishedSummary: getCurrentPublishedAssistantSummary(assistant.id),
    moduleBindingsSummary: getCurrentModuleBindingsSummary(assistant.id),
    governanceDefinitionSummary: getGovernanceDefinitionSummary(assistant.id),
    history: listGovernanceAuditEntries({
      entityType: 'assistant',
      targetId: assistant.id,
      limit: 12,
    }),
    availableModules: GOVERNANCE_REGISTRY_MODULES,
    promptOptionsSummary: listPrompts().map((prompt) => ({
      promptId: prompt.id,
      promptName: prompt.name,
      module: prompt.module,
      version: prompt.version,
      status: prompt.publishState,
    })),
    trace: {
      resolvedChain: ['assistant', 'prompt', 'strategy'],
      primaryPrompt: primaryPrompt
        ? {
            promptId: primaryPrompt.id,
            promptName: primaryPrompt.name,
            module: primaryPrompt.module,
            promptVersion: primaryPrompt.version,
          }
        : null,
      primaryStrategy: primaryStrategyDefinition,
    },
  };
};

export const listPromptGovernanceItems = () =>
  listPrompts().map((prompt) => {
    const usageSummary = getPromptUsageSummary(prompt.id);

    return {
      promptId: prompt.id,
      name: prompt.name,
      module: prompt.module,
      version: prompt.version,
      recordVersion: prompt.recordVersion,
      status: prompt.publishState,
      updatedAt: prompt.updatedAt || null,
      description: prompt.description || '',
      contentPreview: prompt.content.slice(0, 120),
      assistantCount: usageSummary.assistantCount,
      usedBy: usageSummary.usedBy,
      industryType: prompt.industryType || '',
      enabled: prompt.enabled !== false,
    };
  });

export const buildPromptGovernanceDetail = (promptId = '') => {
  const prompt = getPromptById(promptId);
  if (!prompt) {
    return null;
  }

  const usageSummary = getPromptUsageSummary(prompt.id);

  return {
    promptId: prompt.id,
    name: prompt.name,
    module: prompt.module,
    version: prompt.version,
    recordVersion: prompt.recordVersion,
    status: prompt.publishState,
    updatedAt: prompt.updatedAt || null,
    publishedAt: prompt.publishedAt || null,
    description: prompt.description || '',
    content: prompt.content || '',
    industryType: prompt.industryType || '',
    assistantId: prompt.assistantId || '',
    enabled: prompt.enabled !== false,
    tags: prompt.tags || [],
    usageSummary,
    history: listGovernanceAuditEntries({
      entityType: 'prompt',
      targetId: prompt.id,
      limit: 12,
    }),
  };
};

export const getCurrentPublishedAssistantSummary = (assistantId = '') => {
  const settings = readSettings();
  const assistant = getTargetAssistant(assistantId, settings);
  const moduleBindings = buildModuleBindings(assistant, settings);
  const primaryBinding = pickPrimaryModuleBinding(moduleBindings);
  const primaryStrategyDefinition = getStrategyDefinition(primaryBinding.strategyId);

  return {
    currentPublishedAssistant: {
      assistantId: assistant?.id || '',
      assistantName: assistant?.assistantName || assistant?.name || '',
      assistantVersion: String(assistant?.version || 1),
      definitionSource: 'assistantProfiles',
      definitionStatus: assistant?.publishState || 'draft',
    },
    currentPublishedPrompt: {
      promptId: primaryBinding.promptId || '',
      promptName: primaryBinding.promptName || '',
      definitionSource: 'promptRegistry',
      definitionStatus: primaryBinding.promptStatus || 'missing',
    },
    currentPublishedPromptVersion: {
      promptVersion: primaryBinding.promptVersion || '',
      versionLabel: primaryBinding.promptVersion || '',
      isLatest: Boolean(primaryBinding.promptVersion),
      sourceVersion: primaryBinding.promptVersion || null,
      sourceUpdatedAt: getGovernanceSourceUpdatedAt(),
    },
    currentPublishedStrategy: {
      strategyId: primaryStrategyDefinition.strategyId,
      strategyName: primaryStrategyDefinition.strategyName,
      strategyCategory: primaryStrategyDefinition.category,
      strategyStatus: primaryStrategyDefinition.status,
      definitionSource: primaryStrategyDefinition.source,
      definitionStatus: assistant?.publishState || 'draft',
    },
    publishRecord: buildPublishRecord(assistant, primaryBinding),
  };
};

export const getCurrentModuleBindingsSummary = (assistantId = '') => {
  const settings = readSettings();
  const assistant = getTargetAssistant(assistantId, settings);
  const currentModuleBindings = buildModuleBindings(assistant, settings);

  return {
    currentModuleBindings,
    bindingSource: 'governance-registry',
    bindingStatus: assistant?.publishState || 'draft',
    bindingRecord: buildDefinitionRecord({
      definitionSource: 'governance-registry',
      definitionStatus: assistant?.publishState || 'draft',
      sourceVersion: pickPrimaryModuleBinding(currentModuleBindings).promptVersion || null,
    }),
  };
};

export const getGovernanceDefinitionSummary = (assistantId = '') => {
  const settings = readSettings();
  const assistant = getTargetAssistant(assistantId, settings);
  const currentModuleBindings = buildModuleBindings(assistant, settings);
  const primaryBinding = pickPrimaryModuleBinding(currentModuleBindings);
  const primaryStrategyDefinition = getStrategyDefinition(primaryBinding.strategyId);

  return {
    assistantDefinition: {
      assistantId: assistant?.id || '',
      assistantName: assistant?.assistantName || assistant?.name || '',
      industryType: assistant?.industryType || '',
      templateOrigin: assistant?.templateOrigin || 'custom',
      templateCategory: assistant?.templateCategory || 'role-template',
      templateRole: assistant?.templateRole || '',
      description: assistant?.description || '',
      defaultVariables: assistant?.defaultVariables || {},
      variableSchema: assistant?.variableSchema || [],
      definitionSource: 'assistantProfiles',
      definitionStatus: assistant?.publishState || 'draft',
    },
    promptDefinition: {
      promptId: primaryBinding.promptId || '',
      promptName: primaryBinding.promptName || '',
      promptVersion: primaryBinding.promptVersion || '',
      definitionSource: 'promptRegistry',
      definitionStatus: primaryBinding.promptStatus || 'missing',
    },
    strategyDefinition: {
      strategyId: primaryStrategyDefinition.strategyId,
      strategyName: primaryStrategyDefinition.strategyName,
      strategyCategory: primaryStrategyDefinition.category,
      strategyStatus: primaryStrategyDefinition.status,
      analyzeStrategy: assistant?.defaultStrategies?.analyzeStrategy || '',
      searchStrategy: assistant?.defaultStrategies?.searchStrategy || '',
      scriptStrategy: assistant?.defaultStrategies?.scriptStrategy || '',
      definitionSource: primaryStrategyDefinition.source,
      definitionStatus: assistant?.publishState || 'draft',
    },
    moduleBindingDefinition: {
      analyze: currentModuleBindings.analyze,
      search: currentModuleBindings.search,
      script: currentModuleBindings.script,
      definitionRecord: buildDefinitionRecord({
        definitionSource: 'governance-registry',
        definitionStatus: assistant?.publishState || 'draft',
        sourceVersion: primaryBinding.promptVersion || null,
      }),
    },
    definitionSource: 'governance-registry',
    definitionStatus: assistant?.publishState || 'draft',
    governanceRecord: buildDefinitionRecord({
      definitionSource: 'governance-registry',
      definitionStatus: assistant?.publishState || 'draft',
      sourceVersion: primaryBinding.promptVersion || null,
    }),
  };
};
