import Rule from '../base-rule.js';
import { readJsonFile } from '../../../services/jsonDataService.js';
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
  const taskInput = normalizeText(normalizedInput.taskInput, normalizedInput.customerText);
  const taskSubject = normalizeText(
    normalizedInput.taskSubject,
    normalizedInput.productDirection,
    normalizedInput.topic,
  );
  const text = normalizeText(context.text, taskInput, taskSubject);

  const allProducts = Array.isArray(context.products)
    ? context.products
    : readJsonFile('products.json', []);
  const allRules = isPlainObject(context.rules)
    ? context.rules
    : readJsonFile('rules.json', { analyzeCustomerRules: [] });
  const products = filterProductsByScope(allProducts, executionContext.productScope || []);
  const rules = filterRulesByScope(allRules, executionContext.rulesScope || []);

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
