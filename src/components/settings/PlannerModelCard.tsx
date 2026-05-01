import { Button, Card, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, ThunderboltOutlined } from '@ant-design/icons';
import type { PlannerModelState } from '../../types/settingsCenter';

type PlannerModelCardProps = {
  planner: PlannerModelState;
  compact?: boolean;
};

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  ready: { color: 'green', icon: <CheckCircleFilled />, label: '就绪' },
  degraded: { color: 'orange', icon: <ExclamationCircleFilled />, label: '降级' },
  unavailable: { color: 'red', icon: <CloseCircleFilled />, label: '不可用' },
};

function PlannerModelCard({ planner, compact = false }: PlannerModelCardProps) {
  const st = STATUS_MAP[planner.status] || STATUS_MAP.unavailable;

  return (
    <Card className="ap-planner-model" size="small" styles={{ body: { padding: 20 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ThunderboltOutlined style={{ fontSize: 22, color: '#2563eb' }} />
        <Typography.Text strong style={{ fontSize: 15 }}>任务规划器小模型</Typography.Text>
        <Tag color={st.color} icon={st.icon} style={{ fontSize: 10 }}>{st.label}</Tag>
      </div>

      <div className="ap-planner-model__grid">
        <div className="ap-planner-model__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>当前来源</Typography.Text>
          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{planner.source}</Typography.Text>
        </div>
        <div className="ap-planner-model__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>模型</Typography.Text>
          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{planner.modelName}</Typography.Text>
        </div>
        <div className="ap-planner-model__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>最近调用</Typography.Text>
          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{planner.lastCallCount > 0 ? `${planner.lastCallCount} 次` : '暂无统计'}</Typography.Text>
        </div>
        <div className="ap-planner-model__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>成功率</Typography.Text>
          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{planner.successRate > 0 ? `${planner.successRate}%` : '暂无统计'}</Typography.Text>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>用途：任务拆解、模块路由、结构化计划</Typography.Text>
        <br />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>Fallback：{planner.fallbackStrategy}</Typography.Text>
      </div>

      {!compact && (
        <Space style={{ marginTop: 12 }}>
          <Button size="small">预热</Button>
          <Button size="small">查看状态</Button>
        </Space>
      )}
    </Card>
  );
}

export default PlannerModelCard;
