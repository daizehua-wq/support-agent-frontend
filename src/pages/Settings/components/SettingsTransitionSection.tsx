import { Button, Card, Col, Form, Input, Row, Select, Space } from 'antd';
import type { FormInstance } from 'antd';

type SettingsTransitionSectionProps = {
  modelForm: FormInstance;
  strategyForm: FormInstance;
  databaseForm: FormInstance;
  defaultModelValues: Record<string, unknown>;
  defaultStrategyValues: Record<string, unknown>;
  defaultDatabaseValues: Record<string, unknown>;
  currentDefaultModelLabel: string;
  watchedAnalyzeStrategy: string;
  watchedSearchStrategy: string;
  watchedScriptStrategy: string;
  watchedDatabaseName: string;
  watchedDatabaseType: string;
  databaseTypeOptions: Array<{ label: string; value: string }>;
  onViewModelCenter: () => void;
  onTestModelConnection: () => void;
  onSaveStrategySettings: () => void;
  onResetStrategySettings: () => void;
  onSaveDatabaseSettings: () => void;
  onTestDatabaseConnection: () => void;
};

function SettingsTransitionSection({
  modelForm,
  strategyForm,
  databaseForm,
  defaultModelValues,
  defaultStrategyValues,
  defaultDatabaseValues,
  currentDefaultModelLabel,
  watchedAnalyzeStrategy,
  watchedSearchStrategy,
  watchedScriptStrategy,
  watchedDatabaseName,
  watchedDatabaseType,
  databaseTypeOptions,
  onViewModelCenter,
  onTestModelConnection,
  onSaveStrategySettings,
  onResetStrategySettings,
  onSaveDatabaseSettings,
  onTestDatabaseConnection,
}: SettingsTransitionSectionProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <Card title="调试 / 过渡配置区｜模型层（非主入口）" style={{ borderRadius: 12 }}>
          <Form form={modelForm} layout="vertical" initialValues={defaultModelValues}>
            <Card size="small" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ fontWeight: 600, color: '#262626' }}>模型层当前只保留串联与反馈</div>
                <div style={{ color: '#595959', lineHeight: 1.8 }}>当前默认模型：{currentDefaultModelLabel}</div>
                <div style={{ color: '#595959', lineHeight: 1.8 }}>
                  模块绑定关系：Analyze / Search / Script 已在上方摘要区展示。这里不再作为首屏配置区，只保留联调与过渡期承接能力。
                </div>
                <Space wrap>
                  <Button onClick={onViewModelCenter}>前往 ModelCenter</Button>
                  <Button onClick={onTestModelConnection}>测试默认模型连接</Button>
                </Space>
              </Space>
            </Card>
          </Form>
        </Card>
      </Col>

      <Col xs={24}>
        <Card title="调试 / 过渡配置区｜模块策略（非主入口）" style={{ borderRadius: 12 }}>
          <Form form={strategyForm} layout="vertical" initialValues={defaultStrategyValues}>
            <Card size="small" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ fontWeight: 600, color: '#262626' }}>模块策略当前只保留说明与过渡承接</div>
                <div style={{ color: '#595959', lineHeight: 1.8 }}>
                  当前策略摘要：{watchedAnalyzeStrategy} / {watchedSearchStrategy} / {watchedScriptStrategy}
                </div>
                <div style={{ color: '#595959', lineHeight: 1.8 }}>
                  这里不再作为长期主配置区。模块策略当前先保留说明与过渡期设置能力，后续由治理页统一承接。
                </div>
                <Space wrap>
                  <Button onClick={onSaveStrategySettings}>保存当前模块策略</Button>
                  <Button onClick={onResetStrategySettings}>恢复默认</Button>
                </Space>
              </Space>
            </Card>
          </Form>
        </Card>
      </Col>

      <Col xs={24}>
        <Card title="平台底座后续预留（次级区）" style={{ borderRadius: 12 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card size="small" title="模型层" style={{ borderRadius: 12, background: '#fafafa' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ color: '#262626', fontWeight: 600 }}>未来落点</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>
                    默认模型、模块绑定模型、模型池、启停与测试连接统一收在 Settings 中，先以最小结构预留，不马上做大后台。
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card size="small" title="Prompt / Assistant" style={{ borderRadius: 12, background: '#fafafa' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ color: '#262626', fontWeight: 600 }}>未来落点</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>
                    AssistantProfile、模块 Prompt、版本信息和策略边界先由 Settings 与 AssistantCenter 共同承接，当前先把入口和说明收清楚。
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card size="small" title="数据接入与安全" style={{ borderRadius: 12, background: '#fafafa' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ color: '#262626', fontWeight: 600 }}>未来落点</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>
                    数据库、文件 / 知识资料接入、脱敏出网、本地留存和追溯说明统一放在 Settings，先预留分区，不立即做复杂配置台。
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24}>
        <Card title="数据接入与安全（后续预留）" style={{ borderRadius: 12 }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ color: '#262626', fontWeight: 600 }}>当前阶段统一降权展示</div>
            <div style={{ color: '#595959', lineHeight: 1.8 }}>
              数据库接入、文件 / 知识资料接入、出网 / 留存 / 追溯说明当前统一归入“后续预留区”。这里后续只保留最小说明与联调入口，不再作为 Settings 首屏配置主体。
            </div>

            <Card size="small" title="数据库接入（后续预留）" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Form form={databaseForm} layout="vertical" initialValues={defaultDatabaseValues}>
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库类型" name="databaseType">
                      <Select options={databaseTypeOptions} placeholder="请选择数据库类型" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库地址" name="host">
                      <Input placeholder="请输入数据库地址" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库端口" name="port">
                      <Input placeholder="请输入数据库端口" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={[16, 0]}>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库名称" name="databaseName">
                      <Input placeholder="请输入数据库名称" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库用户名" name="username">
                      <Input placeholder="请输入数据库用户名" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="数据库密码" name="password">
                      <Input.Password placeholder="请输入数据库密码" />
                    </Form.Item>
                  </Col>
                </Row>

                <Space wrap>
                  <Button type="primary" onClick={onSaveDatabaseSettings}>
                    保存数据库设置
                  </Button>
                  <Button onClick={onTestDatabaseConnection}>测试连接</Button>
                </Space>

                <Card size="small" style={{ marginTop: 16, borderRadius: 12, background: '#ffffff' }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div style={{ fontWeight: 600, color: '#262626' }}>数据库接入最小结构说明</div>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      当前这里只保留数据库接入的最小结构：数据源类型、连接地址、库名、账号、测试连接与保存。后续如果平台底座继续平台化，再扩展数据源状态、最近连接结果和更多连接说明，但当前不做复杂数据接入后台。
                    </div>
                    <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                      当前数据库：{watchedDatabaseName} / {watchedDatabaseType}
                    </div>
                  </Space>
                </Card>
              </Form>
            </Card>

            <Card size="small" title="文件 / 知识资料接入（后续预留）" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Card size="small" title="文件接入入口" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      后续这里承接本地文件接入入口，先只明确入口位置，不扩文件管理后台。
                    </div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small" title="知识资料源说明" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      后续这里承接知识资料源说明与接入状态，先只做说明型结构，不做复杂源管理 UI。
                    </div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small" title="业务页使用落点" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      Search / Session / Output 页未来只读展示当前引用的资料来源，这里先作为总入口预留。
                    </div>
                  </Card>
                </Col>
              </Row>
            </Card>

            <Card size="small" title="出网 / 留存 / 追溯说明（后续预留）" style={{ borderRadius: 12, background: '#fafafa' }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Card size="small" title="出网判定说明" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      当前先说明哪些结果允许出网、哪些仅本地留存，不做复杂规则配置台。
                    </div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small" title="本地留存说明" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      当前先说明本地留存与内部参考的边界，后续再决定是否扩更多策略配置。
                    </div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small" title="日志 / 追溯最小展示" style={{ borderRadius: 12, background: '#ffffff' }}>
                    <div style={{ color: '#595959', lineHeight: 1.8 }}>
                      当前只适合做说明与最小展示：最近执行、当前策略、当前结论，不做日志后台。
                    </div>
                  </Card>
                </Col>
              </Row>
            </Card>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

export default SettingsTransitionSection;
