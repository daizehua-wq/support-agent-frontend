import { readJsonFile, writeJsonFile } from './jsonDataService.js';

const ASSISTANT_REGISTRY_FILE = 'assistantProfiles.json';
const PROMPT_REGISTRY_FILE = 'promptRegistry.json';
const GOVERNANCE_MODULES = ['analyze', 'search', 'script'];
const LEGACY_STRATEGY_ALIASES = {
  pcb_rules_first: 'rules-only',
  semiconductor_rules_first: 'rules-only',
  pcb_docs_first: 'local-only',
  semiconductor_docs_first: 'local-only',
  pcb_solution_first: 'local-model',
  semiconductor_solution_first: 'local-model',
};

const now = () => new Date().toISOString();

const toNonEmptyString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const toOptionalString = (value) => {
  const normalizedValue = toNonEmptyString(value);
  return normalizedValue || undefined;
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

const toPositiveInteger = (value, fallbackValue = 1) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackValue;
  }

  return Math.floor(numericValue);
};

const normalizePublishState = (value, fallbackValue = 'draft') => {
  const normalizedValue = toNonEmptyString(value).toLowerCase();

  if (normalizedValue === 'active') return 'published';
  if (normalizedValue === 'published') return 'published';
  if (normalizedValue === 'draft') return 'draft';
  if (normalizedValue === 'archived') return 'archived';

  return fallbackValue;
};

const normalizeModuleName = (value) => {
  const normalizedValue = toNonEmptyString(value).toLowerCase();
  return GOVERNANCE_MODULES.includes(normalizedValue) ? normalizedValue : '';
};

const normalizeModuleBindings = (value = {}) =>
  GOVERNANCE_MODULES.reduce((result, moduleName) => {
    result[moduleName] = toNonEmptyString(value?.[moduleName]);
    return result;
  }, {});

const normalizeStrategyId = (value) => {
  const normalizedValue = toNonEmptyString(value);
  return LEGACY_STRATEGY_ALIASES[normalizedValue] || normalizedValue;
};

const normalizeStrategyMap = (value = {}) => ({
  analyzeStrategy: normalizeStrategyId(value?.analyzeStrategy),
  searchStrategy: normalizeStrategyId(value?.searchStrategy),
  scriptStrategy: normalizeStrategyId(value?.scriptStrategy),
});

const normalizeIndustryType = (value) => {
  const normalizedValue = toNonEmptyString(value).toLowerCase();
  return normalizedValue || 'other';
};

const normalizeTemplateOrigin = (value) => {
  const normalizedValue = toNonEmptyString(value).toLowerCase();
  return normalizedValue === 'builtin' ? 'builtin' : 'custom';
};

const normalizeTemplateCategory = (value) => {
  const normalizedValue = toNonEmptyString(value);
  return normalizedValue || 'role-template';
};

const normalizeScopeMap = (value = {}) => ({
  rulesScope: normalizeStringArray(value?.rulesScope),
  productScope: normalizeStringArray(value?.productScope),
  docScope: normalizeStringArray(value?.docScope),
});

const normalizeVariableDefaults = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [toNonEmptyString(key), toNonEmptyString(entryValue)])
      .filter(([key, entryValue]) => Boolean(key) && Boolean(entryValue)),
  );
};

const normalizeVariableSchema = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      return {
        key: toNonEmptyString(item.key),
        label: toNonEmptyString(item.label),
        description: toNonEmptyString(item.description),
        required: item.required === true,
        defaultValue: toNonEmptyString(item.defaultValue),
        example: toNonEmptyString(item.example),
      };
    })
    .filter((item) => item?.key);
};

const buildSlug = (value = '', prefix = 'item') => {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue || prefix;
};

const ensureUniqueId = (candidateId = '', existingIds = [], prefix = 'item') => {
  const usedIds = new Set(existingIds.filter(Boolean));
  const baseId = buildSlug(candidateId, prefix);

  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
};

const buildPromptVersionLabel = (value) => {
  const normalizedValue = toNonEmptyString(value);
  return normalizedValue || 'v1';
};

const sortByUpdatedAtDesc = (items = [], fieldName = 'updatedAt') =>
  [...items].sort((leftItem, rightItem) => {
    const leftValue = Date.parse(leftItem?.[fieldName] || '') || 0;
    const rightValue = Date.parse(rightItem?.[fieldName] || '') || 0;
    return rightValue - leftValue;
  });

const normalizeAssistantRecord = (record = {}, index = 0) => {
  const assistantId =
    toNonEmptyString(record.id) ||
    toNonEmptyString(record.assistantId) ||
    `assistant-${index + 1}`;
  const publishState = normalizePublishState(
    record.publishState || record.status,
    record.enabled === false ? 'archived' : 'published',
  );
  const updatedAt =
    toOptionalString(record.updatedAt) ||
    toOptionalString(record.modifiedAt) ||
    toOptionalString(record.publishedAt) ||
    null;

  return {
    id: assistantId,
    assistantId,
    name:
      toNonEmptyString(record.name) ||
      toNonEmptyString(record.assistantName) ||
      assistantId,
    assistantName:
      toNonEmptyString(record.assistantName) ||
      toNonEmptyString(record.name) ||
      assistantId,
    description: toNonEmptyString(record.description),
    industryType: normalizeIndustryType(record.industryType),
    templateOrigin: normalizeTemplateOrigin(record.templateOrigin),
    templateCategory: normalizeTemplateCategory(record.templateCategory),
    templateRole: toNonEmptyString(record.templateRole),
    enabled: record.enabled !== false && publishState !== 'archived',
    publishState,
    version: toPositiveInteger(record.version, 1),
    updatedAt,
    modifiedAt: updatedAt,
    publishedAt:
      toOptionalString(record.publishedAt) ||
      (publishState === 'published' ? updatedAt : null),
    defaultTaskContext:
      toNonEmptyString(record.defaultTaskContext) ||
      toNonEmptyString(record.defaultCustomerType),
    defaultSubjectHint:
      toNonEmptyString(record.defaultSubjectHint) ||
      toNonEmptyString(record.defaultProductDirection),
    defaultVariables: normalizeVariableDefaults(record.defaultVariables || {}),
    variableSchema: normalizeVariableSchema(record.variableSchema || []),
    defaultCustomerType: toNonEmptyString(record.defaultCustomerType),
    defaultProductDirection: toNonEmptyString(record.defaultProductDirection),
    defaultModuleBindings: normalizeModuleBindings(record.defaultModuleBindings || {}),
    defaultStrategies: normalizeStrategyMap(record.defaultStrategies || {}),
    dataScopes: normalizeScopeMap(record.dataScopes || {}),
    tags: normalizeStringArray(record.tags),
    scenes: normalizeStringArray(record.scenes),
  };
};

const normalizePromptRecord = (record = {}, index = 0) => {
  const promptId =
    toNonEmptyString(record.id) ||
    toNonEmptyString(record.promptId) ||
    `prompt-${index + 1}`;
  const publishState = normalizePublishState(
    record.publishState || record.status,
    record.enabled === false ? 'archived' : 'published',
  );
  const updatedAt =
    toOptionalString(record.updatedAt) ||
    toOptionalString(record.modifiedAt) ||
    toOptionalString(record.publishedAt) ||
    null;

  return {
    id: promptId,
    promptId,
    name:
      toNonEmptyString(record.name) ||
      toNonEmptyString(record.promptName) ||
      promptId,
    promptName:
      toNonEmptyString(record.promptName) ||
      toNonEmptyString(record.name) ||
      promptId,
    module: normalizeModuleName(record.module) || 'analyze',
    description: toNonEmptyString(record.description),
    version: buildPromptVersionLabel(record.version),
    recordVersion: toPositiveInteger(record.recordVersion, 1),
    publishState,
    enabled: record.enabled !== false && publishState !== 'archived',
    updatedAt,
    modifiedAt: updatedAt,
    publishedAt:
      toOptionalString(record.publishedAt) ||
      (publishState === 'published' ? updatedAt : null),
    content: typeof record.content === 'string' ? record.content : '',
    industryType: normalizeIndustryType(record.industryType),
    assistantId: toNonEmptyString(record.assistantId),
    tags: normalizeStringArray(record.tags),
  };
};

const writeAssistantRegistry = (assistants = []) => {
  writeJsonFile(ASSISTANT_REGISTRY_FILE, assistants);
  return assistants;
};

const writePromptRegistry = (prompts = []) => {
  writeJsonFile(PROMPT_REGISTRY_FILE, prompts);
  return prompts;
};

export const listAssistants = () =>
  sortByUpdatedAtDesc(
    readJsonFile(ASSISTANT_REGISTRY_FILE, []).map((item, index) =>
      normalizeAssistantRecord(item, index),
    ),
  );

export const listPrompts = () =>
  sortByUpdatedAtDesc(
    readJsonFile(PROMPT_REGISTRY_FILE, []).map((item, index) =>
      normalizePromptRecord(item, index),
    ),
  );

export const getAssistantById = (assistantId = '') => {
  const normalizedAssistantId = toNonEmptyString(assistantId);
  return listAssistants().find((item) => item.id === normalizedAssistantId) || null;
};

export const getPromptById = (promptId = '') => {
  const normalizedPromptId = toNonEmptyString(promptId);
  return listPrompts().find((item) => item.id === normalizedPromptId) || null;
};

export const getEnabledAssistants = () => listAssistants().filter((item) => item.enabled !== false);

export const getEnabledPrompts = () => listPrompts().filter((item) => item.enabled !== false);

export const getDefaultAssistantProfile = () => getEnabledAssistants()[0] || listAssistants()[0] || null;

export const getPromptsByModule = (moduleName = '') => {
  const normalizedModuleName = normalizeModuleName(moduleName);
  return getEnabledPrompts().filter((item) => item.module === normalizedModuleName);
};

export const getPromptsByAssistant = (assistantId = '') => {
  const normalizedAssistantId = toNonEmptyString(assistantId);
  return getEnabledPrompts().filter((item) => {
    if (!normalizedAssistantId) return true;
    return !item.assistantId || item.assistantId === normalizedAssistantId;
  });
};

export const getPromptForAssistantModule = (assistantId = '', moduleName = '') => {
  const normalizedModuleName = normalizeModuleName(moduleName);
  if (!normalizedModuleName) {
    return null;
  }

  const assistant = assistantId
    ? getAssistantById(assistantId) || getDefaultAssistantProfile()
    : getDefaultAssistantProfile();
  const promptId = assistant?.defaultModuleBindings?.[normalizedModuleName] || '';
  const prompt = promptId ? getPromptById(promptId) : null;

  if (prompt && prompt.enabled !== false) {
    return prompt;
  }

  const modulePrompts = getPromptsByModule(normalizedModuleName);

  if (assistant?.industryType) {
    const industryPrompt = modulePrompts.find(
      (item) => item.industryType && item.industryType === assistant.industryType,
    );
    if (industryPrompt) {
      return industryPrompt;
    }
  }

  return (
    modulePrompts.find((item) => item.publishState === 'published') ||
    modulePrompts[0] ||
    null
  );
};

export const getAssistantPromptBindings = (assistantId = '') => {
  const assistant = assistantId ? getAssistantById(assistantId) : getDefaultAssistantProfile();
  return normalizeModuleBindings(assistant?.defaultModuleBindings || {});
};

export const getPromptUsageSummary = (promptId = '') => {
  const normalizedPromptId = toNonEmptyString(promptId);
  const assistants = listAssistants();
  const usedBy = assistants
    .filter((assistant) =>
      GOVERNANCE_MODULES.some(
        (moduleName) => assistant.defaultModuleBindings?.[moduleName] === normalizedPromptId,
      ),
    )
    .map((assistant) => ({
      assistantId: assistant.id,
      assistantName: assistant.assistantName,
      modules: GOVERNANCE_MODULES.filter(
        (moduleName) => assistant.defaultModuleBindings?.[moduleName] === normalizedPromptId,
      ),
    }));

  return {
    assistantCount: usedBy.length,
    usedBy,
  };
};

export const createAssistantProfile = (draft = {}) => {
  const assistants = listAssistants();
  const assistantId = ensureUniqueId(
    draft.assistantId || draft.id || draft.assistantName,
    assistants.map((item) => item.id),
    'assistant',
  );
  const timestamp = now();
  const assistant = normalizeAssistantRecord(
    {
      ...draft,
      id: assistantId,
      assistantId,
      updatedAt: timestamp,
      modifiedAt: timestamp,
      version: 1,
      publishState: draft.publishState || 'draft',
    },
    assistants.length,
  );

  writeAssistantRegistry([assistant, ...assistants]);
  return assistant;
};

export const updateAssistantProfile = (assistantId = '', patch = {}) => {
  const assistants = listAssistants();
  const normalizedAssistantId = toNonEmptyString(assistantId);
  const index = assistants.findIndex((item) => item.id === normalizedAssistantId);

  if (index < 0) {
    return null;
  }

  const currentAssistant = assistants[index];
  const timestamp = now();
  const nextAssistant = normalizeAssistantRecord({
    ...currentAssistant,
    ...patch,
    id: normalizedAssistantId,
    assistantId: normalizedAssistantId,
    version:
      patch.version === undefined
        ? currentAssistant.version + 1
        : toPositiveInteger(patch.version, currentAssistant.version + 1),
    updatedAt: timestamp,
    modifiedAt: timestamp,
  });

  assistants[index] = nextAssistant;
  writeAssistantRegistry(assistants);
  return nextAssistant;
};

export const removeAssistantProfile = (assistantId = '') => {
  const assistants = listAssistants();
  const normalizedAssistantId = toNonEmptyString(assistantId);
  const nextAssistants = assistants.filter((item) => item.id !== normalizedAssistantId);

  if (nextAssistants.length === assistants.length) {
    return false;
  }

  writeAssistantRegistry(nextAssistants);
  return true;
};

export const publishAssistantProfile = (assistantId = '') =>
  updateAssistantProfile(assistantId, {
    publishState: 'published',
    publishedAt: now(),
  });

export const createPromptRecord = (draft = {}) => {
  const prompts = listPrompts();
  const promptId = ensureUniqueId(
    draft.promptId || draft.id || draft.name,
    prompts.map((item) => item.id),
    'prompt',
  );
  const timestamp = now();
  const prompt = normalizePromptRecord(
    {
      ...draft,
      id: promptId,
      promptId,
      updatedAt: timestamp,
      modifiedAt: timestamp,
      recordVersion: 1,
      publishState: draft.publishState || 'draft',
    },
    prompts.length,
  );

  writePromptRegistry([prompt, ...prompts]);
  return prompt;
};

export const updatePromptRecord = (promptId = '', patch = {}) => {
  const prompts = listPrompts();
  const normalizedPromptId = toNonEmptyString(promptId);
  const index = prompts.findIndex((item) => item.id === normalizedPromptId);

  if (index < 0) {
    return null;
  }

  const currentPrompt = prompts[index];
  const timestamp = now();
  const nextPrompt = normalizePromptRecord({
    ...currentPrompt,
    ...patch,
    id: normalizedPromptId,
    promptId: normalizedPromptId,
    recordVersion:
      patch.recordVersion === undefined
        ? currentPrompt.recordVersion + 1
        : toPositiveInteger(patch.recordVersion, currentPrompt.recordVersion + 1),
    updatedAt: timestamp,
    modifiedAt: timestamp,
  });

  prompts[index] = nextPrompt;
  writePromptRegistry(prompts);
  return nextPrompt;
};

export const removePromptRecord = (promptId = '') => {
  const prompts = listPrompts();
  const normalizedPromptId = toNonEmptyString(promptId);
  const nextPrompts = prompts.filter((item) => item.id !== normalizedPromptId);

  if (nextPrompts.length === prompts.length) {
    return false;
  }

  writePromptRegistry(nextPrompts);
  return true;
};

export const publishPromptRecord = (promptId = '') =>
  updatePromptRecord(promptId, {
    publishState: 'published',
    publishedAt: now(),
  });

export const GOVERNANCE_REGISTRY_MODULES = GOVERNANCE_MODULES;
