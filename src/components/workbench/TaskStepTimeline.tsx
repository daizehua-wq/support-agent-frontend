import { Steps, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  FileSearchOutlined,
  FileTextOutlined,
  LoadingOutlined,
  MinusCircleFilled,
  SaveOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { TaskStepExecution } from '../../types/taskPlan';

const ICON_MAP: Record<string, React.ReactNode> = {
  analysis: <AuditOutlined />,
  evidence: <FileSearchOutlined />,
  output: <FileTextOutlined />,
  save: <SaveOutlined />,
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <MinusCircleFilled style={{ color: '#94a3b8' }} />,
  running: <LoadingOutlined style={{ color: '#2563eb' }} />,
  done: <CheckCircleFilled style={{ color: '#22c55e' }} />,
  failed: <CloseCircleFilled style={{ color: '#ef4444' }} />,
  degraded: <WarningFilled style={{ color: '#f59e0b' }} />,
  skipped: <MinusCircleFilled style={{ color: '#94a3b8' }} />,
};

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  done: '已完成',
  failed: '失败',
  degraded: '降级',
  skipped: '已跳过',
};

type TaskStepTimelineProps = {
  steps: TaskStepExecution[];
};

function TaskStepTimeline({ steps }: TaskStepTimelineProps) {
  return (
    <div className="ap-task-timeline">
      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={steps.map((step) => ({
          title: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>{step.title}</Typography.Text>
              <Tag
                color={
                  step.status === 'done' ? 'green' :
                  step.status === 'failed' ? 'red' :
                  step.status === 'degraded' ? 'orange' :
                  step.status === 'running' ? 'processing' :
                  'default'
                }
                style={{ fontSize: 11 }}
              >
                {STATUS_LABEL[step.status]}
              </Tag>
            </div>
          ),
          description:
            step.status !== 'pending' ? (
              <div style={{ fontSize: 12 }}>
                {step.summary && (
                  <Typography.Text type="secondary">{step.summary}</Typography.Text>
                )}
                {step.durationMs !== undefined && step.status !== 'running' && (
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    · {(step.durationMs / 1000).toFixed(1)}s
                  </Typography.Text>
                )}
              </div>
            ) : undefined,
          status:
            step.status === 'running' ? 'process' :
            step.status === 'failed' ? 'error' :
            ['done', 'degraded', 'skipped'].includes(step.status) ? 'finish' :
            'wait',
          icon: STATUS_ICON[step.status] || ICON_MAP[step.type],
        }))}
      />
    </div>
  );
}

export default TaskStepTimeline;
