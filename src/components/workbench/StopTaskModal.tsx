import { Modal, Typography } from 'antd';

type StopTaskModalProps = {
  open: boolean;
  mode: 'workbench' | 'output';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

const CONFIG: Record<'workbench' | 'output', { title: string; description: string; okText: string; cancelText: string }> = {
  workbench: {
    title: '停止任务？',
    description:
      '当前任务正在执行。停止后，已完成步骤会保存，未完成步骤不会丢失。任务会进入"可继续"状态，你可以稍后从历史任务继续推进。',
    okText: '停止并保存进度',
    cancelText: '继续执行',
  },
  output: {
    title: '停止生成新版本？',
    description:
      '这只会取消当前新版本生成，不会取消整个任务，也不会影响已有 Output 版本。',
    okText: '停止生成新版本',
    cancelText: '继续生成',
  },
};

function StopTaskModal({ open, mode, onConfirm, onCancel, loading = false }: StopTaskModalProps) {
  const cfg = CONFIG[mode] || CONFIG.workbench;

  return (
    <Modal
      title={cfg.title}
      open={open}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText={cfg.okText}
      cancelText={cfg.cancelText}
      okButtonProps={{ danger: true }}
      centered
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7 }}>
        {cfg.description}
      </Typography.Paragraph>
    </Modal>
  );
}

export default StopTaskModal;
