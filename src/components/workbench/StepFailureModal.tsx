import { Button, Modal, Space, Typography } from 'antd';
import type { StepFailureKind, TaskStepExecution } from '../../types/taskPlan';

type StepFailureModalProps = {
  open: boolean;
  failedStep: TaskStepExecution | null;
  onRetry: () => void;
  onSkipExternal: () => void;
  onBackToPlan: () => void;
  onKeepProgress: () => void;
  loading?: boolean;
};

const FAILURE_CONFIG: Record<StepFailureKind, { title: string; description: string; canSkipExternal: boolean; canBackToPlan: boolean }> = {
  external_source: {
    title: '外部资料源不可用',
    description: '外部资料源当前不可用。你可以重试该步骤、跳过外部源继续使用内部检索，或保留当前进度稍后继续。',
    canSkipExternal: true,
    canBackToPlan: false,
  },
  internal_knowledge: {
    title: '内部知识库检索失败',
    description: '内部知识库检索未返回有效结果。你可以重试该步骤，或保留当前进度稍后继续。',
    canSkipExternal: false,
    canBackToPlan: false,
  },
  analysis: {
    title: '分析步骤失败',
    description: '客户场景分析未返回有效结果。你可以重试分析步骤，或保留当前进度稍后继续。',
    canSkipExternal: false,
    canBackToPlan: false,
  },
  output: {
    title: '输出生成失败',
    description: '模型调用返回空响应或生成过程异常。你可以重试生成、返回计划确认重新开始，或保留当前进度。',
    canSkipExternal: false,
    canBackToPlan: true,
  },
  save: {
    title: '保存失败',
    description: '任务保存到历史记录时出现异常。你可以重试保存或暂存当前页面。',
    canSkipExternal: false,
    canBackToPlan: false,
  },
};

function StepFailureModal({
  open,
  failedStep,
  onRetry,
  onSkipExternal,
  onBackToPlan,
  onKeepProgress,
  loading = false,
}: StepFailureModalProps) {
  if (!failedStep || !failedStep.failureKind) return null;

  const config = FAILURE_CONFIG[failedStep.failureKind] || FAILURE_CONFIG.analysis;

  return (
    <Modal
      title={config.title}
      open={open}
      footer={null}
      closable
      onCancel={onKeepProgress}
      centered
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
        {config.description}
      </Typography.Paragraph>

      {failedStep.failureReason && (
        <div style={{ padding: 14, borderRadius: 16, background: 'rgba(239, 68, 68, 0.06)', marginBottom: 20 }}>
          <Typography.Text type="danger" style={{ fontSize: 13 }}>{failedStep.failureReason}</Typography.Text>
        </div>
      )}

      <Space direction="vertical" style={{ width: '100%' }}>
        <Button type="primary" block onClick={onRetry} loading={loading}>重试该步骤</Button>

        {config.canSkipExternal && (
          <Button block onClick={onSkipExternal}>跳过外部源继续</Button>
        )}

        {config.canBackToPlan && (
          <Button block onClick={onBackToPlan}>返回计划确认</Button>
        )}

        <Button block onClick={onKeepProgress}>保留进度</Button>
      </Space>
    </Modal>
  );
}

export default StepFailureModal;
