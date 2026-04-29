import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Spin, Typography } from 'antd';
import GovernanceDetailDrawer from '../../../components/settings/GovernanceDetailDrawer';
import GovernanceLogCard from '../../../components/settings/GovernanceLogCard';
import SettingsModuleShell from '../../../components/settings/SettingsModuleShell';
import * as settingsAdapter from '../../../utils/settingsCenterAdapter';
import type { GovernanceEvent } from '../../../types/settingsModules';

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'assistant_publish', label: 'Assistant 发布' },
  { value: 'model_default_change', label: 'Model 默认变更' },
  { value: 'data_source_binding', label: '数据源绑定' },
  { value: 'settings_modify', label: 'Settings 修改' },
  { value: 'app_channel_modify', label: 'App / Channel 修改' },
  { value: 'security_config_change', label: '安全配置变更' },
];

function SettingsGovernancePage() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [detailEvent, setDetailEvent] = useState<GovernanceEvent | null>(null);
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getGovernance().then((d) => setEvents(d.events || [])).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => typeFilter === 'all' ? events : events.filter((e) => e.type === typeFilter), [typeFilter, events]);

  if (loading) return <SettingsModuleShell title="治理历史" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="治理历史" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败</Typography.Text><br/><Button style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  return (
    <>
      <SettingsModuleShell
        title="治理历史"
        description="查看 Assistant 发布、Model 默认变更、数据源绑定、Settings 修改、App / Channel 修改和安全配置变更。"
      >
        <div style={{ marginBottom: 14 }}>
          <Select value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} style={{ width: 180 }} />
        </div>
        <GovernanceLogCard events={filtered} onViewDetail={setDetailEvent} />
      </SettingsModuleShell>

      <GovernanceDetailDrawer
        open={!!detailEvent}
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
      />
    </>
  );
}

export default SettingsGovernancePage;
