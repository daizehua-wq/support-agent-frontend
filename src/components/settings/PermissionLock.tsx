import { Button, Card, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';

type PermissionLockProps = {
  requiredRole: string;
  currentRole: string;
  onContactAdmin?: () => void;
};

function PermissionLock({ requiredRole, currentRole, onContactAdmin }: PermissionLockProps) {
  return (
    <Card className="ap-permission-lock" styles={{ body: { textAlign: 'center', padding: 40 } }}>
      <LockOutlined style={{ fontSize: 48, color: '#94a3b8' }} />
      <Typography.Title level={4} style={{ margin: '16px 0 0' }}>无权限</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
        当前角色：{currentRole} · 所需权限：{requiredRole}
      </Typography.Paragraph>
      {onContactAdmin && (
        <Button type="primary" style={{ marginTop: 16 }} onClick={onContactAdmin}>
          联系管理员
        </Button>
      )}
    </Card>
  );
}

export default PermissionLock;
