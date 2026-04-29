import { useEffect, useState } from 'react';
import { Button, Card, Spin, Tag, Typography } from 'antd';
import { LockOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import RuntimeStatusCard from '../../../components/settings/RuntimeStatusCard';
import SettingsModuleShell from '../../../components/settings/SettingsModuleShell';
import * as settingsAdapter from '../../../utils/settingsCenterAdapter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = any;

function SettingsRuntimePage() {
  const [data, setData] = useState<ApiData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getRuntime().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    settingsAdapter.getRuntime()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <SettingsModuleShell title="运行状态与安全" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="运行状态与安全" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败，请稍后重试。</Typography.Text><br/><Button icon={<ReloadOutlined />} style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  const h = data?.health || {};
  const wh = data?.webhook || {};
  const sv = data?.secretVault || {};
  const gw = data?.apiGateway || {};

  const healthItems = [
    { name: 'Storage', status: (h.storage?.status === 'ok' ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable', detail: h.storage?.summary },
    { name: 'Python Runtime', status: (h.pythonRuntime?.status === 'healthy' ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable', detail: h.pythonRuntime?.summary },
    { name: 'Embedded Model', status: (h.embeddedModel?.status === 'ok' ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable', detail: h.embeddedModel?.summary },
    { name: 'Context Store', status: (h.contextStore?.status === 'ok' ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable', detail: h.contextStore?.summary },
  ];

  return (
    <SettingsModuleShell title="运行状态与安全" description="查看服务健康、Runtime、Secret Vault、API Gateway、Webhook 安全边界。">
      <div style={{ marginBottom: 14 }}><RuntimeStatusCard items={healthItems} title="服务健康" /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Python Runtime</Typography.Text>
          <Tag color="green">{data?.pythonRuntime?.enabled ? '正常' : '未启用'}</Tag>
        </Card>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Embedded Model</Typography.Text>
          <Tag color={data?.embeddedModel?.present ? 'green' : 'orange'}>{data?.embeddedModel?.status || 'loading'}</Tag>
        </Card>
      </div>

      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}><LockOutlined style={{ marginRight: 6 }} />Secret Vault</Typography.Text>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>状态</Typography.Text><br /><Tag color="green">{sv.status || '正常'}</Tag></div>
          <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>托管凭据</Typography.Text><br /><Typography.Text strong>{sv.keyCount || 0}</Typography.Text></div>
        </div>
        {(sv.keysRefs || []).length > 0 && <div style={{marginTop:8}}>{(sv.keysRefs || []).map((r: string, i: number) => <Tag key={i} style={{fontSize:10}}>{r}</Tag>)}</div>}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>API Gateway</Typography.Text>
          <Tag color="green" style={{ fontSize: 11 }}>{gw.status || '未知'}</Tag>
        </Card>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}><SafetyCertificateOutlined />Webhook 安全边界</Typography.Text>
          <Tag color={wh.publicSignatureEnabled ? 'green' : 'red'} style={{ fontSize: 11 }}>公网签名校验 · {wh.publicSignatureEnabled ? '启用' : '未启用'}</Tag>
          <Tag style={{ fontSize: 11, display: 'block', marginTop: 4 }}>当前边界 · {wh.boundary || 'internal_only'}</Tag>
          {wh.warning && <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{wh.warning}</Typography.Text>}
        </Card>
      </div>

      {(data?.securityTips || []).length > 0 && (
        <Card size="small" style={{ borderRadius: 22 }} styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>安全提示</Typography.Text>
          {(data?.securityTips || []).map((tip: string, i: number) => (
            <Tag key={i} color="orange" style={{ fontSize: 11, marginBottom: 4 }}>{tip}</Tag>
          ))}
        </Card>
      )}
    </SettingsModuleShell>
  );
}

export default SettingsRuntimePage;
