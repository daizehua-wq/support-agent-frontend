import { useEffect, useState } from 'react';
import { Button, Card, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import AssistantPublishConfirmModal from '../../components/settings/AssistantPublishConfirmModal';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import AssistantCenterPage from '../AssistantCenter';
import * as settingsAdapter from '../../utils/settingsCenterAdapter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = any;

function SettingsAssistantsPage() {
  const [showPublish, setShowPublish] = useState(false);
  const [data, setData] = useState<ApiData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getAssistants().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    settingsAdapter.getAssistants()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <SettingsModuleShell title="Assistant / Prompt" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="Assistant / Prompt" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败，请稍后重试。</Typography.Text><br/><Button icon={<ReloadOutlined />} style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  const cp = data?.currentPublished;
  const ev = data?.governanceEvents || [];

  return (
    <SettingsModuleShell
      title="Assistant / Prompt"
      description="管理 Assistant、Prompt、发布版本、模块绑定和治理历史。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Assistant / Prompt</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          这里用于治理业务助手、Prompt 模板、当前发布版和模块绑定关系。
        </Typography.Text>
        {cp && <div style={{marginTop:8}}><Tag color="blue">{cp.assistantName} · {cp.version}</Tag></div>}
        {ev.length > 0 && <div style={{marginTop:8}}><Typography.Text type="secondary" style={{fontSize:11}}>最近治理事件：{ev.length} 条</Typography.Text></div>}
      </Card>

      <div style={{ marginBottom: 18 }}>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setShowPublish(true)}>发布 Assistant 示例</Button>
        <AssistantPublishConfirmModal
          open={showPublish}
          assistantName="销售支持助手"
          currentVersion="v3"
          newVersion="v4"
          affectedModules={['workbench', 'output']}
          onPublish={() => setShowPublish(false)}
          onCancel={() => setShowPublish(false)}
        />
      </div>

      <AssistantCenterPage />
    </SettingsModuleShell>
  );
}

export default SettingsAssistantsPage;
