import { Card, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import type { RuntimeStatus } from '../../types/settingsModules';

type RuntimeStatusCardProps = {
  items: Array<{ name: string; status: RuntimeStatus; detail?: string }>;
  title: string;
};

const STATUS_CFG: Record<RuntimeStatus, { color: string; icon: React.ReactNode }> = {
  healthy: { color: 'green', icon: <CheckCircleFilled /> },
  degraded: { color: 'orange', icon: <ExclamationCircleFilled /> },
  unavailable: { color: 'red', icon: <CloseCircleFilled /> },
};

function RuntimeStatusCard({ items, title }: RuntimeStatusCardProps) {
  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>{title}</Typography.Text>
      {items.map((item) => {
        const cfg = STATUS_CFG[item.status] || STATUS_CFG.unavailable;
        return (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{item.name}</span>
            <span>
              <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 10 }}>{item.status === 'healthy' ? '正常' : item.status}</Tag>
              {item.detail && <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{item.detail}</Typography.Text>}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

export default RuntimeStatusCard;
