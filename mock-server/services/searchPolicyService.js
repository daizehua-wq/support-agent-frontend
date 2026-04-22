import { buildOutboundSanitizationResult } from './sanitizationService.js';

const SEARCH_POLICY_CONTRACT_VERSION = 'search-policy/v1';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeBoolean = (value, fallback = undefined) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
};

const normalizeStatus = (value = 'unknown') => {
  const normalizedValue = normalizeText(value).toLowerCase();

  if (normalizedValue === 'allowed') {
    return 'allowed';
  }

  if (normalizedValue === 'internal-only' || normalizedValue === 'blocked') {
    return 'internal-only';
  }

  return 'unknown';
};

const hasWhitelistValues = (value) => {
  if (Array.isArray(value)) {
    return value.some((item) => normalizeText(item));
  }

  return Boolean(normalizeText(value));
};

const normalizeWhitelist = (whitelist = {}) => {
  const normalizedWhitelist =
    whitelist && typeof whitelist === 'object' && !Array.isArray(whitelist) ? whitelist : {};

  return {
    docTypes: Array.isArray(normalizedWhitelist.docTypes) ? normalizedWhitelist.docTypes : [],
    outboundDocTypes: Array.isArray(normalizedWhitelist.outboundDocTypes)
      ? normalizedWhitelist.outboundDocTypes
      : [],
    extensions: Array.isArray(normalizedWhitelist.extensions) ? normalizedWhitelist.extensions : [],
    pathPrefixes: Array.isArray(normalizedWhitelist.pathPrefixes)
      ? normalizedWhitelist.pathPrefixes
      : [],
    outboundPathPrefixes: Array.isArray(normalizedWhitelist.outboundPathPrefixes)
      ? normalizedWhitelist.outboundPathPrefixes
      : [],
    tables: Array.isArray(normalizedWhitelist.tables) ? normalizedWhitelist.tables : [],
    outboundTables: Array.isArray(normalizedWhitelist.outboundTables)
      ? normalizedWhitelist.outboundTables
      : [],
    schemas: Array.isArray(normalizedWhitelist.schemas) ? normalizedWhitelist.schemas : [],
    outboundSchemas: Array.isArray(normalizedWhitelist.outboundSchemas)
      ? normalizedWhitelist.outboundSchemas
      : [],
    sourceRefs: Array.isArray(normalizedWhitelist.sourceRefs) ? normalizedWhitelist.sourceRefs : [],
    outboundSourceRefs: Array.isArray(normalizedWhitelist.outboundSourceRefs)
      ? normalizedWhitelist.outboundSourceRefs
      : [],
    summaryAllowed: normalizeBoolean(normalizedWhitelist.summaryAllowed, undefined),
    outboundAllowed: normalizeBoolean(normalizedWhitelist.outboundAllowed, undefined),
  };
};

export const buildSearchKeywordPolicy = ({
  moduleName = 'searchDocuments',
  strategy = 'masked-api',
  keyword = '',
  industryType = 'other',
  enableExternalSupplement = false,
  searchExecutionStrategy = 'local-only',
  modulePolicy = null,
} = {}) => {
  const sanitizationResult = buildOutboundSanitizationResult({
    moduleName,
    strategy,
    sourceText: keyword,
    input: {
      industryType,
    },
  });

  const externalSupplementRequested = enableExternalSupplement === true;
  const externalSearchAllowed =
    externalSupplementRequested &&
    searchExecutionStrategy !== 'local-only' &&
    Boolean(modulePolicy?.internetSupplementAllowed) &&
    sanitizationResult.outboundAllowed;
  let externalSearchReason = `${moduleName}-external-supplement-disabled`;

  if (externalSearchAllowed) {
    externalSearchReason = `${moduleName}-external-supplement-allowed`;
  } else if (externalSupplementRequested) {
    if (searchExecutionStrategy === 'local-only') {
      externalSearchReason = `${moduleName}-external-supplement-blocked-by-local-strategy`;
    } else if (!modulePolicy?.internetSupplementAllowed) {
      externalSearchReason = `${moduleName}-external-supplement-policy-blocked`;
    } else if (!sanitizationResult.outboundAllowed) {
      externalSearchReason =
        sanitizationResult.outboundReason || `${moduleName}-external-supplement-sanitization-blocked`;
    } else {
      externalSearchReason = `${moduleName}-external-supplement-blocked`;
    }
  }

  return {
    contractVersion: SEARCH_POLICY_CONTRACT_VERSION,
    moduleName,
    keyword: normalizeText(keyword),
    sanitizedKeyword: sanitizationResult.sanitizedText || normalizeText(keyword),
    detectedSensitiveTypes: sanitizationResult.detectedSensitiveTypes || [],
    outboundAllowed: sanitizationResult.outboundAllowed,
    outboundReason: sanitizationResult.outboundReason,
    externalSupplementRequested,
    externalSearchAllowed,
    externalSearchReason,
    sanitizationResult,
  };
};

export const buildEvidenceOutboundPolicy = ({
  candidate = {},
  modulePolicy = null,
  defaultStatus = 'internal-only',
} = {}) => {
  const connectorWhitelist = normalizeWhitelist(candidate.whitelist);
  const hasExplicitOutboundWhitelist =
    hasWhitelistValues(connectorWhitelist.outboundDocTypes) ||
    hasWhitelistValues(connectorWhitelist.outboundPathPrefixes) ||
    hasWhitelistValues(connectorWhitelist.outboundTables) ||
    hasWhitelistValues(connectorWhitelist.outboundSchemas) ||
    hasWhitelistValues(connectorWhitelist.outboundSourceRefs);
  const whitelistMatched = hasExplicitOutboundWhitelist
    ? candidate.outboundWhitelistMatched === true || candidate.whitelistMatched === true
    : candidate.whitelistMatched === true;

  let decision = normalizeStatus(candidate.outboundStatus || defaultStatus);
  let reason = normalizeText(candidate.outboundReason);

  if (!reason) {
    if (decision === 'allowed' && whitelistMatched) {
      reason = 'connector-outbound-whitelist-allowed';
    } else if (decision === 'allowed') {
      reason = 'connector-explicitly-allowed';
    } else if (decision === 'internal-only') {
      reason = 'connector-internal-only';
    } else {
      reason = 'connector-policy-unknown';
    }
  }

  if (decision === 'allowed' && modulePolicy?.sensitiveDataAllowedToLeaveLocal === false && !whitelistMatched) {
    decision = 'internal-only';
    reason = 'module-outbound-whitelist-required';
  }

  if (connectorWhitelist.outboundAllowed === false) {
    decision = 'internal-only';
    reason = 'connector-outbound-disabled';
  }

  if (connectorWhitelist.outboundAllowed === true) {
    decision = 'allowed';
    reason = whitelistMatched ? 'connector-outbound-whitelist-allowed' : 'connector-outbound-enabled';
  }

  const summaryAllowed =
    connectorWhitelist.summaryAllowed === undefined
      ? decision === 'allowed' && whitelistMatched
      : connectorWhitelist.summaryAllowed === true && decision === 'allowed';

  return {
    contractVersion: SEARCH_POLICY_CONTRACT_VERSION,
    decision,
    reason,
    whitelistMatched,
    summaryAllowed,
    moduleSensitiveDataMayLeaveLocal: Boolean(modulePolicy?.sensitiveDataAllowedToLeaveLocal),
    policySource: candidate.connectorId ? `search.connector.${candidate.connectorId}` : 'search.connector',
    connectorId: candidate.connectorId || '',
    connectorType: candidate.connectorType || '',
  };
};

export const applyEvidenceOutboundPolicies = ({
  evidenceCandidates = [],
  modulePolicy = null,
} = {}) => {
  return evidenceCandidates.map((candidate) => {
    const outboundPolicy = buildEvidenceOutboundPolicy({
      candidate,
      modulePolicy,
      defaultStatus: candidate.outboundStatus || 'internal-only',
    });

    return {
      ...candidate,
      outboundStatus: outboundPolicy.decision,
      outboundPolicy,
    };
  });
};

export const isSearchSummaryModelAllowed = ({
  modulePolicy = null,
  modelEnabled = false,
  keywordPolicy = null,
  whitelistedEvidenceCount = 0,
} = {}) => {
  if (!modelEnabled) {
    return {
      allowed: false,
      reason: 'search-summary-model-disabled',
    };
  }

  if (!modulePolicy?.apiModelAllowed) {
    return {
      allowed: false,
      reason: 'search-summary-model-policy-blocked',
    };
  }

  if (!keywordPolicy?.outboundAllowed) {
    return {
      allowed: false,
      reason: keywordPolicy?.outboundReason || 'search-summary-model-keyword-blocked',
    };
  }

  if (whitelistedEvidenceCount <= 0) {
    return {
      allowed: false,
      reason: 'search-summary-model-no-whitelisted-evidence',
    };
  }

  return {
    allowed: true,
    reason: 'search-summary-model-allowed',
  };
};

export const summarizeEvidenceOutboundPolicies = (evidenceItems = []) => {
  return evidenceItems.reduce(
    (acc, item) => {
      const decision = item?.outboundPolicy?.decision || item?.outboundStatus || 'unknown';

      if (decision === 'allowed') {
        acc.allowedCount += 1;
      } else if (decision === 'internal-only') {
        acc.internalOnlyCount += 1;
      } else {
        acc.unknownCount += 1;
      }

      if (item?.outboundPolicy?.summaryAllowed) {
        acc.summaryAllowedCount += 1;
      }

      return acc;
    },
    {
      allowedCount: 0,
      internalOnlyCount: 0,
      unknownCount: 0,
      summaryAllowedCount: 0,
    },
  );
};
