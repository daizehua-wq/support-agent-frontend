import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SearchKeywordRule from './builtin/keyword-rule.js';
import SearchLlmRule from './builtin/llm-rule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const pluginConfigPath = path.join(projectRoot, 'config', 'plugins.json');

const BUILTIN_RULES = {
  'keyword-rule': SearchKeywordRule,
  'llm-rule': SearchLlmRule,
};

const DEFAULT_PLUGIN_CONFIG = {
  ruleEngine: {
    searchDocuments: {
      rules: [
        {
          id: 'keyword-rule',
          enabled: true,
        },
        {
          id: 'llm-rule',
          enabled: false,
        },
      ],
    },
  },
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeText = (value = '') => String(value || '').trim();

const uniqueBy = (items = [], getKey = (item) => item) => {
  const seen = new Set();

  return (items || []).filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const readPluginConfig = () => {
  if (!fs.existsSync(pluginConfigPath)) {
    return cloneValue(DEFAULT_PLUGIN_CONFIG);
  }

  try {
    const rawText = fs.readFileSync(pluginConfigPath, 'utf-8');
    if (!rawText.trim()) {
      return cloneValue(DEFAULT_PLUGIN_CONFIG);
    }

    return {
      ...cloneValue(DEFAULT_PLUGIN_CONFIG),
      ...(JSON.parse(rawText) || {}),
    };
  } catch (error) {
    console.warn('[search-rule-engine] failed to read plugins config, using defaults:', error.message);
    return cloneValue(DEFAULT_PLUGIN_CONFIG);
  }
};

const normalizeRuleEntries = (config = {}) => {
  const configuredRules = Array.isArray(config?.ruleEngine?.searchDocuments?.rules)
    ? config.ruleEngine.searchDocuments.rules
    : DEFAULT_PLUGIN_CONFIG.ruleEngine.searchDocuments.rules;

  return configuredRules
    .map((entry) => {
      if (typeof entry === 'string') {
        return {
          id: entry,
          enabled: true,
        };
      }

      if (!isPlainObject(entry)) {
        return null;
      }

      return {
        ...entry,
        id: normalizeText(entry.id),
        enabled: entry.enabled !== false,
      };
    })
    .filter((entry) => entry && entry.id);
};

const mergeSearchFragments = (fragments = []) => {
  const sortedFragments = [...fragments].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const matchedRules = uniqueBy(
    sortedFragments.flatMap((fragment) =>
      Array.isArray(fragment.matchedRules) ? fragment.matchedRules : [],
    ),
    (item) => item?.name || JSON.stringify(item),
  );
  const matchedProducts = uniqueBy(
    sortedFragments.flatMap((fragment) =>
      Array.isArray(fragment.matchedProducts) ? fragment.matchedProducts : [],
    ),
    (item) => item?.id || item?.productName || JSON.stringify(item),
  );
  const documents = uniqueBy(
    sortedFragments.flatMap((fragment) =>
      Array.isArray(fragment.documents) ? fragment.documents : [],
    ),
    (item) => item?.id || `${item?.productId || ''}:${item?.docName || ''}:${item?.docType || ''}`,
  );

  return {
    matchedRules,
    matchedRule:
      sortedFragments.find((fragment) => isPlainObject(fragment.matchedRule))?.matchedRule || null,
    matchedProducts,
    documents,
  };
};

export const loadSearchRules = ({ config = readPluginConfig() } = {}) => {
  return normalizeRuleEntries(config)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => {
      const RuleClass = BUILTIN_RULES[entry.id];

      if (!RuleClass) {
        console.warn(`[search-rule-engine] unknown rule "${entry.id}" skipped`);
        return null;
      }

      return new RuleClass(entry);
    })
    .filter(Boolean);
};

export const runSearchRuleEngine = async (context = {}, options = {}) => {
  const config = options.config || readPluginConfig();
  const rules = loadSearchRules({ config });
  const fragments = [];
  const executedRules = [];

  for (const rule of rules) {
    let matched = false;

    try {
      matched = await rule.match(context);
    } catch (error) {
      console.warn(`[search-rule-engine] rule "${rule.id}" match failed:`, error.message);
      executedRules.push({
        id: rule.id,
        matched: false,
        error: error.message,
      });
      continue;
    }

    if (!matched) {
      executedRules.push({
        id: rule.id,
        matched: false,
      });
      continue;
    }

    try {
      const fragment = await rule.execute(context);
      if (isPlainObject(fragment)) {
        fragments.push({
          ruleId: rule.id,
          ...cloneValue(fragment),
        });
      }
      executedRules.push({
        id: rule.id,
        matched: true,
      });
    } catch (error) {
      console.warn(`[search-rule-engine] rule "${rule.id}" execute failed:`, error.message);
      executedRules.push({
        id: rule.id,
        matched: true,
        error: error.message,
      });
    }
  }

  return {
    configPath: pluginConfigPath,
    enabledRules: rules.map((rule) => rule.id),
    executedRules,
    fragments,
    ...mergeSearchFragments(fragments),
  };
};

export const mergeSearchResultWithRuleEngine = ({
  searchResult = {},
  ruleEngineResult = null,
} = {}) => {
  if (!isPlainObject(searchResult) || !isPlainObject(ruleEngineResult)) {
    return searchResult;
  }

  const existingMatchedRules = Array.isArray(searchResult.matchedRules)
    ? searchResult.matchedRules
    : [];
  const existingMatchedProducts = Array.isArray(searchResult.matchedProducts)
    ? searchResult.matchedProducts
    : [];
  const existingDocumentSeeds = Array.isArray(searchResult.documentSeeds)
    ? searchResult.documentSeeds
    : [];

  return {
    ...cloneValue(searchResult),
    matchedRules:
      existingMatchedRules.length > 0 ? existingMatchedRules : ruleEngineResult.matchedRules || [],
    matchedRule: searchResult.matchedRule || ruleEngineResult.matchedRule || null,
    matchedProducts:
      existingMatchedProducts.length > 0
        ? existingMatchedProducts
        : ruleEngineResult.matchedProducts || [],
    documentSeeds:
      existingDocumentSeeds.length > 0 ? existingDocumentSeeds : ruleEngineResult.documents || [],
    searchRuleEngine: {
      configPath: ruleEngineResult.configPath,
      enabledRules: ruleEngineResult.enabledRules || [],
      executedRules: ruleEngineResult.executedRules || [],
      documentSeedCount: Array.isArray(ruleEngineResult.documents)
        ? ruleEngineResult.documents.length
        : 0,
    },
  };
};
