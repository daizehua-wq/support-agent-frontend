import {
  appendSessionStep,
  attachSessionAsset,
  upsertSessionEvidence,
} from './sessionService.js';
import { summarizeEvidenceOutboundPolicies } from './searchPolicyService.js';

export const buildSearchTraceSummary = ({
  keywordPolicy = null,
  evidenceItems = [],
  sourceSummary = null,
  summaryModelTrace = null,
  externalSearchTrace = null,
  connectorRegistrySummary = null,
} = {}) => {
  const outboundPolicySummary = summarizeEvidenceOutboundPolicies(evidenceItems);
  const outboundAllowed = Boolean(externalSearchTrace?.used || summaryModelTrace?.used);
  const outboundReason = summaryModelTrace?.used
    ? summaryModelTrace.reason
    : externalSearchTrace?.used
      ? externalSearchTrace.reason
      : summaryModelTrace?.reason ||
        externalSearchTrace?.reason ||
        keywordPolicy?.externalSearchReason ||
        'search-outbound-not-used';

  return {
    keywordPolicy: keywordPolicy
      ? {
          sanitizedKeyword: keywordPolicy.sanitizedKeyword,
          outboundAllowed: keywordPolicy.outboundAllowed,
          outboundReason: keywordPolicy.outboundReason,
          externalSearchAllowed: keywordPolicy.externalSearchAllowed,
          externalSearchReason: keywordPolicy.externalSearchReason,
          detectedSensitiveTypes: keywordPolicy.detectedSensitiveTypes,
        }
      : null,
    summaryModelTrace:
      summaryModelTrace && typeof summaryModelTrace === 'object' ? summaryModelTrace : null,
    externalSearchTrace:
      externalSearchTrace && typeof externalSearchTrace === 'object' ? externalSearchTrace : null,
    sourceSummary,
    outboundPolicySummary,
    connectorRegistrySummary,
    outboundAllowed,
    outboundReason,
  };
};

export const logSearchDiagnostics = ({
  matchedSearchRules = [],
  matchedRule = null,
  matchedProducts = [],
  evidenceItems = [],
  primaryEvidenceIds = [],
  executionContext = null,
  connectorRegistrySummary = null,
  searchTraceSummary = null,
} = {}) => {
  console.log('[searchFlow] matchedRules:', matchedSearchRules.map((item) => item.name));
  console.log('[searchFlow] matchedRule:', matchedRule);
  console.log('[searchFlow] matchedProducts:', matchedProducts.map((item) => item.productName));
  console.log('[searchFlow] evidenceItems:', evidenceItems.map((item) => item.title));
  console.log('[searchFlow] primaryEvidenceIds:', primaryEvidenceIds);
  console.log('[searchFlow] resolvedExecutionContext.summary:', executionContext?.summary);
  console.log('[searchFlow] resolvedExecutionContext.source:', executionContext?.source);
  console.log('[searchFlow] resolvedExecutionContext.fallbackReason:', executionContext?.fallbackReason);
  console.log('[searchFlow] connectorRegistrySummary:', connectorRegistrySummary);
  console.log('[searchFlow] searchTraceSummary:', searchTraceSummary);
};

export const persistSearchTrace = ({
  sessionId = '',
  searchStepInput = null,
  searchStepOutput = null,
  searchSummary = '',
  searchRoute = '',
  searchStrategy = '',
  searchExecutionStrategy = '',
  searchTraceSummary = null,
  searchReason = '',
  modelName = '',
  evidenceItems = [],
  documents = [],
  primaryEvidenceIds = [],
} = {}) => {
  const searchStep = appendSessionStep({
    sessionId,
    stepType: 'search',
    inputPayload: searchStepInput,
    outputPayload: searchStepOutput,
    summary: searchSummary,
    route: searchRoute,
    strategy: searchStrategy,
    executionStrategy: searchExecutionStrategy,
    outboundAllowed: Boolean(searchTraceSummary?.outboundAllowed),
    outboundReason: searchTraceSummary?.outboundReason || searchReason,
    modelName,
  });

  evidenceItems.forEach((evidence) => {
    upsertSessionEvidence({
      sessionId,
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
      relatedSessionId: evidence.relatedSessionId,
      productId: evidence.productId,
      productName: evidence.productName,
      isPrimaryEvidence: primaryEvidenceIds.includes(evidence.evidenceId),
    });
  });

  documents.forEach((doc) => {
    attachSessionAsset({
      sessionId,
      sourceModule: 'search',
      docId: doc.id,
      docName: doc.docName,
      docType: doc.docType,
      applicableScene: doc.applicableScene,
      externalAvailable: doc.externalAvailable,
    });
  });

  return searchStep;
};
