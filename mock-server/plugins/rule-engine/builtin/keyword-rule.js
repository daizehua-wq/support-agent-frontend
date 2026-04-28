import Rule from '../base-rule.js';
import { matchRules } from '../../../data/models/knowledgeRule.js';
import { searchResources } from '../../../data/models/knowledgeResource.js';
import {
  filterProductsByScope,
  filterRulesByScope,
} from '../../../services/assistantContextService.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (...values) =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

const buildBaseAnalyzeFragment = ({ matchedRule = null, matchedProducts = [] } = {}) => {
  return {
    summary: matchedRule?.summaryTemplate || '暂未命中明确规则，建议继续确认客户核心关注点。',
    sceneJudgement: matchedRule?.sceneJudgement || '当前场景仍需进一步确认。',
    recommendedProducts: matchedProducts.map((item) => item.productName),
    followupQuestions: matchedRule?.followupQuestions || [],
    riskNotes: matchedRule?.riskNotes || [],
    nextActions: matchedRule?.nextActions || [],
  };
};

const buildLegacyRule = (rule = {}) => {
  if (rule.legacyRule) {
    return rule.legacyRule;
  }

  const suggestions =
    rule.suggestions && typeof rule.suggestions === 'object' && !Array.isArray(rule.suggestions)
      ? rule.suggestions
      : {};
  const riskNotes = Array.isArray(rule.riskNotes)
    ? rule.riskNotes
    : [rule.riskNotes].filter(Boolean);

  return {
    name: rule.id,
    appId: rule.appId || rule.app_id || '',
    app_id: rule.appId || rule.app_id || '',
    keywords: rule.keywords || [],
    sceneType: rule.scenario || rule.topic || '',
    targetCategory: suggestions.targetCategory || rule.topic || '',
    templateGroup: suggestions.templateGroup || 'technical_reply',
    scope: [rule.domainType || rule.domain_type || 'general'].filter(Boolean),
    priority: Number(rule.priority || suggestions.priority || 0),
    summaryTemplate:
      typeof suggestions.summaryTemplate === 'string'
        ? suggestions.summaryTemplate
        : undefined,
    sceneJudgement:
      typeof suggestions.sceneJudgement === 'string'
        ? suggestions.sceneJudgement
        : undefined,
    followupQuestions: suggestions.followupQuestions || [],
    riskNotes,
    nextActions: suggestions.nextActions || [],
  };
};

const normalizeProductFromResource = (resource = {}) => {
  if (resource.legacyProduct) {
    return resource.legacyProduct;
  }

  return {
    id: resource.id,
    productName: resource.title,
    category: resource.contentType || resource.content_type || '',
    industryTypes: [resource.domainType || resource.domain_type || 'general'].filter(Boolean),
    scope: [resource.domainType || resource.domain_type || 'general'].filter(Boolean),
    keywords: [],
    summary: resource.summary || '',
    applicableScenes: resource.applicableScenarios || [],
    externalAvailable: Boolean(resource.isShareable ?? resource.is_shareable),
    relatedDocuments: [
      {
        docName: resource.title,
        docType: resource.contentType || resource.content_type || '资料',
        summaryText: resource.summary || '',
        externalAvailable: Boolean(resource.isShareable ?? resource.is_shareable),
      },
    ],
  };
};

const buildProductsFromResources = (resources = []) => {
  const productMap = new Map();

  for (const resource of resources || []) {
    const product = normalizeProductFromResource(resource);
    const existing = productMap.get(product.id) || {
      ...product,
      relatedDocuments: [],
    };
    const documents = resource.legacyDocument
      ? [resource.legacyDocument]
      : product.relatedDocuments || [];

    for (const document of documents) {
      const key = `${document.docName || ''}__${document.docType || ''}`;
      const exists = (existing.relatedDocuments || []).some(
        (item) => `${item.docName || ''}__${item.docType || ''}` === key,
      );
      if (!exists) {
        existing.relatedDocuments.push(document);
      }
    }

    productMap.set(product.id, existing);
  }

  return Array.from(productMap.values());
};

const loadKnowledgeContext = ({
  text = '',
  executionContext = {},
  appId = '',
  domainTypeHint = '',
} = {}) => {
  const domainType =
    domainTypeHint || executionContext.productScope?.[0] || executionContext.rulesScope?.[0] || '';
  const rules = matchRules({
    appId,
    domainType,
    workflowStage: 'analyze',
    keyword: text,
  });
  const resources = searchResources({
    appId,
    domainType,
    keyword: text,
  });

  return {
    products: buildProductsFromResources(resources),
    rules: {
      analyzeCustomerRules: rules.map(buildLegacyRule),
    },
  };
};

const resolveMatchedProducts = ({ matchedRule = null, products = [], text = '' } = {}) => {
  let matchedProducts = [];

  if (matchedRule?.targetProducts?.length) {
    matchedProducts = products.filter((product) => matchedRule.targetProducts.includes(product.id));
  }

  if (matchedProducts.length === 0 && matchedRule?.targetCategory) {
    matchedProducts = products.filter((product) => product.category === matchedRule.targetCategory);
  }

  if (matchedProducts.length === 0) {
    const scoredProducts = products
      .map((product) => ({
        product,
        hitCount: (product.keywords || []).filter((keyword) => text.includes(keyword)).length,
      }))
      .filter((item) => item.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount);

    matchedProducts = scoredProducts.slice(0, 3).map((item) => item.product);
  }

  return matchedProducts;
};

const resolveKeywordRuleMatch = (context = {}) => {
  const normalizedInput = isPlainObject(context.normalizedInput) ? context.normalizedInput : {};
  const executionContext = isPlainObject(context.executionContext) ? context.executionContext : {};
  const appId = normalizeText(
    normalizedInput.appId || normalizedInput.app_id || context.appId || context.app_id,
  );
  const domainTypeHint = normalizeText(
    normalizedInput.domainType || normalizedInput.domain_type || normalizedInput.industryType,
  );
  const taskInput = normalizeText(normalizedInput.taskInput, normalizedInput.customerText);
  const taskSubject = normalizeText(
    normalizedInput.taskSubject,
    normalizedInput.productDirection,
    normalizedInput.topic,
  );
  const text = normalizeText(context.text, taskInput, taskSubject);

  const knowledgeContext = loadKnowledgeContext({
    text,
    executionContext,
    appId,
    domainTypeHint,
  });
  const effectiveProductScope = domainTypeHint
    ? [domainTypeHint]
    : executionContext.productScope || [];
  const effectiveRulesScope = domainTypeHint
    ? [domainTypeHint]
    : executionContext.rulesScope || [];
  const allProducts = Array.isArray(context.products)
    ? context.products
    : knowledgeContext.products;
  const allRules = isPlainObject(context.rules)
    ? context.rules
    : knowledgeContext.rules;
  const products = filterProductsByScope(allProducts, effectiveProductScope);
  const rules = filterRulesByScope(allRules, effectiveRulesScope);

  const matchedRules = (rules.analyzeCustomerRules || [])
    .filter((rule) => (rule.keywords || []).some((item) => text.includes(item)))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const matchedRule = matchedRules[0] || null;
  const matchedProducts = resolveMatchedProducts({
    matchedRule,
    products,
    text,
  });
  const matchedProduct = matchedProducts[0] || null;
  const relatedDocumentNames = matchedProduct
    ? (matchedProduct.relatedDocuments || []).map((doc) => doc.docName)
    : [];

  return {
    text,
    matchedRules,
    matchedRule,
    matchedProducts,
    matchedProduct,
    relatedDocumentNames,
    analysis: buildBaseAnalyzeFragment({
      matchedRule,
      matchedProducts,
    }),
  };
};

export default class KeywordRule extends Rule {
  constructor(options = {}) {
    super({
      id: 'keyword-rule',
      name: 'Keyword Rule',
      ...options,
    });
  }

  async match(context = {}) {
    const matchResult = resolveKeywordRuleMatch(context);
    return Boolean(matchResult.matchedRule || matchResult.matchedProducts.length > 0);
  }

  async execute(context = {}) {
    const matchResult = resolveKeywordRuleMatch(context);

    return {
      priority: matchResult.matchedRule?.priority || 0,
      matchedRules: matchResult.matchedRules,
      matchedRule: matchResult.matchedRule,
      matchedProducts: matchResult.matchedProducts,
      matchedProduct: matchResult.matchedProduct,
      relatedDocumentNames: matchResult.relatedDocumentNames,
      analysis: matchResult.analysis,
    };
  }
}
