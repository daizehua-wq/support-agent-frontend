import { Button, Drawer, Tag, Typography, message } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled, CloseCircleFilled, ReloadOutlined, EyeOutlined } from '@ant-design/icons';

type ProviderState = {
  name: string;
  status: 'healthy' | 'ready' | 'degraded' | 'unavailable';
  detail?: string;
};

type DataSourceHealthCheckDrawerProps = {
  open: boolean;
  sourceName: string;
  overallStatus: 'healthy' | 'degraded' | 'unavailable';
  lastCheckTime: string;
  providers: ProviderState[];
  degradedReason?: string;
  onRecheck: () => void;
  onViewSecretRef: () => void;
  onClose: () => void;
};

const STATUS_CFG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  healthy: { color: 'green', icon: <CheckCircleFilled />, label: '正常' },
  ready: { color: 'green', icon: <CheckCircleFilled />, label: '就绪' },
  degraded: { color: 'orange', icon: <ExclamationCircleFilled />, label: '降级' },
  unavailable: { color: 'red', icon: <CloseCircleFilled />, label: '不可用' },
};

function DataSourceHealthCheckDrawer({ open, sourceName, overallStatus, lastCheckTime, providers, degradedReason, onRecheck, onViewSecretRef, onClose }: DataSourceHealthCheckDrawerProps) {
  const overall = STATUS_CFG[overallStatus];
  return (
    <Drawer title="数据源健康检查" open={open} onClose={onClose} width={480}>
      <div style={{ marginBottom: 14 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>数据源</Typography.Text><br /><Typography.Text strong>{sourceName}</Typography.Text>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>总体状态</Typography.Text><br /><Tag color={overall.color} icon={overall.icon}>{overall.label}</Tag>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>最近检查</Typography.Text><br /><Typography.Text>{lastCheckTime}</Typography.Text>
      </div>

      {degradedReason && (
        <div style={{ padding: 12, borderRadius: 14, background: 'rgba(245,158,11,0.08)', marginBottom: 14 }}>
          <Typography.Text style={{ fontSize: 13, color: '#d97706' }}>降级原因：{degradedReason}</Typography.Text>
        </div>
      )}

      <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Provider 状态</Typography.Text>
      {providers.map((p) => {
        const cfg = STATUS_CFG[p.status] || STATUS_CFG.unavailable;
        return (
          <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{p.name}</span>
            <span><Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 10 }}>{cfg.label}</Tag>{p.detail && <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{p.detail}</Typography.Text>}</span>
          </div>
        );
      })}

      <div style={{ marginTop: 14 }}>
        <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>推荐修复动作</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, lineHeight: 1.8 }}>
          1. 检查外部资料源服务状态<br />
          2. 检查凭据引用是否有效<br />
          3. 检查网络访问策略<br />
          4. 重试健康检查
        </Typography.Paragraph>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <Button block icon={<ReloadOutlined />} onClick={() => { onRecheck(); message.success('已发起重新检查'); }}>重新检查</Button>
        <Button block icon={<EyeOutlined />} onClick={onViewSecretRef}>查看凭据引用</Button>
      </div>
    </Drawer>
  );
}

export default DataSourceHealthCheckDrawer;
