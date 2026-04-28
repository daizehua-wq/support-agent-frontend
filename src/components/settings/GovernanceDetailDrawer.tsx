import { Drawer, Button, Tag, Typography } from 'antd';
import type { GovernanceEvent } from '../../types/settingsModules';

type GovernanceDetailDrawerProps = {
  open: boolean;
  event: GovernanceEvent | null;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  assistant_publish: 'Assistant 发布',
  model_default_change: 'Model 默认变更',
  data_source_binding: '数据源绑定',
  settings_modify: 'Settings 修改',
  app_channel_modify: 'App / Channel 修改',
  security_config_change: '安全配置变更',
};

function GovernanceDetailDrawer({ open, event, onClose }: GovernanceDetailDrawerProps) {
  if (!event) return null;
  return (
    <Drawer title="治理事件详情" open={open} onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>事件类型</Typography.Text><br /><Tag>{TYPE_LABELS[event.type] || event.type}</Tag></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>对象</Typography.Text><br /><Typography.Text strong>{event.content}</Typography.Text></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>操作人</Typography.Text><br /><Typography.Text>{event.actor}</Typography.Text></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>时间</Typography.Text><br /><Typography.Text>{event.timestamp}</Typography.Text></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>状态</Typography.Text><br /><Tag color={event.status === 'active' ? 'green' : 'default'}>{event.status === 'active' ? '活跃' : '归档'}</Tag></div>
        {event.summary && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>变更摘要</Typography.Text><br /><Typography.Text>{event.summary}</Typography.Text></div>}
        {event.affectedModules && event.affectedModules.length > 0 && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>影响范围</Typography.Text><br />{event.affectedModules.map((m) => <Tag key={m}>{m}</Tag>)}</div>}
        <Button disabled block>回滚 · 暂未开放</Button>
      </div>
    </Drawer>
  );
}

export default GovernanceDetailDrawer;
