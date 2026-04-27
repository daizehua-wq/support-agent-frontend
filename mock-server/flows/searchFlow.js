import {
  readSettings,
  getModelConfigForModule,
  getDefaultSettings,
  getResolvedExecutionContextForModule,
} from '../services/settingsService.js';
import { getModulePolicy } from '../config/policyConfig.js';
import { resolveModelRuntimeForModule } from '../services/modelRouter.js';
import {
  getOrCreateSession,
  getSessionStorePath,
  updateSession,
} from '../services/sessionService.js';
import { getPromptForModule } from '../services/promptService.js';
import {
  getAssistantExecutionContext,
} from '../services/assistantContextService.js';
import { normalizeCapabilityRequest } from '../services/taskModelService.js';
import { runSearchRuleEngine } from '../plugins/search-rule-engine/index.js';
import {
  collectSearchEvidenceCandidates,
  dedupeSearchEvidenceCandidates,
  sortSearchEvidenceCandidates,
  summarizeSearchEvidenceSources,
  buildSearchConnectorRegistrySummary,
} from '../services/searchAdapterRegistry.js';
import {
  buildSearchKeywordPolicy,
  applyEvidenceOutboundPolicies,
} from '../services/searchPolicyService.js';
import {
  buildPrimaryEvidenceCandidates,
  buildEvidenceItems,
  buildWhitelistedEvidenceSummaries,
} from '../services/searchEvidenceBuilder.js';
import {
  buildExternalFallbackResults,
  generateSearchSummary,
  getExternalSearchProvider,
  isExternalProviderConfigured,
  runExternalProviderSearch,
} from '../services/searchSummaryService.js';
import {
  buildSearchTraceSummary,
  logSearchDiagnostics,
  persistSearchTrace,
} from '../services/searchTraceService.js';
import { createReferencePackFromSearch } from '../services/referencePackService.js';
import { runPaidApiConnector } from '../plugins/data-connectors/paidApiConnector.js';
import { runWebSearchConnector } from '../plugins/data-connectors/webSearchConnector.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeSourceScopeList = ({
  sourceScopes = undefined,
  enableExternalSupplement = false,
  includePaidApiSources = false,
  includeWebSources = false,
} = {}) => {
  const defaultScopes = ['internal', 'paid_api', 'web'];
  const sourceScopesProvided = Array.isArray(sourceScopes);
  const rawScopes = sourceScopesProvided ? sourceScopes : defaultScopes;
  const normalizedScopes = rawScopes
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const scopeSet = new Set(
    normalizedScopes.length ? normalizedScopes : sourceScopesProvided ? [] : defaultScopes,
  );

  if (enableExternalSupplement || includeWebSources) {
    scopeSet.add('web');
    scopeSet.add('internet');
  }

  if (includePaidApiSources) {
    scopeSet.add('paid_api');
    scopeSet.add('authoritative');
  }

  return {
    includeInternal: scopeSet.has('internal') || scopeSet.has('internal_data'),
    includePaidApi:
      scopeSet.has('paid_api') ||
      scopeSet.has('paid') ||
      scopeSet.has('authoritative') ||
      scopeSet.has('paid_authoritative_data'),
    includeWeb:
      scopeSet.has('web') ||
      scopeSet.has('internet') ||
      scopeSet.has('web_search') ||
      scopeSet.has('official_web') ||
      scopeSet.has('general_web'),
    sourceScopes: [...scopeSet],
    defaultEnabled: !sourceScopesProvided,
  };
};

const buildFinalSearchRoute = ({
  keywordPolicy = null,
  externalResults = [],
  externalSearchTrace = null,
  summaryModelTrace = null,
} = {}) => {
  const summaryPrefix = summaryModelTrace?.used ? 'search-llm' : 'search-local';

  if (keywordPolicy?.externalSupplementRequested && !keywordPolicy?.externalSearchAllowed) {
    return `${summaryPrefix}+external-blocked`;
  }

  if (keywordPolicy?.externalSearchAllowed) {
    if (externalSearchTrace?.used) {
      return `${summaryPrefix}+external`;
    }

    if (externalResults.length > 0) {
      return `${summaryPrefix}+external-fallback`;
    }

    return `${summaryPrefix}+external-empty`;
  }

  return summaryModelTrace?.used ? 'search-llm-local' : 'search-local-only';
};

export const runSearchDocumentsFlow = async (rawInput = {}) => {
  const normalizedRequest = normalizeCapabilityRequest(rawInput, 'retrieve');
  const normalizedInput = normalizedRequest.payload;
  const taskModel = normalizedRequest.taskModel;
  const {
    keyword = '',
    docType = undefined,
    industryType = 'other',
    onlyExternalAvailable = false,
    enableExternalSupplement = false,
    sessionId = '',
    settings = undefined,
    taskInput = '',
    taskSubject = '',
    context = '',
    goal = '',
    deliverable = '',
    variables = {},
    attachments = [],
    appId = '',
    sourceScopes = undefined,
    includePaidApiSources = false,
    includeWebSources = false,
    useMockExternalProviderFallback = true,
    retainRaw = false,
  } = normalizedInput;
  const runtimeSettings = settings || readSettings() || getDefaultSettings();
  const baseSearchModelConfig = getModelConfigForModule('search');
  const modelRuntime = resolveModelRuntimeForModule({
    moduleName: 'search',
    modelSettings: runtimeSettings.model || {},
  });
  const searchModelConfig = modelRuntime.resolvedModel?.isResolved
    ? {
        ...baseSearchModelConfig,
        modelProvider:
          modelRuntime.resolvedModel.resolvedProvider || baseSearchModelConfig.modelProvider,
        baseUrl: modelRuntime.resolvedModel.resolvedBaseUrl || baseSearchModelConfig.baseUrl,
        modelName: modelRuntime.resolvedModel.resolvedModelName || baseSearchModelConfig.modelName,
        appId,
      }
    : {
        ...baseSearchModelConfig,
        appId,
      };
  const assistantContext = getAssistantExecutionContext(runtimeSettings);
  const initialAssistantId =
    assistantContext.assistantId || runtimeSettings.assistant?.activeAssistantId || '';
  const initialSearchPrompt = getPromptForModule(initialAssistantId, 'search');
  const initialResolvedExecutionContext = getResolvedExecutionContextForModule(
    'search',
    assistantContext.executionContext || {},
    {
      modulePrompt: {
        promptId: initialSearchPrompt?.id || '',
        promptVersion: initialSearchPrompt?.version || '',
      },
    },
  );
  const activeAssistantId =
    initialResolvedExecutionContext.resolvedAssistant?.assistantId || initialAssistantId || '';
  const searchPrompt = getPromptForModule(activeAssistantId, 'search');
  const baseExecutionContext = getResolvedExecutionContextForModule(
    'search',
    assistantContext.executionContext || {},
    {
      modulePrompt: {
        promptId: searchPrompt?.id || '',
        promptVersion: searchPrompt?.version || '',
      },
    },
  );
  const promptId = baseExecutionContext.resolvedPrompt?.promptId || searchPrompt?.id || '';
  const promptVersion = baseExecutionContext.resolvedPrompt?.promptVersion || searchPrompt?.version || '';
  const executionContext = {
    ...baseExecutionContext,
    resolvedPrompt: {
      ...(baseExecutionContext.resolvedPrompt || {}),
      promptId,
      promptVersion,
    },
    source: {
      ...(baseExecutionContext.source || {}),
      prompt:
        baseExecutionContext.source?.prompt && baseExecutionContext.source?.prompt !== 'none'
          ? baseExecutionContext.source.prompt
          : promptId
            ? 'module.search.prompt'
            : baseExecutionContext.source?.prompt || 'none',
      promptVersion:
        baseExecutionContext.source?.promptVersion && baseExecutionContext.source?.promptVersion !== 'none'
          ? baseExecutionContext.source.promptVersion
          : promptVersion
            ? 'module.search.promptVersion'
            : baseExecutionContext.source?.promptVersion || 'none',
    },
    fallbackReason: {
      ...(baseExecutionContext.fallbackReason || {}),
      prompt:
        promptId && baseExecutionContext.fallbackReason?.prompt === 'prompt-missing'
          ? 'module-prompt-applied'
          : baseExecutionContext.fallbackReason?.prompt,
      promptVersion:
        promptVersion && baseExecutionContext.fallbackReason?.promptVersion === 'prompt-version-missing'
          ? 'module-prompt-version-applied'
          : baseExecutionContext.fallbackReason?.promptVersion,
    },
    summary: {
      ...(baseExecutionContext.summary || {}),
      promptId,
      promptVersion,
    },
  };
  const searchStrategy =
    executionContext.strategy?.id ||
    runtimeSettings.strategy?.searchStrategy ||
    getDefaultSettings().strategy.searchStrategy;
  const searchExecutionStrategy = searchStrategy === 'local-only' ? 'local-only' : 'external-enabled';

  const modulePolicy = getModulePolicy('searchDocuments');
  const keywordPolicy = buildSearchKeywordPolicy({
    moduleName: 'searchDocuments',
    strategy: 'masked-api',
    keyword,
    industryType,
    enableExternalSupplement,
    searchExecutionStrategy,
    modulePolicy,
  });

  const searchRuleEngineResult = await runSearchRuleEngine({
    capability: 'search-documents',
    rawInput,
    normalizedInput,
    keyword,
    industryType,
    docType,
    executionContext,
  });
  const matchedSearchRules = Array.isArray(searchRuleEngineResult.matchedRules)
    ? searchRuleEngineResult.matchedRules
    : [];
  const matchedRule = searchRuleEngineResult.matchedRule || null;
  const matchedProducts = Array.isArray(searchRuleEngineResult.matchedProducts)
    ? searchRuleEngineResult.matchedProducts
    : [];
  const documents = Array.isArray(searchRuleEngineResult.documents)
    ? searchRuleEngineResult.documents
    : [];

  const { connectorRegistry, candidates: adapterCandidates } = await collectSearchEvidenceCandidates({
    keyword,
    industryType,
    docTypeFilter: docType,
    settings: runtimeSettings,
    documents,
  });

  let evidenceCandidates = sortSearchEvidenceCandidates(
    dedupeSearchEvidenceCandidates(
      applyEvidenceOutboundPolicies({
        evidenceCandidates: adapterCandidates,
        modulePolicy,
      }),
    ),
  );

  if (onlyExternalAvailable) {
    evidenceCandidates = evidenceCandidates.filter((item) => item.outboundPolicy?.decision === 'allowed');
  }

  const primaryEvidenceCandidates = buildPrimaryEvidenceCandidates(evidenceCandidates);
  const primaryCandidateRefs = primaryEvidenceCandidates.map(
    (item) => `${item.sourceType}:${item.sourceRef}`,
  );
  const evidenceItems = buildEvidenceItems({
    evidenceCandidates,
    matchedRule,
    primaryCandidateRefs,
    activeAssistantId,
    sessionId: sessionId || '',
  });
  const primaryEvidenceIds = evidenceItems
    .filter((item) => primaryCandidateRefs.includes(`${item.sourceType}:${item.sourceRef}`))
    .map((item) => item.evidenceId);
  const sourceSummary = summarizeSearchEvidenceSources(evidenceCandidates);

  let externalResults = [];
  let externalSearchTrace = {
    requested: keywordPolicy.externalSupplementRequested,
    allowed: keywordPolicy.externalSearchAllowed,
    used: false,
    providerConfigured: isExternalProviderConfigured(),
    resultCount: 0,
    reason: keywordPolicy.externalSearchAllowed
      ? 'external-search-awaiting-provider'
      : keywordPolicy.externalSearchReason,
  };

  if (keywordPolicy.externalSearchAllowed) {
    try {
      const providerResults = await runExternalProviderSearch({
        keyword: keywordPolicy.sanitizedKeyword || keyword,
      });
      externalResults = providerResults;
      externalSearchTrace = {
        ...externalSearchTrace,
        used: providerResults.length > 0,
        resultCount: providerResults.length,
        reason: providerResults.length > 0 ? 'external-provider-search-success' : 'external-provider-search-empty',
      };
    } catch (error) {
      console.log('[searchFlow] external provider search failed:', error.message);
      externalSearchTrace = {
        ...externalSearchTrace,
        used: false,
        resultCount: 0,
        reason: error.message,
      };
    }

    if (externalResults.length === 0) {
      externalResults = buildExternalFallbackResults(evidenceItems);
      externalSearchTrace = {
        ...externalSearchTrace,
        used: false,
        resultCount: externalResults.length,
        reason: externalResults.length > 0 ? 'external-provider-fallback-from-whitelisted-evidence' : externalSearchTrace.reason,
      };
    }
  }

  const whitelistedEvidenceSummaries = buildWhitelistedEvidenceSummaries(evidenceItems, {
    maxItems: Number(runtimeSettings.search?.summaryPolicy?.maxWhitelistedEvidenceItems || 6),
    maxSummaryLength: Number(runtimeSettings.search?.summaryPolicy?.maxEvidenceSummaryLength || 180),
  });
  const summaryResult = await generateSearchSummary({
    modulePolicy,
    modelConfig: searchModelConfig,
    keywordPolicy,
    matchedRule,
    evidenceItems,
    sourceSummary,
    externalResults,
    whitelistedEvidenceSummaries,
  });

  const session = getOrCreateSession({
    sessionId,
    title: keyword ? `retrieve｜${keyword}` : taskInput ? `retrieve｜${taskInput}` : undefined,
    taskInput,
    context,
    goal,
    deliverable,
    variables,
    attachments,
    audience: '通用工作会话',
    industryType,
    sourceModule: 'search',
    currentStage: 'requirement_discussion',
    currentGoal: goal || 'retrieve_materials',
    keyword,
    taskSubject: taskSubject || matchedProducts[0]?.productName || keyword,
    assistantId: activeAssistantId,
    executionContext,
  });

  const evidenceItemsWithSession = evidenceItems.map((item) => ({
    ...item,
    relatedSessionId: session.id,
  }));
  const sourceScopeSelection = normalizeSourceScopeList({
    sourceScopes: sourceScopes || variables.sourceScopes,
    enableExternalSupplement,
    includePaidApiSources:
      includePaidApiSources === true || variables.includePaidApiSources === true,
    includeWebSources: includeWebSources === true || variables.includeWebSources === true,
  });
  const shouldUseMockExternalProviderFallback =
    useMockExternalProviderFallback !== false &&
    variables.useMockExternalProviderFallback !== false;
  let governedExternalSources = [];
  let externalProviderStates = [];

  if (sourceScopeSelection.includePaidApi) {
    try {
      const paidApiResult = await runPaidApiConnector({
        keyword,
        sessionId: session.id,
        appId,
        useMockFallback: shouldUseMockExternalProviderFallback,
      });
      governedExternalSources = [
        ...governedExternalSources,
        ...(Array.isArray(paidApiResult.sources) ? paidApiResult.sources : []),
      ];
      externalProviderStates = [
        ...externalProviderStates,
        ...(Array.isArray(paidApiResult.providerStates) ? paidApiResult.providerStates : []),
      ];
    } catch (error) {
      externalProviderStates.push({
        provider: 'generic_paid_api',
        sourceType: 'paid_api',
        status: 'failed',
        reason: error.message,
        resultCount: 0,
      });
      console.warn('[searchFlow] paid_api connector degraded:', error.message);
    }
  }

  if (sourceScopeSelection.includeWeb) {
    try {
      const webSearchResult = await runWebSearchConnector({
        keyword,
        sessionId: session.id,
        appId,
        useMockFallback: shouldUseMockExternalProviderFallback,
      });
      governedExternalSources = [
        ...governedExternalSources,
        ...(Array.isArray(webSearchResult.sources) ? webSearchResult.sources : []),
      ];
      externalProviderStates = [
        ...externalProviderStates,
        ...(Array.isArray(webSearchResult.providerStates) ? webSearchResult.providerStates : []),
      ];
    } catch (error) {
      externalProviderStates.push({
        provider: 'generic_web_search',
        sourceType: 'web_search',
        status: 'failed',
        reason: error.message,
        resultCount: 0,
      });
      console.warn('[searchFlow] web_search connector degraded:', error.message);
    }
  }

  let referencePackResult = null;
  let referencePackError = null;

  try {
    referencePackResult = createReferencePackFromSearch({
      query: keyword || taskInput || taskSubject,
      title: keyword ? `参考资料包：${keyword}` : '参考资料包',
      sessionId: session.id,
      appId,
      internalEvidenceItems: sourceScopeSelection.includeInternal ? evidenceItemsWithSession : [],
      externalSources: governedExternalSources,
      retainRaw: retainRaw === true || variables.retainRaw === true,
    });
  } catch (error) {
    referencePackError = {
      message: error.message,
    };
    console.warn('[searchFlow] reference pack generation failed:', error.message);
  }
  const connectorRegistrySummary = buildSearchConnectorRegistrySummary(connectorRegistry);
  const searchTraceSummary = buildSearchTraceSummary({
    keywordPolicy,
    evidenceItems: evidenceItemsWithSession,
    sourceSummary,
    summaryModelTrace: summaryResult.summaryModelTrace,
    externalSearchTrace,
    connectorRegistrySummary,
  });
  const searchRoute = buildFinalSearchRoute({
    keywordPolicy,
    externalResults,
    externalSearchTrace,
    summaryModelTrace: summaryResult.summaryModelTrace,
  });
  const searchReason =
    keywordPolicy.externalSupplementRequested && !keywordPolicy.externalSearchAllowed
      ? keywordPolicy.externalSearchReason
      : summaryResult.searchReason;

  logSearchDiagnostics({
    matchedSearchRules,
    matchedRule,
    matchedProducts,
    evidenceItems: evidenceItemsWithSession,
    primaryEvidenceIds,
    executionContext,
    connectorRegistrySummary,
    searchTraceSummary,
  });
  console.log('[searchFlow] session.id:', session.id);
  console.log('[searchFlow] sessionStorePath:', getSessionStorePath());
  console.log('[searchFlow] searchRoute:', searchRoute);
  console.log('[searchFlow] searchReason:', searchReason);
  console.log('[searchFlow] searchSummary:', summaryResult.searchSummary);

  const searchStepInput = {
    keyword,
    sanitizedKeyword: keywordPolicy.sanitizedKeyword,
    docType,
    assistantId: activeAssistantId,
    promptId,
    promptVersion,
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    resolvedAssistant: executionContext.resolvedAssistant,
    resolvedPrompt: executionContext.resolvedPrompt,
    executionContextSummary: executionContext.summary,
    executionContext,
    resolvedModel: modelRuntime.resolvedModel,
    industryType,
    taskSubject: taskSubject || keyword,
    onlyExternalAvailable,
    enableExternalSupplement,
    taskInput: taskModel.taskInput,
    context: taskModel.context,
    goal: taskModel.goal,
    deliverable: taskModel.deliverable,
    variables: taskModel.variables,
    attachments: taskModel.attachments,
    searchSanitizationResult: keywordPolicy.sanitizationResult,
    searchKeywordPolicy: keywordPolicy,
    summaryModelTrace: summaryResult.summaryModelTrace,
    externalSearchTrace,
    whitelistedEvidenceSummaries,
    connectorRegistrySummary,
    searchRuleEngine: {
      configPath: searchRuleEngineResult.configPath,
      enabledRules: searchRuleEngineResult.enabledRules || [],
      executedRules: searchRuleEngineResult.executedRules || [],
    },
    sourceScopeSelection,
    useMockExternalProviderFallback: shouldUseMockExternalProviderFallback,
    externalProviderStates,
    referencePackId: referencePackResult?.referencePack?.referencePackId || '',
    referencePack: referencePackResult?.referencePack || null,
    governedEvidenceItems: referencePackResult?.evidenceItems || [],
    referencePackLibrary: referencePackResult?.library || null,
    referencePackCacheCleanup: referencePackResult?.cacheCleanup || null,
    referencePackError,
    taskModel,
  };
  const searchStepOutput = {
    matchedSearchRules,
    matchedRule,
    matchedProducts,
    evidenceItems: evidenceItemsWithSession,
    primaryEvidenceIds,
    sourceSummary,
    referenceSummary: summaryResult.searchSummary,
    searchSummary: summaryResult.searchSummary,
    externalResults,
    assistantId: activeAssistantId,
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    resolvedAssistant: executionContext.resolvedAssistant,
    resolvedPrompt: executionContext.resolvedPrompt,
    executionContextSummary: executionContext.summary,
    executionContext,
    resolvedModel: modelRuntime.resolvedModel,
    promptId,
    promptVersion,
    searchSanitizationResult: keywordPolicy.sanitizationResult,
    searchKeywordPolicy: keywordPolicy,
    summaryModelTrace: summaryResult.summaryModelTrace,
    externalSearchTrace,
    whitelistedEvidenceSummaries,
    connectorRegistrySummary,
    searchTraceSummary,
    sourceScopeSelection,
    useMockExternalProviderFallback: shouldUseMockExternalProviderFallback,
    externalProviderStates,
    referencePackId: referencePackResult?.referencePack?.referencePackId || '',
    referencePack: referencePackResult?.referencePack || null,
    governedEvidenceItems: referencePackResult?.evidenceItems || [],
    referencePackLibrary: referencePackResult?.library || null,
    referencePackCacheCleanup: referencePackResult?.cacheCleanup || null,
    referencePackError,
    searchRuleEngine: {
      configPath: searchRuleEngineResult.configPath,
      enabledRules: searchRuleEngineResult.enabledRules || [],
      executedRules: searchRuleEngineResult.executedRules || [],
    },
  };

  const searchStep = persistSearchTrace({
    sessionId: session.id,
    searchStepInput,
    searchStepOutput,
    searchSummary: summaryResult.searchSummary,
    searchRoute,
    searchStrategy,
    searchExecutionStrategy,
    searchTraceSummary,
    searchReason,
    modelName: searchModelConfig.modelName || '',
    evidenceItems: evidenceItemsWithSession,
    documents,
    primaryEvidenceIds,
  });

  updateSession(session.id, {
    sourceModule: 'search',
    currentStage: 'requirement_discussion',
    currentGoal: goal || 'retrieve_materials',
    assistantId: activeAssistantId,
    title: matchedProducts[0]?.productName
      ? `retrieve｜${matchedProducts[0].productName}`
      : keyword
        ? `retrieve｜${keyword}`
        : taskInput
          ? `retrieve｜${taskInput}`
        : session.title,
  });

  return {
    keyword,
    sessionId: session.id,
    stepId: searchStep.id,
    matchedSearchRules,
    matchedRule,
    matchedProducts,
    evidenceItems: evidenceItemsWithSession,
    primaryEvidenceIds,
    referenceSummary: summaryResult.searchSummary,
    searchModelConfig,
    modelRuntime,
    searchStrategy,
    searchExecutionStrategy,
    enableExternalSupplement,
    externalSearchAllowed: keywordPolicy.externalSearchAllowed,
    searchSanitizationResult: keywordPolicy.sanitizationResult,
    searchKeywordPolicy: keywordPolicy,
    sourceSummary,
    searchRoute,
    searchReason,
    searchSummary: summaryResult.searchSummary,
    externalResults,
    externalProvider: getExternalSearchProvider(),
    externalProviderConfigured: isExternalProviderConfigured(),
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    promptId,
    promptVersion,
    assistantContext,
    executionContext,
    activeAssistantId,
    searchPrompt,
    searchRuleEngine: {
      configPath: searchRuleEngineResult.configPath,
      enabledRules: searchRuleEngineResult.enabledRules || [],
      executedRules: searchRuleEngineResult.executedRules || [],
    },
    modulePolicy,
    summaryModelTrace: summaryResult.summaryModelTrace,
    externalSearchTrace,
    whitelistedEvidenceSummaries,
    connectorRegistrySummary,
    searchTraceSummary,
    sourceScopeSelection,
    useMockExternalProviderFallback: shouldUseMockExternalProviderFallback,
    externalProviderStates,
    referencePackId: referencePackResult?.referencePack?.referencePackId || '',
    referencePack: referencePackResult?.referencePack || null,
    governedEvidenceItems: referencePackResult?.evidenceItems || [],
    referencePackLibrary: referencePackResult?.library || null,
    referencePackCacheCleanup: referencePackResult?.cacheCleanup || null,
    referencePackError,
  };
};
