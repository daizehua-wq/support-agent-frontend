import { apiGetEnvelope, apiPostEnvelope } from './client';
import type { ApiEnvelope } from './helpers';

const ASSISTANT_CENTER_BASE = '/api/agent/assistant-center';

export type GovernanceAuditFieldChange = {
  field: string;
  before?: string;
  after?: string;
};

export type GovernanceAuditEntry = {
  id: string;
  entityType: 'assistant' | 'prompt';
  action: string;
  actor: string;
  targetId: string;
  targetName?: string;
  summary?: string;
  createdAt?: string | null;
  changeCount?: number;
  changedFields?: GovernanceAuditFieldChange[];
  metadata?: Record<string, unknown>;
};

export type AssistantPromptBindings = {
  analyze: string;
  search: string;
  script: string;
};

export type AssistantStrategies = {
  analyzeStrategy: string;
  searchStrategy: string;
  scriptStrategy: string;
};

export type AssistantScopes = {
  rulesScope: string[];
  productScope: string[];
  docScope: string[];
};

export type AssistantVariableSchemaItem = {
  key: string;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
  example?: string;
};

export type AssistantCenterListItem = {
  assistantId: string;
  assistantName: string;
  description?: string;
  status: string;
  currentVersion: string;
  updatedAt?: string | null;
  industryType?: string;
  templateOrigin?: 'builtin' | 'custom';
  templateCategory?: string;
  templateRole?: string;
  activeFlag?: boolean;
  currentPublishedAssistant?: string;
  currentPublishedPrompt?: string;
  currentPublishedPromptVersion?: string;
  currentPublishedStrategy?: string;
  defaultTaskContext?: string;
  defaultSubjectHint?: string;
  defaultVariables?: Record<string, string>;
  variableSchema?: AssistantVariableSchemaItem[];
  defaultCustomerType?: string;
  defaultProductDirection?: string;
  defaultModuleBindings: AssistantPromptBindings;
  defaultStrategies: AssistantStrategies;
  dataScopes: AssistantScopes;
};

export type AssistantCenterDetail = AssistantCenterListItem & {
  currentPublishedSummary?: Record<string, unknown>;
  moduleBindingsSummary?: Record<string, unknown>;
  governanceDefinitionSummary?: Record<string, unknown>;
  promptOptionsSummary?: Array<Record<string, unknown>>;
  trace?: Record<string, unknown>;
  history?: GovernanceAuditEntry[];
};

export type PromptCenterListItem = {
  promptId: string;
  name: string;
  module: 'analyze' | 'search' | 'script';
  version: string;
  recordVersion: number;
  status: string;
  updatedAt?: string | null;
  description?: string;
  contentPreview?: string;
  assistantCount?: number;
  industryType?: string;
  enabled?: boolean;
};

export type PromptCenterDetail = {
  promptId: string;
  name: string;
  module: 'analyze' | 'search' | 'script';
  version: string;
  recordVersion: number;
  status: string;
  updatedAt?: string | null;
  publishedAt?: string | null;
  description?: string;
  content: string;
  industryType?: string;
  assistantId?: string;
  enabled?: boolean;
  tags?: string[];
  usageSummary?: {
    assistantCount?: number;
    usedBy?: Array<{
      assistantId: string;
      assistantName: string;
      modules: string[];
      }>;
  };
  history?: GovernanceAuditEntry[];
};

export type AssistantMutationRequest = {
  assistantId?: string;
  assistantName: string;
  description?: string;
  industryType: string;
  templateOrigin?: 'builtin' | 'custom';
  templateCategory?: string;
  templateRole?: string;
  defaultTaskContext?: string;
  defaultSubjectHint?: string;
  defaultVariables?: Record<string, string>;
  variableSchema?: AssistantVariableSchemaItem[];
  defaultCustomerType?: string;
  defaultProductDirection?: string;
  defaultStrategies: AssistantStrategies;
  dataScopes: AssistantScopes;
  defaultModuleBindings: AssistantPromptBindings;
  enabled?: boolean;
};

export type PromptMutationRequest = {
  promptId?: string;
  name: string;
  module: 'analyze' | 'search' | 'script';
  version: string;
  description?: string;
  content: string;
  industryType?: string;
  assistantId?: string;
  enabled?: boolean;
  tags?: string[];
};

type GovernanceMutationResponse<TDetail> = ApiEnvelope<{
  detail?: TDetail;
  deleted?: boolean;
}>;

async function governanceGet<TData>(path: string, fallbackMessage: string) {
  return apiGetEnvelope<TData>(path, fallbackMessage);
}

async function governancePost<TData>(
  path: string,
  payload: Record<string, unknown> | undefined,
  fallbackMessage: string,
) {
  return apiPostEnvelope<TData>(path, payload, fallbackMessage);
}

export async function getAssistantCenterAssistants() {
  return governanceGet<{
    items: AssistantCenterListItem[];
    activeAssistantId?: string;
  }>(`${ASSISTANT_CENTER_BASE}/assistants`, '获取 Assistant 列表成功');
}

export async function getAssistantCenterAssistantDetail(assistantId: string) {
  return governanceGet<{ detail?: AssistantCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/assistants/${assistantId}`,
    '获取 Assistant 详情成功',
  );
}

export async function createAssistantCenterAssistant(data: AssistantMutationRequest) {
  return governancePost<{ detail?: AssistantCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/assistants`,
    {
      assistant: data,
    },
    'Assistant 创建成功',
  );
}

export async function updateAssistantCenterAssistant(
  assistantId: string,
  data: AssistantMutationRequest & { version: number },
): Promise<GovernanceMutationResponse<AssistantCenterDetail>> {
  return governancePost<{ detail?: AssistantCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/assistants/${assistantId}/update`,
    {
      assistant: data,
      version: data.version,
    },
    'Assistant 保存成功',
  );
}

export async function publishAssistantCenterAssistant(
  assistantId: string,
): Promise<GovernanceMutationResponse<AssistantCenterDetail>> {
  return governancePost<{ detail?: AssistantCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/assistants/${assistantId}/publish`,
    undefined,
    'Assistant 发布成功',
  );
}

export async function activateAssistantCenterAssistant(
  assistantId: string,
): Promise<GovernanceMutationResponse<AssistantCenterDetail>> {
  return governancePost<{ detail?: AssistantCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/assistants/${assistantId}/activate`,
    undefined,
    'Assistant 激活成功',
  );
}

export async function deleteAssistantCenterAssistant(
  assistantId: string,
): Promise<GovernanceMutationResponse<AssistantCenterDetail>> {
  return governancePost<{ deleted?: boolean }>(
    `${ASSISTANT_CENTER_BASE}/assistants/${assistantId}/delete`,
    undefined,
    'Assistant 删除成功',
  );
}

export async function getAssistantCenterPrompts() {
  return governanceGet<{ items: PromptCenterListItem[] }>(
    `${ASSISTANT_CENTER_BASE}/prompts`,
    '获取 Prompt 列表成功',
  );
}

export async function getAssistantCenterPromptDetail(promptId: string) {
  return governanceGet<{ detail?: PromptCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/prompts/${promptId}`,
    '获取 Prompt 详情成功',
  );
}

export async function createAssistantCenterPrompt(data: PromptMutationRequest) {
  return governancePost<{ detail?: PromptCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/prompts`,
    {
      prompt: data,
    },
    'Prompt 创建成功',
  );
}

export async function updateAssistantCenterPrompt(
  promptId: string,
  data: PromptMutationRequest & { recordVersion: number },
): Promise<GovernanceMutationResponse<PromptCenterDetail>> {
  return governancePost<{ detail?: PromptCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/prompts/${promptId}/update`,
    {
      prompt: data,
      recordVersion: data.recordVersion,
    },
    'Prompt 保存成功',
  );
}

export async function publishAssistantCenterPrompt(
  promptId: string,
): Promise<GovernanceMutationResponse<PromptCenterDetail>> {
  return governancePost<{ detail?: PromptCenterDetail }>(
    `${ASSISTANT_CENTER_BASE}/prompts/${promptId}/publish`,
    undefined,
    'Prompt 发布成功',
  );
}

export async function deleteAssistantCenterPrompt(
  promptId: string,
): Promise<GovernanceMutationResponse<PromptCenterDetail>> {
  return governancePost<{ deleted?: boolean }>(
    `${ASSISTANT_CENTER_BASE}/prompts/${promptId}/delete`,
    undefined,
    'Prompt 删除成功',
  );
}
