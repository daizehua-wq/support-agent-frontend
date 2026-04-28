import { Modal, Button, Space, Typography } from 'antd';
import {
  EditOutlined,
  ExportOutlined,
  FileAddOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

type ContinueTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onContinueOutput: () => void;
  onSupplementRegenerate: () => void;
  onEditGoal: () => void;
  onCloneTask: () => void;
};

function ContinueTaskModal({
  open,
  onClose,
  onContinueOutput,
  onSupplementRegenerate,
  onEditGoal,
  onCloneTask,
}: ContinueTaskModalProps) {
  return (
    <Modal title="继续推进任务" open={open} onCancel={onClose} footer={null} width={520} centered>
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
        选择一种方式继续推进该任务：
      </Typography.Paragraph>

      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Button block icon={<ExportOutlined />} onClick={onContinueOutput}>
          基于当前结果继续输出
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -6 }}>
          同一任务追加 Output Version，进入 Workbench 基于当前结果继续输出
        </Typography.Text>

        <Button block icon={<ReloadOutlined />} onClick={onSupplementRegenerate}>
          补充资料重新生成
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -6 }}>
          同一任务追加 Evidence Pack Version + Output Version
        </Typography.Text>

        <Button block icon={<EditOutlined />} onClick={onEditGoal}>
          修改任务目标
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -6 }}>
          同一任务追加 TaskPlan Version，编辑任务目标和任务计划
        </Typography.Text>

        <Button block icon={<FileAddOutlined />} onClick={onCloneTask}>
          新建类似任务
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -6 }}>
          系统会复制任务结构和通用设置，但不会默认复制客户敏感资料、历史输出或外部源结果
        </Typography.Text>
      </Space>
    </Modal>
  );
}

export default ContinueTaskModal;
