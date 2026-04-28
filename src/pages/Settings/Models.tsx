import { Card, Typography } from 'antd';
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PlannerModelCard from '../../components/settings/PlannerModelCard';
import ModelCenterPage from '../ModelCenter';

function SettingsModelsPage() {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 10 }} />
          大模型管理
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          管理默认大模型、模块绑定、fallback 规则，并查看任务规划器小模型状态。
        </Typography.Paragraph>
      </div>

      <PlannerModelCard
        planner={{
          status: 'ready',
          source: 'embedded-planner',
          modelName: 'gpt-4o-mini',
          lastCallCount: 142,
          successRate: 94.3,
          fallbackStrategy: '默认任务模板',
        }}
      />

      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
          <ThunderboltOutlined style={{ marginRight: 6 }} />
          任务规划器小模型
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          这里用于治理平台的大模型能力、模块绑定和 fallback 策略。
          任务规划器小模型作为独立能力展示，用于任务拆解、模块路由和结构化计划生成。
        </Typography.Text>
      </Card>

      <div style={{ marginTop: 18 }}>
        <ModelCenterPage />
      </div>
    </div>
  );
}

export default SettingsModelsPage;
