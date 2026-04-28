import { useMemo, useState } from 'react';
import { Select } from 'antd';
import GovernanceDetailDrawer from '../../../components/settings/GovernanceDetailDrawer';
import GovernanceLogCard from '../../../components/settings/GovernanceLogCard';
import SettingsModuleShell from '../../../components/settings/SettingsModuleShell';
import { MOCK_GOVERNANCE } from '../../../utils/mockSettingsModules';
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
  const filtered = useMemo(
    () => (typeFilter === 'all' ? MOCK_GOVERNANCE : MOCK_GOVERNANCE.filter((e) => e.type === typeFilter)),
    [typeFilter],
  );

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
