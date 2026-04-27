import { Button, Card, Col, Row, Space } from 'antd';
import ResolvedSummaryCard from '../../../components/card/ResolvedSummaryCard';

type DatabaseBindingSummary = {
  defaultAssociatedDatabase?: string;
  activeDatabaseId?: string;
  visibleDatabases?: string[];
};

type SettingsSummarySectionProps = {
  assistantId: string;
  promptId: string;
  promptVersion: string;
  strategyId: string;
  sourceSummary: string;
  versionLabel: string;
  databaseRelationSource: string;
  currentDefaultModelLabel: string;
  currentDatabaseName: string;
  currentDatabaseType: string;
  databaseBindingSummary: DatabaseBindingSummary | null;
  onViewModelCenter: () => void;
  onTestModelConnection: () => void;
  onViewDatabaseManager: () => void;
  onTestDatabaseConnection: () => void;
};

function SettingsSummarySection({
  assistantId,
  promptId,
  promptVersion,
  strategyId,
  sourceSummary,
  versionLabel,
  databaseRelationSource,
  currentDefaultModelLabel,
  currentDatabaseName,
  currentDatabaseType,
  databaseBindingSummary,
  onViewModelCenter,
  onTestModelConnection,
  onViewDatabaseManager,
  onTestDatabaseConnection,
}: SettingsSummarySectionProps) {
  return (
    <>
      <ResolvedSummaryCard
        title="当前默认激活摘要"
        assistantId={assistantId}
        promptId={promptId}
        promptVersion={promptVersion}
        strategyId={strategyId}
        source={sourceSummary}
        versionLabel={versionLabel}
        databaseRelationSource={databaseRelationSource}
      />

      <Card size="small" style={{ marginTop: 16, marginBottom: 24, borderRadius: 12, background: '#fafafa' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ fontWeight: 600, color: '#262626' }}>当前默认激活字段说明</div>
          <div style={{ color: '#595959', lineHeight: 1.8 }}>
            当前主口径已经接到治理注册表与状态摘要：Assistant ID、Prompt ID、Prompt 版本、默认策略、数据库关系来源都会按真实配置回传。
          </div>
          <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
            `primaryContract.settings / statusSummary / governanceSummary` 现在是 Settings 的主口径；旧大对象继续只做只读 compat，不再承接写入。
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="模型关系摘要" style={{ borderRadius: 12 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>默认模型：{currentDefaultModelLabel}</div>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>模块绑定：Analyze / Search / Script</div>
              <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                Settings 当前只负责展示系统怎么串起来；模型资源、默认模型、模块绑定与降级处理后续进入 ModelCenter 主页处理。
              </div>
              <Space wrap>
                <Button onClick={onViewModelCenter}>查看 ModelCenter</Button>
                <Button onClick={onTestModelConnection}>测试默认模型连接</Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="数据库关系摘要" style={{ borderRadius: 12 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                当前数据库：{currentDatabaseName} / {currentDatabaseType}
              </div>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                默认关联数据库：
                {databaseBindingSummary?.defaultAssociatedDatabase || databaseBindingSummary?.activeDatabaseId || '未返回'}
              </div>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                可见数据库：
                {(databaseBindingSummary?.visibleDatabases || []).join(' / ') || '未返回'}
              </div>
              <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                Settings 当前只负责展示数据库连接与系统串联状态；数据库列表、详情、健康状态和轻绑定关系后续进入 DatabaseManager 主页处理。
              </div>
              <Space wrap>
                <Button onClick={onViewDatabaseManager}>查看 DatabaseManager</Button>
                <Button onClick={onTestDatabaseConnection}>测试数据库连接</Button>
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="降级规则说明" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Card size="small" title="触发条件" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                模块绑定未命中、默认模型缺字段、目标模型不可用时，按降级策略处理。
              </div>
            </Card>
          </Col>

          <Col xs={24} md={6}>
            <Card size="small" title="降级顺序" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                优先模块绑定，其次默认模型；绑定失效时，按 default-local 或可用默认模型兜底。
              </div>
            </Card>
          </Col>

          <Col xs={24} md={6}>
            <Card size="small" title="页面提示" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                如果页面选择值与真实运行值不一致，运行页必须明确提示来源与回退原因。
              </div>
            </Card>
          </Col>

          <Col xs={24} md={6}>
            <Card size="small" title="trace 留痕" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                降级原因、解析链路与最终生效值应进入 trace / 留痕区，供联调与 QA 查看。
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </>
  );
}

export default SettingsSummarySection;
