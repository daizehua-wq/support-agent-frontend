import { Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch } from 'antd';
import type { FormInstance } from 'antd';

type SettingsPythonRuntimeSectionProps = {
  pythonRuntimeForm: FormInstance;
  defaultPythonRuntimeValues: Record<string, unknown>;
  localModelOptions: Array<{ label: string; value: string }>;
  localApiKeyConfigured: boolean;
  cloudApiKeyConfigured: boolean;
  onSavePythonRuntimeSettings: () => void;
  onResetPythonRuntimeSettings: () => void;
};

const routeOptions = [
  { label: '本地模型', value: 'local' },
  { label: '云端 API', value: 'cloud' },
];

function SettingsPythonRuntimeSection({
  pythonRuntimeForm,
  defaultPythonRuntimeValues,
  localModelOptions,
  localApiKeyConfigured,
  cloudApiKeyConfigured,
  onSavePythonRuntimeSettings,
  onResetPythonRuntimeSettings,
}: SettingsPythonRuntimeSectionProps) {
  return (
    <Card title="Python Runtime 混合路由配置" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Form form={pythonRuntimeForm} layout="vertical" initialValues={defaultPythonRuntimeValues}>
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label="启用 Python Runtime" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="严格模式（失败不回退 Node）" name="strictMode" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Runtime Base URL" name="baseUrl">
              <Input placeholder="http://127.0.0.1:8008" />
            </Form.Item>
          </Col>
        </Row>

        <Card
          size="small"
          title="Runtime 健康门禁（Health Gate）"
          style={{ marginBottom: 16, borderRadius: 12, background: '#fafafa' }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label="启用健康门禁" name={['healthGate', 'enabled']} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="严格门禁（故障阻断回退）" name={['healthGate', 'strictGate']} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="健康探针路径" name={['healthGate', 'checkPath']}>
                <Input placeholder="/health" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={6}>
              <Form.Item label="探针超时(ms)" name={['healthGate', 'timeoutMs']}>
                <InputNumber min={300} step={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="缓存 TTL(ms)" name={['healthGate', 'cacheTtlMs']}>
                <InputNumber min={0} step={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="连续失败阈值" name={['healthGate', 'maxConsecutiveFailures']}>
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="冷却窗口(ms)" name={['healthGate', 'cooldownMs']}>
                <InputNumber min={0} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card size="small" title="模型路由策略" style={{ marginBottom: 16, borderRadius: 12, background: '#fafafa' }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label="启用模块路由" name={['modelRouting', 'enabled']} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="启用失败回退"
                name={['modelRouting', 'fallbackEnabled']}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label="Analyze 路由" name={['modelRouting', 'moduleRoutes', 'analyze']}>
                <Select options={routeOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Search 路由" name={['modelRouting', 'moduleRoutes', 'search']}>
                <Select options={routeOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Script 路由" name={['modelRouting', 'moduleRoutes', 'script']}>
                <Select options={routeOptions} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card size="small" title="Local 通道（Ollama / 本地）" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Form.Item label="模型名" name={['channels', 'local', 'model']}>
                <Select
                  disabled={localModelOptions.length === 0}
                  options={localModelOptions}
                  placeholder={
                    localModelOptions.length > 0
                      ? '选择本机 Ollama 已存在模型'
                      : '未发现本地模型，请先在模型中心配置/测试'
                  }
                />
              </Form.Item>
              <Form.Item label="API Base" name={['channels', 'local', 'apiBase']}>
                <Input placeholder="http://127.0.0.1:11434" />
              </Form.Item>
              <Form.Item label="API Key（可选）" name={['channels', 'local', 'apiKey']}>
                <Input.Password
                  placeholder={localApiKeyConfigured ? '已配置，留空表示保持不变' : '未配置可留空'}
                />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card size="small" title="Cloud 通道（OpenAI / Azure）" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Form.Item label="模型名" name={['channels', 'cloud', 'model']}>
                <Input placeholder="gpt-4o-mini" />
              </Form.Item>
              <Form.Item label="API Base（可选）" name={['channels', 'cloud', 'apiBase']}>
                <Input placeholder="https://api.openai.com/v1" />
              </Form.Item>
              <Form.Item label="API Key" name={['channels', 'cloud', 'apiKey']}>
                <Input.Password
                  placeholder={cloudApiKeyConfigured ? '已配置，留空表示保持不变' : '请输入云端 API Key'}
                />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Space wrap style={{ marginTop: 16 }}>
          <Button type="primary" onClick={onSavePythonRuntimeSettings}>
            保存 Python Runtime 配置
          </Button>
          <Button onClick={onResetPythonRuntimeSettings}>恢复默认</Button>
        </Space>
      </Form>
    </Card>
  );
}

export default SettingsPythonRuntimeSection;
