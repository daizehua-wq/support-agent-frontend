
import { readSettings, DEFAULT_SETTINGS } from './settingsService.js';
import {
  getAssistantById,
  getDefaultAssistantProfile as getGovernanceDefaultAssistantProfile,
  listAssistants,
} from './governanceRegistryService.js';

const normalizeToArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;
  return [value];
};

const getDefaultStrategies = () => ({
  analyzeStrategy: DEFAULT_SETTINGS.strategy.analyzeStrategy,
  searchStrategy: DEFAULT_SETTINGS.strategy.searchStrategy,
  scriptStrategy: DEFAULT_SETTINGS.strategy.scriptStrategy,
});

const getDefaultScopes = (industryType) => {
  const normalizedIndustryType = String(industryType || '').trim().toLowerCase();
  const seedScope =
    normalizedIndustryType && normalizedIndustryType !== 'other'
      ? [normalizedIndustryType]
      : [];

  return {
    rulesScope: seedScope,
    productScope: seedScope,
    docScope: seedScope,
  };
};

export const getAssistantProfiles = () => {
  return listAssistants();
};

export const getAssistantProfileById = (assistantId) => {
  return getAssistantById(assistantId);
};

export const getDefaultAssistantId = () =>
  DEFAULT_SETTINGS.assistant.activeAssistantId || getGovernanceDefaultAssistantProfile()?.id || '';


export const resolveAssistantProfile = (assistantId) => {
  const profiles = getAssistantProfiles();
  const enabledProfiles = profiles.filter((profile) => profile.enabled !== false);
  const fallbackAssistantId = getDefaultAssistantId();

  return (
    enabledProfiles.find((profile) => profile.id === assistantId) ||
    enabledProfiles.find((profile) => profile.id === fallbackAssistantId) ||
    getGovernanceDefaultAssistantProfile() ||
    null
  );
};

export const getResolvedAssistantProfile = (settings) => {
  const resolvedSettings = settings || readSettings();
  const activeAssistantId = resolvedSettings?.assistant?.activeAssistantId || getDefaultAssistantId();
  return resolveAssistantProfile(activeAssistantId);
};

export const buildExecutionContextFromProfile = (profile, settings = {}) => {
  if (!profile) {
    return {
      assistantId: getDefaultAssistantId(),
      rulesScope: [],
      productScope: [],
      docScope: [],
      analyzeStrategy: DEFAULT_SETTINGS.strategy.analyzeStrategy,
      searchStrategy: DEFAULT_SETTINGS.strategy.searchStrategy,
      scriptStrategy: DEFAULT_SETTINGS.strategy.scriptStrategy,
    };
  }

  const profileStrategies =
    profile.defaultStrategies && typeof profile.defaultStrategies === 'object'
      ? profile.defaultStrategies
      : getDefaultStrategies();
  const defaultScopes = getDefaultScopes(profile.industryType);
  const profileScopes =
    profile.dataScopes && typeof profile.dataScopes === 'object' ? profile.dataScopes : defaultScopes;
  const settingsStrategy = settings.strategy || {};

  return {
    assistantId: profile.id,
    rulesScope: normalizeToArray(profileScopes.rulesScope, defaultScopes.rulesScope),
    productScope: normalizeToArray(profileScopes.productScope, defaultScopes.productScope),
    docScope: normalizeToArray(profileScopes.docScope, defaultScopes.docScope),
    analyzeStrategy: profileStrategies.analyzeStrategy || settingsStrategy.analyzeStrategy || DEFAULT_SETTINGS.strategy.analyzeStrategy,
    searchStrategy: profileStrategies.searchStrategy || settingsStrategy.searchStrategy || DEFAULT_SETTINGS.strategy.searchStrategy,
    scriptStrategy: profileStrategies.scriptStrategy || settingsStrategy.scriptStrategy || DEFAULT_SETTINGS.strategy.scriptStrategy,
  };
};

export const getAssistantExecutionContext = (settings) => {
  const resolvedSettings = settings || readSettings();
  const activeAssistantId = resolvedSettings?.assistant?.activeAssistantId || getDefaultAssistantId();
  const profile = resolveAssistantProfile(activeAssistantId);
  const executionContext = buildExecutionContextFromProfile(profile, resolvedSettings);

  return {
    assistantId: executionContext.assistantId,
    assistantProfile: profile,
    executionContext,
    promptBindings: profile?.defaultModuleBindings || {},
  };
};

const matchesScope = (itemScope, targetScope) => {
  const normalizedItemScope = normalizeToArray(itemScope);
  const normalizedTargetScope = normalizeToArray(targetScope);

  if (normalizedTargetScope.length === 0) return true;
  if (normalizedItemScope.length === 0) return true;

  return normalizedItemScope.some((scope) => normalizedTargetScope.includes(scope));
};

export const filterRulesByScope = (rules = {}, rulesScope = []) => {
  const filteredRules = {};

  Object.entries(rules || {}).forEach(([groupKey, groupValue]) => {
    if (!Array.isArray(groupValue)) {
      filteredRules[groupKey] = groupValue;
      return;
    }

    filteredRules[groupKey] = groupValue.filter((rule) => {
      if (!rule || typeof rule !== 'object') return false;
      return matchesScope(rule.scope || rule.industryType, rulesScope);
    });
  });

  return filteredRules;
};

export const filterProductsByScope = (products = [], productScope = []) => {
  return (products || []).filter((product) => {
    if (!product || typeof product !== 'object') return false;
    return matchesScope(product.scope || product.industryTypes, productScope);
  });
};

export const filterDocsByScope = (docs = [], docScope = []) => {
  return (docs || []).filter((doc) => {
    if (!doc || typeof doc !== 'object') return false;
    return matchesScope(doc.scope || doc.industryType || doc.industryTypes, docScope);
  });
};
