import { AxiosHeaders, type AxiosHeaderValue, type AxiosRequestConfig } from 'axios';
import { apiGetEnvelope, apiPostEnvelope } from './client';
import type { ApiEnvelope } from './helpers';
import request from './request';
import type { ExecutionContext } from './settings';
export { normalizeApiEnvelope, type ApiEnvelope, type MaybeWrappedApiEnvelope } from './helpers';

export type IndustryType = string;
export type AgentClientType = 'web' | 'lark' | (string & {});
export type AgentAdapterResponse = {
  msg_type?: string;
  card?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AgentRequestOptions = {
  clientType?: AgentClientType;
  rawResponse?: boolean;
  requestConfig?: AxiosRequestConfig;
};

type WebAgentRequestOptions = AgentRequestOptions & {
  clientType?: 'web';
  rawResponse?: false;
};

export const AGENT_CLIENT_TYPE_HEADER = 'x-client-type';

const normalizeClientType = (clientType?: AgentClientType): string => {
  return typeof clientType === 'string' ? clientType.trim().toLowerCase() : '';
};

export const buildAgentClientHeaders = (
  clientType?: AgentClientType,
): Record<string, string> => {
  const normalizedClientType = normalizeClientType(clientType);

  return normalizedClientType
    ? {
        [AGENT_CLIENT_TYPE_HEADER]: normalizedClientType,
      }
    : {};
};

const buildAgentRequestConfig = (
  options?: AgentRequestOptions,
): AxiosRequestConfig | undefined => {
  const existingConfig = options?.requestConfig;
  const normalizedClientType = normalizeClientType(options?.clientType);

  if (!existingConfig && !normalizedClientType) {
    return undefined;
  }

  const headers = new AxiosHeaders();

  if (existingConfig?.headers instanceof AxiosHeaders) {
    for (const [key, value] of Object.entries(existingConfig.headers.toJSON())) {
      if (value !== undefined) {
        headers.set(key, value as AxiosHeaderValue);
      }
    }
  } else if (existingConfig?.headers && typeof existingConfig.headers === 'object') {
    for (const [key, value] of Object.entries(existingConfig.headers)) {
      if (value !== undefined) {
        headers.set(key, value as AxiosHeaderValue);
      }
    }
  }

  if (normalizedClientType) {
    headers.set(AGENT_CLIENT_TYPE_HEADER, normalizedClientType);
  }

  return {
    ...(existingConfig || {}),
    headers,
  };
};

const shouldUseRawAgentResponse = (options?: AgentRequestOptions): boolean => {
  if (options?.rawResponse) {
    return true;
  }

  const normalizedClientType = normalizeClientType(options?.clientType);
  return Boolean(normalizedClientType) && normalizedClientType !== 'web';
};

const isApiEnvelopeResponse = <TData, TMeta>(
  value: unknown,
): value is ApiEnvelope<TData, TMeta> => {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    typeof value.message === 'string'
  );
};

const postAgentResponse = async <TData, TMeta = undefined>(
  path: string,
  payload: unknown,
  fallbackMessage: string,
  options?: AgentRequestOptions,
): Promise<ApiEnvelope<TData, TMeta> | AgentAdapterResponse> => {
  const config = buildAgentRequestConfig(options);

  if (shouldUseRawAgentResponse(options)) {
    return (await request.post(path, payload, config)) as AgentAdapterResponse;
  }

  return apiPostEnvelope<TData, TMeta>(path, payload, fallbackMessage, config);
};

export type TaskPhase =
  | 'initial_contact'
  | 'requirement_discussion'
  | 'sample_followup'
  | 'quotation'
  | 'other';

export type SalesStage = TaskPhase;

export type AgentResponseContext = {
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  executionContext?: ExecutionContext;
  sessionId?: string;
  latestStep?: string;
  referenceSummary?: string;
  referencePackId?: string;
  referencePack?: ReferencePack | null;
  facts?: ReferencePackEntry[];
  background?: ReferencePackEntry[];
  riskNotes?: ReferencePackEntry[];
  conflicts?: ReferencePackEntry[];
  doNotUse?: ReferencePackEntry[];
  sourceDocName?: string;
};

export type AssistantExecutionContextSummary = {
  assistantId?: string;
  assistantVersion?: string;
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  strategy?: string;
  source?: string;
  fallbackReason?: string;
  rulesScope?: Array<Record<string, unknown> | string | number | boolean | null>;
  productScope?: Array<Record<string, unknown> | string | number | boolean | null>;
  docScope?: Array<Record<string, unknown> | string | number | boolean | null>;
  analyzeStrategy?: string;
  searchStrategy?: string;
  scriptStrategy?: string;
};

export type DatabaseRelationSummary = {
  databaseId?: string;
  databaseName?: string;
  relationType?: string;
  bindingSource?: string;
};

export type RuntimeContinuePayload = {
  sessionId?: string;
  stepId?: string;
  evidenceId?: string;
  fromModule?: string;
  assistantId?: string;
  executionContext?: ExecutionContext | Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
};

export type RuntimeSnapshot = {
  sessionId?: string;
  stepId?: string;
  evidenceId?: string;
  assistantId?: string;
  executionContext?: ExecutionContext | Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
  governanceSummary?: Record<string, unknown> | null;
  modelRuntimeSummary?: Record<string, unknown> | null;
  databaseRelationSummary?: unknown;
  continuePayload?: RuntimeContinuePayload | null;
};

export type RuntimeResponseMeta = {
  sessionId?: string;
  stepId?: string;
  assistantId?: string;
  executionContext?: ExecutionContext | Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
  governanceSummary?: Record<string, unknown> | null;
  modelRuntimeSummary?: Record<string, unknown> | null;
  databaseRelationSummary?: unknown;
  continuePayload?: RuntimeContinuePayload | null;
  responseContract?: Record<string, unknown> | null;
  deprecatedFields?: Record<string, unknown> | null;
  platformContract?: Record<string, unknown> | null;
  pluginRuntimeSummary?: Record<string, unknown> | null;
  pluginTrace?: Record<string, unknown> | null;
  pluginRegistrySummary?: Record<string, unknown> | null;
  modelRuntime?: Record<string, unknown> | null;
  resolvedModel?: Record<string, unknown> | null;
  resolvedAssistant?: Record<string, unknown> | null;
  resolvedPrompt?: Record<string, unknown> | null;
};

type RuntimeModuleName = 'analyze' | 'search' | 'script' | 'workbench';

type RuntimeEnvelope<TData, TMeta = RuntimeResponseMeta> = ApiEnvelope<TData, TMeta> & {
  runtime?: RuntimeSnapshot | null;
};

type AgentApiResponse<TData, TMeta = undefined> = ApiEnvelope<TData, TMeta>;
type AgentRuntimeResponse<TData, TMeta = RuntimeResponseMeta> = RuntimeEnvelope<TData, TMeta>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const readRuntimeString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const hasMeaningfulRuntimeValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return value !== undefined && value !== null;
};

const readRuntimeRecord = (value: unknown): Record<string, unknown> | null => {
  return isRecord(value) ? value : null;
};

const buildRuntimeContinuePayload = ({
  candidate,
  moduleName,
  fallback,
}: {
  candidate?: unknown;
  moduleName: RuntimeModuleName;
  fallback?: Partial<RuntimeContinuePayload>;
}): RuntimeContinuePayload | null => {
  const record = readRuntimeRecord(candidate);
  const fallbackExecutionContext = readRuntimeRecord(fallback?.executionContext);
  const executionContext =
    readRuntimeRecord(record?.executionContext) || fallbackExecutionContext || null;
  const executionContextSummary =
    readRuntimeRecord(record?.executionContextSummary) ||
    readRuntimeRecord(executionContext?.summary) ||
    readRuntimeRecord(fallback?.executionContextSummary) ||
    readRuntimeRecord(fallbackExecutionContext?.summary) ||
    null;

  const normalized: RuntimeContinuePayload = {
    sessionId: readRuntimeString(record?.sessionId) || readRuntimeString(fallback?.sessionId),
    stepId: readRuntimeString(record?.stepId) || readRuntimeString(fallback?.stepId),
    evidenceId: readRuntimeString(record?.evidenceId) || readRuntimeString(fallback?.evidenceId),
    fromModule:
      readRuntimeString(record?.fromModule) ||
      readRuntimeString(fallback?.fromModule) ||
      moduleName,
    assistantId:
      readRuntimeString(record?.assistantId) ||
      readRuntimeString(executionContext?.assistantId) ||
      readRuntimeString(executionContextSummary?.assistantId) ||
      readRuntimeString(fallback?.assistantId),
    executionContext,
    executionContextSummary,
  };

  return Object.values(normalized).some((item) => hasMeaningfulRuntimeValue(item))
    ? normalized
    : null;
};

const buildRuntimeSnapshot = ({
  data,
  meta,
  moduleName,
}: {
  data?: unknown;
  meta?: unknown;
  moduleName: RuntimeModuleName;
}): RuntimeSnapshot | null => {
  const dataRecord = readRuntimeRecord(data);
  const metaRecord = readRuntimeRecord(meta);
  const executionContext =
    readRuntimeRecord(dataRecord?.executionContext) ||
    readRuntimeRecord(metaRecord?.executionContext) ||
    null;
  const executionContextSummary =
    readRuntimeRecord(dataRecord?.executionContextSummary) ||
    readRuntimeRecord(metaRecord?.executionContextSummary) ||
    readRuntimeRecord(executionContext?.summary) ||
    null;
  const governanceSummary =
    readRuntimeRecord(dataRecord?.governanceSummary) ||
    readRuntimeRecord(metaRecord?.governanceSummary) ||
    null;
  const continuePayload = buildRuntimeContinuePayload({
    candidate: dataRecord?.continuePayload || metaRecord?.continuePayload,
    moduleName,
    fallback: {
      sessionId: readRuntimeString(dataRecord?.sessionId) || readRuntimeString(metaRecord?.sessionId),
      stepId: readRuntimeString(dataRecord?.stepId) || readRuntimeString(metaRecord?.stepId),
      evidenceId: readRuntimeString(dataRecord?.evidenceId) || readRuntimeString(metaRecord?.evidenceId),
      assistantId:
        readRuntimeString(dataRecord?.assistantId) ||
        readRuntimeString(metaRecord?.assistantId) ||
        readRuntimeString(executionContext?.assistantId) ||
        readRuntimeString(executionContextSummary?.assistantId) ||
        readRuntimeString(governanceSummary?.assistantId),
      executionContext,
      executionContextSummary,
    },
  });

  const snapshot: RuntimeSnapshot = {
    sessionId:
      continuePayload?.sessionId ||
      readRuntimeString(dataRecord?.sessionId) ||
      readRuntimeString(metaRecord?.sessionId),
    stepId:
      continuePayload?.stepId ||
      readRuntimeString(dataRecord?.stepId) ||
      readRuntimeString(metaRecord?.stepId),
    evidenceId:
      continuePayload?.evidenceId ||
      readRuntimeString(dataRecord?.evidenceId) ||
      readRuntimeString(metaRecord?.evidenceId),
    assistantId:
      continuePayload?.assistantId ||
      readRuntimeString(dataRecord?.assistantId) ||
      readRuntimeString(metaRecord?.assistantId) ||
      readRuntimeString(executionContext?.assistantId) ||
      readRuntimeString(executionContextSummary?.assistantId) ||
      readRuntimeString(governanceSummary?.assistantId),
    executionContext,
    executionContextSummary,
    governanceSummary,
    modelRuntimeSummary:
      readRuntimeRecord(dataRecord?.modelRuntimeSummary) ||
      readRuntimeRecord(metaRecord?.modelRuntimeSummary) ||
      null,
    databaseRelationSummary:
      dataRecord?.databaseRelationSummary ||
      metaRecord?.databaseRelationSummary ||
      executionContextSummary?.databaseRelationSummary ||
      governanceSummary?.databaseRelationSummary ||
      null,
    continuePayload,
  };

  return Object.values(snapshot).some((item) => hasMeaningfulRuntimeValue(item)) ? snapshot : null;
};

const withRuntimeSnapshot = <TData, TMeta>(
  response: ApiEnvelope<TData, TMeta>,
  moduleName: RuntimeModuleName,
): RuntimeEnvelope<TData, TMeta> => {
  return {
    ...response,
    runtime: buildRuntimeSnapshot({
      data: response.data,
      meta: response.meta,
      moduleName,
    }),
  };
};

export type AssistantCenterPublishRecord = {
  publishSource?: string;
  publishStatus?: string;
  recordType?: string;
  sourceVersion?: string | null;
  sourceUpdatedAt?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  note?: string;
  isConfigDerived?: boolean;
};

export type AssistantCenterModuleBindingItem = {
  moduleName?: string;
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
  strategyId?: string;
  strategyName?: string;
  strategyDefinitionSource?: string;
  strategyDefinitionStatus?: string;
  bindingStatus?: string;
  definitionSource?: string;
  strategySource?: string;
  isConfigDerived?: boolean;
};

export type AssistantCenterGovernanceDefinitionSummary = {
  assistantId?: string;
  assistantVersion?: string;
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  strategyName?: string;
  definitionSource?: string;
  definitionStatus?: string;
  analyzeStrategy?: string;
  searchStrategy?: string;
  scriptStrategy?: string;
};

export type AssistantCenterCurrentPublishedData = {
  currentPublishedAssistant?: {
    assistantId?: string;
    assistantName?: string;
    assistantVersion?: string | null;
    definitionSource?: string;
    definitionStatus?: string;
  };
  currentPublishedPrompt?: {
    promptId?: string;
    promptName?: string;
    definitionSource?: string;
    definitionStatus?: string;
  };
  currentPublishedPromptVersion?: {
    promptVersion?: string | null;
    versionLabel?: string | null;
    isLatest?: boolean | null;
    sourceVersion?: string | null;
    sourceUpdatedAt?: string | null;
  };
  currentPublishedStrategy?: {
    strategyId?: string;
    strategyName?: string;
    strategyCategory?: string;
    strategyStatus?: string;
    definitionSource?: string;
    definitionStatus?: string;
  };
  publishRecord?: AssistantCenterPublishRecord;
};

export type AssistantCenterModuleBindingsData = {
  currentModuleBindings?: {
    analyze?: AssistantCenterModuleBindingItem;
    search?: AssistantCenterModuleBindingItem;
    script?: AssistantCenterModuleBindingItem;
  };
  bindingSource?: string;
  bindingStatus?: string;
  bindingRecord?: Record<string, unknown>;
};

export type AssistantCenterGovernanceDefinitionData = {
  assistantDefinition?: Record<string, unknown>;
  promptDefinition?: Record<string, unknown>;
  strategyDefinition?: Record<string, unknown>;
  moduleBindingDefinition?: Record<string, unknown>;
  definitionSource?: string;
  definitionStatus?: string;
  governanceRecord?: Record<string, unknown>;
};

export type AssistantVersionTimelineItem = {
  version: string;
  publishedAt?: string;
  versionNote?: string;
  isCurrent?: boolean;
};

export type AssistantCenterListItem = {
  assistantName?: string;
  assistantId?: string;
  status?: string;
  promptVersion?: string;
  updatedAt?: string;
  updatedBy?: string;
  tags?: string[];
  scenes?: string[];
  currentVersion?: string;
  description?: string;
};

export type AssistantCenterDetailData = {
  assistantName?: string;
  assistantId?: string;
  status?: string;
  promptVersion?: string;
  updatedAt?: string;
  updatedBy?: string;
  tags?: string[];
  scenes?: string[];
  currentVersion?: string;
  description?: string;
  promptId?: string;
  strategyId?: string;
  strategy?: { label?: string } | string;
  source?: string;
  isDefaultMounted?: boolean;
  isExplicitBinding?: boolean;
  executionContextSummary?: AssistantExecutionContextSummary;
  trace?: Record<string, unknown>;
  versionTimeline?: AssistantVersionTimelineItem[];
};

export type SearchEvidenceLevel = 'core' | 'support';

export type SearchEvidenceSourceType =
  | 'local-document'
  | 'local-file'
  | 'enterprise-database'
  | 'external-document'
  | 'external-search'
  | 'internal_data'
  | 'paid_api'
  | 'web_search';

export type SearchEvidenceOutboundStatus = 'allowed' | 'internal-only' | 'unknown';

export type SearchEvidenceOutboundPolicy = {
  contractVersion?: string;
  decision: SearchEvidenceOutboundStatus;
  reason?: string;
  whitelistMatched?: boolean;
  summaryAllowed?: boolean;
  moduleSensitiveDataMayLeaveLocal?: boolean;
  policySource?: string;
  connectorId?: string;
  connectorType?: string;
};

export type SearchEvidenceItem = {
  evidenceId: string;
  level: SearchEvidenceLevel;
  sourceType: SearchEvidenceSourceType;
  sourceRef: string;
  title: string;
  docType: string;
  summary: string;
  applicableScene: string;
  outboundStatus: SearchEvidenceOutboundStatus;
  outboundPolicy: SearchEvidenceOutboundPolicy;
  confidence: number;
  relatedAssistantId: string;
  relatedSessionId: string;
  productId?: string;
  productName?: string;
  connectorId?: string;
  connectorType?: string;
  sourceName?: string;
  provider?: string;
  category?: string;
  trustLevel?: 'high' | 'medium' | 'low' | string;
  priority?: string;
  relevanceScore?: number;
  freshnessScore?: number;
  finalScore?: number;
  retrievedAt?: string;
  updatedAt?: string | null;
  publishedAt?: string | null;
  isDuplicate?: boolean;
  duplicateOf?: string | null;
  canUseAsFact?: boolean;
  canUseAsBackground?: boolean;
  canUseInExternalOutput?: boolean;
  useType?: 'fact' | 'background' | 'riskNote' | 'conflict' | 'doNotUse' | string;
  useReason?: string;
};

export type SearchDocumentsData = {
  evidenceItems?: SearchEvidenceItem[];
  referencePackId?: string;
  referencePack?: ReferencePack;
  governedEvidenceItems?: SearchEvidenceItem[];
  referencePackLibrary?: Record<string, unknown> | null;
  referencePackCacheCleanup?: Record<string, unknown> | null;
  referencePackError?: Record<string, unknown> | null;
  externalProviderStates?: ExternalProviderState[];
  databaseRelationSummary?: DatabaseRelationSummary;
  taskModel?: TaskModelSummary;
  continuePayload?: RuntimeContinuePayload | null;
};

export type ReferencePackEntry = {
  evidenceId?: string;
  conflictId?: string;
  content?: string;
  description?: string;
  source?: string;
  sourceType?: string;
  category?: string;
  trustLevel?: string;
  priority?: string;
  finalScore?: number;
  retrievedAt?: string;
  reason?: string;
  suggestedResolution?: string;
  needHumanConfirmation?: boolean;
};

export type ReferencePack = {
  referencePackId: string;
  title?: string;
  query?: string;
  sessionId?: string;
  appId?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  emptyReason?: string;
  validUntil?: string;
  summary?: string;
  facts?: ReferencePackEntry[];
  background?: ReferencePackEntry[];
  riskNotes?: ReferencePackEntry[];
  conflicts?: ReferencePackEntry[];
  doNotUse?: ReferencePackEntry[];
  evidenceIds?: string[];
  sourceCount?: number;
  highTrustCount?: number;
  riskCount?: number;
  reuseCount?: number;
};

export type ExternalProviderState = {
  provider?: string;
  sourceType?: string;
  status?: string;
  reason?: string;
  resultCount?: number;
};

export type SearchExternalResultItem = {
  title: string;
  summary: string;
  source?: string;
  url?: string;
};

export type SearchResponseMeta = RuntimeResponseMeta & {
  stepId?: string;
  searchStrategy?: string;
  searchExecutionStrategy?: string;
  enableExternalSupplement?: boolean;
  externalSearchAllowed?: boolean;
  externalProviderConfigured?: boolean;
  externalProvider?: string;
  searchRoute?: string;
  searchReason?: string;
  searchSummary?: string;
  searchModelConfig?: Record<string, unknown> | null;
  externalResults?: SearchExternalResultItem[];
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  executionContext?: ExecutionContext;
  sessionId?: string;
  latestStep?: string;
  referenceSummary?: string;
  sourceDocName?: string;
  primaryEvidenceIds?: string[];
  sourceSummary?: {
    knowledgeCount?: number;
    fileSystemCount?: number;
    enterpriseDatabaseCount?: number;
  };
  sourceScopeSelection?: Record<string, unknown> | null;
  referencePackId?: string;
  referencePack?: ReferencePack | null;
  governedEvidenceItems?: SearchEvidenceItem[];
  referencePackLibrary?: Record<string, unknown> | null;
  referencePackCacheCleanup?: Record<string, unknown> | null;
  referencePackError?: Record<string, unknown> | null;
  externalProviderStates?: ExternalProviderState[];
  sanitizedKeyword?: string;
  searchOutboundAllowed?: boolean;
  searchOutboundReason?: string;
  searchTraceSummary?: Record<string, unknown> | null;
  summaryWhitelistCount?: number;
  platformContract?: Record<string, unknown> | null;
  pluginRuntimeSummary?: Record<string, unknown> | null;
  pluginTrace?: Record<string, unknown> | null;
  pluginRegistrySummary?: Record<string, unknown> | null;
  taskModel?: TaskModelSummary;
};

export type TaskModelVariables = Record<string, unknown>;

export type TaskAttachment = {
  id?: string;
  name?: string;
  type?: string;
  value?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type TaskModelSummary = {
  taskInput: string;
  context?: string;
  goal?: string;
  deliverable?: string;
  variables?: TaskModelVariables;
  attachments?: TaskAttachment[];
};

export type GenericTaskRequest = {
  sessionId?: string;
  fromModule?: string;
  pluginId?: string;
  assistantId?: string;
  executionContext?: ExecutionContext;
  taskInput: string;
  context?: string;
  goal?: string;
  goalScene?: string;
  deliverable?: string;
  taskObject?: string;
  audience?: string;
  taskPhase?: TaskPhase;
  taskSubject?: string;
  focusPoints?: string;
  referenceSummary?: string;
  toneStyle?: 'formal' | 'concise' | 'spoken';
  variables?: TaskModelVariables;
  attachments?: TaskAttachment[];
};

export type AnalyzeResponseData = {
  stepId?: string;
  summary: string;
  sceneJudgement: string;
  recommendedProducts: string[];
  followupQuestions: string[];
  riskNotes: string[];
  nextActions: string[];
  analysisRoute?: string;
  analyzeStrategy?: string;
  analyzeExecutionStrategy?: string;
  outboundAllowed?: boolean;
  outboundReason?: string;
  sanitizedAnalyzeText?: string;
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  executionContext?: ExecutionContext;
  sessionId?: string;
  latestStep?: string;
  referenceSummary?: string;
  sourceDocName?: string;
  taskModel?: TaskModelSummary;
  governanceSummary?: Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
  modelRuntimeSummary?: Record<string, unknown> | null;
  databaseRelationSummary?: DatabaseRelationSummary | Record<string, unknown> | null;
  continuePayload?: RuntimeContinuePayload | null;
};

export type ScriptResponseData = {
  stepId?: string;
  formalVersion: string;
  conciseVersion: string;
  spokenVersion: string;
  cautionNotes: string[];
  llmVersion?: string;
  llmRoute?: string;
  scriptStrategy?: string;
  scriptExecutionStrategy?: string;
  outboundAllowed?: boolean;
  outboundReason?: string;
  sanitizedTaskInput?: string;
  sanitizedCustomerText?: string;
  sanitizedReferenceSummary?: string;
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  executionContext?: ExecutionContext;
  sessionId?: string;
  latestStep?: string;
  referenceSummary?: string;
  referencePackId?: string;
  referencePack?: ReferencePack | null;
  facts?: ReferencePackEntry[];
  background?: ReferencePackEntry[];
  riskNotes?: ReferencePackEntry[];
  conflicts?: ReferencePackEntry[];
  doNotUse?: ReferencePackEntry[];
  sourceDocName?: string;
  evidenceId?: string;
  sourceDocId?: string;
  sourceDocType?: string;
  sourceApplicableScene?: string;
  sourceExternalAvailable?: boolean;
  resolvedEvidence?: Record<string, unknown> | null;
  taskModel?: TaskModelSummary;
  governanceSummary?: Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
  modelRuntimeSummary?: Record<string, unknown> | null;
  databaseRelationSummary?: DatabaseRelationSummary | Record<string, unknown> | null;
  continuePayload?: RuntimeContinuePayload | null;
};

export type JudgeTaskRequest = GenericTaskRequest & {
  taskObject?: string;
  audience?: string;
  industryType?: IndustryType;
  taskPhase?: TaskPhase;
  taskSubject?: string;
};

export type AnalyzeCustomerResponse = AgentRuntimeResponse<
  AnalyzeResponseData,
  RuntimeResponseMeta
>;

export const mockAnalyzeCustomerResponse: AnalyzeCustomerResponse = {
  success: true,
  message: '分析成功',
  data: {
    summary:
      '客户当前在评估双氧水体系蚀刻液，核心关注点是稳定性、线宽均匀性和整体成本控制。',
    sceneJudgement:
      '该需求可初步判断为 PCB 蚀刻相关场景，当前处于需求沟通阶段。',
    recommendedProducts: ['双氧水体系蚀刻液', '稳定性优化方案资料'],
    followupQuestions: [
      '当前使用的蚀刻体系是什么？',
      '客户更关注成本、稳定性还是线宽控制？',
      '是否有明确的样品测试计划？',
    ],
    riskNotes: ['目前信息仍偏初步，暂不适合承诺具体性能改善结果。'],
    nextActions: ['先发送基础资料', '确认测试需求', '判断是否进入样品沟通'],
    analysisRoute: 'rules-fallback',
    analyzeStrategy: 'rules-only',
    analyzeExecutionStrategy: 'local-only',
    outboundAllowed: false,
    outboundReason: 'raw-local',
    sanitizedAnalyzeText: '',
    taskModel: {
      taskInput: '我们在评估双氧水体系蚀刻液，重点关注稳定性、线宽均匀性和整体成本控制。',
      context: '客户倾向先了解资料，再决定是否安排样品测试。',
      goal: '完成任务判断并给出建议',
      deliverable: '判断摘要、风险提示与下一步建议',
      variables: {
        industryType: 'pcb',
        stage: 'requirement_discussion',
        subject: '双氧水体系蚀刻液',
      },
      attachments: [],
    },
  },
};

export type JudgeTaskResponse = AnalyzeCustomerResponse;

export function judgeTask(data: JudgeTaskRequest): Promise<JudgeTaskResponse>;
export function judgeTask(
  data: JudgeTaskRequest,
  options: WebAgentRequestOptions,
): Promise<JudgeTaskResponse>;
export function judgeTask(
  data: JudgeTaskRequest,
  options?: AgentRequestOptions,
): Promise<JudgeTaskResponse | AgentAdapterResponse>;
export async function judgeTask(
  data: JudgeTaskRequest,
  options?: AgentRequestOptions,
): Promise<JudgeTaskResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<AnalyzeResponseData, RuntimeResponseMeta>(
    '/api/agent/judge-task',
    data,
    '判断成功',
    options,
  );

  if (!isApiEnvelopeResponse<AnalyzeResponseData, RuntimeResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'analyze') as JudgeTaskResponse;
}

export function analyzeContext(data: JudgeTaskRequest): Promise<JudgeTaskResponse>;
export function analyzeContext(
  data: JudgeTaskRequest,
  options: WebAgentRequestOptions,
): Promise<JudgeTaskResponse>;
export function analyzeContext(
  data: JudgeTaskRequest,
  options?: AgentRequestOptions,
): Promise<JudgeTaskResponse | AgentAdapterResponse>;
export async function analyzeContext(
  data: JudgeTaskRequest,
  options?: AgentRequestOptions,
): Promise<JudgeTaskResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<AnalyzeResponseData, RuntimeResponseMeta>(
    '/api/agent/analyze-context',
    data,
    '判断成功',
    options,
  );

  if (!isApiEnvelopeResponse<AnalyzeResponseData, RuntimeResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'analyze') as JudgeTaskResponse;
}

export type AnalyzeCustomerRequest = JudgeTaskRequest;

export function analyzeCustomer(data: AnalyzeCustomerRequest): Promise<AnalyzeCustomerResponse>;
export function analyzeCustomer(
  data: AnalyzeCustomerRequest,
  options: WebAgentRequestOptions,
): Promise<AnalyzeCustomerResponse>;
export function analyzeCustomer(
  data: AnalyzeCustomerRequest,
  options?: AgentRequestOptions,
): Promise<AnalyzeCustomerResponse | AgentAdapterResponse>;
export function analyzeCustomer(
  data: AnalyzeCustomerRequest,
  options?: AgentRequestOptions,
): Promise<AnalyzeCustomerResponse | AgentAdapterResponse> {
  return judgeTask(data, options);
}

export type SearchDocumentsRequest = GenericTaskRequest & {
  keyword?: string;
  docType?: string;
  industryType?: IndustryType;
  onlyExternalAvailable?: boolean;
  enableExternalSupplement?: boolean;
  sourceScopes?: string[];
  includePaidApiSources?: boolean;
  includeWebSources?: boolean;
  retainRaw?: boolean;
};

export type SearchDocumentsResponse = AgentRuntimeResponse<
  SearchDocumentsData,
  SearchResponseMeta
>;

export const mockSearchDocumentsResponse: SearchDocumentsResponse = {
  success: true,
  message: '检索成功',
  data: {
    evidenceItems: [
      {
        evidenceId: 'evidence-doc-1',
        level: 'core',
        sourceType: 'local-document',
        sourceRef: 'doc-1',
        title: '双氧水体系蚀刻液规格书',
        docType: '规格书',
        summary: '包含产品基础参数、适用场景和使用注意事项。',
        applicableScene: 'PCB 蚀刻场景',
        outboundStatus: 'allowed',
        outboundPolicy: {
          decision: 'allowed',
          reason: 'knowledge-doc-external-available',
          whitelistMatched: true,
          summaryAllowed: true,
        },
        confidence: 0.94,
        relatedAssistantId: 'pcb-sales-support',
        relatedSessionId: 'search-session-demo',
      },
      {
        evidenceId: 'evidence-doc-2',
        level: 'support',
        sourceType: 'local-document',
        sourceRef: 'doc-2',
        title: '稳定性优化方案 FAQ',
        docType: 'FAQ',
        summary: '汇总客户常见问题及标准答复口径。',
        applicableScene: '客户前期沟通阶段',
        outboundStatus: 'internal-only',
        outboundPolicy: {
          decision: 'internal-only',
          reason: 'knowledge-doc-internal-only',
          whitelistMatched: false,
          summaryAllowed: false,
        },
        confidence: 0.8,
        relatedAssistantId: 'pcb-sales-support',
        relatedSessionId: 'search-session-demo',
      },
    ],
  },
  meta: {
    searchStrategy: 'local-only',
    searchExecutionStrategy: 'local-only',
    enableExternalSupplement: false,
    externalSearchAllowed: false,
    externalProviderConfigured: false,
    externalProvider: '',
    searchRoute: 'local-documents-only',
    searchReason: 'default-local-search',
    searchSummary: '已完成本地资料检索，当前未开启公开资料补充。',
    searchModelConfig: null,
    externalResults: [],
    primaryEvidenceIds: ['evidence-doc-1'],
    taskModel: {
      taskInput: '双氧水体系蚀刻液',
      context: '需要筛选出可外发资料和内部参考资料',
      goal: '整理相关资料并返回可复用依据',
      deliverable: '资料清单、证据摘要与检索结论',
      variables: {
        industryType: 'pcb',
        docType: 'spec',
      },
      attachments: [],
    },
  },
};

export type RetrieveMaterialsRequest = SearchDocumentsRequest;

export type RetrieveMaterialsResponse = SearchDocumentsResponse;

export type RetrieveMaterialCategoryOption = {
  label: string;
  value: string;
  count?: number;
  sourceValues?: string[];
};

export type RetrieveMaterialCategoriesData = {
  categories: RetrieveMaterialCategoryOption[];
  source?: string;
  appId?: string;
};

export async function listRetrieveMaterialCategories(): Promise<RetrieveMaterialCategoryOption[]> {
  const response = await apiGetEnvelope<RetrieveMaterialCategoriesData>(
    '/api/agent/retrieve-materials/categories',
    '资料分类加载成功',
  );

  return Array.isArray(response.data?.categories) ? response.data.categories : [];
}

export function retrieveMaterials(
  data: RetrieveMaterialsRequest,
): Promise<RetrieveMaterialsResponse>;
export function retrieveMaterials(
  data: RetrieveMaterialsRequest,
  options: WebAgentRequestOptions,
): Promise<RetrieveMaterialsResponse>;
export function retrieveMaterials(
  data: RetrieveMaterialsRequest,
  options?: AgentRequestOptions,
): Promise<RetrieveMaterialsResponse | AgentAdapterResponse>;
export async function retrieveMaterials(
  data: RetrieveMaterialsRequest,
  options?: AgentRequestOptions,
): Promise<RetrieveMaterialsResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<SearchDocumentsData, SearchResponseMeta>(
    '/api/agent/retrieve-materials',
    data,
    '检索成功',
    options,
  );

  if (!isApiEnvelopeResponse<SearchDocumentsData, SearchResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'search') as RetrieveMaterialsResponse;
}

export function searchReferences(
  data: SearchDocumentsRequest,
): Promise<SearchDocumentsResponse>;
export function searchReferences(
  data: SearchDocumentsRequest,
  options: WebAgentRequestOptions,
): Promise<SearchDocumentsResponse>;
export function searchReferences(
  data: SearchDocumentsRequest,
  options?: AgentRequestOptions,
): Promise<SearchDocumentsResponse | AgentAdapterResponse>;
export async function searchReferences(
  data: SearchDocumentsRequest,
  options?: AgentRequestOptions,
): Promise<SearchDocumentsResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<SearchDocumentsData, SearchResponseMeta>(
    '/api/agent/search-references',
    data,
    '检索成功',
    options,
  );

  if (!isApiEnvelopeResponse<SearchDocumentsData, SearchResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'search') as SearchDocumentsResponse;
}

export function searchDocuments(
  data: SearchDocumentsRequest,
): Promise<SearchDocumentsResponse>;
export function searchDocuments(
  data: SearchDocumentsRequest,
  options: WebAgentRequestOptions,
): Promise<SearchDocumentsResponse>;
export function searchDocuments(
  data: SearchDocumentsRequest,
  options?: AgentRequestOptions,
): Promise<SearchDocumentsResponse | AgentAdapterResponse>;
export function searchDocuments(
  data: SearchDocumentsRequest,
  options?: AgentRequestOptions,
): Promise<SearchDocumentsResponse | AgentAdapterResponse> {
  return searchReferences(data, options);
}

export type ComposeDocumentRequest = GenericTaskRequest & {
  evidenceId?: string;
  industryType?: string;
  audience?: string;
  taskPhase?: TaskPhase;
  taskSubject?: string;
  focusPoints?: string;
  referenceSummary?: string;
  toneStyle?: 'formal' | 'concise' | 'spoken';
  sourceDocId?: string;
  sourceDocName?: string;
  sourceDocType?: string;
  sourceApplicableScene?: string;
  sourceExternalAvailable?: boolean;
  referencePackId?: string;
};

export type GenerateScriptRequest = ComposeDocumentRequest;

export type GenerateScriptResponse = AgentRuntimeResponse<
  ScriptResponseData,
  RuntimeResponseMeta
>;

export const mockGenerateScriptResponse: GenerateScriptResponse = {
  success: true,
  message: '生成成功',
  data: {
    formalVersion:
      '您好，关于您关注的双氧水体系蚀刻液稳定性和整体使用成本问题，我们这边可以先提供一版基础资料供您评估，内容会包含产品适用场景、关键参数及使用注意事项。如您方便，也欢迎您进一步说明当前工艺条件，我们可以更有针对性地协助判断。',
    conciseVersion:
      '您好，您关注的稳定性和成本问题，我们可以先发一版基础资料给您参考。若您方便，也可以补充一下当前工艺条件，我们再进一步判断。',
    spokenVersion:
      '您好，这块我们可以先把基础资料发您看一下，里面会有产品参数和适用场景。您要是方便，也可以跟我说下现在的工艺情况，我们再一起细看。',
    cautionNotes: [
      '当前阶段不建议直接承诺具体性能提升结果。',
      '涉及成本改善时，建议结合客户实际工艺再进一步确认。',
    ],
    llmVersion: '',
    llmRoute: 'template-fallback',
    scriptStrategy: 'local-model',
    scriptExecutionStrategy: 'local-only',
    outboundAllowed: false,
    outboundReason: 'raw-local',
    sanitizedTaskInput: '',
    sanitizedCustomerText: '',
    sanitizedReferenceSummary: '',
    taskModel: {
      taskInput: '我们比较关注稳定性和整体使用成本，能不能先看一下资料？',
      context: '规格书中包含基础参数、适用场景和注意事项。',
      goal: '生成可直接参考的文稿草案',
      deliverable: '参考邮件、说明文稿或沟通草稿',
      variables: {
        audience: 'PCB客户',
        taskPhase: 'requirement_discussion',
        taskSubject: '双氧水体系蚀刻液',
        toneStyle: 'formal',
      },
      attachments: [],
    },
  },
};

export type ComposeDocumentResponse = GenerateScriptResponse;

export function composeDocument(
  data: ComposeDocumentRequest,
): Promise<ComposeDocumentResponse>;
export function composeDocument(
  data: ComposeDocumentRequest,
  options: WebAgentRequestOptions,
): Promise<ComposeDocumentResponse>;
export function composeDocument(
  data: ComposeDocumentRequest,
  options?: AgentRequestOptions,
): Promise<ComposeDocumentResponse | AgentAdapterResponse>;
export async function composeDocument(
  data: ComposeDocumentRequest,
  options?: AgentRequestOptions,
): Promise<ComposeDocumentResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<ScriptResponseData, RuntimeResponseMeta>(
    '/api/agent/compose-document',
    data,
    '生成成功',
    options,
  );

  if (!isApiEnvelopeResponse<ScriptResponseData, RuntimeResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'script') as ComposeDocumentResponse;
}

export function generateScript(
  data: GenerateScriptRequest,
): Promise<GenerateScriptResponse>;
export function generateScript(
  data: GenerateScriptRequest,
  options: WebAgentRequestOptions,
): Promise<GenerateScriptResponse>;
export function generateScript(
  data: GenerateScriptRequest,
  options?: AgentRequestOptions,
): Promise<GenerateScriptResponse | AgentAdapterResponse>;
export function generateScript(
  data: GenerateScriptRequest,
  options?: AgentRequestOptions,
): Promise<GenerateScriptResponse | AgentAdapterResponse> {
  return composeDocument(data, options);
}

export type TaskWorkbenchIntent =
  | 'decision_support'
  | 'material_preparation'
  | 'reference_document'
  | 'general_assistant';

export type TaskWorkbenchOutcome = 'auto' | 'decision_support' | 'material_preparation' | 'reference_document';

export type TaskWorkbenchRequest = {
  assistantId?: string;
  expectedOutcome?: TaskWorkbenchOutcome;
  taskInput: string;
  contextNote?: string;
  expectedDeliverable?: string;
};

export type TaskWorkbenchRoleHint = {
  key: string;
  label: string;
};

export type TaskWorkbenchRecognizedTask = {
  intent: TaskWorkbenchIntent;
  intentLabel: string;
  confidence: number;
  reason: string;
  roleHints: TaskWorkbenchRoleHint[];
  suggestedModule: 'analyze' | 'search' | 'script';
  suggestedModuleLabel: string;
  expectedOutcome?: string;
  expectedDeliverable?: string;
  keyFacts: string[];
  missingInformation: string[];
  recommendedCapabilities: string[];
  summary: string;
};

export type TaskWorkbenchPromptBinding = {
  moduleName: 'analyze' | 'search' | 'script';
  moduleLabel: string;
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
  promptPreview?: string;
};

export type TaskWorkbenchAssistantSummary = {
  assistantId?: string;
  assistantName?: string;
  industryType?: string;
  description?: string;
};

export type TaskWorkbenchRouteRecommendation = {
  moduleName: 'analyze' | 'search' | 'script';
  moduleLabel: string;
  path: string;
  label: string;
  carryPayload?: Record<string, unknown>;
  continuePayload?: RuntimeContinuePayload | null;
};

export type TaskWorkbenchMaterialItem = {
  id: string;
  type: string;
  title: string;
  contentLines: string[];
};

export type TaskWorkbenchResponseData = {
  assistant: TaskWorkbenchAssistantSummary;
  recognizedTask: TaskWorkbenchRecognizedTask;
  promptBinding: TaskWorkbenchPromptBinding;
  executionContextSummary?: Record<string, unknown> | null;
  routeRecommendation: TaskWorkbenchRouteRecommendation;
  materialPackage: TaskWorkbenchMaterialItem[];
  nextActions: string[];
  continuePayload?: RuntimeContinuePayload | null;
};

export type TaskWorkbenchResponse = AgentRuntimeResponse<
  TaskWorkbenchResponseData,
  RuntimeResponseMeta
>;

export function runTaskWorkbench(
  data: TaskWorkbenchRequest,
): Promise<TaskWorkbenchResponse>;
export function runTaskWorkbench(
  data: TaskWorkbenchRequest,
  options: WebAgentRequestOptions,
): Promise<TaskWorkbenchResponse>;
export function runTaskWorkbench(
  data: TaskWorkbenchRequest,
  options?: AgentRequestOptions,
): Promise<TaskWorkbenchResponse | AgentAdapterResponse>;
export async function runTaskWorkbench(
  data: TaskWorkbenchRequest,
  options?: AgentRequestOptions,
): Promise<TaskWorkbenchResponse | AgentAdapterResponse> {
  const response = await postAgentResponse<TaskWorkbenchResponseData, RuntimeResponseMeta>(
    '/api/agent/task-workbench',
    data,
    '任务识别成功',
    options,
  );

  if (!isApiEnvelopeResponse<TaskWorkbenchResponseData, RuntimeResponseMeta>(response)) {
    return response;
  }

  return withRuntimeSnapshot(response, 'workbench') as TaskWorkbenchResponse;
}

export type SessionEvidenceRecord = SearchEvidenceItem & {
  id?: string;
  sessionId?: string;
  sourceModule?: string;
  isPrimaryEvidence?: boolean;
  attachedAt?: string;
  updatedAt?: string;
};

export type SessionStepRecord = {
  id: string;
  sessionId: string;
  stepType: string;
  summary?: string;
  route?: string;
  strategy?: string;
  executionStrategy?: string;
  outboundAllowed?: boolean;
  outboundReason?: string;
  modelName?: string;
  createdAt?: string;
  inputPayload?: Record<string, unknown> | null;
  outputPayload?: Record<string, unknown> | null;
};

export type SessionAssetRecord = {
  id?: string;
  sessionId?: string;
  sourceModule?: string;
  docId?: string;
  docName?: string;
  docType?: string;
  applicableScene?: string;
  externalAvailable?: boolean;
  attachedAt?: string;
};

export type SessionOverviewRecord = {
  id: string;
  title: string;
  sourceModule?: string;
  currentStage?: string;
  currentGoal?: string;
  updatedAt?: string;
  createdAt?: string;
  taskObject?: string;
  audience?: string;
  taskSubject?: string;
  customerName?: string;
  customerType?: string;
  industryType?: string;
  assistantId?: string;
  executionContextSummary?: Record<string, unknown> | null;
  latestStep?: SessionStepRecord | null;
  latestEvidence?: SessionEvidenceRecord | null;
  stepCount?: number;
  evidenceCount?: number;
  assetCount?: number;
  traceSummary?: Record<string, unknown> | null;
  traceContract?: Record<string, unknown> | null;
  deprecatedFields?: Record<string, unknown> | null;
};

export type SessionDetailRecord = {
  session: SessionOverviewRecord;
  steps: SessionStepRecord[];
  evidences: SessionEvidenceRecord[];
  assets: SessionAssetRecord[];
  latestStep?: SessionStepRecord | null;
  stepCount?: number;
  evidenceCount?: number;
  assetCount?: number;
  traceSummary?: Record<string, unknown> | null;
  traceContract?: Record<string, unknown> | null;
  deprecatedFields?: Record<string, unknown> | null;
};

export type SessionDetailResponse = AgentApiResponse<SessionDetailRecord | null>;

export type SessionListResponse = AgentApiResponse<SessionOverviewRecord[]>;

export type SessionEvidenceResponse = AgentApiResponse<SessionEvidenceRecord | null>;

export const getSessionList = async (limit = 8): Promise<SessionListResponse> => {
  const response = await apiGetEnvelope<SessionOverviewRecord[]>(
    '/api/agent/sessions',
    '获取会话列表成功',
    {
      params: {
        limit,
      },
    },
  );
  return response as SessionListResponse;
};

export const getSessionDetail = async (sessionId: string): Promise<SessionDetailResponse> => {
  const response = await apiGetEnvelope<SessionDetailRecord | null>(
    `/api/agent/sessions/${sessionId}`,
    '获取会话详情成功',
  );
  return response as SessionDetailResponse;
};

export const getSessionEvidence = async (
  sessionId: string,
  evidenceId: string,
): Promise<SessionEvidenceResponse> => {
  const response = await apiGetEnvelope<SessionEvidenceRecord | null>(
    `/api/agent/sessions/${sessionId}/evidences/${evidenceId}`,
    '获取会话证据成功',
  );
  return response as SessionEvidenceResponse;
};

/** @deprecated AssistantCenter 已切到 current-published / module-bindings / governance-definition 三类治理接口。 */
export type AssistantCenterListRequest = {
  keyword?: string;
  status?: 'active' | 'draft' | 'archived' | 'all';
};

export type AssistantCenterListResponse = AgentApiResponse<AssistantCenterListItem[]>;

/** @deprecated AssistantCenter 已不再继续扩旧 mixed detail / summary 口径。 */
export type AssistantCenterDetailRequest = {
  assistantId: string;
};

export type AssistantCenterDetailResponse = AgentApiResponse<AssistantCenterDetailData>;

/** @deprecated 使用 getAssistantCenterCurrentPublished / getAssistantCenterModuleBindings / getAssistantCenterGovernanceDefinition 代替。 */
export const getAssistantCenterList = async (
  data: AssistantCenterListRequest = {},
): Promise<AssistantCenterListResponse> => {
  const response = await apiPostEnvelope<AssistantCenterListItem[]>(
    '/api/agent/assistant-center/list',
    data,
    '获取 Assistant 列表成功',
  );
  return response as AssistantCenterListResponse;
};

/** @deprecated 使用 getAssistantCenterCurrentPublished / getAssistantCenterModuleBindings / getAssistantCenterGovernanceDefinition 代替。 */
export const getAssistantCenterDetail = async (
  data: AssistantCenterDetailRequest,
): Promise<AssistantCenterDetailResponse> => {
  const response = await apiPostEnvelope<AssistantCenterDetailData>(
    '/api/agent/assistant-center/detail',
    data,
    '获取 Assistant 详情成功',
  );
  return response as AssistantCenterDetailResponse;
};

export type AssistantCenterCurrentPublishedResponse =
  AgentApiResponse<AssistantCenterCurrentPublishedData>;

export const getAssistantCenterCurrentPublished = async (): Promise<AssistantCenterCurrentPublishedResponse> => {
  const response = await apiPostEnvelope<AssistantCenterCurrentPublishedData>(
    '/api/agent/assistant-center/current-published',
    {},
    '获取 Assistant 当前发布版成功',
  );
  return response as AssistantCenterCurrentPublishedResponse;
};

export type AssistantCenterModuleBindingsResponse =
  AgentApiResponse<AssistantCenterModuleBindingsData>;

export const getAssistantCenterModuleBindings = async (): Promise<AssistantCenterModuleBindingsResponse> => {
  const response = await apiPostEnvelope<AssistantCenterModuleBindingsData>(
    '/api/agent/assistant-center/module-bindings',
    {},
    '获取 Assistant 当前挂载关系成功',
  );
  return response as AssistantCenterModuleBindingsResponse;
};

export type AssistantCenterGovernanceDefinitionResponse =
  AgentApiResponse<AssistantCenterGovernanceDefinitionData>;

export const getAssistantCenterGovernanceDefinition = async (): Promise<AssistantCenterGovernanceDefinitionResponse> => {
  const response = await apiPostEnvelope<AssistantCenterGovernanceDefinitionData>(
    '/api/agent/assistant-center/governance-definition',
    {},
    '获取 Assistant 治理定义成功',
  );
  return response as AssistantCenterGovernanceDefinitionResponse;
};
