import { useEffect, useState } from 'react';
import { Button, Card, Spin, Tag, Typography } from 'antd';
import { LockOutlined, ReloadOutlined } from '@ant-design/icons';
import AdminOnlyEntry from '../../components/settings/AdminOnlyEntry';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import AppsPage from '../Apps';
import * as settingsAdapter from '../../utils/settingsCenterAdapter';
import * as permissionAdapter from '../../utils/permissionAdapter';

function SettingsAppsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getApps().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    permissionAdapter.getPermissionSummary().then((s) => setPermissions(s.permissions as unknown as Record<string, boolean>));
  }, []);

  if (loading) return <SettingsModuleShell title="应用与渠道" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="应用与渠道" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败，请稍后重试。</Typography.Text><br/><Button icon={<ReloadOutlined />} style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  const wh = data?.channels?.find?.((c: any) => c.name?.toLowerCase?.().includes('web')) || {};
  const apiKeys = data?.apiKeys || [];
  const rks = data?.rulesKnowledgeSummary || {};
  const canPlatform = permissions?.canAccessPlatformManager === true;
  const canAdminUi = permissions?.canAccessAdminUi === true;

  return (
    <SettingsModuleShell
      title="应用与渠道"
      description="管理 Apps、API Key、Channels、Application Pack，以及受控的 Platform Manager / Admin UI 高级入口。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
          <LockOutlined style={{ marginRight: 6 }} />
          安全与权限说明
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Webhook 当前仅内部使用。公网暴露前必须完成平台签名校验。Apps / Manage 旧入口已合并到应用与渠道。Platform Manager / Admin UI 仅系统管理员 / 内部运维可见。
        </Typography.Text>
        {apiKeys.length > 0 && <div style={{marginTop:6}}>{apiKeys.map((k: any) => <Tag key={k.id} style={{fontSize:10}}>{k.reference || k.label}</Tag>)}</div>}
        {rks.rulesCount > 0 && <div style={{marginTop:6}}><Typography.Text type="secondary" style={{fontSize:11}}>规则数：{rks.rulesCount} · 知识源：{rks.knowledgeSourcesCount}</Typography.Text></div>}
      </Card>

      {wh.name && (
        <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Webhook 状态</Typography.Text>
          <Tag color="orange">边界：{wh.boundary || 'internal_only'}</Tag>
          <Tag color={wh.publicSignatureEnabled ? 'green' : 'red'}>签名校验：{wh.publicSignatureEnabled ? '已启用' : '未启用'}</Tag>
        </Card>
      )}

      {(canPlatform || canAdminUi) && (
        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canPlatform && <AdminOnlyEntry label="Platform Manager" description="工厂 Agent、渠道配置、演化调度器" permissionLabel="系统管理员" />}
          {canAdminUi && <AdminOnlyEntry label="Admin UI" description="API 密钥管理、应用统计、渠道监控" permissionLabel="内部运维" />}
        </div>
      )}

      <AppsPage />
    </SettingsModuleShell>
  );
}

export default SettingsAppsPage;
