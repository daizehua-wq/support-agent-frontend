import { Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';

import type { ModelCenterDetail, ModelCenterListItem } from '../../../api/modelCenter';
import { getModelItemId } from '../helpers';

type ModelCenterModalsProps = {
  bindingsModalOpen: boolean;
  fallbackModalOpen: boolean;
  createModalOpen: boolean;
  savingBindings: boolean;
  savingFallback: boolean;
  creating: boolean;
  bindingsForm: FormInstance;
  fallbackForm: FormInstance;
  createForm: FormInstance;
  modelList: ModelCenterListItem[];
  selectedModelDetail: ModelCenterDetail | null;
  onSaveBindings: () => void;
  onSaveFallback: () => void;
  onCreate: () => void;
  onCloseBindings: () => void;
  onCloseFallback: () => void;
  onCloseCreate: () => void;
};

function ModelCenterModals({
  bindingsModalOpen,
  fallbackModalOpen,
  createModalOpen,
  savingBindings,
  savingFallback,
  creating,
  bindingsForm,
  fallbackForm,
  createForm,
  modelList,
  selectedModelDetail,
  onSaveBindings,
  onSaveFallback,
  onCreate,
  onCloseBindings,
  onCloseFallback,
  onCloseCreate,
}: ModelCenterModalsProps) {
  return (
    <>
      <Modal
        title="调整模块绑定"
        open={bindingsModalOpen}
        onOk={onSaveBindings}
        onCancel={onCloseBindings}
        confirmLoading={savingBindings}
        destroyOnHidden
      >
        <Form form={bindingsForm} layout="vertical">
          <Form.Item label="Analyze" name="analyze" rules={[{ required: true, message: '请选择 Analyze 模型' }]}>
            <Select
              placeholder="请选择 Analyze 模型"
              options={modelList.map((item) => ({
                label: item.name || item.modelName,
                value: getModelItemId(item),
              }))}
            />
          </Form.Item>
          <Form.Item label="Search" name="search" rules={[{ required: true, message: '请选择 Search 模型' }]}>
            <Select
              placeholder="请选择 Search 模型"
              options={modelList.map((item) => ({
                label: item.name || item.modelName,
                value: getModelItemId(item),
              }))}
            />
          </Form.Item>
          <Form.Item label="Script" name="script" rules={[{ required: true, message: '请选择 Script 模型' }]}>
            <Select
              placeholder="请选择 Script 模型"
              options={modelList.map((item) => ({
                label: item.name || item.modelName,
                value: getModelItemId(item),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="调整降级规则"
        open={fallbackModalOpen}
        onOk={onSaveFallback}
        onCancel={onCloseFallback}
        confirmLoading={savingFallback}
        destroyOnHidden
      >
        <Form form={fallbackForm} layout="vertical">
          <Form.Item label="启用状态" name="enabled" rules={[{ required: true, message: '请选择启用状态' }]}>
            <Select
              placeholder="请选择启用状态"
              options={[
                { label: '已启用', value: 'true' },
                { label: '未启用', value: 'false' },
              ]}
            />
          </Form.Item>
          <Form.Item label="目标模型" name="fallbackModelId">
            <Select
              allowClear
              placeholder="请选择降级目标模型"
              options={modelList
                .filter((item) => getModelItemId(item) !== getModelItemId(selectedModelDetail))
                .map((item) => ({
                  label: item.name || item.modelName,
                  value: getModelItemId(item),
                }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增模型"
        open={createModalOpen}
        onOk={onCreate}
        onCancel={onCloseCreate}
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="展示名称" name="name" rules={[{ required: true, message: '请输入展示名称' }]}>
            <Input placeholder="请输入展示名称" />
          </Form.Item>
          <Form.Item label="Provider" name="provider" rules={[{ required: true, message: '请输入 Provider' }]}>
            <Input placeholder="如 local / api" />
          </Form.Item>
          <Form.Item label="模型名称" name="modelName" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input placeholder="请输入模型名称" />
          </Form.Item>
          <Form.Item label="Base URL" name="baseUrl">
            <Input placeholder="请输入 Base URL" />
          </Form.Item>
          <Form.Item label="API Key" name="apiKey">
            <Input.Password placeholder="请输入 API Key" />
          </Form.Item>
          <Form.Item label="Timeout" name="timeout">
            <Input placeholder="请输入超时时间" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default ModelCenterModals;
