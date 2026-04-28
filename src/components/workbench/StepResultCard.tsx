import { Card, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { TaskStepExecution } from '../../types/taskPlan';

type StepResultCardProps = {
  step: TaskStepExecution;
};

const STATUS_LABEL: Record<string, string> = {
  done: '已完成',
  running: '执行中',
  failed: '失败',
  degraded: '降级',
};

function StepResultCard({ step }: StepResultCardProps) {
  return (
    <Card
      className="ap-step-card"
      size="small"
      styles={{ body: { padding: 18 } }}
    >
      <div className="ap-step-card__header">
        <Typography.Text strong style={{ fontSize: 15 }}>{step.title}</Typography.Text>
        <Tag
          color={
            step.status === 'done' ? 'green' :
            step.status === 'failed' ? 'red' :
            step.status === 'degraded' ? 'orange' :
            'processing'
          }
          icon={
            step.status === 'done' ? <CheckCircleFilled /> :
            step.status === 'failed' ? <CloseCircleFilled /> :
            step.status === 'degraded' ? <WarningFilled /> :
            <LoadingOutlined />
          }
        >
          {STATUS_LABEL[step.status] || step.status}
        </Tag>
      </div>

      {step.summary && (
        <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6 }}>
          {step.summary}
        </Typography.Paragraph>
      )}

      {step.durationMs !== undefined && step.status !== 'running' && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          耗时 {(step.durationMs / 1000).toFixed(1)}s
        </Typography.Text>
      )}

      {step.details && step.details.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {step.details.map((d, i) => (
            <Typography.Text key={i} type="secondary" style={{ display: 'block', fontSize: 12, lineHeight: 1.7 }}>
              · {d}
            </Typography.Text>
          ))}
        </div>
      )}

      {step.riskNotes && step.riskNotes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {step.riskNotes.map((r, i) => (
            <Tag key={i} color="warning" style={{ marginBottom: 4, fontSize: 11 }}>{r}</Tag>
          ))}
        </div>
      )}

      {step.failureReason && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 16, background: 'rgba(239, 68, 68, 0.06)' }}>
          <Typography.Text type="danger" style={{ fontSize: 13 }}>{step.failureReason}</Typography.Text>
        </div>
      )}

      {step.degradedReason && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 16, background: 'rgba(245, 158, 11, 0.06)' }}>
          <Typography.Text style={{ fontSize: 13, color: '#d97706' }}>{step.degradedReason}</Typography.Text>
        </div>
      )}
    </Card>
  );
}

export default StepResultCard;
