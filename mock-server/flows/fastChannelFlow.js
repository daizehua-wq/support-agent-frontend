import {
  EMBEDDED_MODEL_TASKS,
  FAST_CHANNEL_SCHEMA_VERSION,
  normalizeEmbeddedModelTask,
  normalizeText,
} from '../plugins/model-adapters/embeddedModelSchemas.js';
import {
  getLocalModelHealthSnapshot,
  runLocalModelPreprocess,
} from '../services/localModelHealthService.js';

const DEFAULT_WORKFLOW_STAGE = 'analyze';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const DIAGNOSTIC_RULES = Object.freeze([
  {
    id: 'route-test.analyze.product-fit',
    workflowStage: 'analyze',
    keywords: ['判断', '客户', '适合', '产品'],
    minMatches: 2,
    confidence: 0.92,
    priority: 90,
    scenario: '产品适配判断',
  },
  {
    id: 'route-test.search.evidence',
    workflowStage: 'search',
    keywords: ['资料', '检索', '证据', '来源'],
    minMatches: 1,
    confidence: 0.86,
    priority: 70,
    scenario: '资料检索诊断',
  },
  {
    id: 'route-test.script.short-reply',
    workflowStage: 'script',
    keywords: ['话术', '回复', '简洁', '口语'],
    minMatches: 1,
    confidence: 0.84,
    priority: 60,
    scenario: '话术生成诊断',
  },
]);

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeStage = (value = '') => normalizeText(value) || DEFAULT_WORKFLOW_STAGE;

const normalizeFastChannelInput = (rawInput = {}) => {
  const text = normalizeText(
    rawInput.text ||
      rawInput.inputText ||
      rawInput.customerText ||
      rawInput.taskInput ||
      rawInput.keyword ||
      rawInput.content,
  );
  const moduleName = normalizeText(
    rawInput.moduleName || rawInput.module_name || rawInput.module || rawInput.workflowModule,
  );
  const workflowStage = normalizeStage(
    rawInput.workflowStage ||
      rawInput.workflow_stage ||
      rawInput.stage ||
      moduleName ||
      DEFAULT_WORKFLOW_STAGE,
  );

  return {
    text,
    moduleName: moduleName || workflowStage,
    domainType: normalizeText(
      rawInput.domainType || rawInput.domain_type || rawInput.domain || rawInput.industryType,
    ),
    workflowStage,
    appId: normalizeText(rawInput.appId || rawInput.app_id),
    goal: normalizeText(rawInput.goal || rawInput.communicationGoal || rawInput.deliverable),
    locale: normalizeText(rawInput.locale) || 'zh-CN',
    timeoutMs: toPositiveNumber(rawInput.timeoutMs || rawInput.embeddedModelTimeoutMs, 0),
    maxTokens: toPositiveNumber(rawInput.maxTokens || rawInput.embeddedModelMaxTokens, 0),
    task: normalizeEmbeddedModelTask(rawInput.task || rawInput.useCase || rawInput.mode),
    minConfidence: Number.isFinite(Number(rawInput.minConfidence))
      ? Number(rawInput.minConfidence)
      : DEFAULT_CONFIDENCE_THRESHOLD,
  };
};

const capabilityFromWorkflowStage = (workflowStage = '') => {
  const normalizedStage = normalizeText(workflowStage).toLowerCase();

  if (normalizedStage.includes('search') || normalizedStage.includes('retrieve')) {
    return 'search';
  }

  if (normalizedStage.includes('script') || normalizedStage.includes('output') || normalizedStage.includes('compose')) {
    return 'script';
  }

  if (normalizedStage.includes('session')) {
    return 'session';
  }

  if (normalizedStage.includes('analyze') || normalizedStage.includes('analysis')) {
    return 'analyze';
  }

  return 'unknown';
};

const buildInputSummary = (input = {}) => ({
  textLength: normalizeText(input.text).length,
  hasText: Boolean(normalizeText(input.text)),
  moduleName: normalizeText(input.moduleName),
  appId: normalizeText(input.appId),
  domainType: normalizeText(input.domainType),
  workflowStage: normalizeText(input.workflowStage),
  task: normalizeEmbeddedModelTask(input.task),
});

const buildSafeModelStatus = (status = {}) => ({
  status: normalizeText(status.status) || 'unknown',
  ready: status.ready === true,
  enabled: status.enabled !== false,
  provider: normalizeText(status.provider),
  modelName: normalizeText(status.modelName),
  modelPresent: status.modelPresent === true,
  loading: status.loading === true,
  lastErrorCode: normalizeText(status.lastError?.code),
});

const buildSafeEmbeddedModelError = (error = null) => {
  if (!error) {
    return null;
  }

  return {
    errorCode: normalizeText(error.code) || 'EMBEDDED_MODEL_ERROR',
    status: normalizeText(error.status?.status),
  };
};

const buildSafeFallbackDecision = ({
  input,
  reason = 'fallback',
  modelStatus = null,
  embeddedModel = null,
} = {}) => ({
  schemaVersion: FAST_CHANNEL_SCHEMA_VERSION,
  route: 'main_workflow',
  source: 'fallback',
  fallback: true,
  fallbackReason: normalizeText(reason) || 'fallback',
  confidence: 0,
  appId: normalizeText(input?.appId),
  inputSummary: buildInputSummary(input),
  rule: null,
  embeddedModel,
  modelStatus: buildSafeModelStatus(modelStatus || getLocalModelHealthSnapshot()),
});

const matchDiagnosticRules = (input = {}) => {
  const text = normalizeText(input.text).toLowerCase();
  const workflowStage = normalizeText(input.workflowStage).toLowerCase();

  return DIAGNOSTIC_RULES.map((rule) => {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const matchedKeywords = keywords.filter((keyword) => text.includes(normalizeText(keyword).toLowerCase()));
    const stageMatches =
      !rule.workflowStage ||
      workflowStage === normalizeText(rule.workflowStage).toLowerCase() ||
      capabilityFromWorkflowStage(workflowStage) === normalizeText(rule.workflowStage).toLowerCase();

    return {
      ...rule,
      matchedKeywords,
      score: (stageMatches ? 2 : 0) + matchedKeywords.length,
    };
  })
    .filter((rule) => {
      const minMatches = Math.max(1, Number(rule.minMatches) || 1);
      return rule.matchedKeywords.length >= minMatches && rule.score > 0;
    })
    .sort((left, right) => {
      const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return Number(right.confidence || 0) - Number(left.confidence || 0);
    });
};

const buildRuleDecision = ({ input, matchedRule }) => {
  const suggestions =
    matchedRule?.suggestions && typeof matchedRule.suggestions === 'object'
      ? matchedRule.suggestions
      : {};
  const riskNotes = Array.isArray(matchedRule?.riskNotes)
    ? matchedRule.riskNotes
    : [matchedRule?.riskNotes].filter(Boolean);

  return {
    schemaVersion: FAST_CHANNEL_SCHEMA_VERSION,
    route: 'fast_channel',
    source: 'rule_engine',
    fallback: false,
    fallbackReason: '',
    confidence: Number.isFinite(Number(matchedRule?.confidence))
      ? Math.min(1, Math.max(0, Number(matchedRule.confidence)))
      : 1,
    appId: input.appId,
    inputSummary: buildInputSummary(input),
    rule: {
      id: matchedRule?.id || '',
      domainType: matchedRule?.domainType || matchedRule?.domain_type || '',
      workflowStage: matchedRule?.workflowStage || matchedRule?.workflow_stage || '',
      topic: matchedRule?.topic || '',
      scenario: matchedRule?.scenario || '',
      keywords: matchedRule?.keywords || [],
      matchedKeywordCount: Array.isArray(matchedRule?.matchedKeywords)
        ? matchedRule.matchedKeywords.length
        : 0,
      priority: Number(matchedRule?.priority || suggestions.priority || 0),
      suggestions,
      riskNotes,
    },
    embeddedModel: null,
    modelStatus: buildSafeModelStatus(getLocalModelHealthSnapshot()),
    preprocessing: {
      schemaVersion: 'fast-channel-rule-preprocess/v1',
      capability: capabilityFromWorkflowStage(input.workflowStage),
      language: input.locale,
      keywordCount: Array.isArray(matchedRule?.keywords) ? matchedRule.keywords.length : 0,
      signals: ['rule_match'],
      needsMainWorkflow: false,
      reason: 'diagnostic_rule_matched',
    },
  };
};

const buildEmbeddedModelDecision = ({ input, embeddedResult }) => {
  const modelData = embeddedResult.data || {};
  const task = normalizeEmbeddedModelTask(modelData.task || input.task);
  const routeDecision = normalizeText(modelData.routeDecision || modelData.route);
  const route =
    routeDecision === 'fast_channel' &&
    modelData.fallback !== true &&
    modelData.needsMainWorkflow !== true
      ? 'fast_channel'
      : 'main_workflow';
  const compactEmbeddedModel =
    task === EMBEDDED_MODEL_TASKS.ROUTE_DECISION
      ? {
          task,
          routeDecision: route,
          confidence: modelData.confidence,
          fallback: modelData.fallback === true || route !== 'fast_channel',
          durationMs: embeddedResult.durationMs,
        }
      : {
          task,
          capability: normalizeText(modelData.capability),
          routeDecision: normalizeText(modelData.routeDecision || modelData.route),
          confidence: modelData.confidence,
          fallback: modelData.fallback === true || modelData.needsMainWorkflow === true,
          needsMainWorkflow: modelData.needsMainWorkflow === true,
          keywordCount: Array.isArray(modelData.keywords) ? modelData.keywords.length : 0,
          signalCount: Array.isArray(modelData.signals) ? modelData.signals.length : 0,
          fieldCount: Array.isArray(modelData.fields) ? modelData.fields.length : 0,
          missingFieldCount: Array.isArray(modelData.missingFields)
            ? modelData.missingFields.length
            : 0,
          durationMs: embeddedResult.durationMs,
        };

  return {
    schemaVersion: FAST_CHANNEL_SCHEMA_VERSION,
    route,
    source: 'embedded_model',
    fallback: false,
    fallbackReason: '',
    confidence: modelData.confidence,
    appId: input.appId,
    inputSummary: buildInputSummary(input),
    rule: null,
    embeddedModel: compactEmbeddedModel,
    modelStatus: buildSafeModelStatus(getLocalModelHealthSnapshot()),
    preprocessing: compactEmbeddedModel,
  };
};

const normalizeFallbackReason = (error = null) => {
  const code = normalizeText(error?.code);

  if (code === 'MODEL_TIMEOUT') {
    return 'model_timeout';
  }

  if (code === 'LOW_CONFIDENCE') {
    return 'low_confidence';
  }

  if (code === 'INVALID_JSON') {
    return 'invalid_json';
  }

  if (code === 'MODEL_LOAD_FAILED') {
    return 'model_load_failed';
  }

  if (code === 'MODEL_UNAVAILABLE' || code === 'MODEL_NOT_READY') {
    return 'model_unavailable';
  }

  return code ? code.toLowerCase() : 'embedded_model_failed';
};

export const runFastChannelRouteTestFlow = async (rawInput = {}) => {
  const input = normalizeFastChannelInput(rawInput);
  const modelStatus = getLocalModelHealthSnapshot();

  if (!input.text) {
    return buildSafeFallbackDecision({
      input,
      reason: 'empty_input',
      modelStatus,
    });
  }

  let matchedRule = null;

  try {
    matchedRule = matchDiagnosticRules(input)[0] || null;
  } catch (error) {
    return buildSafeFallbackDecision({
      input,
      reason: 'rule_engine_error',
      modelStatus,
      embeddedModel: buildSafeEmbeddedModelError(error),
    });
  }

  if (matchedRule) {
    return buildRuleDecision({
      input,
      matchedRule,
    });
  }

  try {
    const embeddedResult = await runLocalModelPreprocess(
      {
        text: input.text,
        domainType: input.domainType,
        workflowStage: input.workflowStage,
        goal: input.goal,
        locale: input.locale,
        task: input.task,
      },
      {
        task: input.task,
        timeoutMs: input.timeoutMs || undefined,
        maxTokens: input.maxTokens || undefined,
        minConfidence: input.minConfidence,
      },
    );

    return buildEmbeddedModelDecision({
      input,
      embeddedResult,
    });
  } catch (error) {
    return buildSafeFallbackDecision({
      input,
      reason: normalizeFallbackReason(error),
      modelStatus: getLocalModelHealthSnapshot(),
      embeddedModel: buildSafeEmbeddedModelError(error),
    });
  }
};
