import './config/loadEnv.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateScriptWithLLM } from './services/llmService.js';
import {
  sanitizeAnalyzePayload,
  validatePlaceholderIntegrity,
  restoreFromMapping,
} from './services/sanitizationService.js';
import { enhanceAnalyzeWithLLM } from './services/analyzeLLMService.js';
import {
  getModulePolicy,
  isApiModelAllowed,
  isInternetSupplementAllowed,
} from './config/policyConfig.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

const readJsonFile = (fileName) => {
  const filePath = path.join(dataDir, fileName);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
};

const testResultsDir = path.join(__dirname, '..', 'test-results');
const testResultsFile = path.join(testResultsDir, 'manual-test-log.jsonl');

const ensureTestResultsFile = () => {
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }

  if (!fs.existsSync(testResultsFile)) {
    fs.writeFileSync(testResultsFile, '', 'utf-8');
  }
};

const appendTestRecord = (record) => {
  ensureTestResultsFile();

  const payload = {
    time: new Date().toISOString(),
    status: '',
    issueNote: '',
    ...record,
  };

  fs.appendFileSync(testResultsFile, `${JSON.stringify(payload)}\n`, 'utf-8');
};

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER || 'local').toLowerCase();
const MODEL_MODE = (process.env.MODEL_MODE || 'strict-local').toLowerCase();
const ALLOW_API_MODEL = (process.env.ALLOW_API_MODEL || 'false').toLowerCase() === 'true';

const useLocalLLM =
  MODEL_PROVIDER === 'local' ||
  MODEL_PROVIDER === 'hybrid' ||
  MODEL_MODE === 'strict-local' ||
  MODEL_MODE === 'local-first';

const useApiLLM =
  ALLOW_API_MODEL &&
  (MODEL_PROVIDER === 'api' ||
    MODEL_PROVIDER === 'hybrid' ||
    MODEL_MODE === 'api-only' ||
    MODEL_MODE === 'local-first');

app.use(cors());
app.use(express.json());


app.use((req, res, next) => {
  console.log(`[mock] ${req.method} ${req.url}`);
  if (req.method !== 'GET') {
    console.log('[mock] request body:', req.body);
  }
  next();
});

console.log('[runtime] config:', {
  port: PORT,
  host: HOST,
  modelProvider: MODEL_PROVIDER,
  modelMode: MODEL_MODE,
  allowApiModel: ALLOW_API_MODEL,
  useLocalLLM,
  useApiLLM,
});


app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'mock server is running',
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'service is healthy',
    data: {
      service: 'sales-support-agent',
      status: 'ok',
    },
  });
});

app.post('/api/agent/analyze-customer', async (req, res) => {
  const rawInput = req.body || {};
  const { customerText = '', productDirection = '', salesStage = 'other' } = rawInput;
  const sanitizedAnalyzeInput = sanitizeAnalyzePayload(rawInput);
  const products = readJsonFile('products.json');
  const rules = readJsonFile('rules.json');
  const modulePolicy = getModulePolicy('analyzeCustomer');
  console.log('[policy] analyzeCustomer:', modulePolicy);

  console.log('[sanitize] analyzeCustomer:', {
    sanitizedText: sanitizedAnalyzeInput.sanitizedText,
    placeholderKeys: Object.keys(sanitizedAnalyzeInput.mapping),
    removedFieldKeys: Object.keys(sanitizedAnalyzeInput.removedFields || {}),
  });

  console.log('[mock] loaded products count:', products.length);
  console.log('[mock] loaded analyze rules count:', rules.analyzeCustomerRules.length);
  const text = `${customerText} ${productDirection}`;

  const matchedAnalyzeRules = rules.analyzeCustomerRules
    .filter((rule) => rule.keywords.some((keyword) => text.includes(keyword)))
    .sort((a, b) => b.priority - a.priority);

  const matchedRule = matchedAnalyzeRules[0] || null;

  console.log('[mock] matched analyze rule:', matchedRule);

  const matchedProduct = matchedRule
    ? products.find((product) => product.category === matchedRule.targetCategory)
    : null;

  console.log('[mock] matched product:', matchedProduct);

  const relatedDocumentNames = matchedProduct
    ? matchedProduct.relatedDocuments.map((doc) => doc.docName)
    : [];

  let responseData = {
    summary: '客户当前表达了初步了解意向，但信息仍不足，需进一步确认具体产品方向、应用场景和关注点。',
    sceneJudgement: '该需求当前信息偏少，暂归为待进一步澄清场景。',
    recommendedProducts: matchedProduct
      ? [matchedProduct.productName, ...relatedDocumentNames]
      : ['基础资料包', '需求澄清问题清单'],
    followupQuestions: [
      '客户当前想了解的是哪一类产品或方案？',
      '当前应用场景是 PCB、半导体还是其他工序？',
      '客户最关注的是成本、稳定性、兼容性还是测试安排？',
    ],
    riskNotes: ['当前信息不足，暂不适合给出过于具体的产品判断或性能承诺。'],
    nextActions: ['先补充基础信息', '发送基础资料', '再判断是否进入技术沟通'],
  };

  if (matchedRule?.sceneType === 'h2o2') {
    responseData = {
      summary:
        matchedProduct?.summary ||
        '客户当前在评估双氧水体系蚀刻液，核心关注点是稳定性、线宽均匀性和整体成本控制。',
      sceneJudgement: '该需求可初步判断为 PCB 蚀刻相关场景，当前处于需求沟通阶段。',
      recommendedProducts:
        matchedProduct
          ? [matchedProduct.productName, ...relatedDocumentNames]
          : ['双氧水体系蚀刻液', '稳定性优化方案资料'],
      followupQuestions: [
        '当前使用的蚀刻体系是什么？',
        '客户更关注成本、稳定性还是线宽控制？',
        '是否有明确的样品测试计划？',
      ],
      riskNotes: ['目前信息仍偏初步，暂不适合承诺具体性能改善结果。'],
      nextActions: ['先发送基础资料', '确认测试需求', '判断是否进入样品沟通'],
    };
  }

  if (matchedRule?.sceneType === 'cost_sensitive') {
    responseData = {
      summary: '客户当前更关注整体成本优化空间，但信息仍不足，需要先确认现用体系、成本构成和优化目标。',
      sceneJudgement: '该需求可初步判断为成本优化澄清场景。',
      recommendedProducts: productDirection
        ? [productDirection, '成本对比评估清单']
        : ['成本对比评估清单', '需求澄清问题清单'],
      followupQuestions: [
        '客户当前使用的体系和工艺是什么？',
        '客户希望优化的是采购成本、使用成本还是综合成本？',
        '是否已有现用方案可作为对比基线？',
      ],
      riskNotes: ['涉及成本表达时，建议避免直接承诺节省幅度。'],
      nextActions: ['先确认现用体系', '梳理成本构成', '判断是否适合进入对比评估'],
    };
  }

  if (text.includes('清洗') || text.includes('清洗液')) {
    responseData = {
      summary: '客户当前更关注清洗液方案，重点在残留控制、兼容性和清洗后表面状态。',
      sceneJudgement: '该需求可初步判断为湿制程清洗相关场景。',
      recommendedProducts:
        matchedProduct
          ? [matchedProduct.productName, ...relatedDocumentNames]
          : ['电子级清洗液', '清洗兼容性说明资料'],
      followupQuestions: [
        '客户目前清洗的对象是什么材料或工序？',
        '更关注颗粒、金属离子还是有机残留？',
        '是否已有现用清洗方案作为对比？',
      ],
      riskNotes: ['需避免在不了解工艺条件前直接承诺清洗效果。'],
      nextActions: ['先确认应用工序', '发送清洗液资料', '再判断是否进入测试沟通'],
    };
  }

  if (text.includes('样品') || text.includes('测试')) {
    responseData = {
      summary: '客户当前已经进入样品测试推进阶段，重点在测试安排、评价指标和样品规格确认。',
      sceneJudgement: '该需求可初步判断为样品测试或验证推进场景。',
      recommendedProducts:
        matchedProduct
          ? [matchedProduct.productName, ...relatedDocumentNames]
          : [productDirection || '待确认产品方案', '样品测试说明资料'],
      followupQuestions: [
        '客户预计何时安排测试？',
        '本次测试最关注哪些指标？',
        '样品规格、数量和寄送时间是否已明确？',
      ],
      riskNotes: ['样品测试阶段需先确认评价标准，避免双方对测试结果理解不一致。'],
      nextActions: ['确认样品规格', '确认寄样时间', '明确测试指标'],
    };
  }

  if (text.includes('成本')) {
    responseData.riskNotes = [...responseData.riskNotes, '涉及成本优化时，建议结合客户现用体系做对比。'];
  }

  if (salesStage === 'initial_contact') {
    responseData.nextActions = ['先发送基础介绍资料', '了解客户当前工艺', '判断是否需要进一步技术沟通'];
  }

  // === LLM enhancement chain integration ===
  let finalAnalyzeData = responseData;
  let analysisRoute = 'rules-only';

  if (useLocalLLM || useApiLLM) {
    const analyzeLLMResult = await enhanceAnalyzeWithLLM({
      sanitizedText: sanitizedAnalyzeInput.sanitizedText,
      safeMeta: sanitizedAnalyzeInput.safeMeta,
      baseResult: {
        ...responseData,
      },
    });

    const fieldsToCheck = [
      analyzeLLMResult.enhancedResult.summary || '',
      analyzeLLMResult.enhancedResult.sceneJudgement || '',
      ...(analyzeLLMResult.enhancedResult.riskNotes || []),
      ...(analyzeLLMResult.enhancedResult.nextActions || []),
    ].filter((item) => typeof item === 'string' && item.trim());

    const placeholderChecks = fieldsToCheck.map((item) =>
      validatePlaceholderIntegrity(item, sanitizedAnalyzeInput.mapping),
    );

    const placeholderCheck = {
      isValid: placeholderChecks.every((item) => item.unknownPlaceholders.length === 0),
      missingPlaceholders: Array.from(
        new Set(placeholderChecks.flatMap((item) => item.missingPlaceholders)),
      ),
      unknownPlaceholders: Array.from(
        new Set(placeholderChecks.flatMap((item) => item.unknownPlaceholders)),
      ),
    };

    console.log('[router] analyzeCustomer route result:', {
      source: analyzeLLMResult.source,
      reason: analyzeLLMResult.reason,
    });

    console.log('[router] analyzeCustomer placeholder check:', placeholderCheck);

    if (placeholderCheck.missingPlaceholders.length > 0) {
      console.log('[router] analyzeCustomer missing placeholders (allowed):', placeholderCheck.missingPlaceholders);
    }

    const hasUnknownPlaceholders = placeholderCheck.unknownPlaceholders.length > 0;

    if (analyzeLLMResult.source === 'local-llm' && !hasUnknownPlaceholders) {
      const restoredAnalyzeResult = restoreFromMapping(
        analyzeLLMResult.enhancedResult,
        sanitizedAnalyzeInput.mapping,
      );

      finalAnalyzeData = {
        ...responseData,
        ...restoredAnalyzeResult,
        recommendedProducts: responseData.recommendedProducts,
        followupQuestions: responseData.followupQuestions,
      };
      analysisRoute = 'rules+local-llm';
    } else {
      analysisRoute = 'rules-fallback';
    }
  }

  appendTestRecord({
    module: '客户分析',
    input: customerText || productDirection || '',
    actualResult: `${finalAnalyzeData.summary} | 推荐：${finalAnalyzeData.recommendedProducts.join('、')}`,
    matchedRule: matchedRule?.name || '',
    matchedData: matchedProduct ? `${matchedProduct.id} / ${matchedProduct.productName}` : '',
  });

  res.json({
    success: true,
    message: '分析成功',
    data: {
      ...finalAnalyzeData,
      analysisRoute,
    },
  });
});

app.post('/api/agent/search-documents', (req, res) => {
  const {
    keyword = '',
    industryType = 'other',
    onlyExternalAvailable = false,
  } = req.body || {};

  const products = readJsonFile('products.json');
  const rules = readJsonFile('rules.json');
  const modulePolicy = getModulePolicy('searchDocuments');
  console.log('[policy] searchDocuments:', modulePolicy);
  console.log('[policy] internet supplement allowed:', isInternetSupplementAllowed('searchDocuments'));

  console.log('[mock] loaded products count:', products.length);
  console.log('[mock] loaded search rules count:', rules.searchRules.length);

  const text = `${keyword}`;

  const matchedSearchRules = rules.searchRules.filter((rule) =>
    rule.keywords.some((item) => text.includes(item)),
  );

  const matchedRule = matchedSearchRules[0] || null;

  console.log('[mock] matched search rule:', matchedRule);

  let matchedProducts = [];

  if (matchedRule) {
    matchedProducts = products.filter((product) => product.category === matchedRule.targetCategory);
  }

  if (industryType && industryType !== 'other') {
    matchedProducts = matchedProducts.filter((product) => product.industryTypes.includes(industryType));
  }

  console.log('[mock] matched search products count:', matchedProducts.length);

  let documents = matchedProducts.flatMap((product) =>
    product.relatedDocuments.map((doc, index) => ({
      id: `${product.id}-doc-${index + 1}`,
      docName: doc.docName,
      docType: doc.docType,
      summaryText: doc.summaryText,
      applicableScene: product.applicableScenes.join(' / '),
      externalAvailable: doc.externalAvailable,
    })),
  );

  if (!matchedRule) {
    documents = products.flatMap((product) =>
      product.relatedDocuments.map((doc, index) => ({
        id: `${product.id}-doc-${index + 1}`,
        docName: doc.docName,
        docType: doc.docType,
        summaryText: doc.summaryText,
        applicableScene: product.applicableScenes.join(' / '),
        externalAvailable: doc.externalAvailable,
      })),
    );
  }

  if (onlyExternalAvailable) {
    documents = documents.filter((item) => item.externalAvailable);
  }

  appendTestRecord({
    module: '资料检索',
    input: keyword || '',
    actualResult: documents.length
      ? `返回资料：${documents.map((item) => item.docName).join('、')}`
      : '未返回资料',
    matchedRule: matchedRule?.name || '',
    matchedData: matchedProducts.length
      ? matchedProducts.map((product) => `${product.id} / ${product.productName}`).join('；')
      : '',
  });

  res.json({
    success: true,
    message: '检索成功',
    data: documents,
  });
});

app.post('/api/agent/generate-script', async (req, res) => {
  const {
    toneStyle = 'formal',
    communicationGoal = 'first_reply',
    customerText = '',
    referenceSummary = '',
    productDirection = '',
  } = req.body || {};

  const scriptTemplates = readJsonFile('script_templates.json');
  const faqs = readJsonFile('faqs.json');
  const rules = readJsonFile('rules.json');
  const modulePolicy = getModulePolicy('generateScript');
  console.log('[policy] generateScript:', modulePolicy);
  console.log('[policy] api model allowed:', isApiModelAllowed('generateScript'));

  console.log('[mock] loaded script templates count:', scriptTemplates.length);
  console.log('[mock] loaded faqs count:', faqs.length);
  console.log('[mock] loaded script rules count:', rules.scriptRules.length);

  const text = `${customerText} ${referenceSummary} ${productDirection}`;

  const sceneRules = rules.scriptRules.filter((rule) => rule.ruleType === 'scene');
  const toneRules = rules.scriptRules.filter((rule) => rule.ruleType === 'tone');

  const directSceneRule = sceneRules.find((rule) => rule.scene === communicationGoal) || null;
  const keywordSceneRule =
    sceneRules.find((rule) => rule.keywords?.some((keyword) => text.includes(keyword))) || null;

  const matchedSceneRule = directSceneRule || keywordSceneRule || null;
  const matchedToneRule = toneRules.find((rule) => rule.toneStyle === toneStyle) || null;

  console.log('[mock] direct script scene rule:', directSceneRule);
  console.log('[mock] keyword script scene rule:', keywordSceneRule);
  console.log('[mock] matched script scene rule:', matchedSceneRule);
  console.log('[mock] matched script tone rule:', matchedToneRule);

  const targetScene = matchedSceneRule?.scene || communicationGoal || 'first_reply';

  let sceneTemplates = scriptTemplates.filter((item) => item.scene === targetScene);

  if (sceneTemplates.length === 0) {
    sceneTemplates = scriptTemplates.filter((item) => item.scene === 'first_reply');
  }

  const getTemplateByTone = (style) => {
    return (
      sceneTemplates.find((item) => item.toneStyle === style) ||
      scriptTemplates.find((item) => item.scene === 'first_reply' && item.toneStyle === style) ||
      null
    );
  };

  const replaceProductPlaceholder = (templateText) =>
    templateText.replaceAll('【产品方向】', productDirection || '相关产品');

  const formalTemplate = getTemplateByTone('formal');
  const conciseTemplate = getTemplateByTone('concise');
  const spokenTemplate = getTemplateByTone('spoken');

  let formalVersion = formalTemplate
    ? replaceProductPlaceholder(formalTemplate.template)
    : '您好，我们可以先提供一版基础资料供您参考。';

  let conciseVersion = conciseTemplate
    ? replaceProductPlaceholder(conciseTemplate.template)
    : formalVersion;

  let spokenVersion = spokenTemplate
    ? replaceProductPlaceholder(spokenTemplate.template)
    : conciseVersion;

  const matchedFaqs = faqs.filter((faq) => faq.keywords.some((keyword) => text.includes(keyword)));
  const cautionNotes = Array.from(
    new Set([
      ...matchedFaqs.map((faq) => faq.riskNote).filter(Boolean),
      '当前阶段不建议直接承诺具体性能提升结果。',
    ]),
  );

  if (toneStyle === 'concise') {
    formalVersion = conciseVersion;
  }

  if (toneStyle === 'spoken') {
    formalVersion = spokenVersion;
  }

  const selectedTemplate =
    toneStyle === 'spoken'
      ? spokenVersion
      : toneStyle === 'concise'
        ? conciseVersion
        : formalVersion;

  const llmResult = await generateScriptWithLLM({
    moduleName: 'generateScript',
    useLocalLLM,
    useApiLLM,
    scene: matchedSceneRule?.scene || targetScene,
    toneStyle,
    productDirection,
    customerText,
    referenceSummary,
    cautionNotes,
    selectedTemplate,
  });

  const llmVersion = llmResult.rewrittenScript;
  const llmRoute = llmResult.route;

  console.log('[router] generateScript route result:', {
    route: llmResult.route,
    routeReason: llmResult.routeReason,
    source: llmResult.source,
    modulePolicy: llmResult.modulePolicy,
  });
  console.log('[router] generateScript final route:', llmRoute);

  appendTestRecord({
    module: '话术生成',
    input: customerText || referenceSummary || productDirection || '',
    actualResult: llmVersion || formalVersion,
    matchedRule: [matchedSceneRule?.name, matchedToneRule?.name].filter(Boolean).join(' + '),
    matchedData: sceneTemplates.length
      ? sceneTemplates.map((item) => `${item.id} / ${item.scene} / ${item.toneStyle}`).join('；')
      : `targetScene=${targetScene}`,
  });

  console.log('[response] generate-script data:', {
    formalVersion,
    conciseVersion,
    spokenVersion,
    llmVersion,
    llmRoute,
    cautionNotes,
  });

  res.json({
    success: true,
    message: '生成成功',
    data: {
      formalVersion,
      conciseVersion,
      spokenVersion,
      llmVersion,
      llmRoute,
      cautionNotes,
    },
  });
});

app.listen(PORT, HOST, () => {
  console.log(`mock server is running at http://${HOST}:${PORT}`);
  console.log(`local access: http://127.0.0.1:${PORT}`);
});