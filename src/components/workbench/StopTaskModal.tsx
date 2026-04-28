import { Modal, Typography } from 'antd';

type StopTaskModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

function StopTaskModal({ open, onConfirm, onCancel, loading = false }: StopTaskModalProps) {
  return (
    <Modal
      title="停止并保存进度"
      open={open}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="停止并保存进度"
      cancelText="继续执行"
      okButtonProps={{ danger: true }}
      centered
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7 }}>
        当前任务将被停止，已完成的步骤进度会保留。你可以稍后从历史任务中继续执行。
      </Typography.Paragraph>
    </Modal>
  );
}

export default StopTaskModal;
