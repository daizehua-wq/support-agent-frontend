import { Router } from 'express';
import { randomUUID } from 'crypto';
import { SpanStatusCode, trace as otelTrace } from '@opentelemetry/api';
import { readSettings } from '../services/settingsService.js';
import { appendTestRecord } from '../services/logService.js';
import { sendSuccess } from '../services/responseService.js';
import { buildDatabaseRelationSummary } from '../services/databaseService.js';
import { buildPlatformContractSummary } from '../contracts/platformContracts.js';
import { executeManifestPlugin } from '../services/pluginRegistryService.js';
import { buildTaskWorkbenchResult } from '../services/taskWorkbenchService.js';
import { normalizeCapabilityRequest } from '../services/taskModelService.js';
import {
  appendSessionStep,
  appendToHistory,
  attachSessionAsset,
  getContext,
  getOrCreateSession,
  listSessionSteps,
  saveContext,
  updateSession,
  upsertSessionEvidence,
} from '../services/sessionService.js';
import { getAssistantExecutionContext } from '../services/assistantContextService.js';
import {
  mergeAnalyzeResultWithRuleEngine,
  runAnalyzeRuleEngine,
} from '../plugins/rule-engine/index.js';
import {
  mergeSearchResultWithRuleEngine,
  runSearchRuleEngine,
} from '../plugins/search-rule-engine/index.js';
import { safeRecordGap } from '../data/models/knowledgeGap.js';
import {
  allVariablesAvailable,
  incrementUsage,
  listTemplates,
  renderTemplate,
} from '../data/models/generationTemplate.js';
import { listResourceCategories } from '../data/models/knowledgeResource.js';
import { getPromptByAppId } from '../data/models/appPrompt.js';
import { estimateTokens, safeRecordCall } from '../data/models/modelCallLog.js';
import {
  buildReferencePackSummaryText,
  getReferencePackScriptInput,
} from '../services/referencePackService.js';

const router = Router();
const tracer = otelTrace.getTracer('mock-server.runtime-routes');

const asyncWrapper = (handler) => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const setSpanStringAttribute = (span, key, value) => {
  if (typeof value === 'string' && value.trim()) {
    span.setAttribute(key, value.trim());
  }
};

const setSpanNumberAttribute = (span, key, value) => {
  if (Number.isFinite(Number(value))) {
    span.setAttribute(key, Number(value));
  }
};

const setSpanBooleanAttribute = (span, key, value) => {
  if (typeof value === 'boolean') {
    span.setAttribute(key, value);
  }
};

const withChildSpan = async (name, attributes = {}, handler) => {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    const startedAt = Date.now();

    try {
      const result = await handler(span);
      span.setStatus({
        code: SpanStatusCode.OK,
      });
      span.setAttribute('mock.span.duration_ms', Math.max(0, Date.now() - startedAt));
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'unknown-error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
};

const resolveLlmDurationMs = (...candidates) => {
  for (const candidate of candidates) {
    const normalizedValue = toFiniteNumber(candidate, Number.NaN);
    if (Number.isFinite(normalizedValue) && normalizedValue >= 0) {
      return normalizedValue;
    }
  }

  return 0;
};

const resolveAnalyzeResourceCount = (analyzeResult = {}, ruleEngineResult = null) => {
  const relatedDocumentNames = Array.isArray(analyzeResult.relatedDocumentNames)
    ? analyzeResult.relatedDocumentNames
    : Array.isArray(ruleEngineResult?.relatedDocumentNames)
      ? ruleEngineResult.relatedDocumentNames
      : [];
  const matchedProducts = Array.isArray(analyzeResult.matchedProducts)
    ? analyzeResult.matchedProducts
    : Array.isArray(ruleEngineResult?.matchedProducts)
      ? ruleEngineResult.matchedProducts
      : [];

  return relatedDocumentNames.length || matchedProducts.length;
};

const resolveComposeResourceCount = (contextRecord = null, normalizedInput = {}, finalScriptResult = {}) => {
  if (Array.isArray(contextRecord?.search?.evidenceItems)) {
    return contextRecord.search.evidenceItems.length;
  }

  if (Array.isArray(normalizedInput.attachments) && normalizedInput.attachments.length > 0) {
    return normalizedInput.attachments.length;
  }

  return readNonEmptyString(
    finalScriptResult.evidenceId,
    normalizedInput.evidenceId,
    finalScriptResult.sourceDocId,
    normalizedInput.sourceDocId,
    finalScriptResult.sourceDocName,
    normalizedInput.sourceDocName,
  )
    ? 1
    : 0;
};

const readNonEmptyString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const SEARCH_EMPTY_STATE_TIMEOUT_MS = Math.min(
  12000,
  Math.max(1000, Number(process.env.SEARCH_EMPTY_STATE_TIMEOUT_MS || '10000') || 10000),
);

const buildSearchEmptyStateExecution = ({
  keyword = '',
  sessionId = '',
  appId = '',
  startedAt = Date.now(),
  reason = '',
} = {}) => {
  const durationMs = Math.max(0, Date.now() - startedAt);
  const searchSummary = `未找到与“${keyword || '当前关键词'}”直接匹配的资料，已记录知识缺口，请补充更明确的产品名、工序名或场景关键词。`;

  return {
    output: {
      keyword,
      sessionId,
      appId,
      matchedSearchRules: [],
      matchedRule: null,
      matchedProducts: [],
      evidenceItems: [],
      primaryEvidenceIds: [],
      sourceSummary: {},
      referenceSummary: searchSummary,
      searchSummary,
      externalResults: [],
      searchRoute: 'search-empty-timeout',
      searchReason: reason || `search empty-state guard returned after ${durationMs}ms`,
      modelRuntime: {
        source: 'search-empty-state-guard',
        durationMs,
        fallbackReason: reason || 'search-empty-state-timeout',
      },
      executionContext: {
        source: {
          search: 'empty-state-guard',
        },
        fallbackReason: {
          search: reason || 'search-empty-state-timeout',
        },
        summary: {
          route: 'search-empty-timeout',
        },
      },
      searchTraceSummary: {
        outboundAllowed: false,
        outboundReason: reason || 'search-empty-state-timeout',
      },
    },
    plugin: {
      pluginId: 'builtin.search.empty-state-guard',
      executedPluginId: 'builtin.search.empty-state-guard',
    },
    trace: {
      timing: {
        durationMs,
      },
      timeoutFallback: true,
    },
    registrySummary: {
      resolution: {
        mode: 'empty-state-timeout',
        reason,
      },
    },
  };
};

const hasSearchRuleEngineHit = (result = null) => {
  if (!result || typeof result !== 'object') {
    return false;
  }

  return [
    result.matchedRules,
    result.matchedProducts,
    result.documents,
  ].some((items) => Array.isArray(items) && items.length > 0);
};

const normalizeSearchText = (value = '') => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isRelevantEvidenceForKeyword = (item = {}, keyword = '') => {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword || normalizedKeyword.length < 2) {
    return true;
  }

  const haystack = normalizeSearchText(
    [
      item.title,
      item.docType,
      item.summary,
      item.applicableScene,
      item.sourceRef,
    ].filter(Boolean).join(' '),
  );

  if (!haystack) {
    return false;
  }

  if (haystack.includes(normalizedKeyword)) {
    return true;
  }

  const terms = normalizedKeyword.split(' ').filter((term) => term.length >= 2);
  return terms.length > 0 && terms.some((term) => haystack.includes(term));
};

const withSearchEmptyStateTimeout = async (promise, context = {}, options = {}) => {
  if (options.enabled === false) {
    return promise;
  }

  const startedAt = Date.now();
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          resolve(
            buildSearchEmptyStateExecution({
              ...context,
              startedAt,
              reason: `search-main exceeded ${SEARCH_EMPTY_STATE_TIMEOUT_MS}ms empty-state guard`,
            }),
          );
        }, SEARCH_EMPTY_STATE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const assignIfMissing = (target, key, ...candidates) => {
  if (!isPlainObject(target) || readNonEmptyString(target[key])) {
    return;
  }

  const nextValue = readNonEmptyString(...candidates);
  if (nextValue) {
    target[key] = nextValue;
  }
};

const assignBooleanIfMissing = (target, key, ...candidates) => {
  if (!isPlainObject(target) || typeof target[key] === 'boolean') {
    return;
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') {
      target[key] = candidate;
      return;
    }
  }
};

const resolveRuntimeAssistantArtifacts = ({
  assistantId = '',
  executionContext = null,
  executionContextSummary = null,
  fallbackAssistantId = '',
} = {}) => {
  const normalizedExecutionContext = isPlainObject(executionContext)
    ? {
        ...executionContext,
      }
    : null;
  const normalizedExecutionContextSummary = isPlainObject(executionContextSummary)
    ? {
        ...executionContextSummary,
      }
    : isPlainObject(normalizedExecutionContext?.summary)
      ? {
          ...normalizedExecutionContext.summary,
        }
      : null;
  const settingsAssistantId = readNonEmptyString(readSettings()?.assistant?.activeAssistantId);
  const resolvedAssistantId = readNonEmptyString(
    assistantId,
    normalizedExecutionContext?.resolvedAssistant?.assistantId,
    normalizedExecutionContext?.assistantId,
    normalizedExecutionContextSummary?.assistantId,
    fallbackAssistantId,
    settingsAssistantId,
  );

  if (normalizedExecutionContextSummary) {
    assignIfMissing(normalizedExecutionContextSummary, 'assistantId', resolvedAssistantId);
  }

  if (normalizedExecutionContext) {
    assignIfMissing(normalizedExecutionContext, 'assistantId', resolvedAssistantId);

    const normalizedResolvedAssistant = isPlainObject(normalizedExecutionContext.resolvedAssistant)
      ? {
          ...normalizedExecutionContext.resolvedAssistant,
        }
      : resolvedAssistantId
        ? {}
        : null;

    if (normalizedResolvedAssistant) {
      assignIfMissing(normalizedResolvedAssistant, 'assistantId', resolvedAssistantId);
      normalizedExecutionContext.resolvedAssistant = normalizedResolvedAssistant;
    }

    if (normalizedExecutionContextSummary) {
      normalizedExecutionContext.summary = normalizedExecutionContextSummary;
    }
  }

  return {
    assistantId: resolvedAssistantId,
    executionContext: normalizedExecutionContext || executionContext || null,
    executionContextSummary:
      normalizedExecutionContextSummary ||
      (isPlainObject(executionContextSummary) ? executionContextSummary : null),
  };
};

const ensureVariables = (payload = {}) => {
  if (!isPlainObject(payload.variables)) {
    payload.variables = {};
  }

  return payload.variables;
};

const mirrorDerivedVariables = (payload = {}) => {
  const variables = ensureVariables(payload);
  const taskSubject = readNonEmptyString(
    payload.taskSubject,
    payload.topic,
    payload.productDirection,
  );
  const industryType = readNonEmptyString(payload.industryType, payload.domainType);
  const referenceSummary = readNonEmptyString(payload.referenceSummary, payload.context);

  assignIfMissing(variables, 'taskSubject', taskSubject);
  assignIfMissing(variables, 'subject', taskSubject);
  assignIfMissing(variables, 'topic', taskSubject);
  assignIfMissing(variables, 'productDirection', taskSubject);
  assignIfMissing(variables, 'industryType', industryType);
  assignIfMissing(variables, 'domain', industryType);
  assignIfMissing(variables, 'referenceSummary', referenceSummary);
};

const shouldCreateManagedSession = (req) => {
  const requestPath = readNonEmptyString(req?.path, req?.originalUrl);
  return [
    '/analyze-context',
    '/search-documents',
    '/search-references',
    '/retrieve-materials',
    '/generate-script',
    '/generate-content',
    '/compose-document',
  ].some((suffix) => requestPath.endsWith(suffix));
};

const shouldUseManagedSession = (req, sessionId = '') => {
  return Boolean(readNonEmptyString(sessionId)) || shouldCreateManagedSession(req);
};

const resolveManagedSessionId = (req, rawInput = {}) => {
  const requestedSessionId = readNonEmptyString(rawInput.sessionId);
  if (requestedSessionId) {
    return requestedSessionId;
  }

  return shouldCreateManagedSession(req) ? randomUUID() : '';
};

const getPrimarySearchEvidence = (contextRecord = {}) => {
  if (isPlainObject(contextRecord?.search?.primaryEvidence)) {
    return contextRecord.search.primaryEvidence;
  }

  if (Array.isArray(contextRecord?.search?.evidenceItems) && contextRecord.search.evidenceItems.length > 0) {
    return contextRecord.search.evidenceItems[0];
  }

  return null;
};

const hydrateSearchInputFromContext = (payload = {}, contextRecord = null) => {
  if (!isPlainObject(payload) || !contextRecord) {
    return payload;
  }

  const cachedTaskSubject = readNonEmptyString(
    contextRecord?.search?.taskSubject,
    contextRecord?.search?.topic,
    contextRecord?.analysis?.taskSubject,
    contextRecord?.analysis?.topic,
    contextRecord?.content?.taskSubject,
    contextRecord?.content?.topic,
  );
  const cachedIndustryType = readNonEmptyString(
    contextRecord?.search?.industryType,
    contextRecord?.search?.domainType,
    contextRecord?.analysis?.industryType,
    contextRecord?.analysis?.domainType,
    contextRecord?.content?.industryType,
    contextRecord?.content?.domainType,
  );
  const cachedReferenceSummary = readNonEmptyString(
    contextRecord?.search?.referenceSummary,
    contextRecord?.analysis?.summary,
    contextRecord?.analysis?.context,
    contextRecord?.content?.referenceSummary,
  );

  assignIfMissing(payload, 'topic', cachedTaskSubject);
  assignIfMissing(payload, 'taskSubject', payload.topic, cachedTaskSubject);
  assignIfMissing(payload, 'productDirection', payload.taskSubject, payload.topic, cachedTaskSubject);
  assignIfMissing(payload, 'domainType', cachedIndustryType);
  assignIfMissing(payload, 'industryType', payload.domainType, cachedIndustryType);
  assignIfMissing(
    payload,
    'keyword',
    payload.topic,
    payload.taskSubject,
    contextRecord?.search?.keyword,
    cachedTaskSubject,
  );
  assignIfMissing(payload, 'context', payload.referenceSummary, cachedReferenceSummary);
  assignIfMissing(payload, 'referenceSummary', payload.context, cachedReferenceSummary);
  mirrorDerivedVariables(payload);

  return payload;
};

const hydrateComposeInputFromContext = (payload = {}, contextRecord = null) => {
  if (!isPlainObject(payload) || !contextRecord) {
    return payload;
  }

  const cachedTaskSubject = readNonEmptyString(
    contextRecord?.content?.taskSubject,
    contextRecord?.search?.taskSubject,
    contextRecord?.analysis?.taskSubject,
    contextRecord?.analysis?.topic,
  );
  const cachedIndustryType = readNonEmptyString(
    contextRecord?.content?.industryType,
    contextRecord?.content?.domainType,
    contextRecord?.search?.industryType,
    contextRecord?.analysis?.industryType,
    contextRecord?.analysis?.domainType,
  );
  const cachedReferenceSummary = readNonEmptyString(
    contextRecord?.search?.searchSummary,
    contextRecord?.search?.primaryEvidence?.summary,
    contextRecord?.search?.referenceSummary,
    contextRecord?.content?.referenceSummary,
    contextRecord?.analysis?.summary,
    contextRecord?.analysis?.context,
  );
  const primaryEvidence = getPrimarySearchEvidence(contextRecord);

  assignIfMissing(payload, 'topic', cachedTaskSubject);
  assignIfMissing(payload, 'taskSubject', payload.topic, cachedTaskSubject);
  assignIfMissing(payload, 'productDirection', payload.taskSubject, payload.topic, cachedTaskSubject);
  assignIfMissing(payload, 'domainType', cachedIndustryType);
  assignIfMissing(payload, 'industryType', payload.domainType, cachedIndustryType);
  assignIfMissing(payload, 'referenceSummary', cachedReferenceSummary);
  assignIfMissing(payload, 'context', payload.referenceSummary, cachedReferenceSummary);
  assignIfMissing(payload, 'evidenceId', contextRecord?.search?.primaryEvidenceId, contextRecord?.content?.evidenceId);
  assignIfMissing(payload, 'sourceDocId', primaryEvidence?.sourceRef, primaryEvidence?.sourceDocId);
  assignIfMissing(payload, 'sourceDocName', primaryEvidence?.title, primaryEvidence?.sourceDocName);
  assignIfMissing(payload, 'sourceDocType', primaryEvidence?.docType, primaryEvidence?.sourceDocType);
  assignIfMissing(
    payload,
    'sourceApplicableScene',
    primaryEvidence?.applicableScene,
    primaryEvidence?.sourceApplicableScene,
  );
  assignBooleanIfMissing(
    payload,
    'sourceExternalAvailable',
    primaryEvidence?.sourceExternalAvailable,
    primaryEvidence?.outboundStatus === 'allowed',
  );
  mirrorDerivedVariables(payload);

  return payload;
};

const buildManagedInput = async (req, rawInput = {}, capability = 'analyze') => {
  const nextInput = isPlainObject(rawInput) ? { ...rawInput } : {};
  const managedSessionId = resolveManagedSessionId(req, nextInput);

  if (managedSessionId && !readNonEmptyString(nextInput.sessionId)) {
    nextInput.sessionId = managedSessionId;
  }

  const contextRecord = managedSessionId ? await getContext(managedSessionId) : null;

  if (capability === 'search') {
    hydrateSearchInputFromContext(nextInput, contextRecord);
  }

  if (capability === 'compose') {
    hydrateComposeInputFromContext(nextInput, contextRecord);
  }

  return {
    rawInput: nextInput,
    sessionId: managedSessionId,
    contextRecord,
  };
};

const buildAnalyzeContextSnapshot = ({ normalizedInput = {}, analyzeResult = {} } = {}) => ({
  taskInput:
    normalizedInput.taskInput || normalizedInput.customerText || '',
  taskSubject:
    normalizedInput.taskSubject || normalizedInput.productDirection || '',
  topic:
    normalizedInput.taskSubject || normalizedInput.productDirection || '',
  industryType: normalizedInput.industryType || 'other',
  domainType: normalizedInput.industryType || 'other',
  taskPhase: normalizedInput.taskPhase || normalizedInput.salesStage || 'other',
  audience: normalizedInput.audience || normalizedInput.customerType || '',
  context: normalizedInput.context || normalizedInput.referenceSummary || '',
  summary: analyzeResult.finalAnalyzeData?.summary || '',
  sceneJudgement: analyzeResult.finalAnalyzeData?.sceneJudgement || '',
  recommendedProducts: Array.isArray(analyzeResult.finalAnalyzeData?.recommendedProducts)
    ? analyzeResult.finalAnalyzeData.recommendedProducts
    : [],
  nextStepType: analyzeResult.finalAnalyzeData?.nextStepType || '',
  sessionId: analyzeResult.sessionId || normalizedInput.sessionId || '',
});

const buildSearchContextSnapshot = ({
  normalizedInput = {},
  searchResult = {},
  searchEvidenceItems = [],
} = {}) => {
  const primaryEvidenceIds = Array.isArray(searchResult.primaryEvidenceIds)
    ? searchResult.primaryEvidenceIds
    : [];
  const primaryEvidence =
    searchEvidenceItems.find((item) => primaryEvidenceIds.includes(item.evidenceId)) ||
    searchEvidenceItems[0] ||
    null;
  const referenceSummary = readNonEmptyString(
    normalizedInput.referenceSummary,
    normalizedInput.context,
    searchResult.referenceSummary,
  );

  return {
    keyword: normalizedInput.keyword || '',
    taskSubject: normalizedInput.taskSubject || normalizedInput.keyword || '',
    topic: normalizedInput.taskSubject || normalizedInput.keyword || '',
    industryType: normalizedInput.industryType || 'other',
    domainType: normalizedInput.industryType || 'other',
    docType: normalizedInput.docType || '',
    referenceSummary,
    searchSummary: searchResult.searchSummary || searchResult.referenceSummary || '',
    sourceSummary: searchResult.sourceSummary || null,
    primaryEvidenceId: primaryEvidence?.evidenceId || primaryEvidenceIds[0] || '',
    primaryEvidence,
    primaryEvidenceIds,
    evidenceItems: searchEvidenceItems,
    referencePackId: searchResult.referencePackId || '',
    referencePack: searchResult.referencePack || null,
    governedEvidenceItems: searchResult.governedEvidenceItems || [],
    sessionId: searchResult.sessionId || normalizedInput.sessionId || '',
  };
};

const buildContentContextSnapshot = ({ normalizedInput = {}, finalScriptResult = {}, sessionId = '' } = {}) => ({
  taskSubject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
  topic: normalizedInput.taskSubject || normalizedInput.productDirection || '',
  industryType: normalizedInput.industryType || 'other',
  domainType: normalizedInput.industryType || 'other',
  referenceSummary:
    normalizedInput.referenceSummary || finalScriptResult.referenceSummary || '',
  goal: normalizedInput.goal || '',
  goalScene: normalizedInput.goalScene || normalizedInput.communicationGoal || '',
  evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
  referencePackId: finalScriptResult.referencePackId || normalizedInput.referencePackId || '',
  sourceDocId: finalScriptResult.sourceDocId || normalizedInput.sourceDocId || '',
  sourceDocName: finalScriptResult.sourceDocName || normalizedInput.sourceDocName || '',
  sourceDocType: finalScriptResult.sourceDocType || normalizedInput.sourceDocType || '',
  sourceApplicableScene:
    finalScriptResult.sourceApplicableScene || normalizedInput.sourceApplicableScene || '',
  sourceExternalAvailable:
    finalScriptResult.sourceExternalAvailable ?? normalizedInput.sourceExternalAvailable,
  llmRoute: finalScriptResult.llmRoute || '',
  sessionId: sessionId || normalizedInput.sessionId || '',
});

const buildAnalyzeRuleEngineContext = ({
  rawInput = {},
  normalizedInput = {},
  settings = {},
  executionContext = null,
} = {}) => {
  const assistantContext = getAssistantExecutionContext(settings);

  return {
    capability: 'analyze-context',
    rawInput,
    normalizedInput,
    taskInput: normalizedInput.taskInput || normalizedInput.customerText || '',
    taskSubject:
      normalizedInput.taskSubject ||
      normalizedInput.productDirection ||
      normalizedInput.topic ||
      '',
    taskPhase: normalizedInput.taskPhase || normalizedInput.salesStage || 'other',
    industryType: normalizedInput.industryType || normalizedInput.domainType || 'other',
    text: `${normalizedInput.taskInput || normalizedInput.customerText || ''} ${
      normalizedInput.taskSubject || normalizedInput.productDirection || normalizedInput.topic || ''
    }`.trim(),
    executionContext:
      (isPlainObject(executionContext) && executionContext) ||
      assistantContext.executionContext ||
      {},
  };
};

const buildSearchRuleEngineContext = ({
  rawInput = {},
  normalizedInput = {},
  settings = {},
  executionContext = null,
} = {}) => {
  const assistantContext = getAssistantExecutionContext(settings);

  return {
    capability: 'search-documents',
    rawInput,
    normalizedInput,
    keyword: normalizedInput.keyword || '',
    industryType: normalizedInput.industryType || normalizedInput.domainType || 'other',
    docType: normalizedInput.docType || '',
    executionContext:
      (isPlainObject(executionContext) && executionContext) ||
      assistantContext.executionContext ||
      {},
  };
};

// =========================
// 运行接口｜Runtime Routes
// 当前只承接：
// - Analyze
// - Search
// - Script
// 不承接：
// - currentPublished / moduleBindings / governanceDefinition
// - Settings 配置对象
// - DatabaseManager 治理对象
// =========================

const buildGovernanceSummary = ({
  assistantId = '',
  promptId = '',
  promptVersion = '',
  strategy = null,
  executionContext = null,
  executionContextSummary = null,
  source = null,
  fallbackReason = null,
  fallbackAssistantId = '',
} = {}) => {
  const resolvedAssistantArtifacts = resolveRuntimeAssistantArtifacts({
    assistantId,
    executionContext,
    executionContextSummary,
    fallbackAssistantId,
  });

  return {
    assistantId: resolvedAssistantArtifacts.assistantId,
    promptId,
    promptVersion,
    resolvedAssistant: resolvedAssistantArtifacts.executionContext?.resolvedAssistant || null,
    resolvedPrompt: resolvedAssistantArtifacts.executionContext?.resolvedPrompt || null,
    strategy: strategy || resolvedAssistantArtifacts.executionContext?.strategy || null,
    executionContextSummary: resolvedAssistantArtifacts.executionContextSummary,
    source: source || resolvedAssistantArtifacts.executionContext?.source || null,
    fallbackReason: fallbackReason || resolvedAssistantArtifacts.executionContext?.fallbackReason || null,
  };
};

const buildModelRuntimeSummary = (modelRuntime = null) => ({
  resolvedModel: modelRuntime?.resolvedModel || null,
  modelSource: modelRuntime?.resolvedModel?.source || modelRuntime?.reason || '',
});

const buildContinuePayload = ({
  sessionId = '',
  stepId = '',
  evidenceId = '',
  fromModule = '',
  assistantId = '',
  executionContext = null,
  executionContextSummary = null,
  fallbackAssistantId = '',
} = {}) => {
  const resolvedAssistantArtifacts = resolveRuntimeAssistantArtifacts({
    assistantId,
    executionContext,
    executionContextSummary,
    fallbackAssistantId,
  });

  return {
    sessionId: sessionId || undefined,
    stepId: stepId || undefined,
    evidenceId: evidenceId || undefined,
    fromModule: fromModule || undefined,
    assistantId: resolvedAssistantArtifacts.assistantId || undefined,
    executionContext: resolvedAssistantArtifacts.executionContext,
    executionContextSummary: resolvedAssistantArtifacts.executionContextSummary,
  };
};

const buildRuntimeInterfaceContract = (primary = []) => ({
  primary,
  frozenLegacyFlatFields: [
    'assistantId',
    'promptId',
    'promptVersion',
    'strategy',
    'source',
    'fallbackReason',
    'executionContext',
    'resolvedAssistant',
    'resolvedPrompt',
    'resolvedModel',
    'modelSource',
  ],
  retirementPlanned: [
    'assistantId',
    'promptId',
    'promptVersion',
    'strategy',
    'source',
    'fallbackReason',
    'executionContext',
    'resolvedAssistant',
    'resolvedPrompt',
    'resolvedModel',
    'modelSource',
  ],
});

const buildTaskModelMeta = (taskModel = null) => ({
  contractVersion: 'task-model/v1',
  taskInput: taskModel?.taskInput || '',
  context: taskModel?.context || '',
  goal: taskModel?.goal || '',
  deliverable: taskModel?.deliverable || '',
  variables: taskModel?.variables || {},
  attachments: taskModel?.attachments || [],
});

const hasPersistedSessionStep = (sessionId = '', stepId = '') => {
  if (!sessionId || !stepId) {
    return false;
  }

  return listSessionSteps(sessionId).some((step) => step.id === stepId);
};

const buildSessionTitle = (prefix = '', ...candidates) => {
  const subject = readNonEmptyString(...candidates);
  return subject ? `${prefix}｜${subject}` : undefined;
};

const resolveModelNameFromRuntime = (modelRuntime = {}) => {
  return readNonEmptyString(
    modelRuntime?.resolvedModel?.resolvedModelName,
    modelRuntime?.resolvedModel?.modelName,
    modelRuntime?.resolvedModel?.model,
    modelRuntime?.resolvedModel?.id,
    modelRuntime?.modelName,
  );
};

const isModelRuntimeSuccess = (modelRuntime = {}) => {
  const statusText = [
    modelRuntime?.route,
    modelRuntime?.reason,
    modelRuntime?.error,
    ...(Array.isArray(modelRuntime?.attempts)
      ? modelRuntime.attempts.map((item) => `${item?.result || ''} ${item?.error || ''}`)
      : []),
  ]
    .join(' ')
    .toLowerCase();

  if (!statusText) {
    return true;
  }

  return !/(error|failed|failure|fallback|not-configured|authenticationerror|apiconnectionerror)/i.test(
    statusText,
  );
};

const recordWorkflowModelCall = ({
  appId = '',
  modelRuntime = null,
  latencyMs = 0,
  tokensUsed = null,
  inputText = '',
  outputText = '',
} = {}) => {
  const model = resolveModelNameFromRuntime(modelRuntime || {});

  if (!model) {
    return;
  }

  safeRecordCall({
    appId,
    model,
    success: isModelRuntimeSuccess(modelRuntime || {}),
    latencyMs,
    tokensUsed:
      tokensUsed === null || tokensUsed === undefined
        ? estimateTokens(inputText, outputText)
        : Math.max(0, Number(tokensUsed) || 0),
  });
};

const resolveGenerationTemplateForUsage = ({
  goalScene = '',
  toneStyle = 'formal',
  appId = '',
} = {}) => {
  const scene = readNonEmptyString(goalScene, 'first_reply');
  const normalizedToneStyle = readNonEmptyString(toneStyle, 'formal');
  const templates = listTemplates({ appId });
  let sceneTemplates = templates.filter((item) => item.scene === scene);

  if (sceneTemplates.length === 0) {
    sceneTemplates = templates.filter((item) => item.scene === 'first_reply');
  }

  return (
    sceneTemplates.find((item) => item.toneStyle === normalizedToneStyle) ||
    templates.find((item) => item.scene === 'first_reply' && item.toneStyle === normalizedToneStyle) ||
    sceneTemplates[0] ||
    null
  );
};

const stringifyTemplateValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (isPlainObject(item) ? JSON.stringify(item) : readNonEmptyString(item)))
      .filter(Boolean)
      .join('；');
  }

  if (isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return readNonEmptyString(value);
};

const firstTemplateValue = (...values) => {
  for (const value of values) {
    const normalizedValue = stringifyTemplateValue(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const buildDirectTemplateContext = (normalizedInput = {}) => {
  const variables = isPlainObject(normalizedInput.variables) ? normalizedInput.variables : {};
  const analysisResult = isPlainObject(normalizedInput.analysisResult)
    ? normalizedInput.analysisResult
    : isPlainObject(normalizedInput.analysis_result)
      ? normalizedInput.analysis_result
      : {};
  const companyData = isPlainObject(normalizedInput.companyData)
    ? normalizedInput.companyData
    : isPlainObject(normalizedInput.cachedCompanyData)
      ? normalizedInput.cachedCompanyData
      : {};
  const guidanceNotes = [
    ...(Array.isArray(normalizedInput.guidanceNotes) ? normalizedInput.guidanceNotes : []),
    ...(Array.isArray(normalizedInput.cautionNotes) ? normalizedInput.cautionNotes : []),
  ];
  const contextData = {
    ...variables,
    task_subject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
    taskSubject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
    task_input: normalizedInput.taskInput || normalizedInput.customerText || '',
    taskInput: normalizedInput.taskInput || normalizedInput.customerText || '',
    reference_summary: normalizedInput.referenceSummary || normalizedInput.context || '',
    referenceSummary: normalizedInput.referenceSummary || normalizedInput.context || '',
    focus_points: normalizedInput.focusPoints || normalizedInput.concernPoints || '',
    focusPoints: normalizedInput.focusPoints || normalizedInput.concernPoints || '',
    guidance_notes: guidanceNotes.map((item) => stringifyTemplateValue(item?.content || item)).filter(Boolean).join('\n'),
  };

  contextData.company_name = firstTemplateValue(
    variables.company_name,
    variables.companyName,
    normalizedInput.company_name,
    normalizedInput.companyName,
    companyData.company_name,
    companyData.companyName,
    normalizedInput.taskSubject,
    normalizedInput.productDirection,
    normalizedInput.taskObject,
  );
  contextData.companyName = contextData.company_name;
  contextData.risk_level = firstTemplateValue(
    variables.risk_level,
    variables.riskLevel,
    normalizedInput.risk_level,
    normalizedInput.riskLevel,
    analysisResult.risk_level,
    analysisResult.riskLevel,
  );
  contextData.riskLevel = contextData.risk_level;
  contextData.risk_details = firstTemplateValue(
    variables.risk_details,
    variables.riskDetails,
    normalizedInput.risk_details,
    normalizedInput.riskDetails,
    analysisResult.risk_details,
    analysisResult.riskDetails,
    analysisResult.summary,
    companyData.risk_info,
    companyData.riskInfo,
  );
  contextData.riskDetails = contextData.risk_details;
  contextData.suggestions = firstTemplateValue(
    variables.suggestions,
    variables.recommended_actions,
    variables.recommendedActions,
    normalizedInput.suggestions,
    normalizedInput.recommendations,
    analysisResult.suggestions,
    analysisResult.recommended_actions,
    analysisResult.recommendedActions,
  );

  return contextData;
};

const buildDirectTemplateModelRuntime = (durationMs = 0) => ({
  route: 'rule_only',
  reason: 'standard_template_rendered_before_plugin',
  durationMs,
  latencyMs: durationMs,
  tokensUsed: 0,
  resolvedModel: {
    isResolved: true,
    resolvedProvider: 'rule',
    resolvedModelName: 'rule_only',
    source: 'generation-template',
  },
});

const recordGenerationTemplateUsage = ({
  normalizedInput = {},
  scriptResult = {},
  finalScriptResult = {},
} = {}) => {
  const explicitTemplateId = readNonEmptyString(
    scriptResult.selectedTemplateId,
    finalScriptResult.selectedTemplateId,
  );
  const appId = readNonEmptyString(normalizedInput.appId, normalizedInput.app_id);
  const scopedTemplate = resolveGenerationTemplateForUsage({
    goalScene: normalizedInput.goalScene || normalizedInput.communicationGoal || '',
    toneStyle: normalizedInput.toneStyle || 'formal',
    appId,
  });
  const template =
    appId && scopedTemplate?.appId
      ? scopedTemplate
      : explicitTemplateId
        ? { id: explicitTemplateId }
        : scopedTemplate;

  if (!template?.id) {
    return '';
  }

  incrementUsage(template.id);
  return template.id;
};

const persistAnalyzeTraceCompat = ({
  normalizedInput = {},
  analyzeResult = {},
  databaseRelationSummary = null,
} = {}) => {
  const sessionId = readNonEmptyString(analyzeResult.sessionId, normalizedInput.sessionId);
  const stepId = readNonEmptyString(analyzeResult.stepId);

  if (!sessionId || !stepId || hasPersistedSessionStep(sessionId, stepId)) {
    return;
  }

  const executionContext = analyzeResult.executionContext || null;
  const resolvedAssistantArtifacts = resolveRuntimeAssistantArtifacts({
    assistantId: analyzeResult.activeAssistantId || '',
    executionContext,
    fallbackAssistantId: normalizedInput.assistantId || '',
  });
  const resolvedAssistantId = resolvedAssistantArtifacts.assistantId;
  const resolvedExecutionContext = resolvedAssistantArtifacts.executionContext;
  const resolvedExecutionContextSummary = resolvedAssistantArtifacts.executionContextSummary;
  const title = buildSessionTitle(
    'judge',
    normalizedInput.taskSubject,
    normalizedInput.productDirection,
    normalizedInput.taskInput,
  );
  const session = getOrCreateSession({
    sessionId,
    title,
    taskInput: normalizedInput.taskInput || '',
    context: normalizedInput.context || '',
    goal: normalizedInput.goal || '',
    deliverable: normalizedInput.deliverable || '',
    variables: normalizedInput.variables || {},
    attachments: normalizedInput.attachments || [],
    taskObject: normalizedInput.taskObject || '',
    audience: readNonEmptyString(normalizedInput.audience, '通用工作会话'),
    industryType: normalizedInput.industryType || 'other',
    sourceModule: 'analyze',
    currentStage: readNonEmptyString(normalizedInput.taskPhase, normalizedInput.salesStage, 'requirement_discussion'),
    currentGoal: normalizedInput.goal || 'judge_task',
    taskSubject: readNonEmptyString(normalizedInput.taskSubject, normalizedInput.productDirection),
    assistantId: resolvedAssistantId,
    executionContext: resolvedExecutionContext,
    databaseSummary: databaseRelationSummary,
  });

  appendSessionStep({
    id: stepId,
    sessionId: session.id,
    stepType: 'analyze',
    inputPayload: {
      sessionId,
      fromModule: normalizedInput.fromModule || '',
      assistantId: resolvedAssistantId,
      promptId: analyzeResult.promptId || '',
      promptVersion: analyzeResult.promptVersion || '',
      strategy: analyzeResult.strategy || '',
      source: analyzeResult.source || null,
      fallbackReason: analyzeResult.fallbackReason || null,
      resolvedAssistant: resolvedExecutionContext?.resolvedAssistant || null,
      resolvedPrompt: resolvedExecutionContext?.resolvedPrompt || null,
      executionContextSummary: resolvedExecutionContextSummary,
      executionContext: resolvedExecutionContext,
      resolvedModel: analyzeResult.modelRuntime?.resolvedModel || null,
      taskObject: normalizedInput.taskObject || '',
      audience: normalizedInput.audience || '',
      industryType: normalizedInput.industryType || 'other',
      taskSubject: readNonEmptyString(normalizedInput.taskSubject, normalizedInput.productDirection),
      taskPhase: readNonEmptyString(normalizedInput.taskPhase, normalizedInput.salesStage),
      taskInput: normalizedInput.taskInput || '',
      context: normalizedInput.context || '',
      goal: normalizedInput.goal || '',
      deliverable: normalizedInput.deliverable || '',
      variables: normalizedInput.variables || {},
      attachments: normalizedInput.attachments || [],
      databaseSummary: databaseRelationSummary,
    },
    outputPayload: {
      matchedRule: analyzeResult.matchedRule || null,
      matchedProducts: Array.isArray(analyzeResult.matchedProducts) ? analyzeResult.matchedProducts : [],
      relatedDocumentNames: Array.isArray(analyzeResult.relatedDocumentNames)
        ? analyzeResult.relatedDocumentNames
        : [],
      finalAnalyzeData: analyzeResult.finalAnalyzeData || {},
      assistantId: resolvedAssistantId,
      resolvedAssistant: resolvedExecutionContext?.resolvedAssistant || null,
      resolvedPrompt: resolvedExecutionContext?.resolvedPrompt || null,
      executionContextSummary: resolvedExecutionContextSummary,
      executionContext: resolvedExecutionContext,
      resolvedModel: analyzeResult.modelRuntime?.resolvedModel || null,
      modelRuntime: analyzeResult.modelRuntime || null,
    },
    summary: analyzeResult.finalAnalyzeData?.summary || '',
    route: analyzeResult.analysisRoute || '',
    strategy: analyzeResult.analyzeStrategy || '',
    executionStrategy: analyzeResult.analyzeExecutionStrategy || '',
    outboundAllowed: Boolean(analyzeResult.analyzeOutboundDecision?.outboundAllowed),
    outboundReason: analyzeResult.analyzeOutboundDecision?.outboundReason || '',
    modelName: resolveModelNameFromRuntime(analyzeResult.modelRuntime),
  });

  const relatedDocumentNames = Array.isArray(analyzeResult.relatedDocumentNames)
    ? analyzeResult.relatedDocumentNames
    : [];

  relatedDocumentNames.forEach((docName) => {
    if (!readNonEmptyString(docName)) {
      return;
    }

    attachSessionAsset({
      sessionId: session.id,
      sourceModule: 'analyze',
      docId: '',
      docName,
      docType: '推荐资料',
      applicableScene: analyzeResult.finalAnalyzeData?.sceneJudgement || '',
      externalAvailable: false,
    });
  });

  updateSession(session.id, {
    sourceModule: 'analyze',
    currentStage: readNonEmptyString(normalizedInput.taskPhase, normalizedInput.salesStage, 'requirement_discussion'),
    currentGoal: normalizedInput.goal || 'judge_task',
    assistantId: resolvedAssistantId,
    executionContextSummary: resolvedExecutionContextSummary,
    databaseSummary: databaseRelationSummary,
    title: title || session.title,
  });
};

const persistSearchTraceCompat = ({
  normalizedInput = {},
  searchResult = {},
  searchEvidenceItems = [],
  databaseRelationSummary = null,
} = {}) => {
  const sessionId = readNonEmptyString(searchResult.sessionId, normalizedInput.sessionId);
  const stepId = readNonEmptyString(searchResult.stepId);

  if (!sessionId || !stepId || hasPersistedSessionStep(sessionId, stepId)) {
    return;
  }

  const executionContext = searchResult.executionContext || null;
  const resolvedAssistantArtifacts = resolveRuntimeAssistantArtifacts({
    assistantId: searchResult.activeAssistantId || '',
    executionContext,
    fallbackAssistantId: normalizedInput.assistantId || '',
  });
  const resolvedAssistantId = resolvedAssistantArtifacts.assistantId;
  const resolvedExecutionContext = resolvedAssistantArtifacts.executionContext;
  const resolvedExecutionContextSummary = resolvedAssistantArtifacts.executionContextSummary;
  const hydratedReferenceSummary = readNonEmptyString(
    normalizedInput.referenceSummary,
    normalizedInput.context,
    searchResult.referenceSummary,
  );
  const title = buildSessionTitle(
    'retrieve',
    normalizedInput.keyword,
    normalizedInput.taskSubject,
    normalizedInput.taskInput,
  );
  const session = getOrCreateSession({
    sessionId,
    title,
    taskInput: normalizedInput.taskInput || '',
    context: normalizedInput.context || '',
    goal: normalizedInput.goal || '',
    deliverable: normalizedInput.deliverable || '',
    variables: normalizedInput.variables || {},
    attachments: normalizedInput.attachments || [],
    audience: '通用工作会话',
    industryType: normalizedInput.industryType || 'other',
    sourceModule: 'search',
    currentStage: 'requirement_discussion',
    currentGoal: normalizedInput.goal || 'retrieve_materials',
    keyword: normalizedInput.keyword || '',
    taskSubject: readNonEmptyString(
      normalizedInput.taskSubject,
      searchResult.matchedProducts?.[0]?.productName,
      normalizedInput.keyword,
    ),
    assistantId: resolvedAssistantId,
    executionContext: resolvedExecutionContext,
    databaseSummary: databaseRelationSummary,
  });

  appendSessionStep({
    id: stepId,
    sessionId: session.id,
    stepType: 'search',
    inputPayload: {
      sessionId,
      keyword: normalizedInput.keyword || '',
      docType: normalizedInput.docType,
      assistantId: resolvedAssistantId,
      promptId: searchResult.promptId || '',
      promptVersion: searchResult.promptVersion || '',
      strategy: searchResult.strategy || '',
      source: searchResult.source || null,
      fallbackReason: searchResult.fallbackReason || null,
      resolvedAssistant: resolvedExecutionContext?.resolvedAssistant || null,
      resolvedPrompt: resolvedExecutionContext?.resolvedPrompt || null,
      executionContextSummary: resolvedExecutionContextSummary,
      executionContext: resolvedExecutionContext,
      resolvedModel: searchResult.modelRuntime?.resolvedModel || null,
      taskInput: normalizedInput.taskInput || '',
      context: normalizedInput.context || '',
      referenceSummary: hydratedReferenceSummary,
      goal: normalizedInput.goal || '',
      deliverable: normalizedInput.deliverable || '',
      variables: normalizedInput.variables || {},
      attachments: normalizedInput.attachments || [],
      databaseSummary: databaseRelationSummary,
    },
    outputPayload: {
      matchedRule: searchResult.matchedRule || null,
      matchedProducts: Array.isArray(searchResult.matchedProducts) ? searchResult.matchedProducts : [],
      evidenceItems: searchEvidenceItems,
      primaryEvidenceIds: Array.isArray(searchResult.primaryEvidenceIds) ? searchResult.primaryEvidenceIds : [],
      searchSummary: searchResult.searchSummary || '',
      referenceSummary: hydratedReferenceSummary,
      sourceSummary: searchResult.sourceSummary || null,
      assistantId: resolvedAssistantId,
      resolvedAssistant: resolvedExecutionContext?.resolvedAssistant || null,
      resolvedPrompt: resolvedExecutionContext?.resolvedPrompt || null,
      executionContextSummary: resolvedExecutionContextSummary,
      executionContext: resolvedExecutionContext,
      modelRuntime: searchResult.modelRuntime || null,
      externalResults: Array.isArray(searchResult.externalResults) ? searchResult.externalResults : [],
    },
    summary: searchResult.searchSummary || hydratedReferenceSummary || '',
    route: searchResult.searchRoute || '',
    strategy: searchResult.searchStrategy || '',
    executionStrategy: searchResult.searchExecutionStrategy || '',
    outboundAllowed: Boolean(searchResult.searchTraceSummary?.outboundAllowed),
    outboundReason:
      searchResult.searchTraceSummary?.outboundReason ||
      searchResult.searchReason ||
      '',
    modelName: resolveModelNameFromRuntime(searchResult.modelRuntime),
  });

  const primaryEvidenceIds = Array.isArray(searchResult.primaryEvidenceIds)
    ? searchResult.primaryEvidenceIds
    : [];

  searchEvidenceItems.forEach((evidence) => {
    if (!readNonEmptyString(evidence?.evidenceId, evidence?.title)) {
      return;
    }

    upsertSessionEvidence({
      sessionId: session.id,
      sourceModule: 'search',
      evidenceId: evidence.evidenceId,
      level: evidence.level,
      sourceType: evidence.sourceType,
      sourceRef: evidence.sourceRef,
      title: evidence.title,
      docType: evidence.docType,
      summary: evidence.summary,
      applicableScene: evidence.applicableScene,
      outboundStatus: evidence.outboundStatus,
      outboundPolicy: evidence.outboundPolicy,
      confidence: evidence.confidence,
      relatedAssistantId: evidence.relatedAssistantId,
      relatedSessionId: session.id,
      productId: evidence.productId,
      productName: evidence.productName,
      isPrimaryEvidence: primaryEvidenceIds.includes(evidence.evidenceId),
    });
  });

  const documents = Array.isArray(searchResult.documents) ? searchResult.documents : [];
  documents.forEach((doc) => {
    if (!readNonEmptyString(doc?.docName)) {
      return;
    }

    attachSessionAsset({
      sessionId: session.id,
      sourceModule: 'search',
      docId: doc.id,
      docName: doc.docName,
      docType: doc.docType,
      applicableScene: doc.applicableScene,
      externalAvailable: Boolean(doc.externalAvailable),
    });
  });

  updateSession(session.id, {
    sourceModule: 'search',
    currentStage: 'requirement_discussion',
    currentGoal: normalizedInput.goal || 'retrieve_materials',
    assistantId: resolvedAssistantId,
    executionContextSummary: resolvedExecutionContextSummary,
    databaseSummary: databaseRelationSummary,
    title: title || session.title,
  });
};

const persistComposeTraceCompat = ({
  normalizedInput = {},
  scriptResult = {},
  finalScriptResult = {},
  databaseRelationSummary = null,
} = {}) => {
  const sessionId = readNonEmptyString(scriptResult.sessionId, normalizedInput.sessionId);
  const stepId = readNonEmptyString(scriptResult.stepId);

  if (!sessionId || !stepId || hasPersistedSessionStep(sessionId, stepId)) {
    return;
  }

  const executionContext = scriptResult.executionContext || finalScriptResult.executionContext || null;
  const resolvedAssistantArtifacts = resolveRuntimeAssistantArtifacts({
    assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
    executionContext,
    executionContextSummary: finalScriptResult.executionContextSummary || null,
    fallbackAssistantId: normalizedInput.assistantId || '',
  });
  const resolvedAssistantId = resolvedAssistantArtifacts.assistantId;
  const resolvedExecutionContext = resolvedAssistantArtifacts.executionContext;
  const resolvedExecutionContextSummary = resolvedAssistantArtifacts.executionContextSummary;
  const effectiveTaskSubject = readNonEmptyString(
    normalizedInput.taskSubject,
    normalizedInput.productDirection,
  );
  const title = buildSessionTitle(
    'compose',
    effectiveTaskSubject,
    normalizedInput.taskInput,
    normalizedInput.referenceSummary,
  );
  const session = getOrCreateSession({
    sessionId,
    title,
    taskInput: normalizedInput.taskInput || '',
    context: normalizedInput.context || '',
    goal: normalizedInput.goal || '',
    deliverable: normalizedInput.deliverable || '',
    variables: normalizedInput.variables || {},
    attachments: normalizedInput.attachments || [],
    audience: readNonEmptyString(normalizedInput.audience, '通用工作会话'),
    industryType: normalizedInput.industryType || 'other',
    sourceModule: 'script',
    currentStage: readNonEmptyString(normalizedInput.taskPhase, 'drafting'),
    currentGoal: normalizedInput.goal || 'compose_document',
    taskSubject: effectiveTaskSubject,
    assistantId: resolvedAssistantId,
    executionContext: resolvedExecutionContext,
    databaseSummary: databaseRelationSummary,
    appId: normalizedInput.appId || normalizedInput.app_id || '',
  });

  appendSessionStep({
    id: stepId,
    sessionId: session.id,
    stepType: 'script',
    inputPayload: {
      sessionId,
      appId: normalizedInput.appId || normalizedInput.app_id || '',
      fromModule: normalizedInput.fromModule || '',
      evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
      assistantId: resolvedAssistantId,
      promptId: scriptResult.promptId || finalScriptResult.promptId || '',
      promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
      strategy: scriptResult.strategy || finalScriptResult.strategy || '',
      source: scriptResult.source || finalScriptResult.source || null,
      fallbackReason: scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
      resolvedAssistant:
        resolvedExecutionContext?.resolvedAssistant || finalScriptResult.resolvedAssistant || null,
      resolvedPrompt: resolvedExecutionContext?.resolvedPrompt || finalScriptResult.resolvedPrompt || null,
      executionContextSummary: resolvedExecutionContextSummary,
      executionContext: resolvedExecutionContext,
      resolvedModel: scriptResult.modelRuntime?.resolvedModel || finalScriptResult.resolvedModel || null,
      audience: normalizedInput.audience || '',
      taskPhase: normalizedInput.taskPhase || '',
      goalScene: normalizedInput.goalScene || '',
      focusPoints: normalizedInput.focusPoints || '',
      referenceSummary: normalizedInput.referenceSummary || finalScriptResult.referenceSummary || '',
      taskInput: normalizedInput.taskInput || '',
      context: normalizedInput.context || '',
      goal: normalizedInput.goal || '',
      deliverable: normalizedInput.deliverable || '',
      variables: normalizedInput.variables || {},
      attachments: normalizedInput.attachments || [],
      sourceDocId: finalScriptResult.sourceDocId || normalizedInput.sourceDocId || '',
      sourceDocName: finalScriptResult.sourceDocName || normalizedInput.sourceDocName || '',
      sourceDocType: finalScriptResult.sourceDocType || normalizedInput.sourceDocType || '',
      sourceApplicableScene:
        finalScriptResult.sourceApplicableScene || normalizedInput.sourceApplicableScene || '',
      sourceExternalAvailable:
        finalScriptResult.sourceExternalAvailable || normalizedInput.sourceExternalAvailable || false,
      toneStyle: normalizedInput.toneStyle || '',
      databaseSummary: databaseRelationSummary,
    },
    outputPayload: finalScriptResult,
    summary: finalScriptResult.llmVersion || finalScriptResult.formalVersion || '',
    route: finalScriptResult.llmRoute || '',
    strategy: finalScriptResult.scriptStrategy || '',
    executionStrategy: finalScriptResult.scriptExecutionStrategy || '',
    outboundAllowed: Boolean(finalScriptResult.outboundAllowed),
    outboundReason: finalScriptResult.outboundReason || '',
    modelName: resolveModelNameFromRuntime(scriptResult.modelRuntime || finalScriptResult.modelRuntime),
  });

  const sourceDocName = readNonEmptyString(finalScriptResult.sourceDocName, normalizedInput.sourceDocName);
  if (sourceDocName) {
    attachSessionAsset({
      sessionId: session.id,
      sourceModule: normalizedInput.fromModule || 'search',
      docId: finalScriptResult.sourceDocId || normalizedInput.sourceDocId || '',
      docName: sourceDocName,
      docType: finalScriptResult.sourceDocType || normalizedInput.sourceDocType || '',
      applicableScene:
        finalScriptResult.sourceApplicableScene || normalizedInput.sourceApplicableScene || '',
      externalAvailable: Boolean(
        finalScriptResult.sourceExternalAvailable || normalizedInput.sourceExternalAvailable,
      ),
    });
  }

  updateSession(session.id, {
    sourceModule: 'script',
    currentStage: readNonEmptyString(normalizedInput.taskPhase, 'drafting'),
    currentGoal: normalizedInput.goal || 'compose_document',
    assistantId: resolvedAssistantId,
    executionContextSummary: resolvedExecutionContextSummary,
    databaseSummary: databaseRelationSummary,
    title: title || session.title,
  });
};

const processJudgeTask = async (req, res, { applyAnalyzeRuleEngine = false } = {}) => {
  return withChildSpan(
    'mock-server.agent.analyze-context',
    {
      'mock.workflow.step': 'analyze',
      'mock.rule_engine.enabled': applyAnalyzeRuleEngine,
    },
    async (span) => {
      const { rawInput, sessionId } = await buildManagedInput(req, req.body || {}, 'analyze');
      const normalizedRequest = normalizeCapabilityRequest(rawInput, 'judge');
      const normalizedInput = normalizedRequest.payload;
      const pluginId = rawInput.pluginId || '';
      const settings = readSettings();

      setSpanStringAttribute(span, 'mock.request.trace_id', req.traceId || '');
      setSpanStringAttribute(
        span,
        'mock.session.id',
        readNonEmptyString(normalizedInput.sessionId, sessionId),
      );
      setSpanStringAttribute(
        span,
        'mock.task.subject',
        normalizedInput.taskSubject || normalizedInput.productDirection || '',
      );

      const databaseRelationSummary = buildDatabaseRelationSummary(settings.database || {}, {
        relationType: 'default-database',
      });

      const analyzePluginExecution = await withChildSpan(
        'mock-server.agent.analyze-context.plugin',
        {
          'mock.plugin.kind': 'analyze',
          'mock.plugin.route': 'analyze-customer',
        },
        async (pluginSpan) => {
          const result = await executeManifestPlugin({
            kind: 'analyze',
            route: 'analyze-customer',
            requestedPluginId: pluginId,
            requestPayload: normalizedInput,
            context: {
              settings,
            },
          });

          setSpanStringAttribute(
            pluginSpan,
            'mock.plugin.selected_id',
            result?.plugin?.executedPluginId || result?.plugin?.pluginId || '',
          );
          setSpanNumberAttribute(
            pluginSpan,
            'mock.llm.duration_ms',
            resolveLlmDurationMs(result?.trace?.timing?.durationMs),
          );

          return result;
        },
      );

      const analyzeRuleEngineResult = applyAnalyzeRuleEngine
        ? await withChildSpan(
            'mock-server.agent.analyze-context.rule-engine',
            {
              'mock.rule_engine.name': 'analyze',
            },
            async (ruleSpan) => {
              const result = await runAnalyzeRuleEngine(
                buildAnalyzeRuleEngineContext({
                  rawInput,
                  normalizedInput,
                  settings,
                  executionContext: analyzePluginExecution.output?.executionContext,
                }),
              );

              setSpanStringAttribute(ruleSpan, 'mock.rule.name', result?.matchedRule?.name || '');
              setSpanNumberAttribute(
                ruleSpan,
                'mock.resources.count',
                resolveAnalyzeResourceCount(analyzePluginExecution.output || {}, result),
              );

              return result;
            },
          )
        : null;
      const analyzeResult = applyAnalyzeRuleEngine
        ? mergeAnalyzeResultWithRuleEngine({
            analyzeResult: analyzePluginExecution.output || {},
            ruleEngineResult: analyzeRuleEngineResult,
          })
        : analyzePluginExecution.output || {};

      const analyzeResourceCount = resolveAnalyzeResourceCount(
        analyzeResult,
        analyzeRuleEngineResult,
      );
      const analyzeLlmDurationMs = resolveLlmDurationMs(
        analyzeResult?.modelRuntime?.durationMs,
        analyzeResult?.modelRuntime?.latencyMs,
        analyzeResult?.modelRuntime?.timing?.durationMs,
        analyzePluginExecution?.trace?.timing?.durationMs,
      );

      setSpanStringAttribute(span, 'mock.rule.name', analyzeResult.matchedRule?.name || '');
      setSpanNumberAttribute(span, 'mock.resources.count', analyzeResourceCount);
      setSpanNumberAttribute(span, 'mock.llm.duration_ms', analyzeLlmDurationMs);
      setSpanStringAttribute(span, 'mock.model.source', analyzeResult.modelRuntime?.reason || '');
      recordWorkflowModelCall({
        appId: readNonEmptyString(
          normalizedInput.appId,
          normalizedInput.app_id,
          rawInput.appId,
          rawInput.app_id,
        ),
        modelRuntime: analyzeResult.modelRuntime,
        latencyMs: analyzeLlmDurationMs,
        inputText: normalizedInput.taskInput || normalizedInput.taskSubject || '',
        outputText: analyzeResult.finalAnalyzeData?.summary || '',
      });

      appendTestRecord({
        module: '判断分析',
        input:
          normalizedInput.taskInput ||
          normalizedInput.taskSubject ||
          normalizedInput.productDirection ||
          '',
        actualResult: `${analyzeResult.finalAnalyzeData.summary} | 推荐：${analyzeResult.finalAnalyzeData.recommendedProducts.join('、')}`,
        matchedRule: analyzeResult.matchedRule?.name || '',
        matchedData: analyzeResult.matchedProducts.length
          ? analyzeResult.matchedProducts
              .map((product) => `${product.id} / ${product.productName}`)
              .join('；')
          : '',
      });

      const analyzeAssistantArtifacts = resolveRuntimeAssistantArtifacts({
        assistantId: analyzeResult.activeAssistantId || '',
        executionContext: analyzeResult.executionContext,
        fallbackAssistantId: normalizedInput.assistantId || '',
      });
      const analyzeGovernanceSummary = buildGovernanceSummary({
        assistantId: analyzeAssistantArtifacts.assistantId,
        promptId: analyzeResult.promptId || '',
        promptVersion: analyzeResult.promptVersion || '',
        strategy: analyzeResult.strategy || null,
        executionContext: analyzeAssistantArtifacts.executionContext,
        executionContextSummary: analyzeAssistantArtifacts.executionContextSummary,
        source: analyzeResult.source || null,
        fallbackReason: analyzeResult.fallbackReason || null,
      });
      const analyzeModelRuntimeSummary = buildModelRuntimeSummary(analyzeResult.modelRuntime);
      const analyzeContinuePayload = buildContinuePayload({
        sessionId: analyzeResult.sessionId,
        stepId: analyzeResult.stepId,
        fromModule: 'analyze',
        assistantId: analyzeAssistantArtifacts.assistantId,
        executionContext: analyzeAssistantArtifacts.executionContext,
        executionContextSummary: analyzeAssistantArtifacts.executionContextSummary,
      });

      const resolvedSessionId = analyzeResult.sessionId || sessionId;
      const matchedRuleCount = Array.isArray(analyzeResult.matchedRules)
        ? analyzeResult.matchedRules.length
        : Array.isArray(analyzeRuleEngineResult?.matchedRules)
          ? analyzeRuleEngineResult.matchedRules.length
          : analyzeResult.matchedRule
            ? 1
            : 0;

      if (matchedRuleCount === 0) {
        safeRecordGap(
          resolvedSessionId,
          readNonEmptyString(normalizedInput.appId, normalizedInput.app_id, rawInput.appId, rawInput.app_id),
          readNonEmptyString(
            analyzeResult.sanitizedAnalyzeInput?.sanitizedText,
            normalizedInput.taskInput,
            normalizedInput.customerText,
            normalizedInput.taskSubject,
            normalizedInput.productDirection,
          ),
          matchedRuleCount,
        );
      }

      if (resolvedSessionId && shouldUseManagedSession(req, sessionId)) {
        await saveContext(resolvedSessionId, {
          sessionId: resolvedSessionId,
          analysis: buildAnalyzeContextSnapshot({
            normalizedInput,
            analyzeResult,
          }),
          lastStep: 'analyze',
        });
        await appendToHistory(resolvedSessionId, 'analyze', {
          summary: analyzeResult.finalAnalyzeData?.summary || '',
          taskSubject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
          industryType: normalizedInput.industryType || 'other',
          stepId: analyzeResult.stepId || '',
        });
      }

      persistAnalyzeTraceCompat({
        normalizedInput,
        analyzeResult,
        databaseRelationSummary,
      });

      return sendSuccess(res, {
        message: '判断成功',
        data: {
          ...analyzeResult.finalAnalyzeData,
          sessionId: analyzeResult.sessionId,
          stepId: analyzeResult.stepId,
          assistantId: analyzeAssistantArtifacts.assistantId,
          promptId: analyzeResult.promptId || '',
          promptVersion: analyzeResult.promptVersion || '',
          strategy: analyzeResult.strategy || null,
          source: analyzeResult.source || null,
          fallbackReason: analyzeResult.fallbackReason || null,
          governanceSummary: analyzeGovernanceSummary,
          taskModel: normalizedRequest.taskModel,
          assistantContext: analyzeResult.assistantContext,
          executionContext: analyzeAssistantArtifacts.executionContext,
          executionContextSummary: analyzeAssistantArtifacts.executionContextSummary,
          resolvedAssistant: analyzeAssistantArtifacts.executionContext?.resolvedAssistant || null,
          resolvedPrompt: analyzeAssistantArtifacts.executionContext?.resolvedPrompt || null,
          modelRuntime: analyzeResult.modelRuntime,
          resolvedModel: analyzeResult.modelRuntime?.resolvedModel || null,
          modelSource:
            analyzeResult.modelRuntime?.resolvedModel?.source ||
            analyzeResult.modelRuntime?.reason ||
            '',
          modelRuntimeSummary: analyzeModelRuntimeSummary,
          databaseRelationSummary,
          matchedRule: analyzeResult.matchedRule || null,
          matchedRules: analyzeResult.matchedRules || [],
          matchedProducts: analyzeResult.matchedProducts || [],
          ruleEngine: analyzeResult.ruleEngine || null,
          analysisRoute: analyzeResult.analysisRoute,
          analyzeStrategy: analyzeResult.analyzeStrategy,
          analyzeExecutionStrategy: analyzeResult.analyzeExecutionStrategy,
          continuePayload: analyzeContinuePayload,
          outboundAllowed: analyzeResult.analyzeOutboundDecision.outboundAllowed,
          outboundReason: analyzeResult.analyzeOutboundDecision.outboundReason,
          sanitizedAnalyzeText: analyzeResult.sanitizedAnalyzeInput.sanitizedText,
        },
        meta: {
          sessionId: analyzeResult.sessionId,
          stepId: analyzeResult.stepId,
          responseContract: buildRuntimeInterfaceContract([
            'continuePayload',
            'governanceSummary',
            'modelRuntimeSummary',
            'pluginRuntimeSummary',
          ]),
          deprecatedFields: {
            assistantId: 'legacy-runtime-flat-field-frozen',
            promptId: 'legacy-runtime-flat-field-frozen',
            promptVersion: 'legacy-runtime-flat-field-frozen',
            strategy: 'legacy-runtime-flat-field-frozen',
            source: 'legacy-runtime-flat-field-frozen',
            fallbackReason: 'legacy-runtime-flat-field-frozen',
          },
          governanceSummary: analyzeGovernanceSummary,
          modelRuntimeSummary: analyzeModelRuntimeSummary,
          taskModel: buildTaskModelMeta(normalizedRequest.taskModel),
          executionContext: analyzeAssistantArtifacts.executionContext,
          modelRuntime: analyzeResult.modelRuntime,
          databaseRelationSummary,
          continuePayload: analyzeContinuePayload,
          executionContextSummary: analyzeAssistantArtifacts.executionContextSummary,
          platformContract: buildPlatformContractSummary(),
          pluginRuntimeSummary: analyzePluginExecution.plugin,
          pluginTrace: analyzePluginExecution.trace,
          pluginRegistrySummary: analyzePluginExecution.registrySummary,
        },
      });
    },
  );
};

const handleJudgeTask = async (req, res) => {
  return processJudgeTask(req, res);
};

const handleAnalyzeContext = async (req, res) => {
  return processJudgeTask(req, res, {
    applyAnalyzeRuleEngine: true,
  });
};

router.post('/analyze-customer', asyncWrapper(handleJudgeTask));
router.post('/judge-task', asyncWrapper(handleJudgeTask));

const processRetrieveMaterials = async (req, res, { applySearchRuleEngine = false } = {}) => {
  return withChildSpan(
    'mock-server.agent.search-references',
    {
      'mock.workflow.step': 'search',
      'mock.rule_engine.enabled': applySearchRuleEngine,
    },
    async (span) => {
      const { rawInput, sessionId: managedSessionId } = await buildManagedInput(
        req,
        req.body || {},
        'search',
      );
      const normalizedRequest = normalizeCapabilityRequest(rawInput, 'retrieve');
      const normalizedInput = normalizedRequest.payload;
      const {
        keyword = '',
        docType = undefined,
        industryType = 'other',
        onlyExternalAvailable = false,
        enableExternalSupplement = false,
        sessionId = '',
        pluginId = '',
      } = normalizedRequest.payload;
      const searchAppId = readNonEmptyString(
        normalizedInput.appId,
        normalizedInput.app_id,
        rawInput.appId,
        rawInput.app_id,
      );

      const settings = readSettings();

      setSpanStringAttribute(span, 'mock.request.trace_id', req.traceId || '');
      setSpanStringAttribute(
        span,
        'mock.session.id',
        readNonEmptyString(sessionId, managedSessionId),
      );
      setSpanStringAttribute(
        span,
        'mock.task.subject',
        normalizedInput.taskSubject || keyword,
      );

      const databaseRelationSummary = buildDatabaseRelationSummary(settings.database || {}, {
        relationType: 'default-database',
      });
      const searchRuleEnginePreflightResult = applySearchRuleEngine
        ? await runSearchRuleEngine(
            buildSearchRuleEngineContext({
              rawInput,
              normalizedInput,
              settings,
              executionContext: null,
            }),
          )
        : null;
      const shouldUseSearchEmptyStateGuard =
        !applySearchRuleEngine || !hasSearchRuleEngineHit(searchRuleEnginePreflightResult);

      const searchPluginExecution = await withChildSpan(
        'mock-server.agent.search-references.plugin',
        {
          'mock.plugin.kind': 'search',
          'mock.plugin.route': 'search-documents',
        },
        async (pluginSpan) => {
          const result = await withSearchEmptyStateTimeout(
            executeManifestPlugin({
              kind: 'search',
              route: 'search-documents',
              requestedPluginId: pluginId,
              requestPayload: {
                keyword,
                docType,
                industryType,
                onlyExternalAvailable,
                enableExternalSupplement,
                sessionId,
                appId: searchAppId,
              },
              context: {
                settings,
              },
            }),
            {
              keyword,
              sessionId: readNonEmptyString(sessionId, managedSessionId),
              appId: searchAppId,
            },
            {
              enabled: shouldUseSearchEmptyStateGuard,
            },
          );

          setSpanStringAttribute(
            pluginSpan,
            'mock.plugin.selected_id',
            result?.plugin?.executedPluginId || result?.plugin?.pluginId || '',
          );
          setSpanNumberAttribute(
            pluginSpan,
            'mock.llm.duration_ms',
            resolveLlmDurationMs(result?.trace?.timing?.durationMs),
          );

          return result;
        },
      );
      const searchRuleEngineResult = applySearchRuleEngine
        ? await withChildSpan(
            'mock-server.agent.search-references.rule-engine',
            {
              'mock.rule_engine.name': 'search',
            },
            async (ruleSpan) => {
              const result =
                searchRuleEnginePreflightResult ||
                (await runSearchRuleEngine(
                  buildSearchRuleEngineContext({
                    rawInput,
                    normalizedInput,
                    settings,
                    executionContext: searchPluginExecution.output?.executionContext,
                  }),
                ));

              setSpanStringAttribute(ruleSpan, 'mock.rule.name', result?.matchedRule?.name || '');
              setSpanNumberAttribute(
                ruleSpan,
                'mock.resources.count',
                Array.isArray(result?.documents) ? result.documents.length : 0,
              );

              return result;
            },
          )
        : null;
      const searchResult = applySearchRuleEngine
        ? mergeSearchResultWithRuleEngine({
            searchResult: searchPluginExecution.output || {},
            ruleEngineResult: searchRuleEngineResult,
          })
        : searchPluginExecution.output || {};
      let searchEvidenceItems = Array.isArray(searchResult.evidenceItems)
        ? searchResult.evidenceItems
        : [];
      const matchedProducts = Array.isArray(searchResult.matchedProducts)
        ? searchResult.matchedProducts
        : [];
      const searchMatchedRuleCount = Array.isArray(searchResult.matchedSearchRules)
        ? searchResult.matchedSearchRules.length
        : searchResult.matchedRule
          ? 1
          : 0;
      const shouldFilterGenericEvidence =
        searchMatchedRuleCount === 0 && matchedProducts.length === 0 && searchEvidenceItems.length > 0;

      if (shouldFilterGenericEvidence) {
        const relevantEvidenceItems = searchEvidenceItems.filter((item) =>
          isRelevantEvidenceForKeyword(item, keyword || normalizedInput.taskInput || ''),
        );

        if (relevantEvidenceItems.length === 0) {
          const noHitSummary = `未找到与“${keyword || normalizedInput.taskInput || '当前关键词'}”直接匹配的资料，已记录知识缺口，请补充更明确的产品名、工序名或场景关键词。`;
          searchEvidenceItems = [];
          searchResult.evidenceItems = [];
          searchResult.primaryEvidenceIds = [];
          searchResult.sourceSummary = {};
          searchResult.searchSummary = noHitSummary;
          searchResult.referenceSummary = noHitSummary;
          searchResult.searchRoute = 'search-empty-no-hit';
          searchResult.searchReason = 'no relevant evidence matched keyword';
        } else {
          searchEvidenceItems = relevantEvidenceItems;
          searchResult.evidenceItems = relevantEvidenceItems;
        }
      }
      const searchKnowledgeGap =
        searchEvidenceItems.length === 0
          ? safeRecordGap(
              readNonEmptyString(searchResult.sessionId, sessionId, managedSessionId),
              searchAppId,
              readNonEmptyString(
                searchResult.searchSanitizationResult?.sanitizedText,
                keyword,
                normalizedInput.taskInput,
                normalizedInput.taskSubject,
              ),
              searchMatchedRuleCount,
            )
          : null;
      const searchLlmDurationMs = resolveLlmDurationMs(
        searchResult?.summaryModelTrace?.durationMs,
        searchResult?.summaryModelTrace?.latencyMs,
        searchResult?.modelRuntime?.durationMs,
        searchResult?.modelRuntime?.latencyMs,
        searchResult?.modelRuntime?.timing?.durationMs,
        searchPluginExecution?.trace?.timing?.durationMs,
      );

      setSpanStringAttribute(span, 'mock.rule.name', searchResult.matchedRule?.name || '');
      setSpanNumberAttribute(span, 'mock.resources.count', searchEvidenceItems.length);
      setSpanNumberAttribute(span, 'mock.llm.duration_ms', searchLlmDurationMs);
      setSpanBooleanAttribute(
        span,
        'mock.external_search.used',
        Boolean(searchResult.externalResults?.length),
      );
      recordWorkflowModelCall({
        appId: readNonEmptyString(
          normalizedInput.appId,
          normalizedInput.app_id,
          rawInput.appId,
          rawInput.app_id,
        ),
        modelRuntime: searchResult.modelRuntime,
        latencyMs: searchLlmDurationMs,
        inputText: keyword || normalizedInput.taskInput || '',
        outputText: searchResult.searchSummary || '',
      });

      appendTestRecord({
        module: '资料整理',
        input: keyword || '',
        actualResult: searchEvidenceItems.length
          ? `返回证据：${searchEvidenceItems.map((item) => item.title).join('、')}`
          : '未返回证据',
        matchedRule: searchResult.matchedRule?.name || '',
        matchedData: matchedProducts.length
          ? matchedProducts
              .map((product) => `${product.id} / ${product.productName}`)
              .join('；')
          : '',
      });

      const searchAssistantArtifacts = resolveRuntimeAssistantArtifacts({
        assistantId: searchResult.activeAssistantId || '',
        executionContext: searchResult.executionContext,
        fallbackAssistantId: normalizedInput.assistantId || '',
      });
      const searchGovernanceSummary = buildGovernanceSummary({
        assistantId: searchAssistantArtifacts.assistantId,
        promptId: searchResult.promptId || '',
        promptVersion: searchResult.promptVersion || '',
        strategy: searchResult.strategy || null,
        executionContext: searchAssistantArtifacts.executionContext,
        executionContextSummary: searchAssistantArtifacts.executionContextSummary,
        source: searchResult.source || null,
        fallbackReason: searchResult.fallbackReason || null,
      });
      const searchModelRuntimeSummary = buildModelRuntimeSummary(searchResult.modelRuntime);
      const searchContinuePayload = buildContinuePayload({
        sessionId: searchResult.sessionId,
        stepId: searchResult.stepId,
        fromModule: 'search',
        assistantId: searchAssistantArtifacts.assistantId,
        executionContext: searchAssistantArtifacts.executionContext,
        executionContextSummary: searchAssistantArtifacts.executionContextSummary,
      });
      const hydratedReferenceSummary = readNonEmptyString(
        normalizedInput.referenceSummary,
        normalizedInput.context,
        searchResult.referenceSummary,
      );

      const resolvedSessionId = searchResult.sessionId || sessionId;
      if (resolvedSessionId && shouldUseManagedSession(req, managedSessionId)) {
        await saveContext(resolvedSessionId, {
          sessionId: resolvedSessionId,
          search: buildSearchContextSnapshot({
            normalizedInput,
            searchResult,
            searchEvidenceItems,
          }),
          lastStep: 'search',
        });
        await appendToHistory(resolvedSessionId, 'search', {
          keyword,
          taskSubject: normalizedInput.taskSubject || keyword,
          referenceSummary: hydratedReferenceSummary,
          stepId: searchResult.stepId || '',
          evidenceCount: searchEvidenceItems.length,
        });
      }

      persistSearchTraceCompat({
        normalizedInput,
        searchResult,
        searchEvidenceItems,
        databaseRelationSummary,
      });

      return sendSuccess(res, {
        message: '检索成功',
        data: {
          evidenceItems: searchEvidenceItems,
          referencePackId: searchResult.referencePackId || '',
          referencePack: searchResult.referencePack || null,
          governedEvidenceItems: searchResult.governedEvidenceItems || [],
          referencePackLibrary: searchResult.referencePackLibrary || null,
          referencePackCacheCleanup: searchResult.referencePackCacheCleanup || null,
          referencePackError: searchResult.referencePackError || null,
          externalProviderStates: searchResult.externalProviderStates || [],
          knowledgeGap: searchKnowledgeGap,
          databaseRelationSummary,
          taskModel: normalizedRequest.taskModel,
          continuePayload: searchContinuePayload,
        },
        meta: {
          sessionId: searchResult.sessionId,
          stepId: searchResult.stepId,
          responseContract: buildRuntimeInterfaceContract([
            'continuePayload',
            'governanceSummary',
            'modelRuntimeSummary',
            'evidenceItems',
            'pluginRuntimeSummary',
          ]),
          deprecatedFields: {
            assistantId: 'legacy-runtime-flat-field-frozen',
            promptId: 'legacy-runtime-flat-field-frozen',
            promptVersion: 'legacy-runtime-flat-field-frozen',
            strategy: 'legacy-runtime-flat-field-frozen',
            source: 'legacy-runtime-flat-field-frozen',
            fallbackReason: 'legacy-runtime-flat-field-frozen',
          },
          governanceSummary: searchGovernanceSummary,
          modelRuntimeSummary: searchModelRuntimeSummary,
          taskModel: buildTaskModelMeta(normalizedRequest.taskModel),
          assistantContext: searchResult.assistantContext,
          executionContext: searchAssistantArtifacts.executionContext,
          modelRuntime: searchResult.modelRuntime,
          databaseRelationSummary,
          executionContextSummary: searchAssistantArtifacts.executionContextSummary,
          searchStrategy: searchResult.searchStrategy,
          searchExecutionStrategy: searchResult.searchExecutionStrategy,
          enableExternalSupplement: searchResult.enableExternalSupplement,
          externalSearchAllowed: searchResult.externalSearchAllowed,
          externalProviderConfigured: searchResult.externalProviderConfigured,
          externalProvider: searchResult.externalProvider,
          searchRoute: searchResult.searchRoute,
          searchReason: searchResult.searchReason,
          emptyState: searchEvidenceItems.length === 0,
          knowledgeGap: searchKnowledgeGap,
          searchSummary: searchResult.searchSummary,
          sourceSummary: searchResult.sourceSummary,
          sanitizedKeyword: searchResult.searchSanitizationResult?.sanitizedText || '',
          searchOutboundAllowed: Boolean(searchResult.searchTraceSummary?.outboundAllowed),
          searchOutboundReason:
            searchResult.searchTraceSummary?.outboundReason ||
            searchResult.searchSanitizationResult?.outboundReason ||
            'searchDocuments-outbound-not-used',
          referenceSummary: hydratedReferenceSummary,
          primaryEvidenceIds: searchResult.primaryEvidenceIds,
          sourceScopeSelection: searchResult.sourceScopeSelection,
          referencePackId: searchResult.referencePackId || '',
          referencePack: searchResult.referencePack || null,
          governedEvidenceItems: searchResult.governedEvidenceItems || [],
          referencePackLibrary: searchResult.referencePackLibrary || null,
          referencePackCacheCleanup: searchResult.referencePackCacheCleanup || null,
          referencePackError: searchResult.referencePackError || null,
          externalProviderStates: searchResult.externalProviderStates || [],
          matchedProducts,
          searchModelConfig: searchResult.searchModelConfig,
          externalResults: searchResult.externalResults,
          searchTraceSummary: searchResult.searchTraceSummary,
          summaryWhitelistCount: searchResult.whitelistedEvidenceSummaries?.length || 0,
          continuePayload: searchContinuePayload,
          platformContract: buildPlatformContractSummary(),
          pluginRuntimeSummary: searchPluginExecution.plugin,
          pluginTrace: searchPluginExecution.trace,
          pluginRegistrySummary: searchPluginExecution.registrySummary,
        },
      });
    },
  );
};

const handleRetrieveMaterials = async (req, res) => {
  return processRetrieveMaterials(req, res);
};

const handleRetrieveMaterialCategories = async (req, res) => {
  const appId = readNonEmptyString(req.query?.appId, req.query?.app_id);
  const categories = listResourceCategories({
    appId,
  });

  return sendSuccess(res, {
    message: '资料分类加载成功',
    data: {
      categories,
      source: 'knowledge_resources',
      appId,
    },
    meta: {
      count: categories.length,
    },
  });
};

const handleSearchReferences = async (req, res) => {
  return processRetrieveMaterials(req, res, {
    applySearchRuleEngine: true,
  });
};

router.post('/search-documents', asyncWrapper(handleRetrieveMaterials));
router.post('/retrieve-materials', asyncWrapper(handleRetrieveMaterials));
router.get('/retrieve-materials/categories', asyncWrapper(handleRetrieveMaterialCategories));

const handleComposeDocument = async (req, res) => {
  return withChildSpan(
    'mock-server.agent.generate-content',
    {
      'mock.workflow.step': 'compose',
    },
    async (span) => {
      const { rawInput, sessionId: managedSessionId, contextRecord } = await buildManagedInput(
        req,
        req.body || {},
        'compose',
      );
      const normalizedRequest = normalizeCapabilityRequest(rawInput, 'compose');
      let normalizedInput = normalizedRequest.payload;
      const pluginId = rawInput.pluginId || '';
      const requestedReferencePackId = readNonEmptyString(
        normalizedInput.referencePackId,
        rawInput.referencePackId,
      );
      const referencePackInput = requestedReferencePackId
        ? getReferencePackScriptInput(requestedReferencePackId)
        : null;

      if (referencePackInput) {
        const referencePackSummary = buildReferencePackSummaryText(referencePackInput);
        normalizedInput = {
          ...normalizedInput,
          referencePackId: referencePackInput.referencePackId,
          referenceSummary: referencePackSummary || normalizedInput.referenceSummary || '',
          context: normalizedInput.context || referencePackSummary || '',
          sourceDocId: referencePackInput.referencePackId,
          sourceDocName: referencePackInput.title,
          sourceDocType: 'reference_pack',
          sourceApplicableScene: 'governed_reference_pack',
          sourceExternalAvailable: false,
        };
      }
      const normalizedSessionId = normalizedInput.sessionId || '';
      const settings = readSettings();
      const appId = readNonEmptyString(
        normalizedInput.appId,
        normalizedInput.app_id,
        rawInput.appId,
        rawInput.app_id,
      );
      const appSystemPrompt = appId ? getPromptByAppId(appId) || '' : '';
      const appTemplate = resolveGenerationTemplateForUsage({
        goalScene: normalizedInput.goalScene || normalizedInput.communicationGoal || '',
        toneStyle: normalizedInput.toneStyle || 'formal',
        appId,
      });
      const composePluginInput = {
        ...normalizedInput,
        appId,
        app_id: appId,
        appSystemPrompt: appSystemPrompt || normalizedInput.appSystemPrompt || '',
        selectedTemplateId: appTemplate?.id || normalizedInput.selectedTemplateId || '',
        selectedTemplate:
          appTemplate?.templateContent ||
          appTemplate?.template_content ||
          normalizedInput.selectedTemplate ||
          '',
        generationTemplate: appTemplate || normalizedInput.generationTemplate || null,
      };
      const directTemplateStartedAt = Date.now();
      const directTemplateContent =
        appTemplate?.templateContent ||
        appTemplate?.template_content ||
        normalizedInput.selectedTemplate ||
        normalizedInput.templateContent ||
        normalizedInput.template_content ||
        '';
      const directTemplateContext = buildDirectTemplateContext(normalizedInput);
      const outputStyle = readNonEmptyString(normalizedInput.outputStyle, normalizedInput.output_style).toLowerCase();
      const canUseDirectTemplate =
        outputStyle === 'standard' &&
        directTemplateContent &&
        allVariablesAvailable(directTemplateContent, directTemplateContext);

      if (canUseDirectTemplate) {
        const guidanceNotesText = readNonEmptyString(directTemplateContext.guidance_notes);
        const renderedContent = renderTemplate(directTemplateContent, directTemplateContext);
        const finalContent = guidanceNotesText
          ? `${renderedContent}\n\n注意事项：\n${guidanceNotesText}`
          : renderedContent;
        const directDurationMs = Math.max(0, Date.now() - directTemplateStartedAt);
        const directModelRuntime = buildDirectTemplateModelRuntime(directDurationMs);
        const selectedTemplateId = appTemplate?.id || normalizedInput.selectedTemplateId || '';

        if (selectedTemplateId) {
          incrementUsage(selectedTemplateId);
        }

        safeRecordCall({
          appId,
          model: 'rule_only',
          success: true,
          latencyMs: directDurationMs,
          tokensUsed: 0,
        });

        appendTestRecord({
          module: '参考写作',
          input:
            normalizedInput.taskInput ||
            normalizedInput.referenceSummary ||
            normalizedInput.taskSubject ||
            '',
          actualResult: finalContent,
          matchedRule: 'rule_only',
          matchedData: directTemplateContent,
        });

        setSpanStringAttribute(span, 'mock.llm.route', 'rule_only');
        setSpanNumberAttribute(span, 'mock.llm.duration_ms', directDurationMs);

        return sendSuccess(res, {
          message: '写作成功',
          data: {
            formalVersion: finalContent,
            conciseVersion: finalContent,
            spokenVersion: finalContent,
            llmVersion: finalContent,
            content: finalContent,
            llmRoute: 'rule_only',
            generationRoute: 'rule_only',
            templateRender: {
              rendered: true,
              outputStyle,
              missingVariables: [],
            },
            modelRuntime: directModelRuntime,
            resolvedModel: directModelRuntime.resolvedModel,
            modelRuntimeSummary: buildModelRuntimeSummary(directModelRuntime),
            selectedTemplateId,
            referencePackId: referencePackInput?.referencePackId || '',
            referencePack: referencePackInput,
            facts: referencePackInput?.facts || [],
            background: referencePackInput?.background || [],
            riskNotes: referencePackInput?.riskNotes || [],
            conflicts: referencePackInput?.conflicts || [],
            doNotUse: referencePackInput?.doNotUse || [],
            referenceSummary: normalizedInput.referenceSummary || '',
            sessionId: readNonEmptyString(normalizedSessionId, managedSessionId),
            traceId: req.traceId || '',
            tokensUsed: 0,
            tokens_used: 0,
            databaseRelationSummary: buildDatabaseRelationSummary(readSettings().database || {}, {
              relationType: 'default-database',
            }),
          },
          meta: {
            sessionId: readNonEmptyString(normalizedSessionId, managedSessionId),
            llmRoute: 'rule_only',
            generationRoute: 'rule_only',
            modelRuntimeSummary: buildModelRuntimeSummary(directModelRuntime),
            selectedTemplateId,
            referencePackId: referencePackInput?.referencePackId || '',
            platformContract: buildPlatformContractSummary(),
          },
        });
      }

      setSpanStringAttribute(span, 'mock.request.trace_id', req.traceId || '');
      setSpanStringAttribute(
        span,
        'mock.session.id',
        readNonEmptyString(normalizedSessionId, managedSessionId),
      );
      setSpanStringAttribute(
        span,
        'mock.task.subject',
        normalizedInput.taskSubject || normalizedInput.productDirection || '',
      );

      const databaseRelationSummary = buildDatabaseRelationSummary(settings.database || {}, {
        relationType: 'default-database',
      });

      const outputPluginExecution = await withChildSpan(
        'mock-server.agent.generate-content.plugin',
        {
          'mock.plugin.kind': 'output',
          'mock.plugin.route': 'generate-script',
        },
        async (pluginSpan) => {
          const result = await executeManifestPlugin({
            kind: 'output',
            route: 'generate-script',
            requestedPluginId: pluginId,
            requestPayload: composePluginInput,
            context: {
              settings,
            },
          });

          setSpanStringAttribute(
            pluginSpan,
            'mock.plugin.selected_id',
            result?.plugin?.executedPluginId || result?.plugin?.pluginId || '',
          );
          setSpanNumberAttribute(
            pluginSpan,
            'mock.llm.duration_ms',
            resolveLlmDurationMs(result?.trace?.timing?.durationMs),
          );

          return result;
        },
      );
      const scriptResult = outputPluginExecution.output || {};
      const finalScriptResult = scriptResult.finalResult || {};
      const selectedGenerationTemplateId = recordGenerationTemplateUsage({
        normalizedInput,
        scriptResult,
        finalScriptResult,
      });
      const composeResourceCount = resolveComposeResourceCount(
        contextRecord,
        normalizedInput,
        finalScriptResult,
      );
      const composeLlmDurationMs = resolveLlmDurationMs(
        finalScriptResult?.modelRuntime?.durationMs,
        finalScriptResult?.modelRuntime?.latencyMs,
        finalScriptResult?.modelRuntime?.timing?.durationMs,
        scriptResult?.modelRuntime?.durationMs,
        scriptResult?.modelRuntime?.latencyMs,
        scriptResult?.modelRuntime?.timing?.durationMs,
        outputPluginExecution?.trace?.timing?.durationMs,
      );

      setSpanStringAttribute(span, 'mock.rule.name', scriptResult.toneRule?.name || '');
      setSpanNumberAttribute(span, 'mock.resources.count', composeResourceCount);
      setSpanNumberAttribute(span, 'mock.llm.duration_ms', composeLlmDurationMs);
      setSpanStringAttribute(span, 'mock.llm.route', finalScriptResult.llmRoute || '');
      recordWorkflowModelCall({
        appId: readNonEmptyString(
          normalizedInput.appId,
          normalizedInput.app_id,
          rawInput.appId,
          rawInput.app_id,
        ),
        modelRuntime: scriptResult.modelRuntime || finalScriptResult.modelRuntime,
        latencyMs: composeLlmDurationMs,
        tokensUsed: finalScriptResult.generationRoute === 'rule_only' ? 0 : null,
        inputText:
          normalizedInput.taskInput ||
          normalizedInput.referenceSummary ||
          normalizedInput.taskSubject ||
          '',
        outputText: finalScriptResult.llmVersion || finalScriptResult.formalVersion || '',
      });

      appendTestRecord({
        module: '参考写作',
        input:
          normalizedInput.taskInput ||
          normalizedInput.referenceSummary ||
          normalizedInput.taskSubject ||
          '',
        actualResult:
          finalScriptResult.llmVersion || finalScriptResult.formalVersion || '',
        matchedRule: scriptResult.toneRule?.name || '',
        matchedData: scriptResult.selectedTemplate || '',
      });

      const scriptAssistantArtifacts = resolveRuntimeAssistantArtifacts({
        assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
        executionContext:
          scriptResult.executionContext || finalScriptResult.executionContext || null,
        executionContextSummary: finalScriptResult.executionContextSummary || null,
        fallbackAssistantId: normalizedInput.assistantId || '',
      });
      const scriptGovernanceSummary = buildGovernanceSummary({
        assistantId: scriptAssistantArtifacts.assistantId,
        promptId: scriptResult.promptId || finalScriptResult.promptId || '',
        promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
        strategy: scriptResult.strategy || finalScriptResult.strategy || null,
        executionContext: scriptAssistantArtifacts.executionContext,
        executionContextSummary: scriptAssistantArtifacts.executionContextSummary,
        source: scriptResult.source || finalScriptResult.source || null,
        fallbackReason:
          scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
      });
      const scriptModelRuntimeSummary = buildModelRuntimeSummary(scriptResult.modelRuntime);
      const scriptContinuePayload = buildContinuePayload({
        sessionId: scriptResult.sessionId || normalizedSessionId,
        stepId: scriptResult.stepId,
        evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
        fromModule: 'script',
        assistantId: scriptAssistantArtifacts.assistantId,
        executionContext: scriptAssistantArtifacts.executionContext,
        executionContextSummary: scriptAssistantArtifacts.executionContextSummary,
      });

      console.log('[response] generate-script data:', {
        ...finalScriptResult,
        selectedTemplateId: selectedGenerationTemplateId || finalScriptResult.selectedTemplateId || '',
        sessionId: scriptResult.sessionId || normalizedSessionId,
        source: scriptResult.source || finalScriptResult.source || null,
        fallbackReason:
          scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
        governanceSummary: scriptGovernanceSummary,
        continuePayload: scriptContinuePayload,
        modelSource:
          scriptResult.modelRuntime?.resolvedModel?.source ||
          scriptResult.modelRuntime?.reason ||
          '',
        modelRuntimeSummary: scriptModelRuntimeSummary,
      });

      const resolvedSessionId = scriptResult.sessionId || normalizedSessionId || managedSessionId;
      if (resolvedSessionId && shouldUseManagedSession(req, managedSessionId)) {
        await saveContext(resolvedSessionId, {
          sessionId: resolvedSessionId,
          appId: normalizedInput.appId || normalizedInput.app_id || '',
          content: buildContentContextSnapshot({
            normalizedInput,
            finalScriptResult,
            sessionId: resolvedSessionId,
          }),
          lastStep: 'script',
        });
        await appendToHistory(resolvedSessionId, 'script', {
          appId: normalizedInput.appId || normalizedInput.app_id || '',
          taskSubject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
          referenceSummary:
            normalizedInput.referenceSummary || finalScriptResult.referenceSummary || '',
          evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
          referencePackId: finalScriptResult.referencePackId || normalizedInput.referencePackId || '',
          stepId: scriptResult.stepId || '',
          llmRoute: finalScriptResult.llmRoute || '',
        });
      }

      persistComposeTraceCompat({
        normalizedInput,
        scriptResult,
        finalScriptResult,
        databaseRelationSummary,
      });

      return sendSuccess(res, {
        message: '写作成功',
        data: {
          ...finalScriptResult,
          sessionId: scriptResult.sessionId || normalizedSessionId,
          stepId: scriptResult.stepId,
          assistantId: scriptAssistantArtifacts.assistantId,
          promptId: scriptResult.promptId || finalScriptResult.promptId || '',
          promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
          strategy: scriptResult.strategy || finalScriptResult.strategy || null,
          source: scriptResult.source || finalScriptResult.source || null,
          fallbackReason:
            scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
          governanceSummary: scriptGovernanceSummary,
          taskModel: normalizedRequest.taskModel,
          executionContext: scriptAssistantArtifacts.executionContext,
          executionContextSummary: scriptAssistantArtifacts.executionContextSummary,
          resolvedAssistant: scriptAssistantArtifacts.executionContext?.resolvedAssistant || null,
          resolvedPrompt: scriptAssistantArtifacts.executionContext?.resolvedPrompt || null,
          modelRuntime: scriptResult.modelRuntime,
          resolvedModel: scriptResult.modelRuntime?.resolvedModel || null,
          modelSource:
            scriptResult.modelRuntime?.resolvedModel?.source ||
            scriptResult.modelRuntime?.reason ||
            '',
          modelRuntimeSummary: scriptModelRuntimeSummary,
          selectedTemplateId: selectedGenerationTemplateId || finalScriptResult.selectedTemplateId || '',
          databaseRelationSummary,
          continuePayload: scriptContinuePayload,
        },
        meta: {
          sessionId: scriptResult.sessionId || normalizedSessionId,
          stepId: scriptResult.stepId,
          responseContract: buildRuntimeInterfaceContract([
            'continuePayload',
            'governanceSummary',
            'modelRuntimeSummary',
            'scriptResult',
          ]),
          deprecatedFields: {
            assistantId: 'legacy-runtime-flat-field-frozen',
            promptId: 'legacy-runtime-flat-field-frozen',
            promptVersion: 'legacy-runtime-flat-field-frozen',
            strategy: 'legacy-runtime-flat-field-frozen',
            source: 'legacy-runtime-flat-field-frozen',
            fallbackReason: 'legacy-runtime-flat-field-frozen',
          },
          promptName: finalScriptResult.promptName || '',
          governanceSummary: scriptGovernanceSummary,
          modelRuntimeSummary: scriptModelRuntimeSummary,
          taskModel: buildTaskModelMeta(normalizedRequest.taskModel),
          executionContext: scriptAssistantArtifacts.executionContext,
          modelRuntime: scriptResult.modelRuntime,
          databaseRelationSummary,
          executionContextSummary: scriptAssistantArtifacts.executionContextSummary,
          continuePayload: scriptContinuePayload,
          scriptStrategy: finalScriptResult.scriptStrategy || '',
          scriptExecutionStrategy: finalScriptResult.scriptExecutionStrategy || '',
          outboundAllowed: finalScriptResult.outboundAllowed || false,
          outboundReason: finalScriptResult.outboundReason || '',
          platformContract: buildPlatformContractSummary(),
          pluginRuntimeSummary: outputPluginExecution.plugin,
          pluginTrace: outputPluginExecution.trace,
          pluginRegistrySummary: outputPluginExecution.registrySummary,
        },
      });
    },
  );
};

router.post('/generate-script', asyncWrapper(handleComposeDocument));
router.post('/compose-document', asyncWrapper(handleComposeDocument));

router.post('/task-workbench', async (req, res) => {
  const rawInput = req.body || {};
  const settings = readSettings();
  const workbenchResult = buildTaskWorkbenchResult(rawInput, {
    settings,
  });

  appendTestRecord({
    module: '统一任务工作台',
    input: rawInput.taskInput || rawInput.keyword || rawInput.customerText || '',
    actualResult: `${workbenchResult.recognizedTask.intentLabel} | ${workbenchResult.promptBinding.promptName || workbenchResult.promptBinding.moduleLabel}`,
    matchedRule: workbenchResult.recognizedTask.reason || '',
    matchedData: workbenchResult.assistant.assistantId || '',
  });

  const workbenchContinuePayload = buildContinuePayload({
    fromModule: 'workbench',
    assistantId: workbenchResult.assistant.assistantId,
    executionContextSummary: workbenchResult.executionContextSummary,
  });

  return sendSuccess(res, {
    message: '任务识别成功',
    data: {
      ...workbenchResult,
      continuePayload: workbenchContinuePayload,
      routeRecommendation: {
        ...workbenchResult.routeRecommendation,
        continuePayload: workbenchContinuePayload,
      },
    },
    meta: {
      platformContract: buildPlatformContractSummary(),
      responseContract: buildRuntimeInterfaceContract([
        'continuePayload',
        'recognizedTask',
        'promptBinding',
        'materialPackage',
        'routeRecommendation',
      ]),
      continuePayload: workbenchContinuePayload,
      governanceSummary: buildGovernanceSummary({
        assistantId: workbenchResult.assistant.assistantId,
        promptId: workbenchResult.promptBinding.promptId,
        promptVersion: workbenchResult.promptBinding.promptVersion,
        executionContext: {
          summary: workbenchResult.executionContextSummary,
        },
      }),
    },
  });
});

// 运行接口已从 agentRoutes.js 完成首轮物理分层：
// - POST /analyze-customer
// - POST /search-documents
// - POST /generate-script
// - POST /task-workbench
// Analyze / Search / Output 已切到 manifest 插件执行入口（pluginRegistryService）。

export {
  buildContinuePayload,
  buildGovernanceSummary,
  handleAnalyzeContext,
  handleComposeDocument,
  handleJudgeTask,
  handleSearchReferences,
  buildModelRuntimeSummary,
  buildRuntimeInterfaceContract,
  handleRetrieveMaterials,
};

export default router;
