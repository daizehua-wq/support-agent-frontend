import { Button, Card, Tag, Typography, Drawer, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';
import type { GovernanceEvent, GovernanceEventType } from '../../types/settingsModules';

type GovernanceLogCardProps = {
  events: GovernanceEvent[];
};

const TYPE_LABELS: Record<GovernanceEventType, string> = {
  assistant_publish: 'Assistant 发布',
  model_default_change: 'Model 默认变更',
  data_source_binding: '数据源绑定',
  settings_modify: 'Settings 修改',
  app_channel_modify: 'App / Channel 修改',
  security_config_change: '安全配置变更',
};

function GovernanceLogCard({ events }: GovernanceLogCardProps) {
  const [detail, setDetail] = useState<GovernanceEvent | null>(null);

  return (
    <>
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
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(event)}>查看详情</Button>
          </div>
        ))}
      </Card>

      <Drawer title="治理事件详情" open={!!detail} onClose={() => setDetail(null)} width={480}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>事件类型</Typography.Text>
              <br /><Tag>{TYPE_LABELS[detail.type]}</Tag>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>事件内容</Typography.Text>
              <br /><Typography.Text strong>{detail.content}</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>操作者</Typography.Text>
              <br /><Typography.Text>{detail.actor}</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>时间</Typography.Text>
              <br /><Typography.Text>{detail.timestamp}</Typography.Text>
            </div>
            {detail.summary && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>变更摘要</Typography.Text>
                <br /><Typography.Text>{detail.summary}</Typography.Text>
              </div>
            )}
            {detail.affectedModules && detail.affectedModules.length > 0 && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>影响模块</Typography.Text>
                <br />{detail.affectedModules.map((m) => <Tag key={m} style={{ fontSize: 10 }}>{m}</Tag>)}
              </div>
            )}
            <Button disabled block onClick={() => message.info('回滚能力将在后续版本开放。当前仅支持查看变更详情。')}>回滚 · 暂未开放</Button>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default GovernanceLogCard;
