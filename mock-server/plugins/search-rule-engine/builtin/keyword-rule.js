import Rule from '../base-rule.js';
import { matchRules } from '../../../data/models/knowledgeRule.js';
import { searchResources } from '../../../data/models/knowledgeResource.js';
import {
  filterProductsByScope,
  filterRulesByScope,
} from '../../../services/assistantContextService.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readNonEmptyString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const normalizeText = (...values) =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

const dedupeDocuments = (documents = []) => {
  const seen = new Set();

  return (documents || []).filter((item) => {
    const key = `${item.productId || ''}__${item.docName}__${item.docType}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildSearchDocumentsFromProducts = (products = []) => {
  return (products || []).flatMap((product) =>
    (product.relatedDocuments || []).map((doc, index) => ({
      id: `${product.id}-doc-${index + 1}`,
      productId: product.id,
      productName: product.productName,
      docName: doc.docName,
      docType: doc.docType,
      summaryText: doc.summaryText,
      applicableScene: Array.isArray(product.applicableScenes)
        ? product.applicableScenes.join(' / ')
        : '',
      externalAvailable: Boolean(doc.externalAvailable),
    })),
  );
};

const buildLegacyRule = (rule = {}) => {
  if (rule.legacyRule) {
    return rule.legacyRule;
  }

  const suggestions =
    rule.suggestions && typeof rule.suggestions === 'object' && !Array.isArray(rule.suggestions)
      ? rule.suggestions
      : {};

  return {
    name: rule.id,
    keywords: rule.keywords || [],
    targetCategory: suggestions.targetCategory || rule.topic || '',
    scope: [rule.domainType || rule.domain_type || 'general'].filter(Boolean),
    priority: Number(rule.priority || suggestions.priority || 0),
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
  keyword = '',
  industryType = '',
  executionContext = {},
  appId = '',
} = {}) => {
  const domainType = industryType !== 'other'
    ? industryType
    : executionContext.docScope?.[0] || executionContext.productScope?.[0] || '';
  const rules = matchRules({
    appId,
    domainType,
    workflowStage: 'search',
    keyword,
  });
  const resources = searchResources({
    appId,
    domainType,
    keyword,
  });

  return {
    products: buildProductsFromResources(resources),
    rules: {
      searchRules: rules.map(buildLegacyRule),
    },
  };
};

const resolveMatchedProducts = ({ products = [], matchedRule = null, industryType = 'other' } = {}) => {
  let matchedProducts = [];

  if (matchedRule?.targetCategory) {
    matchedProducts = products.filter((product) => product.category === matchedRule.targetCategory);
  }

  if (industryType && industryType !== 'other') {
    matchedProducts = matchedProducts.filter((product) =>
      Array.isArray(product.industryTypes) ? product.industryTypes.includes(industryType) : false,
    );
  }

  if (matchedProducts.length === 0 && industryType && industryType !== 'other') {
    matchedProducts = products.filter((product) =>
      Array.isArray(product.industryTypes) ? product.industryTypes.includes(industryType) : false,
    );
  }

  return matchedProducts;
};

const resolveSearchRuleMatch = (context = {}) => {
  const normalizedInput = isPlainObject(context.normalizedInput) ? context.normalizedInput : {};
  const executionContext = isPlainObject(context.executionContext) ? context.executionContext : {};
  const appId = readNonEmptyString(
    normalizedInput.appId,
    normalizedInput.app_id,
    context.appId,
    context.app_id,
  );
  const keyword = readNonEmptyString(
    context.keyword,
    normalizedInput.keyword,
    normalizedInput.taskSubject,
    normalizedInput.topic,
  );
  const industryType = readNonEmptyString(
    context.industryType,
    normalizedInput.industryType,
    normalizedInput.domainType,
  ) || 'other';
  const knowledgeContext = loadKnowledgeContext({
    keyword,
    industryType,
    executionContext,
    appId,
  });
  const scopeHint = industryType && industryType !== 'other' ? industryType : '';
  const effectiveProductScope = scopeHint
    ? [scopeHint]
    : executionContext.productScope || [];
  const effectiveRulesScope = scopeHint
    ? [scopeHint]
    : executionContext.rulesScope || [];
  const allProducts = Array.isArray(context.products)
    ? context.products
    : knowledgeContext.products;
  const allRules = isPlainObject(context.rules)
    ? context.rules
    : knowledgeContext.rules;
  const products = filterProductsByScope(allProducts, effectiveProductScope);
  const rules = filterRulesByScope(allRules, effectiveRulesScope);
  const matchedRules = (rules.searchRules || [])
    .filter((rule) => (rule.keywords || []).some((item) => keyword.includes(item)))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const matchedRule = matchedRules[0] || null;
  const matchedProducts = resolveMatchedProducts({
    products,
    matchedRule,
    industryType,
  });
  const fallbackProducts =
    matchedProducts.length > 0
      ? matchedProducts
      : industryType && industryType !== 'other'
        ? []
        : products;
  const documents = dedupeDocuments(
    matchedRule
      ? buildSearchDocumentsFromProducts(matchedProducts)
      : buildSearchDocumentsFromProducts(fallbackProducts),
  );

  return {
    keyword,
    matchedRules,
    matchedRule,
    matchedProducts,
    documents,
  };
};

export default class SearchKeywordRule extends Rule {
  constructor(options = {}) {
    super({
      id: 'keyword-rule',
      name: 'Search Keyword Rule',
      ...options,
    });
  }

  async match(_context = {}) {
    return true;
  }

  async execute(context = {}) {
    const matchResult = resolveSearchRuleMatch(context);

    return {
      priority: matchResult.matchedRule?.priority || 0,
      matchedRules: matchResult.matchedRules,
      matchedRule: matchResult.matchedRule,
      matchedProducts: matchResult.matchedProducts,
      documents: matchResult.documents,
    };
  }
}
