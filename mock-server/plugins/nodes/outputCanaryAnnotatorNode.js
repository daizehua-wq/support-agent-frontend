import { nowLocalIso } from '../../utils/localTime.js';
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value = '') => String(value || '').trim();

export const runOutputCanaryAnnotator = async ({
  input = {},
  nodeSpec = {},
  context = {},
} = {}) => {
  const payload = isPlainObject(input) ? { ...input } : {};
  const finalResult = isPlainObject(payload.finalResult) ? { ...payload.finalResult } : {};
  const overrides = isPlainObject(nodeSpec.inputOverrides) ? nodeSpec.inputOverrides : {};
  const rawRequestPayload = isPlainObject(context?.requestPayload) ? context.requestPayload : {};

  const failureFlagKey = normalizeString(overrides.failureFlagKey || 'forceCanaryNodeFailure');
  const shouldForceFailure =
    overrides.forceFailure === true ||
    (failureFlagKey && (payload[failureFlagKey] === true || rawRequestPayload[failureFlagKey] === true));

  if (shouldForceFailure) {
    throw new Error(
      `[custom-node] ${nodeSpec.type || 'custom-node'} forced failure for rollback verification`,
    );
  }

  const releaseTag =
    normalizeString(overrides.releaseTag) ||
    normalizeString(context?.releaseResolution?.canaryPluginId) ||
    normalizeString(context?.pluginSummary?.pluginId) ||
    'workflow-canary';

  const customNotice = normalizeString(overrides.appendNotice);
  const notice = customNotice || `[${releaseTag}] custom node annotation applied`;
  const originalText = normalizeString(finalResult.llmVersion || finalResult.formalVersion || '');

  if (notice) {
    finalResult.llmVersion = originalText ? `${originalText}\n${notice}` : notice;
  }

  const metadataKey = normalizeString(overrides.metadataKey) || 'customWorkflowNodeMeta';

  return {
    ...payload,
    finalResult,
    [metadataKey]: {
      nodeId: nodeSpec.id || '',
      nodeType: nodeSpec.type || '',
      pluginId: context?.pluginSummary?.pluginId || '',
      executionTag: context?.executionTag || 'primary',
      releaseTag,
      appliedAt: nowLocalIso(),
    },
  };
};

export default runOutputCanaryAnnotator;
