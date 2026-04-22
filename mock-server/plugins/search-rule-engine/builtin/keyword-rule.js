import Rule from '../base-rule.js';
import { readJsonFile } from '../../../services/jsonDataService.js';
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
  const allProducts = Array.isArray(context.products)
    ? context.products
    : readJsonFile('products.json', []);
  const allRules = isPlainObject(context.rules)
    ? context.rules
    : readJsonFile('rules.json', { searchRules: [] });
  const products = filterProductsByScope(allProducts, executionContext.productScope || []);
  const rules = filterRulesByScope(allRules, executionContext.rulesScope || []);
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
