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
  return requestPath.endsWith('/analyze-context');
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

  return {
    keyword: normalizedInput.keyword || '',
    taskSubject: normalizedInput.taskSubject || normalizedInput.keyword || '',
    topic: normalizedInput.taskSubject || normalizedInput.keyword || '',
    industryType: normalizedInput.industryType || 'other',
    domainType: normalizedInput.industryType || 'other',
    docType: normalizedInput.docType || '',
    referenceSummary: searchResult.referenceSummary || '',
    sourceSummary: searchResult.sourceSummary || null,
    primaryEvidenceId: primaryEvidence?.evidenceId || primaryEvidenceIds[0] || '',
    primaryEvidence,
    primaryEvidenceIds,
    evidenceItems: searchEvidenceItems,
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
  source = null,
  fallbackReason = null,
} = {}) => ({
  assistantId,
  promptId,
  promptVersion,
  resolvedAssistant: executionContext?.resolvedAssistant || null,
  resolvedPrompt: executionContext?.resolvedPrompt || null,
  strategy: strategy || executionContext?.strategy || null,
  executionContextSummary: executionContext?.summary || null,
  source: source || executionContext?.source || null,
  fallbackReason: fallbackReason || executionContext?.fallbackReason || null,
});

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
} = {}) => {
  const normalizedExecutionContextSummary =
    executionContextSummary || executionContext?.summary || null;

  return {
    sessionId: sessionId || undefined,
    stepId: stepId || undefined,
    evidenceId: evidenceId || undefined,
    fromModule: fromModule || undefined,
    assistantId:
      assistantId ||
      executionContext?.resolvedAssistant?.assistantId ||
      normalizedExecutionContextSummary?.assistantId ||
      undefined,
    executionContext: executionContext || null,
    executionContextSummary: normalizedExecutionContextSummary,
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
    modelRuntime?.resolvedModel?.modelName,
    modelRuntime?.resolvedModel?.model,
    modelRuntime?.resolvedModel?.id,
    modelRuntime?.modelName,
  );
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
    assistantId: analyzeResult.activeAssistantId || '',
    executionContext,
    databaseSummary: databaseRelationSummary,
  });

  appendSessionStep({
    id: stepId,
    sessionId: session.id,
    stepType: 'analyze',
    inputPayload: {
      sessionId,
      fromModule: normalizedInput.fromModule || '',
      assistantId: analyzeResult.activeAssistantId || '',
      promptId: analyzeResult.promptId || '',
      promptVersion: analyzeResult.promptVersion || '',
      strategy: analyzeResult.strategy || '',
      source: analyzeResult.source || null,
      fallbackReason: analyzeResult.fallbackReason || null,
      resolvedAssistant: executionContext?.resolvedAssistant || null,
      resolvedPrompt: executionContext?.resolvedPrompt || null,
      executionContextSummary: executionContext?.summary || null,
      executionContext,
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
      executionContextSummary: executionContext?.summary || null,
      executionContext,
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
    assistantId: analyzeResult.activeAssistantId || '',
    executionContextSummary: executionContext?.summary || null,
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
    assistantId: searchResult.activeAssistantId || '',
    executionContext,
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
      assistantId: searchResult.activeAssistantId || '',
      promptId: searchResult.promptId || '',
      promptVersion: searchResult.promptVersion || '',
      strategy: searchResult.strategy || '',
      source: searchResult.source || null,
      fallbackReason: searchResult.fallbackReason || null,
      executionContextSummary: executionContext?.summary || null,
      executionContext,
      resolvedModel: searchResult.modelRuntime?.resolvedModel || null,
      taskInput: normalizedInput.taskInput || '',
      context: normalizedInput.context || '',
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
      sourceSummary: searchResult.sourceSummary || null,
      executionContextSummary: executionContext?.summary || null,
      executionContext,
      modelRuntime: searchResult.modelRuntime || null,
      externalResults: Array.isArray(searchResult.externalResults) ? searchResult.externalResults : [],
    },
    summary: searchResult.searchSummary || searchResult.referenceSummary || '',
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
    assistantId: searchResult.activeAssistantId || '',
    executionContextSummary: executionContext?.summary || null,
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
    assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
    executionContext,
    databaseSummary: databaseRelationSummary,
  });

  appendSessionStep({
    id: stepId,
    sessionId: session.id,
    stepType: 'script',
    inputPayload: {
      sessionId,
      fromModule: normalizedInput.fromModule || '',
      evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
      assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
      promptId: scriptResult.promptId || finalScriptResult.promptId || '',
      promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
      strategy: scriptResult.strategy || finalScriptResult.strategy || '',
      source: scriptResult.source || finalScriptResult.source || null,
      fallbackReason: scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
      resolvedAssistant: executionContext?.resolvedAssistant || finalScriptResult.resolvedAssistant || null,
      resolvedPrompt: executionContext?.resolvedPrompt || finalScriptResult.resolvedPrompt || null,
      executionContextSummary: executionContext?.summary || finalScriptResult.executionContextSummary || null,
      executionContext,
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
    assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
    executionContextSummary: executionContext?.summary || finalScriptResult.executionContextSummary || null,
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

      const analyzeGovernanceSummary = buildGovernanceSummary({
        assistantId: analyzeResult.activeAssistantId,
        promptId: analyzeResult.promptId || '',
        promptVersion: analyzeResult.promptVersion || '',
        strategy: analyzeResult.strategy || null,
        executionContext: analyzeResult.executionContext,
        source: analyzeResult.source || null,
        fallbackReason: analyzeResult.fallbackReason || null,
      });
      const analyzeModelRuntimeSummary = buildModelRuntimeSummary(analyzeResult.modelRuntime);
      const analyzeContinuePayload = buildContinuePayload({
        sessionId: analyzeResult.sessionId,
        stepId: analyzeResult.stepId,
        fromModule: 'analyze',
        assistantId: analyzeResult.activeAssistantId,
        executionContext: analyzeResult.executionContext,
      });

      const resolvedSessionId = analyzeResult.sessionId || sessionId;
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
          assistantId: analyzeResult.activeAssistantId,
          promptId: analyzeResult.promptId || '',
          promptVersion: analyzeResult.promptVersion || '',
          strategy: analyzeResult.strategy || null,
          source: analyzeResult.source || null,
          fallbackReason: analyzeResult.fallbackReason || null,
          governanceSummary: analyzeGovernanceSummary,
          taskModel: normalizedRequest.taskModel,
          assistantContext: analyzeResult.assistantContext,
          executionContext: analyzeResult.executionContext,
          executionContextSummary: analyzeResult.executionContext?.summary || null,
          resolvedAssistant: analyzeResult.executionContext?.resolvedAssistant || null,
          resolvedPrompt: analyzeResult.executionContext?.resolvedPrompt || null,
          modelRuntime: analyzeResult.modelRuntime,
          resolvedModel: analyzeResult.modelRuntime?.resolvedModel || null,
          modelSource:
            analyzeResult.modelRuntime?.resolvedModel?.source ||
            analyzeResult.modelRuntime?.reason ||
            '',
          modelRuntimeSummary: analyzeModelRuntimeSummary,
          databaseRelationSummary,
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
          executionContext: analyzeResult.executionContext,
          modelRuntime: analyzeResult.modelRuntime,
          databaseRelationSummary,
          continuePayload: analyzeContinuePayload,
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

      const searchPluginExecution = await withChildSpan(
        'mock-server.agent.search-references.plugin',
        {
          'mock.plugin.kind': 'search',
          'mock.plugin.route': 'search-documents',
        },
        async (pluginSpan) => {
          const result = await executeManifestPlugin({
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
            },
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
      const searchRuleEngineResult = applySearchRuleEngine
        ? await withChildSpan(
            'mock-server.agent.search-references.rule-engine',
            {
              'mock.rule_engine.name': 'search',
            },
            async (ruleSpan) => {
              const result = await runSearchRuleEngine(
                buildSearchRuleEngineContext({
                  rawInput,
                  normalizedInput,
                  settings,
                  executionContext: searchPluginExecution.output?.executionContext,
                }),
              );

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
      const searchEvidenceItems = Array.isArray(searchResult.evidenceItems)
        ? searchResult.evidenceItems
        : [];
      const matchedProducts = Array.isArray(searchResult.matchedProducts)
        ? searchResult.matchedProducts
        : [];
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

      const searchGovernanceSummary = buildGovernanceSummary({
        assistantId: searchResult.activeAssistantId,
        promptId: searchResult.promptId || '',
        promptVersion: searchResult.promptVersion || '',
        strategy: searchResult.strategy || null,
        executionContext: searchResult.executionContext,
        source: searchResult.source || null,
        fallbackReason: searchResult.fallbackReason || null,
      });
      const searchModelRuntimeSummary = buildModelRuntimeSummary(searchResult.modelRuntime);
      const searchContinuePayload = buildContinuePayload({
        sessionId: searchResult.sessionId,
        stepId: searchResult.stepId,
        fromModule: 'search',
        assistantId: searchResult.activeAssistantId,
        executionContext: searchResult.executionContext,
      });

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
          referenceSummary: searchResult.referenceSummary || '',
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
          executionContext: searchResult.executionContext,
          modelRuntime: searchResult.modelRuntime,
          databaseRelationSummary,
          executionContextSummary: searchResult.executionContext?.summary || null,
          searchStrategy: searchResult.searchStrategy,
          searchExecutionStrategy: searchResult.searchExecutionStrategy,
          enableExternalSupplement: searchResult.enableExternalSupplement,
          externalSearchAllowed: searchResult.externalSearchAllowed,
          externalProviderConfigured: searchResult.externalProviderConfigured,
          externalProvider: searchResult.externalProvider,
          searchRoute: searchResult.searchRoute,
          searchReason: searchResult.searchReason,
          searchSummary: searchResult.searchSummary,
          sourceSummary: searchResult.sourceSummary,
          sanitizedKeyword: searchResult.searchSanitizationResult?.sanitizedText || '',
          searchOutboundAllowed: Boolean(searchResult.searchTraceSummary?.outboundAllowed),
          searchOutboundReason:
            searchResult.searchTraceSummary?.outboundReason ||
            searchResult.searchSanitizationResult?.outboundReason ||
            'searchDocuments-outbound-not-used',
          referenceSummary: searchResult.referenceSummary,
          primaryEvidenceIds: searchResult.primaryEvidenceIds,
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

const handleSearchReferences = async (req, res) => {
  return processRetrieveMaterials(req, res, {
    applySearchRuleEngine: true,
  });
};

router.post('/search-documents', asyncWrapper(handleRetrieveMaterials));
router.post('/retrieve-materials', asyncWrapper(handleRetrieveMaterials));

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
      const normalizedInput = normalizedRequest.payload;
      const pluginId = rawInput.pluginId || '';
      const normalizedSessionId = normalizedInput.sessionId || '';
      const settings = readSettings();

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
      const scriptResult = outputPluginExecution.output || {};
      const finalScriptResult = scriptResult.finalResult || {};
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

      const scriptGovernanceSummary = buildGovernanceSummary({
        assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
        promptId: scriptResult.promptId || finalScriptResult.promptId || '',
        promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
        strategy: scriptResult.strategy || finalScriptResult.strategy || null,
        executionContext:
          scriptResult.executionContext || finalScriptResult.executionContext || null,
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
        assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
        executionContext:
          scriptResult.executionContext || finalScriptResult.executionContext || null,
        executionContextSummary: finalScriptResult.executionContextSummary || null,
      });

      console.log('[response] generate-script data:', {
        ...finalScriptResult,
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
          content: buildContentContextSnapshot({
            normalizedInput,
            finalScriptResult,
            sessionId: resolvedSessionId,
          }),
          lastStep: 'script',
        });
        await appendToHistory(resolvedSessionId, 'script', {
          taskSubject: normalizedInput.taskSubject || normalizedInput.productDirection || '',
          referenceSummary:
            normalizedInput.referenceSummary || finalScriptResult.referenceSummary || '',
          evidenceId: finalScriptResult.evidenceId || normalizedInput.evidenceId || '',
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
          assistantId: scriptResult.activeAssistantId || finalScriptResult.assistantId || '',
          promptId: scriptResult.promptId || finalScriptResult.promptId || '',
          promptVersion: scriptResult.promptVersion || finalScriptResult.promptVersion || '',
          strategy: scriptResult.strategy || finalScriptResult.strategy || null,
          source: scriptResult.source || finalScriptResult.source || null,
          fallbackReason:
            scriptResult.fallbackReason || finalScriptResult.fallbackReason || null,
          governanceSummary: scriptGovernanceSummary,
          taskModel: normalizedRequest.taskModel,
          executionContext:
            scriptResult.executionContext || finalScriptResult.executionContext || null,
          executionContextSummary:
            scriptResult.executionContext?.summary ||
            finalScriptResult.executionContextSummary ||
            null,
          resolvedAssistant:
            scriptResult.executionContext?.resolvedAssistant ||
            finalScriptResult.resolvedAssistant ||
            null,
          resolvedPrompt:
            scriptResult.executionContext?.resolvedPrompt ||
            finalScriptResult.resolvedPrompt ||
            null,
          modelRuntime: scriptResult.modelRuntime,
          resolvedModel: scriptResult.modelRuntime?.resolvedModel || null,
          modelSource:
            scriptResult.modelRuntime?.resolvedModel?.source ||
            scriptResult.modelRuntime?.reason ||
            '',
          modelRuntimeSummary: scriptModelRuntimeSummary,
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
          executionContext:
            scriptResult.executionContext || finalScriptResult.executionContext || null,
          modelRuntime: scriptResult.modelRuntime,
          databaseRelationSummary,
          executionContextSummary:
            scriptResult.executionContext?.summary ||
            finalScriptResult.executionContextSummary ||
            null,
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
