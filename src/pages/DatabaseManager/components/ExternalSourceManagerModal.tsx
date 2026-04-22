import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';

import {
  externalAuthTypeOptions,
  externalCapabilityOptions,
  externalOutboundPolicyOptions,
  externalSourceTypeOptions,
} from '../helpers';

type ExternalSourceManagerModalProps = {
  open: boolean;
  loading: boolean;
  form: FormInstance;
  mode: 'create' | 'edit';
  onSubmit: () => void;
  onCancel: () => void;
};

function ExternalSourceManagerModal({
  open,
  loading,
  form,
  mode,
  onSubmit,
  onCancel,
}: ExternalSourceManagerModalProps) {
  const authType = Form.useWatch('authType', form) || 'none';

  return (
    <Modal
      title={mode === 'create' ? '新增外部数据源接入位' : '编辑外部数据源接入位'}
      open={open}
      onOk={onSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: '请输入名称' }]}
        >
          <Input placeholder="如 商业检索 API / 行业数据库 / 政务公开数据源" />
        </Form.Item>
        <Form.Item label="供应商" name="providerName">
          <Input placeholder="如 Vendor Search / 企业数据服务商 / 政务公开平台" />
        </Form.Item>
        <Form.Item
          label="数据源类型"
          name="sourceType"
          rules={[{ required: true, message: '请选择数据源类型' }]}
        >
          <Select options={externalSourceTypeOptions} placeholder="请选择数据源类型" />
        </Form.Item>
        <Form.Item
          label="认证方式"
          name="authType"
          rules={[{ required: true, message: '请选择认证方式' }]}
        >
          <Select options={externalAuthTypeOptions} placeholder="请选择认证方式" />
        </Form.Item>
        <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>
        <Form.Item label="Base URL" name="baseUrl">
          <Input placeholder="如 https://vendor.example.com" />
        </Form.Item>
        <Form.Item label="API Path" name="apiPath">
          <Input placeholder="如 /v1/search /dataset/query" />
        </Form.Item>
        {(authType === 'api-key' || authType === 'bearer') && (
          <Form.Item
            label={authType === 'bearer' ? 'Bearer Token' : 'API Key'}
            name="apiKey"
            extra={
              mode === 'edit'
                ? '留空则保持当前密钥不变。'
                : '保存后会进入专用密钥托管，并供 Python Runtime 调用。'
            }
          >
            <Input.Password placeholder="请输入密钥" />
          </Form.Item>
        )}
        {authType === 'basic' && (
          <>
            <Form.Item label="用户名" name="username">
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item label="密码" name="password" extra={mode === 'edit' ? '留空则保持当前密码不变。' : undefined}>
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          </>
        )}
        <Form.Item label="能力" name="capabilities">
          <Select
            mode="multiple"
            options={externalCapabilityOptions}
            placeholder="选择后续可能开放的能力"
          />
        </Form.Item>
        <Form.Item
          label="允许访问域名"
          name="allowedDomains"
          extra="用于后续真正接供应商时的 allowlist。"
        >
          <Select
            mode="tags"
            tokenSeparators={[',', ' ']}
            placeholder="如 vendor.example.com"
          />
        </Form.Item>
        <Form.Item
          label="仅公开数据"
          name="publicDataOnly"
          valuePropName="checked"
          initialValue={true}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          label="本地数据外发策略"
          name="localDataOutboundPolicy"
          initialValue="blocked"
        >
          <Select options={externalOutboundPolicyOptions} />
        </Form.Item>
        <Form.Item label="备注" name="notes">
          <Input.TextArea
            rows={4}
            placeholder="如 仅允许查询公开工商信息；禁止上传本地文档内容；后续走 Python Runtime 联调。"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ExternalSourceManagerModal;
