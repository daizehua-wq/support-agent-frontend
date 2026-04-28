import { Button, Modal, Space, Typography } from 'antd';
import type { TaskStepExecution } from '../../types/taskPlan';

type StepFailureModalProps = {
  open: boolean;
  failedStep: TaskStepExecution | null;
  onRetry: () => void;
  onSkipExternal: () => void;
  onContinueLimited: () => void;
  onBackToPlan: () => void;
  onKeepProgress: () => void;
  loading?: boolean;
};

type FailureConfig = {
  title: string;
  description: string;
  retryLabel: string;
  canSkipExternal: boolean;
  skipExternalLabel?: string;
  canContinueLimited: boolean;
  continueLimitedLabel?: string;
  canBackToPlan: boolean;
};

const FAILURE_CONFIG: Record<string, FailureConfig> = {
  external_source: {
    title: '外部资料源不可用',
    description:
      '该失败仅影响外部资料补充，不影响内部知识库和 Reference Pack 的使用。你可以跳过外部资料源继续执行，但最终 Output 会标记为"外部源降级"。',
    retryLabel: '重试外部源',
    canSkipExternal: true,
    skipExternalLabel: '跳过外部源继续',
    canContinueLimited: false,
    canBackToPlan: false,
  },
  internal_knowledge: {
    title: '内部知识库检索失败',
    description:
      '该资料源属于核心上下文来源，不建议跳过。建议重试，或保留当前进度后稍后继续。',
    retryLabel: '重试该步骤',
    canSkipExternal: false,
    canContinueLimited: false,
    canBackToPlan: false,
  },
  analysis: {
    title: '分析步骤失败',
    description:
      '该步骤用于理解任务目标和组织执行计划，不能跳过。建议重试，或保留当前进度后稍后继续。',
    retryLabel: '重试 Analysis',
    canSkipExternal: false,
    canContinueLimited: false,
    canBackToPlan: false,
  },
  output: {
    title: '输出生成失败',
    description:
      '已完成的分析结果和证据资料不会丢失。你可以重试生成，或返回工作台修改任务计划。',
    retryLabel: '重试生成',
    canSkipExternal: false,
    canContinueLimited: false,
    canBackToPlan: true,
  },
  save: {
    title: '保存历史任务失败',
    description:
      '当前页面中的结果已暂存，但尚未成功写入历史任务。建议重试保存。',
    retryLabel: '重试保存',
    canSkipExternal: false,
    canContinueLimited: false,
    canBackToPlan: false,
  },
  external_dependency_high_risk: {
    title: '该任务依赖外部企业信息',
    description:
      '外部资料源当前不可用。继续执行将缺少关键外部依据，Output 会标记为高风险。',
    retryLabel: '重试外部源',
    canSkipExternal: false,
    canContinueLimited: true,
    continueLimitedLabel: '基于有限资料继续',
    canBackToPlan: false,
  },
};

function StepFailureModal({
  open,
  failedStep,
  onRetry,
  onSkipExternal,
  onContinueLimited,
  onBackToPlan,
  onKeepProgress,
  loading = false,
}: StepFailureModalProps) {
  if (!failedStep || !failedStep.failureKind) return null;

  const config: FailureConfig = FAILURE_CONFIG[failedStep.failureKind] || FAILURE_CONFIG.analysis;

  return (
    <Modal
      title={config.title}
      open={open}
      footer={null}
      closable
      onCancel={onKeepProgress}
      centered
      width={480}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
        {config.description}
      </Typography.Paragraph>

      {failedStep.failureReason && (
        <div style={{ padding: 14, borderRadius: 16, background: 'rgba(239, 68, 68, 0.06)', marginBottom: 20 }}>
          <Typography.Text type="danger" style={{ fontSize: 13 }}>
            {failedStep.failureReason}
          </Typography.Text>
        </div>
      )}

      <Space direction="vertical" style={{ width: '100%' }}>
        <Button type="primary" block onClick={onRetry} loading={loading}>
          {config.retryLabel}
        </Button>

        {config.canSkipExternal && config.skipExternalLabel && (
          <Button block onClick={onSkipExternal}>
            {config.skipExternalLabel}
          </Button>
        )}

        {config.canContinueLimited && config.continueLimitedLabel && (
          <Button block onClick={onContinueLimited}>
            {config.continueLimitedLabel}
          </Button>
        )}

        {config.canBackToPlan && (
          <Button block onClick={onBackToPlan}>
            返回工作台修改计划
          </Button>
        )}

        <Button block onClick={onKeepProgress}>
          {failedStep.failureKind === 'save' ? '暂存当前页面' : '保留进度'}
        </Button>
      </Space>
    </Modal>
  );
}

export default StepFailureModal;
