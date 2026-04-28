import { Select, Typography } from 'antd';
import { AuditOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import GovernanceLogCard from '../../../components/settings/GovernanceLogCard';
import { MOCK_GOVERNANCE } from '../../../utils/mockSettingsModules';

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

  const filtered = useMemo(
    () => (typeFilter === 'all' ? MOCK_GOVERNANCE : MOCK_GOVERNANCE.filter((e) => e.type === typeFilter)),
    [typeFilter],
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <AuditOutlined style={{ marginRight: 10 }} />
          治理历史
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          查看 Assistant 发布、Model 默认变更、数据源绑定、Settings 修改、App / Channel 修改和安全配置变更。
        </Typography.Paragraph>
      </div>

      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Select value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} style={{ width: 180 }} />
      </div>

      <div style={{ borderRadius: 22, overflow: 'hidden' }}>
        <GovernanceLogCard events={filtered} />
      </div>
    </div>
  );
}

export default SettingsGovernancePage;
