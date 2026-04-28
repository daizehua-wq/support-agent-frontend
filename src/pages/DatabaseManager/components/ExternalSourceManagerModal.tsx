import { Alert, Collapse, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';

import {
  buildExternalProviderTemplateFormValues,
  externalAuthTypeOptions,
  externalCapabilityOptions,
  externalSourceCategoryOptions,
  externalOutboundPolicyOptions,
  externalSourceTypeOptions,
  getDefaultProviderTemplateId,
  getExternalProviderOptions,
  getExternalProviderTemplate,
  isExternalSourceCustomApi,
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
  const sourceCategory = Form.useWatch('sourceCategory', form) || 'authoritative_database';
  const providerTemplate = Form.useWatch('providerTemplate', form) || 'qichacha';
  const selectedTemplate = getExternalProviderTemplate(providerTemplate);
  const isCustomApi = isExternalSourceCustomApi(providerTemplate, sourceCategory);
  const needsSecretKey = selectedTemplate?.requiresSecretKey === true;
  const providerOptions = getExternalProviderOptions(sourceCategory);

  const applyProviderTemplate = (templateId: string) => {
    form.setFieldsValue(buildExternalProviderTemplateFormValues(templateId));
  };

  const handleSourceCategoryChange = (category: string) => {
    const nextTemplateId = getDefaultProviderTemplateId(category);
    applyProviderTemplate(nextTemplateId);
  };

  return (
    <Modal
      title={mode === 'create' ? '新增外部数据源接入位' : '编辑外部数据源接入位'}
      open={open}
      onOk={onSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnHidden
      width={760}
    >
      <Form form={form} layout="vertical">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="先选择服务商，系统会自动套用 provider / sourceType / API 地址等模板；普通模式只需要填写密钥和调用策略。"
        />

        <Form.Item
          label="数据源类型"
          name="sourceCategory"
          rules={[{ required: true, message: '请选择数据源类型' }]}
        >
          <Select
            options={externalSourceCategoryOptions}
            onChange={handleSourceCategoryChange}
            placeholder="请选择数据源类型"
          />
        </Form.Item>

        <Form.Item
          label="服务商"
          name="providerTemplate"
          rules={[{ required: true, message: '请选择服务商' }]}
        >
          <Select
            options={providerOptions}
            onChange={applyProviderTemplate}
            placeholder="请选择服务商"
          />
        </Form.Item>

        <Form.Item
          label="数据源名称"
          name="name"
          rules={[{ required: true, message: '请输入名称' }]}
        >
          <Input placeholder={selectedTemplate?.normalName || '如 企查查'} />
        </Form.Item>

        {(authType === 'api-key' || authType === 'bearer') && (
          <Form.Item
            label={authType === 'bearer' ? 'Bearer Token' : 'API Key'}
            name="apiKey"
            rules={
              mode === 'create' && authType !== 'basic'
                ? [{ required: true, message: '请输入 API Key' }]
                : []
            }
            extra={mode === 'edit' ? '留空则保持当前密钥不变。' : '密钥会进入本机专用密钥托管，不写入 Git。'}
          >
            <Input.Password placeholder="请输入 API Key" />
          </Form.Item>
        )}

        {needsSecretKey ? (
          <Form.Item
            label="Secret Key"
            name="secretKey"
            extra={mode === 'edit' ? '留空则保持当前 Secret Key 不变。' : '企查查等权威数据库通常需要 Secret Key。'}
          >
            <Input.Password placeholder="请输入 Secret Key" />
          </Form.Item>
        ) : null}

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

        <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>

        <Form.Item label="缓存时间（小时）" name="cacheTtlHours" initialValue={24}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="每日调用上限" name="callQuota" initialValue={0} extra="0 表示暂不限制。">
          <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="可选" />
        </Form.Item>

        <Form.Item
          label="是否允许用于外发资料"
          name="allowExternalOutput"
          valuePropName="checked"
          initialValue={false}
        >
          <Switch />
        </Form.Item>

        {!isCustomApi ? (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${selectedTemplate?.label || '当前服务商'} 将按 ${selectedTemplate?.sourceType === 'paid_api' ? '权威数据库' : '互联网搜索'} 模板保存`}
            description={
              selectedTemplate?.value === 'qichacha'
                ? '企查查会固定保存为 paid_api / P1，并通过 Search 资料治理链路进入 evidence 与 referencePack。'
                : '底层 provider、sourceType、Base URL、API Path 会由模板自动带入。'
            }
          />
        ) : null}

        <Collapse
          key={isCustomApi ? 'custom-api' : 'provider-template'}
          ghost
          defaultActiveKey={isCustomApi ? ['advanced'] : []}
          items={[
            {
              key: 'advanced',
              label: isCustomApi ? '底层字段配置' : '高级配置',
              children: (
                <>
                  <Form.Item label="供应商名称" name="providerName">
                    <Input placeholder="如 企查查 / Tavily / 自定义供应商" />
                  </Form.Item>
                  <Form.Item label="provider" name="provider">
                    <Input placeholder="如 qichacha / tavily / custom_api" />
                  </Form.Item>
        <Form.Item
          label="内部数据源类型"
          name="sourceType"
          rules={[{ required: true, message: '请选择数据源类型' }]}
        >
                    <Select
                      options={externalSourceTypeOptions}
                      placeholder="请选择数据源类型"
                      disabled={providerTemplate === 'qichacha'}
                    />
        </Form.Item>
        <Form.Item
          label="认证方式"
          name="authType"
          rules={[{ required: true, message: '请选择认证方式' }]}
        >
          <Select options={externalAuthTypeOptions} placeholder="请选择认证方式" />
        </Form.Item>
        <Form.Item label="Base URL" name="baseUrl">
          <Input placeholder="如 https://vendor.example.com" />
        </Form.Item>
        <Form.Item label="API Path" name="apiPath">
          <Input placeholder="如 /v1/search /dataset/query" />
        </Form.Item>
        <Form.Item label="请求方法" name="method" initialValue="GET">
          <Select
            options={[
              { label: 'GET', value: 'GET' },
              { label: 'POST', value: 'POST' },
            ]}
          />
        </Form.Item>
        <Form.Item label="查询参数名" name="queryParam" initialValue="q">
          <Input placeholder="如 q / query / keyword" />
        </Form.Item>
        <Form.Item label="数量参数名" name="limitParam" initialValue="limit">
          <Input placeholder="如 limit / count / pageSize" />
        </Form.Item>
        <Form.Item label="默认返回数量" name="defaultLimit" initialValue={5}>
          <InputNumber min={1} max={50} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="时效范围" name="freshness" initialValue="month">
          <Select
            options={[
              { label: '不限', value: 'all' },
              { label: '近一天', value: 'day' },
              { label: '近一周', value: 'week' },
              { label: '近一月', value: 'month' },
              { label: '近一年', value: 'year' },
            ]}
          />
        </Form.Item>
        <Form.Item label="优先级" name="priority" initialValue="P3">
          <Select
            options={['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((value) => ({
              label: value,
              value,
            }))}
          />
        </Form.Item>
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
        <Form.Item label="阻止访问域名" name="blockedDomains">
          <Select
            mode="tags"
            tokenSeparators={[',', ' ']}
            placeholder="如 blocked.example.com"
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
          label="外部可访问"
          name="externalAvailable"
          valuePropName="checked"
          initialValue={true}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          label="审计保留原始数据"
          name="retainRaw"
          valuePropName="checked"
          initialValue={false}
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
                  <Form.Item label="Header 配置" name="headersConfig">
                    <Input.TextArea rows={3} placeholder='如 {"X-Token": "${apiKey}"}' />
                  </Form.Item>
                  <Form.Item label="返回字段映射" name="fieldMappings">
                    <Input.TextArea rows={3} placeholder='如 {"title": "name", "summary": "description"}' />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
        <Form.Item label="备注" name="notes">
          <Input.TextArea
            rows={4}
            placeholder="如 仅允许查询公开工商信息；禁止上传本地文档内容。"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ExternalSourceManagerModal;
