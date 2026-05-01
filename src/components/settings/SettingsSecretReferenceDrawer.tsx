import { Button, Drawer, Tag, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';

type SecretReference = {
  envKey: string;
  secretRef: string;
  binding: string;
  lastRotation?: string;
  status: 'active' | 'expiring' | 'unknown';
};

type SettingsSecretReferenceDrawerProps = {
  open: boolean;
  references: SecretReference[];
  onClose: () => void;
  onRequestRotation: () => void;
};

function SettingsSecretReferenceDrawer({ open, references, onClose, onRequestRotation }: SettingsSecretReferenceDrawerProps) {
  return (
    <Drawer title={<span><LockOutlined style={{ marginRight: 8 }} />凭据引用</span>} open={open} onClose={onClose} width={480}>
      <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
        真实凭据不会在界面中展示。
      </Typography.Text>

      {references.map((ref) => (
        <div key={ref.envKey} style={{ padding: 14, borderRadius: 16, background: 'rgba(248,250,252,0.72)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{ref.secretRef}</Typography.Text>
            <Tag color={ref.status === 'active' ? 'green' : 'orange'} style={{ fontSize: 10 }}>{ref.status === 'active' ? '活跃' : '即将过期'}</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>env: {ref.envKey}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>绑定：{ref.binding}</Typography.Text>
          {ref.lastRotation && <Typography.Text type="secondary" style={{ fontSize: 11 }}>最近轮换：{ref.lastRotation}</Typography.Text>}
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <Button block onClick={() => message.info('轮换记录功能将在后续版本开放。')}>查看轮换记录</Button>
        <Button block type="primary" onClick={() => { onRequestRotation(); message.info('轮换申请已提交'); onClose(); }}>申请轮换</Button>
      </div>
    </Drawer>
  );
}

export default SettingsSecretReferenceDrawer;
