import { Card, Tag, Typography } from 'antd';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';

type AdminOnlyEntryProps = {
  label: string;
  description: string;
  permissionLabel: string;
};

function AdminOnlyEntry({ label, description, permissionLabel }: AdminOnlyEntryProps) {
  return (
    <Card className="ap-admin-entry" size="small" styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SettingOutlined style={{ fontSize: 20, color: '#2563eb' }} />
        <div style={{ flex: 1 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>{label}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.5 }}>
            {description}
          </Typography.Paragraph>
        </div>
        <Tag icon={<LockOutlined />} style={{ fontSize: 10, flexShrink: 0 }}>{permissionLabel}</Tag>
      </div>
    </Card>
  );
}

export default AdminOnlyEntry;
