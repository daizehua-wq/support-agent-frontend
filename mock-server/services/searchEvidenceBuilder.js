import { buildOutboundSanitizationResult } from './sanitizationService.js';

const normalizeText = (value = '') => String(value || '').trim();

const clampNumber = (value, min, max) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return min;
  }

  return Math.min(max, Math.max(min, numericValue));
};

const getDocumentPriority = (docType = '', sourceType = 'local-document') => {
  if (sourceType === 'local-document') {
    if (docType.includes('规格')) {
      return 5;
    }

    if (docType.includes('FAQ')) {
      return 4;
    }

    if (docType.includes('测试')) {
      return 3;
    }

    if (docType.includes('方案')) {
      return 2;
    }
  }

  if (sourceType === 'local-file') {
    return 1;
  }

  if (sourceType === 'enterprise-database') {
    return 0;
  }

  if (docType.includes('规格')) {
    return 4;
  }

  if (docType.includes('FAQ')) {
    return 3;
  }

  if (docType.includes('测试')) {
    return 2;
  }

  if (docType.includes('方案')) {
    return 1;
  }

  return 0;
};

export const buildPrimaryEvidenceCandidates = (evidenceCandidates = []) => {
  return evidenceCandidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const priorityDiff =
        getDocumentPriority(b.candidate.docType, b.candidate.sourceType) -
        getDocumentPriority(a.candidate.docType, a.candidate.sourceType);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const confidenceDiff =
        Number(b.candidate.confidenceBase || 0) - Number(a.candidate.confidenceBase || 0);

      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }

      return a.index - b.index;
    })
    .slice(0, 3)
    .map((item) => item.candidate);
};

const getEvidenceLevel = ({ docType = '', docName = '' } = {}) => {
  const normalizedType = normalizeText(docType);
  const normalizedName = normalizeText(docName);

  if (
    normalizedType === 'spec' ||
    normalizedType === 'case' ||
    normalizedType === 'project' ||
    normalizedType === '规格书' ||
    normalizedType === '案例资料' ||
    normalizedType === '项目资料' ||
    normalizedName.includes('规格书')
  ) {
    return 'core';
  }

  return 'support';
};

const getEvidenceConfidence = ({
  docType = '',
  docName = '',
  matchedRule = null,
  isPrimary = false,
  confidenceBase = undefined,
} = {}) => {
  if (Number.isFinite(Number(confidenceBase))) {
    let confidence = Number(confidenceBase);

    if (matchedRule?.name) {
      confidence += 0.04;
    }

    if (isPrimary) {
      confidence += 0.02;
    }

    return Number(Math.min(confidence, 0.98).toFixed(2));
  }

  const normalizedType = normalizeText(docType);
  const normalizedName = normalizeText(docName);

  let confidence = 0.68;

  if (normalizedType === 'spec' || normalizedType === '规格书' || normalizedName.includes('规格书')) {
    confidence = 0.92;
  } else if (
    normalizedType === 'case' ||
    normalizedType === 'project' ||
    normalizedType === '案例资料' ||
    normalizedType === '项目资料'
  ) {
    confidence = 0.88;
  } else if (normalizedType === 'FAQ') {
    confidence = 0.8;
  } else if (
    normalizedType.includes('测试') ||
    normalizedType.includes('工艺') ||
    normalizedType.includes('兼容')
  ) {
    confidence = 0.78;
  }

  if (matchedRule?.name) {
    confidence += 0.04;
  }

  if (isPrimary) {
    confidence += 0.02;
  }

  return Number(Math.min(confidence, 0.98).toFixed(2));
};

export const buildEvidenceItems = ({
  evidenceCandidates = [],
  matchedRule = null,
  primaryCandidateRefs = [],
  activeAssistantId = '',
  sessionId = '',
} = {}) => {
  return evidenceCandidates.map((candidate) => {
    const level = getEvidenceLevel({
      docType: candidate.docType,
      docName: candidate.title,
    });
    const sourceRefKey = `${candidate.sourceType}:${candidate.sourceRef}`;
    const outboundPolicy = candidate.outboundPolicy || {
      decision: candidate.outboundStatus || 'unknown',
      reason: candidate.outboundReason || 'legacy-outbound-policy',
      whitelistMatched: Boolean(candidate.whitelistMatched),
      summaryAllowed: false,
      policySource: candidate.connectorId ? `search.connector.${candidate.connectorId}` : 'search.connector',
      connectorId: candidate.connectorId || '',
      connectorType: candidate.connectorType || '',
    };

    return {
      evidenceId: `evidence-${candidate.sourceType}-${candidate.sourceRef}`.replace(/[^\w:-]+/g, '-'),
      level,
      sourceType: candidate.sourceType,
      sourceRef: candidate.sourceRef,
      title: candidate.title,
      docType: candidate.docType,
      summary: candidate.summary,
      applicableScene: candidate.applicableScene,
      outboundStatus: outboundPolicy.decision,
      outboundPolicy,
      confidence: getEvidenceConfidence({
        docType: candidate.docType,
        docName: candidate.title,
        matchedRule,
        isPrimary: primaryCandidateRefs.includes(sourceRefKey),
        confidenceBase: candidate.confidenceBase,
      }),
      relatedAssistantId: activeAssistantId,
      relatedSessionId: sessionId,
      productId: candidate.productId || '',
      productName: candidate.productName || '',
      connectorId: candidate.connectorId || '',
      connectorType: candidate.connectorType || '',
    };
  });
};

export const buildWhitelistedEvidenceSummaries = (
  evidenceItems = [],
  {
    maxItems = 6,
    maxSummaryLength = 180,
    moduleName = 'searchDocuments',
  } = {},
) => {
  return evidenceItems
    .filter((item) => item?.outboundPolicy?.summaryAllowed)
    .slice(0, maxItems)
    .map((item) => {
      const sanitizationResult = buildOutboundSanitizationResult({
        moduleName,
        strategy: 'masked-api',
        sourceText: `${normalizeText(item.title)} ${normalizeText(item.summary)}`.trim(),
        input: {},
      });

      const safeSummary = normalizeText(sanitizationResult.sanitizedText || item.summary).slice(
        0,
        maxSummaryLength,
      );

      return {
        evidenceId: item.evidenceId,
        sourceType: item.sourceType,
        title: normalizeText(item.title),
        docType: normalizeText(item.docType),
        applicableScene: normalizeText(item.applicableScene),
        summary: safeSummary,
        confidence: clampNumber(item.confidence, 0, 1),
        outboundDecision: item.outboundPolicy?.decision || item.outboundStatus || 'unknown',
      };
    })
    .filter((item) => item.summary);
};

