import { Card, Space, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
  QuestionCircleFilled,
  WarningFilled,
} from '@ant-design/icons';
import type { ExecutionContextSummary, DataSourceStatus, PlannerStatus } from '../../types/taskPlan';

type ExecutionContextCardProps = {
  context: ExecutionContextSummary;
};

const DATA_STATUS_ICON: Record<DataSourceStatus, React.ReactNode> = {
  healthy: <CheckCircleFilled style={{ color: '#22c55e' }} />,
  degraded: <WarningFilled />,
  unavailable: <CloseCircleFilled style={{ color: '#ef4444' }} />,
  disabled: <MinusCircleFilled style={{ color: '#94a3b8' }} />,
  unknown: <QuestionCircleFilled style={{ color: '#94a3b8' }} />,
};

const DATA_STATUS_LABEL: Record<DataSourceStatus, string> = {
  healthy: '正常',
  degraded: '降级',
  unavailable: '不可用',
  disabled: '已禁用',
  unknown: '未知',
};

const PLANNER_STATUS_CONFIG: Record<PlannerStatus, { color: string; label: string }> = {
  ready: { color: 'green', label: '就绪' },
  degraded: { color: 'orange', label: '降级' },
  unavailable: { color: 'red', label: '不可用' },
  unknown: { color: 'default', label: '未知' },
};

function ExecutionContextCard({ context }: ExecutionContextCardProps) {
  const plannerCfg = PLANNER_STATUS_CONFIG[context.taskPlanner.status];

  return (
    <Card className="ap-execution-context" size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
        执行上下文
      </Typography.Text>

      <div className="ap-execution-context__grid">
        <div className="ap-execution-context__item">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Assistant
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {context.assistantName}
          </Typography.Text>
          <Tag style={{ fontSize: 11, marginLeft: 0, marginTop: 2 }}>
            {context.assistantSource === 'global_default' ? '全局默认' : context.assistantSource}
          </Tag>
        </div>

        <div className="ap-execution-context__item">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            大模型
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {context.modelName}
          </Typography.Text>
        </div>

        <div className="ap-execution-context__item">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            任务规划器
          </Typography.Text>
          <Tag color={plannerCfg.color} style={{ fontSize: 11, marginLeft: 0, marginTop: 2 }}>
            {plannerCfg.label}
          </Tag>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          资料数据源
        </Typography.Text>
        <Space wrap size={[4, 4]}>
          {context.dataSources.map((ds) => (
            <Tag key={ds.name} icon={DATA_STATUS_ICON[ds.status]} style={{ fontSize: 11 }}>
              {ds.name} · {DATA_STATUS_LABEL[ds.status]}
            </Tag>
          ))}
        </Space>
      </div>
    </Card>
  );
}

export default ExecutionContextCard;
