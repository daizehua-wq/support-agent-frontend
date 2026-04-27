import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Space, message } from 'antd';

import {
  createModel,
  deleteModel,
  getModelCenterDetail,
  getModelCenterList,
  saveModelFallback,
  saveModelModuleBindings,
  setDefaultModel,
  testModel,
  updateModel,
  type ModelCenterDetail,
  type ModelCenterListItem,
} from '../../api/modelCenter';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';
import ModelCenterModals from './components/ModelCenterModals';
import ModelCenterOverviewSection from './components/ModelCenterOverviewSection';
import ModelCenterResourceSection from './components/ModelCenterResourceSection';
import { getModelItemId } from './helpers';

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readTopLevelWriteBack(response: unknown) {
  const record = readRecord(response) || {};
  const writeBack = readRecord(record.writeBack) || {};
  const summary = readRecord(writeBack.summary) || {};

  return {
    activeModelId: readString(summary.activeModelId) || '',
    clearedFallbackReferences: Array.isArray(summary.clearedFallbackReferences)
      ? summary.clearedFallbackReferences
      : [],
  };
}

function readTopLevelTargetId(response: unknown) {
  const record = readRecord(response) || {};
  const data = readRecord(record.data) || {};
  const detail = readRecord(data.detail) || {};

  return (
    readString(record.targetId) ||
    readString(data.targetId) ||
    readString(detail.id) ||
    readString(detail.modelId) ||
    ''
  );
}

function normalizeModelListItem(value: unknown): ModelCenterListItem {
  const record = readRecord(value) || {};
  const provider =
    readString(record.provider) ||
    readString(record.modelProvider) ||
    readString(record.mode) ||
    '';
  const enabled = readBoolean(record.enabled);
  const status =
    readString(record.status) ||
    (enabled === false ? 'offline' : provider ? 'available' : 'warning');

  return {
    id:
      readString(record.id) ||
      readString(record.modelId) ||
      readString(record.name) ||
      readString(record.modelName),
    modelId:
      readString(record.modelId) ||
      readString(record.id) ||
      readString(record.name) ||
      readString(record.modelName),
    name:
      readString(record.name) ||
      readString(record.label) ||
      readString(record.modelName) ||
      '未命名模型',
    provider,
    modelName: readString(record.modelName) || '未返回模型名',
    defaultFlag: readBoolean(record.defaultFlag),
    status,
    version: typeof record.version === 'number' ? record.version : undefined,
    updatedAt: readString(record.updatedAt) || readString(record.modifiedAt) || undefined,
    modifiedAt: readString(record.modifiedAt) || undefined,
    enabled,
  };
}

function normalizeModelDetail(value: unknown): ModelCenterDetail | null {
  const record = readRecord(value);

  if (!record) {
    return null;
  }

  const normalizedListItem = normalizeModelListItem(record);

  return {
    ...record,
    ...normalizedListItem,
    baseUrl: readString(record.baseUrl) || '',
    description: readString(record.description) || '',
    apiKeyMasked: readString(record.apiKeyMasked) || '',
    timeout:
      typeof record.timeout === 'number' || typeof record.timeout === 'string'
        ? record.timeout
        : undefined,
    version:
      typeof record.version === 'number'
        ? record.version
        : normalizedListItem.version || 1,
    updatedAt:
      readString(record.updatedAt) ||
      readString(record.modifiedAt) ||
      normalizedListItem.updatedAt,
    modifiedAt: readString(record.modifiedAt) || normalizedListItem.modifiedAt,
    enabled: readBoolean(record.enabled) ?? normalizedListItem.enabled,
  } as ModelCenterDetail;
}

function mapModuleBindingsFromDetail(
  detail?: ModelCenterDetail | null,
): { analyze: string; search: string; script: string } {
  const summary = Array.isArray(detail?.moduleBindingsSummary)
    ? (detail?.moduleBindingsSummary as Array<Record<string, unknown>>)
    : [];

  return summary.reduce<{
    analyze: string;
    search: string;
    script: string;
  }>(
    (accumulator, item) => {
      const moduleKey = String(item.module || '').toLowerCase();
      const bindingValue = String(item.modelId || item.bindingType || item.modelName || '') || '';

      if (moduleKey === 'analyze') accumulator.analyze = bindingValue;
      if (moduleKey === 'search') accumulator.search = bindingValue;
      if (moduleKey === 'script') accumulator.script = bindingValue;
      return accumulator;
    },
    {
      analyze: '',
      search: '',
      script: '',
    },
  );
}

function mapFallbackFromDetail(detail?: ModelCenterDetail | null) {
  const summary = (detail?.fallbackSummary || null) as
    | { modelId?: string; modelName?: string; reason?: string }
    | null;
  const config = (detail?.fallbackConfig || null) as
    | { enabled?: boolean; fallbackModelId?: string | null; fallbackModelName?: string | null }
    | null;

  return {
    enabled: config?.enabled ?? !!summary?.modelId,
    modelId: config?.fallbackModelId || summary?.modelId || null,
    modelName: config?.fallbackModelName || summary?.modelName || null,
    reason: summary?.reason || null,
  };
}

function mapTestFeedbackFromDetail(detail?: ModelCenterDetail | null) {
  const summary = (detail?.testFeedbackSummary || null) as
    | {
        passFlag?: boolean;
        provider?: string;
        baseUrl?: string;
        modelName?: string;
        endpoint?: string;
        testedAt?: string;
      }
    | null;

  if (!summary) return null;

  return {
    status: summary.passFlag ? '测试成功' : '测试失败',
    message: [summary.provider, summary.baseUrl, summary.endpoint].filter(Boolean).join(' | '),
    modelName: summary.modelName || '',
    testedAt: summary.testedAt || '',
  };
}

type ApiErrorShape = {
  message?: string;
  errorFields?: unknown;
  response?: {
    data?: {
      code?: string;
      message?: string;
      data?: {
        code?: string;
        message?: string;
      };
      error?: {
        code?: string;
        message?: string;
      };
      blockers?: Array<{
        type?: string;
        id?: string;
        name?: string;
        reason?: string;
      }>;
    };
  };
};

function asApiError(error: unknown): ApiErrorShape {
  return (error || {}) as ApiErrorShape;
}

function getApiBlockers(error: unknown) {
  const parsedError = asApiError(error);
  const blockers = parsedError.response?.data?.blockers;

  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers
    .map((item) => ({
      type: readString(item?.type) || '',
      name: readString(item?.name) || '',
      reason: readString(item?.reason) || '',
    }))
    .filter((item) => item.type || item.name || item.reason);
}

function formatDeleteBlockers(error: unknown) {
  const blockers = getApiBlockers(error);

  if (!blockers.length) {
    return '';
  }

  return blockers
    .map((item) => {
      if (item.type === 'default-model') {
        return `${item.name || '当前模型'}仍是默认模型`;
      }

      if (item.type === 'module-binding') {
        return item.reason || `${item.name || '当前模型'}仍被模块绑定引用`;
      }

      if (item.type === 'fallback-reference') {
        return `${item.name || '其他模型'}的降级候选仍指向当前模型`;
      }

      return item.reason || item.name || '仍存在依赖';
    })
    .join('；');
}

export default function ModelCenterPage() {
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [modelList, setModelList] = useState<ModelCenterListItem[]>([]);
  const [selectedModelDetail, setSelectedModelDetail] = useState<ModelCenterDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [bindingsModalOpen, setBindingsModalOpen] = useState(false);
  const [fallbackModalOpen, setFallbackModalOpen] = useState(false);
  const [savingBindings, setSavingBindings] = useState(false);
  const [savingFallback, setSavingFallback] = useState(false);
  const [testing, setTesting] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [bindingsForm] = Form.useForm();
  const [fallbackForm] = Form.useForm();

  async function loadList(preferredModelId?: string) {
    setListLoading(true);
    try {
      const response = await getModelCenterList();
      const items = Array.isArray(response.data?.items)
        ? response.data.items.map(normalizeModelListItem)
        : [];
      const activeModelId = readTopLevelWriteBack(response).activeModelId;
      setListError('');

      setModelList(items);

      if (!items.length) {
        setSelectedModelId('');
        setSelectedModelDetail(null);
        return;
      }

      setSelectedModelId((previous) => {
        if (preferredModelId && items.some((item) => getModelItemId(item) === preferredModelId)) {
          return preferredModelId;
        }
        if (previous && items.some((item) => getModelItemId(item) === previous)) return previous;
        if (activeModelId && items.some((item) => getModelItemId(item) === activeModelId)) {
          return activeModelId;
        }
        return getModelItemId(items[0]);
      });
    } catch (error: unknown) {
      const messageText =
        getApiErrorMessage(
          error,
          '获取模型列表失败，请确认 mock server 已启动（npm run dev:mock 或 npm run dev:all）',
        ) || '获取模型列表失败';
      setListError(messageText);
      message.error(messageText);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function loadDetail(modelId: string) {
    setDetailLoading(true);
    try {
      const response = await getModelCenterDetail(modelId);
      setSelectedModelDetail(normalizeModelDetail(response.data?.detail));
    } catch {
      setSelectedModelDetail(null);
      message.error('获取模型详情失败');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedModelDetail(null);
      return;
    }

    void loadDetail(selectedModelId);
  }, [selectedModelId]);

  const defaultModel = useMemo(
    () => modelList.find((item) => item.defaultFlag) || modelList[0],
    [modelList],
  );

  const selectedModel =
    selectedModelDetail ||
    modelList.find((item) => getModelItemId(item) === selectedModelId) ||
    defaultModel;

  const moduleBindings = mapModuleBindingsFromDetail(selectedModelDetail);
  const fallbackSummary = mapFallbackFromDetail(selectedModelDetail);
  const latestTestFeedback = mapTestFeedbackFromDetail(selectedModelDetail);

  const getModelName = (id?: string | null) => {
    if (!id) return '-';
    return (
      modelList.find((item) => getModelItemId(item) === id)?.name ||
      modelList.find((item) => getModelItemId(item) === id)?.modelName ||
      id
    );
  };

  useEffect(() => {
    if (!selectedModelDetail) {
      editForm.resetFields();
      return;
    }

    editForm.setFieldsValue({
      name: selectedModelDetail.name || selectedModelDetail.modelName || '',
      provider: String(selectedModelDetail.modelProvider || selectedModelDetail.provider || ''),
      modelName: selectedModelDetail.modelName || '',
      baseUrl: String(selectedModelDetail.baseUrl || ''),
      description: String(selectedModelDetail.description || ''),
    });
  }, [selectedModelDetail, editForm]);

  useEffect(() => {
    if (!selectedModelDetail) {
      bindingsForm.resetFields();
      return;
    }

    const bindings = mapModuleBindingsFromDetail(selectedModelDetail);
    bindingsForm.setFieldsValue({
      analyze: bindings.analyze,
      search: bindings.search,
      script: bindings.script,
    });
  }, [selectedModelDetail, bindingsForm]);

  useEffect(() => {
    if (!selectedModelDetail) {
      fallbackForm.resetFields();
      return;
    }

    const fallback = mapFallbackFromDetail(selectedModelDetail);
    fallbackForm.setFieldsValue({
      enabled: fallback.enabled ? 'true' : 'false',
      fallbackModelId: fallback.modelId || undefined,
    });
  }, [selectedModelDetail, fallbackForm]);

  async function handleCreate() {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      const response = await createModel({
        name: values.name,
        modelProvider: values.provider,
        modelName: values.modelName,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        timeout: values.timeout,
      });
      const targetId = readTopLevelTargetId(response);
      message.success('新增模型成功');
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadList(targetId);
      if (targetId) {
        await loadDetail(targetId);
      }
    } catch (error: unknown) {
      if (asApiError(error).errorFields) return;
      message.error(getApiErrorMessage(error, '新增模型失败'));
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedModelDetail) return;

    try {
      const values = await editForm.validateFields();
      setSaving(true);
      const modelId = getModelItemId(selectedModelDetail);
      await updateModel(modelId, {
        name: values.name,
        modelProvider: values.provider,
        modelName: values.modelName,
        baseUrl: values.baseUrl,
        description: values.description,
        version: Number(selectedModelDetail.version || 0),
      });
      message.success('保存模型成功');
      await loadList(modelId);
      await loadDetail(modelId);
    } catch (error: unknown) {
      if (asApiError(error).errorFields) return;
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('版本冲突，请刷新后重试');
      } else {
        message.error(getApiErrorMessage(error, '保存模型失败'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedModelDetail) return;

    const modelId = getModelItemId(selectedModelDetail);
    try {
      setDeleting(true);
      const response = await deleteModel(modelId);
      const cleanedFallbacks = readTopLevelWriteBack(response).clearedFallbackReferences;

      if (cleanedFallbacks.length > 0) {
        const fallbackNames = cleanedFallbacks
          .map((item) => {
            const record = readRecord(item) || {};
            return readString(record.modelName) || readString(record.modelId) || '';
          })
          .filter(Boolean)
          .join('、');
        message.success(`删除模型成功，已自动清理降级引用：${fallbackNames}`);
      } else {
        message.success('删除模型成功');
      }
      setSelectedModelDetail(null);
      await loadList();
    } catch (error: unknown) {
      const code = getApiErrorCode(error);
      if (code === 'DEPENDENCY_BLOCKED') {
        const blockerText = formatDeleteBlockers(error);
        message.error(
          blockerText ? `当前模型暂不可删除：${blockerText}` : '当前模型存在依赖，暂不可删除',
        );
      } else {
        message.error(getApiErrorMessage(error, '删除模型失败'));
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleSetDefault() {
    if (!selectedModelDetail) return;

    const modelId = getModelItemId(selectedModelDetail);
    try {
      setSettingDefault(true);
      await setDefaultModel(modelId);
      message.success('默认模型切换成功');
      await loadList(modelId);
      await loadDetail(modelId);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '设置默认模型失败'));
    } finally {
      setSettingDefault(false);
    }
  }

  async function handleSaveBindings() {
    if (!selectedModelDetail) return;

    try {
      const values = await bindingsForm.validateFields();
      setSavingBindings(true);
      const modelId = getModelItemId(selectedModelDetail);
      await saveModelModuleBindings(modelId, {
        version: Number(selectedModelDetail.version || 0),
        moduleBindingsSummary: [
          {
            module: 'analyze',
            modelId: values.analyze,
            modelName: getModelName(values.analyze),
            bindingType: values.analyze,
            enabled: true,
          },
          {
            module: 'search',
            modelId: values.search,
            modelName: getModelName(values.search),
            bindingType: values.search,
            enabled: true,
          },
          {
            module: 'script',
            modelId: values.script,
            modelName: getModelName(values.script),
            bindingType: values.script,
            enabled: true,
          },
        ],
      });
      message.success('模块绑定保存成功');
      setBindingsModalOpen(false);
      await loadList(modelId);
      await loadDetail(modelId);
    } catch (error: unknown) {
      if (asApiError(error).errorFields) return;
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('版本冲突，请刷新后重试');
      } else {
        message.error(getApiErrorMessage(error, '模块绑定保存失败'));
      }
    } finally {
      setSavingBindings(false);
    }
  }

  async function handleSaveFallback() {
    if (!selectedModelDetail) return;

    try {
      const values = await fallbackForm.validateFields();
      setSavingFallback(true);
      const modelId = getModelItemId(selectedModelDetail);
      await saveModelFallback(modelId, {
        version: Number(selectedModelDetail.version || 0),
        fallbackSummary:
          values.enabled === 'true'
            ? {
                modelId: values.fallbackModelId || null,
                modelName: getModelName(values.fallbackModelId || null),
                reason: 'manual-fallback',
              }
            : null,
      });
      message.success('降级规则保存成功');
      setFallbackModalOpen(false);
      await loadList(modelId);
      await loadDetail(modelId);
    } catch (error: unknown) {
      if (asApiError(error).errorFields) return;
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('版本冲突，请刷新后重试');
      } else {
        message.error(getApiErrorMessage(error, '降级规则保存失败'));
      }
    } finally {
      setSavingFallback(false);
    }
  }

  async function handleTestModel() {
    if (!selectedModelDetail) {
      message.warning('请先选择一个模型');
      return;
    }

    const modelId = getModelItemId(selectedModelDetail);
    try {
      setTesting(true);
      await testModel(modelId, {
        prompt: 'health check',
      });
      message.success('模型测试成功');
      await loadDetail(modelId);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '模型测试失败'));
    } finally {
      setTesting(false);
    }
  }

  if (!listLoading && !modelList.length) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F7FA', padding: 24 }}>
        <Card style={{ borderRadius: 12 }}>
          {listError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="模型中心后端不可用"
              description={
                <>
                  <div style={{ marginBottom: 8 }}>{listError}</div>
                  <div>请先运行 `npm run dev:mock`，或直接运行 `npm run dev:all`。</div>
                </>
              }
            />
          ) : null}
          <Empty description="暂无模型资源" />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA', padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
          ModelCenter
        </div>
        <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.8, marginBottom: 16 }}>
          模型治理页，只承接模型资源、默认模型、模块绑定、降级规则与模型测试反馈。
        </div>
        <Space wrap>
          <Button type="primary" onClick={() => setCreateModalOpen(true)}>
            新增模型
          </Button>
          <Button loading={testing} onClick={handleTestModel}>
            测试模型
          </Button>
        </Space>
      </div>

      <ModelCenterOverviewSection
        defaultModel={defaultModel}
        moduleBindings={moduleBindings}
        fallbackSummary={fallbackSummary}
        getModelName={getModelName}
        onOpenBindings={() => setBindingsModalOpen(true)}
        onOpenFallback={() => setFallbackModalOpen(true)}
      />

      <ModelCenterResourceSection
        modelList={modelList}
        listLoading={listLoading}
        selectedModelId={selectedModelId}
        selectedModel={selectedModel}
        selectedModelDetail={selectedModelDetail}
        detailLoading={detailLoading}
        editForm={editForm}
        saving={saving}
        deleting={deleting}
        settingDefault={settingDefault}
        latestTestFeedback={latestTestFeedback}
        onSelectModel={setSelectedModelId}
        onSave={handleSave}
        onSetDefault={handleSetDefault}
        onDelete={handleDelete}
      />

      <ModelCenterModals
        bindingsModalOpen={bindingsModalOpen}
        fallbackModalOpen={fallbackModalOpen}
        createModalOpen={createModalOpen}
        savingBindings={savingBindings}
        savingFallback={savingFallback}
        creating={creating}
        bindingsForm={bindingsForm}
        fallbackForm={fallbackForm}
        createForm={createForm}
        modelList={modelList}
        selectedModelDetail={selectedModelDetail}
        onSaveBindings={handleSaveBindings}
        onSaveFallback={handleSaveFallback}
        onCreate={handleCreate}
        onCloseBindings={() => setBindingsModalOpen(false)}
        onCloseFallback={() => setFallbackModalOpen(false)}
        onCloseCreate={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
      />
    </div>
  );
}
