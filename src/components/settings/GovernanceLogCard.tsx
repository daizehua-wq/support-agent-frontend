import { Button, Card, Tag, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import type { GovernanceEvent, GovernanceEventType } from '../../types/settingsModules';

type GovernanceLogCardProps = {
  events: GovernanceEvent[];
  onViewDetail: (event: GovernanceEvent) => void;
};

const TYPE_LABELS: Record<GovernanceEventType, string> = {
  assistant_publish: 'Assistant 发布',
  model_default_change: 'Model 默认变更',
  data_source_binding: '数据源绑定',
  settings_modify: 'Settings 修改',
  app_channel_modify: 'App / Channel 修改',
  security_config_change: '安全配置变更',
};

function GovernanceLogCard({ events, onViewDetail }: GovernanceLogCardProps) {
  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>治理日志</Typography.Text>
      {events.map((event) => (
        <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag style={{ fontSize: 10 }}>{TYPE_LABELS[event.type]}</Tag>
              <Typography.Text style={{ fontSize: 13 }}>{event.content}</Typography.Text>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
              {event.actor} · {event.timestamp}
            </Typography.Text>
          </div>
          <Button size="small" icon={<EyeOutlined />} onClick={() => onViewDetail(event)}>查看详情</Button>
        </div>
      ))}
    </Card>
  );
}

export default GovernanceLogCard;
