import { Modal, Button, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

type PermissionDeniedModalProps = {
  open: boolean;
  currentRole: string;
  requiredPermission: string;
  onClose: () => void;
};

function PermissionDeniedModal({ open, currentRole, requiredPermission, onClose }: PermissionDeniedModalProps) {
  const navigate = useNavigate();

  return (
    <Modal
      title={<span><LockOutlined style={{ marginRight: 8 }} />权限不足</span>}
      open={open}
      footer={null}
      onCancel={onClose}
      centered
      width={420}
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <LockOutlined style={{ fontSize: 48, color: '#94a3b8', marginBottom: 16 }} />
        <Typography.Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 0 }}>
          当前角色：{currentRole} · 所需权限：{requiredPermission}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          你当前没有执行该操作的权限。如需访问，请联系系统管理员。
        </Typography.Paragraph>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button block onClick={() => { message.info('已向管理员发送申请。'); onClose(); }}>联系管理员</Button>
        <Button block onClick={() => { navigate(-1 as never); onClose(); }}>返回上一页</Button>
      </div>
    </Modal>
  );
}

export default PermissionDeniedModal;
