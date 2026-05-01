import { Button, Modal, Space, Tag, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';

type ExternalSourceDegradedModalProps = {
  open: boolean;
  role: 'admin' | 'user';
  degradedSources: Array<{ name: string; status: string; reason: string }>;
  onContinue: () => void;
  onRetry?: () => void;
  onClose: () => void;
};

function ExternalSourceDegradedModal({
  open,
  role,
  degradedSources,
  onContinue,
  onRetry,
  onClose,
}: ExternalSourceDegradedModalProps) {
  const navigate = useNavigate();

  return (
    <Modal
      title="外部资料源降级"
      open={open}
      footer={null}
      onCancel={onClose}
      centered
      width={500}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
        部分外部资料源当前不可用。系统会优先使用内部知识库、Reference Pack 和已有上下文继续执行。
      </Typography.Paragraph>

      {degradedSources.map((ds) => (
        <div key={ds.name} style={{ padding: 12, borderRadius: 16, background: 'rgba(245,158,11,0.06)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{ds.name}</Typography.Text>
            <Tag color="orange" style={{ fontSize: 10 }}>{ds.status}</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{ds.reason}</Typography.Text>
        </div>
      ))}

      <Space direction="vertical" style={{ width: '100%', marginTop: 10 }}>
        {role === 'admin' && (
          <>
            {onRetry && (
              <Button block onClick={onRetry}>重试外部源</Button>
            )}
            <Button block onClick={() => { navigate('/settings/data-sources'); onClose(); }}>
              检查数据源配置
            </Button>
          </>
        )}
        <Button type="primary" block onClick={onContinue}>基于可用资料继续</Button>
        <Button block onClick={onClose}>知道了</Button>
        {role === 'user' && (
          <Button block onClick={() => message.info('已向管理员发送通知。')}>联系管理员</Button>
        )}
      </Space>
    </Modal>
  );
}

export default ExternalSourceDegradedModal;
