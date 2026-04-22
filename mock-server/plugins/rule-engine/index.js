import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import KeywordRule from './builtin/keyword-rule.js';
import LlmRule from './builtin/llm-rule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const pluginConfigPath = path.join(projectRoot, 'config', 'plugins.json');

const BUILTIN_RULES = {
  'keyword-rule': KeywordRule,
  'llm-rule': LlmRule,
};

const DEFAULT_PLUGIN_CONFIG = {
  ruleEngine: {
    analyzeContext: {
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
  toolRegistry: {
    tools: [],
  },
};

const ANALYZE_ARRAY_KEYS = [
  'recommendedProducts',
  'followupQuestions',
  'riskNotes',
  'nextActions',
];

const ANALYZE_SCALAR_KEYS = ['summary', 'sceneJudgement', 'nextStepType'];

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

const preferNonEmptyArray = (value) => {
  return Array.isArray(value) && value.length > 0 ? value : null;
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
    console.warn('[rule-engine] failed to read plugins config, using defaults:', error.message);
    return cloneValue(DEFAULT_PLUGIN_CONFIG);
  }
};

const normalizeRuleEntries = (config = {}) => {
  const configuredRules = Array.isArray(config?.ruleEngine?.analyzeContext?.rules)
    ? config.ruleEngine.analyzeContext.rules
    : DEFAULT_PLUGIN_CONFIG.ruleEngine.analyzeContext.rules;

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

const buildMergedAnalysis = (fragments = []) => {
  const mergedAnalysis = {};

  fragments.forEach((fragment) => {
    const analysis = isPlainObject(fragment.analysis) ? fragment.analysis : {};

    ANALYZE_SCALAR_KEYS.forEach((key) => {
      if (!normalizeText(mergedAnalysis[key]) && normalizeText(analysis[key])) {
        mergedAnalysis[key] = analysis[key];
      }
    });

    ANALYZE_ARRAY_KEYS.forEach((key) => {
      const nextItems = Array.isArray(analysis[key]) ? analysis[key] : [];
      if (nextItems.length === 0) {
        return;
      }

      mergedAnalysis[key] = uniqueBy([...(mergedAnalysis[key] || []), ...nextItems]);
    });
  });

  return mergedAnalysis;
};

const mergeRuleFragments = (fragments = []) => {
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
  const relatedDocumentNames = uniqueBy(
    sortedFragments.flatMap((fragment) =>
      Array.isArray(fragment.relatedDocumentNames) ? fragment.relatedDocumentNames : [],
    ),
  );

  return {
    matchedRules,
    matchedRule:
      sortedFragments.find((fragment) => isPlainObject(fragment.matchedRule))?.matchedRule || null,
    matchedProducts,
    matchedProduct:
      sortedFragments.find((fragment) => isPlainObject(fragment.matchedProduct))?.matchedProduct ||
      matchedProducts[0] ||
      null,
    relatedDocumentNames,
    analysis: buildMergedAnalysis(sortedFragments),
  };
};

const mergeAnalyzeData = (existingData = {}, ruleAnalysis = {}) => {
  const mergedData = {
    ...cloneValue(ruleAnalysis || {}),
    ...cloneValue(existingData || {}),
  };

  ANALYZE_SCALAR_KEYS.forEach((key) => {
    mergedData[key] = normalizeText(existingData?.[key]) || normalizeText(ruleAnalysis?.[key])
      ? existingData?.[key] || ruleAnalysis?.[key]
      : existingData?.[key] || ruleAnalysis?.[key];
  });

  ANALYZE_ARRAY_KEYS.forEach((key) => {
    mergedData[key] =
      preferNonEmptyArray(existingData?.[key]) ||
      preferNonEmptyArray(ruleAnalysis?.[key]) ||
      [];
  });

  return mergedData;
};

export const loadAnalyzeRules = ({ config = readPluginConfig() } = {}) => {
  return normalizeRuleEntries(config)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => {
      const RuleClass = BUILTIN_RULES[entry.id];

      if (!RuleClass) {
        console.warn(`[rule-engine] unknown rule "${entry.id}" skipped`);
        return null;
      }

      return new RuleClass(entry);
    })
    .filter(Boolean);
};

export const runAnalyzeRuleEngine = async (context = {}, options = {}) => {
  const config = options.config || readPluginConfig();
  const rules = loadAnalyzeRules({ config });
  const fragments = [];
  const executedRules = [];

  for (const rule of rules) {
    let matched = false;

    try {
      matched = await rule.match(context);
    } catch (error) {
      console.warn(`[rule-engine] rule "${rule.id}" match failed:`, error.message);
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
      console.warn(`[rule-engine] rule "${rule.id}" execute failed:`, error.message);
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
    ...mergeRuleFragments(fragments),
  };
};

export const mergeAnalyzeResultWithRuleEngine = ({
  analyzeResult = {},
  ruleEngineResult = null,
} = {}) => {
  if (!isPlainObject(analyzeResult) || !isPlainObject(ruleEngineResult)) {
    return analyzeResult;
  }

  const existingMatchedRules = Array.isArray(analyzeResult.matchedRules)
    ? analyzeResult.matchedRules
    : [];
  const existingMatchedProducts = Array.isArray(analyzeResult.matchedProducts)
    ? analyzeResult.matchedProducts
    : [];
  const existingRelatedDocumentNames = Array.isArray(analyzeResult.relatedDocumentNames)
    ? analyzeResult.relatedDocumentNames
    : [];

  return {
    ...cloneValue(analyzeResult),
    matchedRules:
      existingMatchedRules.length > 0 ? existingMatchedRules : ruleEngineResult.matchedRules || [],
    matchedRule:
      analyzeResult.matchedRule || ruleEngineResult.matchedRule || analyzeResult.matchedRule || null,
    matchedProducts:
      existingMatchedProducts.length > 0
        ? existingMatchedProducts
        : ruleEngineResult.matchedProducts || [],
    matchedProduct:
      analyzeResult.matchedProduct ||
      ruleEngineResult.matchedProduct ||
      existingMatchedProducts[0] ||
      null,
    relatedDocumentNames:
      existingRelatedDocumentNames.length > 0
        ? existingRelatedDocumentNames
        : ruleEngineResult.relatedDocumentNames || [],
    finalAnalyzeData: mergeAnalyzeData(analyzeResult.finalAnalyzeData || {}, ruleEngineResult.analysis || {}),
    ruleEngine: {
      configPath: ruleEngineResult.configPath,
      enabledRules: ruleEngineResult.enabledRules || [],
      executedRules: ruleEngineResult.executedRules || [],
    },
  };
};
