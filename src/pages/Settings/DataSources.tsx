import { useEffect, useState } from 'react';
import { Button, Card, Spin, Tag, Typography } from 'antd';
import { SafetyCertificateOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import DataSourceHealthCheckDrawer from '../../components/settings/DataSourceHealthCheckDrawer';
import SettingsSecretReferenceDrawer from '../../components/settings/SettingsSecretReferenceDrawer';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import DatabaseManagerPage from '../DatabaseManager';
import * as settingsAdapter from '../../utils/settingsCenterAdapter';
import type { UnknownRecord } from '../../utils/unknownRecord';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = any;

function SettingsDataSourcesPage() {
  const [showHealth, setShowHealth] = useState(false);
  const [showSecretRef, setShowSecretRef] = useState(false);
  const [data, setData] = useState<ApiData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getDataSources().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    settingsAdapter.getDataSources()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <SettingsModuleShell title="数据源管理" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="数据源管理" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败，请稍后重试。</Typography.Text><br/><Button icon={<ReloadOutlined />} style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  const ov = data?.overview || {};
  const providerStates = data?.providerStates || [];
  const creds = data?.credentialReferences || [];

  return (
    <SettingsModuleShell
      title="数据源管理"
      description="统一管理内部数据库、内部知识库、Reference Pack、外部资料源、轻绑定和 provider 状态。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />
          凭据安全说明
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          真实凭据不会在界面中展示。仅展示 secret:// 或 env 引用。数据源总数：{ov.total || 0}，正常：{ov.healthy || 0}，降级：{ov.degraded || 0}。
        </Typography.Text>
        {creds.length > 0 && <div style={{marginTop:6}}>{creds.map((c: string, _i: number) => <Tag key={_i} style={{fontSize:10, marginRight:4}}>{c}</Tag>)}</div>}
        <Button size="small" icon={<CheckCircleOutlined />} style={{ marginTop: 8 }} onClick={() => setShowHealth(true)}>健康检查</Button>
        <Button size="small" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setShowSecretRef(true)}>查看凭据引用</Button>
      </Card>

      <DatabaseManagerPage />
      <DataSourceHealthCheckDrawer
        open={showHealth}
        sourceName="企业内部数据库 (SQLite) + 外部资料源"
        overallStatus={ov.degraded > 0 ? 'degraded' : 'healthy'}
        lastCheckTime={new Date().toISOString()}
        providers={providerStates.map((p: UnknownRecord) => ({ name: p.name as string, status: p.status as string, detail: p.impact as string }))}
        degradedReason={ov.degraded > 0 ? '部分数据源不可用' : ''}
        onRecheck={() => setShowHealth(false)}
        onViewSecretRef={() => { setShowHealth(false); setShowSecretRef(true); }}
        onClose={() => setShowHealth(false)}
      />

      <SettingsSecretReferenceDrawer
        open={showSecretRef}
        references={creds.map((c: string) => ({ envKey: c, secretRef: c, binding: '数据源', lastRotation: '—', status: 'active' as const }))}
        onClose={() => setShowSecretRef(false)}
        onRequestRotation={() => {}}
      />
    </SettingsModuleShell>
  );
}

export default SettingsDataSourcesPage;
