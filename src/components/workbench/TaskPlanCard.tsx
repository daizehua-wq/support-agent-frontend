import { Card, Steps, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { TaskPlan } from '../../types/taskPlan';

const STEP_ICON_MAP: Record<string, React.ReactNode> = {
  analysis: <AuditOutlined />,
  evidence: <FileSearchOutlined />,
  output: <FileTextOutlined />,
  save: <SaveOutlined />,
};

type TaskPlanCardProps = {
  plan: TaskPlan;
};

function TaskPlanCard({ plan }: TaskPlanCardProps) {
  return (
    <Card className="ap-task-plan" styles={{ body: { padding: 24 } }}>
      <div className="ap-task-plan__header">
        <Tag color="processing">计划阶段 · 尚未执行</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
          当前只是任务计划，不是执行结果
        </Typography.Text>
      </div>

      <Typography.Title level={4} style={{ margin: '16px 0 8px' }}>
        {plan.taskTitle}
      </Typography.Title>

      <div className="ap-task-plan__sections">
        <div className="ap-task-plan__section">
          <Typography.Text strong>任务目标</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {plan.userGoal || '未指定'}
          </Typography.Paragraph>
        </div>

        <div className="ap-task-plan__section">
          <Typography.Text strong>系统理解</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {plan.understanding}
          </Typography.Paragraph>
        </div>

        <div className="ap-task-plan__section">
          <Typography.Text strong>计划步骤</Typography.Text>
          <Steps
            size="small"
            current={-1}
            style={{ marginTop: 8 }}
            items={plan.steps.map((step) => ({
              title: step.title,
              icon: STEP_ICON_MAP[step.type],
            }))}
          />
        </div>
      </div>

      {plan.riskHints.length > 0 && (
        <div className="ap-task-plan__risks">
          {plan.riskHints.map((hint, index) => (
            <Tag key={index} color="warning" style={{ marginBottom: 4 }}>
              {hint}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  );
}

export default TaskPlanCard;
