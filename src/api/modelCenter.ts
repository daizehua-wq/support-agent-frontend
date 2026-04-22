import { apiGetEnvelope, apiPostEnvelope } from './client';

const MODEL_CENTER_BASE = '/api/agent/governance/model-center';

export type ModelCenterListItem = {
  id?: string;
  modelId?: string;
  name?: string;
  provider?: string;
  modelName: string;
  mode?: string;
  defaultFlag?: boolean;
  status?: string;
  version?: number;
  updatedAt?: string;
  modifiedAt?: string;
  enabled?: boolean;
};

export type ModelCenterDetail = {
  id?: string;
  modelId?: string;
  name?: string;
  provider?: string;
  modelName: string;
  baseUrl?: string;
  description?: string;
  apiKeyMasked?: string;
  timeout?: number | string;
  defaultFlag?: boolean;
  status?: string;
  updatedAt?: string;
  modifiedAt?: string;
  enabled?: boolean;
  version: number;
  moduleBindings?: Record<string, string>;
  fallbackConfig?: {
    enabled?: boolean;
    fallbackModelId?: string | null;
    fallbackModelName?: string | null;
  };
  testFeedbackSummary?: {
    status?: string;
    message?: string;
    testedAt?: string;
  };
  [key: string]: unknown;
};

export type ModelCenterListResponse = {
  items: ModelCenterListItem[];
};

export type ModelCenterDetailResponse = {
  detail: ModelCenterDetail;
};

export type CreateModelRequest = {
  name: string;
  provider?: string;
  modelProvider?: string;
  modelName: string;
  baseUrl?: string;
  description?: string;
  apiKey?: string;
  timeout?: number | string;
};

export type UpdateModelRequest = {
  name?: string;
  provider?: string;
  modelProvider?: string;
  modelName?: string;
  baseUrl?: string;
  description?: string;
  apiKey?: string;
  timeout?: number | string;
  version: number;
};

export type SaveModuleBindingsRequest = {
  version: number;
  moduleBindings?: Record<string, string>;
  moduleBindingsSummary?: Array<{
    module: string;
    modelId?: string;
    modelName?: string;
    bindingType?: string;
    enabled?: boolean;
  }>;
};

export type SaveFallbackRequest = {
  version: number;
  enabled?: boolean;
  fallbackModelId?: string | null;
  fallbackSummary?: {
    modelId?: string | null;
    modelName?: string | null;
    reason?: string | null;
  } | null;
};

export type TestModelRequest = {
  prompt?: string;
  input?: string;
};

export async function getModelCenterList() {
  return apiGetEnvelope<ModelCenterListResponse>(
    `${MODEL_CENTER_BASE}/list`,
    '获取模型列表成功',
  );
}

export async function getModelCenterDetail(modelId: string) {
  return apiGetEnvelope<ModelCenterDetailResponse>(
    `${MODEL_CENTER_BASE}/detail/${modelId}`,
    '获取模型详情成功',
  );
}

export async function createModel(data: CreateModelRequest) {
  return apiPostEnvelope<{ targetId: string }>(
    `${MODEL_CENTER_BASE}/create`,
    data,
    '新增模型成功',
  );
}

export async function updateModel(modelId: string, data: UpdateModelRequest) {
  return apiPostEnvelope<{ targetId?: string; version?: number }>(
    `${MODEL_CENTER_BASE}/update/${modelId}`,
    data,
    '保存模型成功',
  );
}

export async function deleteModel(modelId: string) {
  return apiPostEnvelope<{
    deleted?: boolean;
    summary?: {
      deleted?: boolean;
      clearedFallbackReferences?: Array<{
        modelId?: string;
        modelName?: string;
      }>;
    };
  }>(`${MODEL_CENTER_BASE}/delete/${modelId}`, undefined, '删除模型成功');
}

export async function setDefaultModel(modelId: string) {
  return apiPostEnvelope<{
    writeBack?: {
      summary?: {
        activeModelId?: string;
      };
    };
  }>(`${MODEL_CENTER_BASE}/set-default/${modelId}`, undefined, '设置默认模型成功');
}

export async function saveModelModuleBindings(
  modelId: string,
  data: SaveModuleBindingsRequest,
) {
  return apiPostEnvelope<{ success?: boolean; detail?: ModelCenterDetail }>(
    `${MODEL_CENTER_BASE}/module-bindings/save/${modelId}`,
    data,
    '保存模块绑定成功',
  );
}

export async function saveModelFallback(modelId: string, data: SaveFallbackRequest) {
  return apiPostEnvelope<{ success?: boolean; detail?: ModelCenterDetail }>(
    `${MODEL_CENTER_BASE}/fallback/save/${modelId}`,
    data,
    '保存 fallback 成功',
  );
}

export async function testModel(modelId: string, data: TestModelRequest) {
  return apiPostEnvelope<{
    result?: unknown;
    detail?: ModelCenterDetail;
  }>(`${MODEL_CENTER_BASE}/test/${modelId}`, data, '测试模型成功');
}
