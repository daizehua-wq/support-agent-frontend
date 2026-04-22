import { Alert, Button, Card, Col, Form, InputNumber, Row, Select, Space, Switch } from 'antd';
import type { FormInstance } from 'antd';

import type { WorkflowReleaseRouteOption } from '../../../api/settings';

type SettingsWorkflowReleaseSectionProps = {
  workflowReleaseForm: FormInstance;
  routeOptions: WorkflowReleaseRouteOption[];
  onSaveWorkflowReleaseSettings: () => void;
  onResetWorkflowReleaseSettings: () => void;
  onRefreshWorkflowReleaseOptions: () => void;
};

function SettingsWorkflowReleaseSection({
  workflowReleaseForm,
  routeOptions,
  onSaveWorkflowReleaseSettings,
  onResetWorkflowReleaseSettings,
  onRefreshWorkflowReleaseOptions,
}: SettingsWorkflowReleaseSectionProps) {
  return (
    <Card title="工作流灰度发布 / 回滚控制" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="发布控制说明"
          description="这里的配置会覆盖插件 manifest 的 release 策略。trafficPercent=0 表示全量走稳定插件；打开 rollbackOnError 可在灰度失败后自动回滚。"
        />

        <Form form={workflowReleaseForm} layout="vertical">
          <Row gutter={[16, 16]}>
            {routeOptions.map((routeOption) => {
              const routeKey = routeOption.routeKey;
              const candidateOptions = routeOption.candidates.map((item) => ({
                label: `${item.displayName} (${item.pluginId})`,
                value: item.pluginId,
              }));

              return (
                <Col xs={24} key={routeKey}>
                  <Card
                    size="small"
                    title={routeOption.displayName || `${routeOption.kind} / ${routeOption.route}`}
                    style={{ borderRadius: 12, background: '#fafafa' }}
                  >
                    <Form.Item name={['routes', routeKey, 'kind']} hidden>
                      <input />
                    </Form.Item>
                    <Form.Item name={['routes', routeKey, 'route']} hidden>
                      <input />
                    </Form.Item>
                    <Form.Item name={['routes', routeKey, 'displayName']} hidden>
                      <input />
                    </Form.Item>

                    <Row gutter={[16, 0]}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          label="稳定插件"
                          name={['routes', routeKey, 'stablePluginId']}
                          rules={[{ required: true, message: '请选择稳定插件' }]}
                        >
                          <Select options={candidateOptions} placeholder="请选择稳定插件" />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item label="灰度插件" name={['routes', routeKey, 'canaryPluginId']}>
                          <Select
                            allowClear
                            options={candidateOptions}
                            placeholder="可选；不选表示该路由不灰度"
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={[16, 0]}>
                      <Col xs={24} md={8}>
                        <Form.Item
                          label="灰度流量比例 (%)"
                          name={['routes', routeKey, 'trafficPercent']}
                          rules={[{ required: true, message: '请输入灰度比例' }]}
                        >
                          <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={8}>
                        <Form.Item
                          label="分桶依据"
                          name={['routes', routeKey, 'bucketBy']}
                          rules={[{ required: true, message: '请选择分桶依据' }]}
                        >
                          <Select
                            options={[
                              { label: 'sessionId（推荐）', value: 'sessionId' },
                              { label: 'requestHash', value: 'requestHash' },
                            ]}
                            placeholder="请选择分桶依据"
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={4}>
                        <Form.Item
                          label="启用灰度"
                          name={['routes', routeKey, 'enabled']}
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={4}>
                        <Form.Item
                          label="失败自动回滚"
                          name={['routes', routeKey, 'rollbackOnError']}
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={[16, 0]}>
                      <Col xs={24} md={4}>
                        <Form.Item
                          label="健康守护"
                          name={['routes', routeKey, 'guardEnabled']}
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          label="最小样本"
                          name={['routes', routeKey, 'minSampleSize']}
                          rules={[{ required: true, message: '请输入最小样本' }]}
                        >
                          <InputNumber min={1} max={10000} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          label="最大错误率 (%)"
                          name={['routes', routeKey, 'maxErrorRatePercent']}
                          rules={[{ required: true, message: '请输入错误率阈值' }]}
                        >
                          <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          label="P95 延迟阈值 (ms)"
                          name={['routes', routeKey, 'maxP95LatencyMs']}
                          rules={[{ required: true, message: '请输入延迟阈值' }]}
                        >
                          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                      可选插件数：{routeOption.candidates.length}，当前路由键：{routeKey}
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Form>

        <Space wrap>
          <Button type="primary" onClick={onSaveWorkflowReleaseSettings}>
            保存发布控制
          </Button>
          <Button onClick={onResetWorkflowReleaseSettings}>恢复默认发布策略</Button>
          <Button onClick={onRefreshWorkflowReleaseOptions}>刷新候选插件</Button>
        </Space>
      </Space>
    </Card>
  );
}

export default SettingsWorkflowReleaseSection;
