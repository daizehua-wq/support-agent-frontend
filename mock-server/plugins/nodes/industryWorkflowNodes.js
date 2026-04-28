import { nowLocalIso } from '../../utils/localTime.js';
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value = '') => String(value || '').trim();

const normalizeIndustryType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || 'other';
};

const buildComplianceNotice = ({ industryType = 'other', policyTag = '' } = {}) => {
  const normalizedIndustryType = normalizeIndustryType(industryType);
  const normalizedPolicyTag = normalizeText(policyTag) || 'industry-compliance';

  if (normalizedIndustryType === 'healthcare' || normalizedIndustryType === 'medical') {
    return `[${normalizedPolicyTag}] 医疗场景回复需避免疗效承诺，建议加入“仅供专业人员评估”的提示。`;
  }

  if (normalizedIndustryType === 'legal') {
    return `[${normalizedPolicyTag}] 法务场景回复需避免构成法律意见，建议提示“请由持证律师复核”。`;
  }

  if (normalizedIndustryType === 'manufacturing' || normalizedIndustryType === 'pcb') {
    return `[${normalizedPolicyTag}] 制造场景回复需注明参数受工艺窗口影响，建议先完成小样验证。`;
  }

  return `[${normalizedPolicyTag}] 行业插件已生效，输出需遵守合规边界与验证前置原则。`;
};

export const runAnalyzeIndustryRiskTagger = async ({
  input = {},
  nodeSpec = {},
  context = {},
} = {}) => {
  const payload = isPlainObject(input) ? { ...input } : {};
  const finalAnalyzeData = isPlainObject(payload.finalAnalyzeData)
    ? { ...payload.finalAnalyzeData }
    : {};

  const overrides = isPlainObject(nodeSpec.inputOverrides) ? nodeSpec.inputOverrides : {};
  const requestPayload = isPlainObject(context.requestPayload) ? context.requestPayload : {};
  const industryType =
    normalizeIndustryType(
      payload.industryType || requestPayload.industryType || overrides.industryType || 'other',
    ) || 'other';
  const policyTag = normalizeText(overrides.policyTag) || 'analyze-industry-risk';
  const complianceNotice = buildComplianceNotice({
    industryType,
    policyTag,
  });
  const existingRiskNotes = Array.isArray(finalAnalyzeData.riskNotes)
    ? [...finalAnalyzeData.riskNotes]
    : [];

  if (!existingRiskNotes.includes(complianceNotice)) {
    existingRiskNotes.unshift(complianceNotice);
  }

  finalAnalyzeData.riskNotes = existingRiskNotes;

  return {
    ...payload,
    finalAnalyzeData,
    industryRiskMeta: {
      nodeId: nodeSpec.id || '',
      nodeType: nodeSpec.type || '',
      industryType,
      policyTag,
      appliedAt: nowLocalIso(),
    },
  };
};

export const runSearchEvidencePrioritizer = async ({
  input = {},
  nodeSpec = {},
  context = {},
} = {}) => {
  const payload = isPlainObject(input) ? { ...input } : {};
  const evidenceItems = Array.isArray(payload.evidenceItems) ? [...payload.evidenceItems] : [];
  const overrides = isPlainObject(nodeSpec.inputOverrides) ? nodeSpec.inputOverrides : {};
  const requestPayload = isPlainObject(context.requestPayload) ? context.requestPayload : {};

  const industryType = normalizeIndustryType(
    payload.industryType || requestPayload.industryType || overrides.industryType || 'other',
  );
  const preferredDocTypes = Array.isArray(overrides.preferredDocTypes)
    ? overrides.preferredDocTypes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : [];

  const prioritizedItems = evidenceItems
    .map((item, index) => {
      const docType = normalizeText(item.docType || '').toLowerCase();
      const docTypeScore = preferredDocTypes.includes(docType) ? 100 : 0;
      const confidenceScore = Number(item.confidence || 0) * 100;
      const outboundScore = item.outboundStatus === 'allowed' ? 10 : 0;
      const score = Number((docTypeScore + confidenceScore + outboundScore).toFixed(2));

      return {
        ...item,
        priorityScore: score,
        __index: index,
      };
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.__index - right.__index;
    })
    .map(({ __index, ...rest }) => rest);

  return {
    ...payload,
    evidenceItems: prioritizedItems,
    primaryEvidenceIds: prioritizedItems.slice(0, 3).map((item) => item.evidenceId || item.id).filter(Boolean),
    industryEvidenceMeta: {
      nodeId: nodeSpec.id || '',
      nodeType: nodeSpec.type || '',
      industryType,
      preferredDocTypes,
      reorderedCount: prioritizedItems.length,
      appliedAt: nowLocalIso(),
    },
  };
};

export const runOutputComplianceShield = async ({
  input = {},
  nodeSpec = {},
  context = {},
} = {}) => {
  const payload = isPlainObject(input) ? { ...input } : {};
  const finalResult = isPlainObject(payload.finalResult) ? { ...payload.finalResult } : {};
  const overrides = isPlainObject(nodeSpec.inputOverrides) ? nodeSpec.inputOverrides : {};
  const requestPayload = isPlainObject(context.requestPayload) ? context.requestPayload : {};

  const industryType = normalizeIndustryType(
    payload.industryType || requestPayload.industryType || overrides.industryType || 'other',
  );
  const policyTag = normalizeText(overrides.policyTag) || 'output-compliance-shield';
  const complianceNotice = buildComplianceNotice({
    industryType,
    policyTag,
  });

  const baseText = normalizeText(finalResult.llmVersion || finalResult.formalVersion || '');
  finalResult.llmVersion = baseText ? `${baseText}\n${complianceNotice}` : complianceNotice;

  return {
    ...payload,
    finalResult,
    complianceMeta: {
      nodeId: nodeSpec.id || '',
      nodeType: nodeSpec.type || '',
      industryType,
      policyTag,
      appliedAt: nowLocalIso(),
    },
  };
};

export default {
  runAnalyzeIndustryRiskTagger,
  runSearchEvidencePrioritizer,
  runOutputComplianceShield,
};
