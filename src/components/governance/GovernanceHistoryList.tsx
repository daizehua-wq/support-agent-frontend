import { Card, List, Space, Tag } from 'antd';

type GovernanceAuditFieldChange = {
  field: string;
  before?: string;
  after?: string;
};

type GovernanceAuditEntry = {
  id: string;
  action: string;
  actor: string;
  summary?: string;
  createdAt?: string | null;
  changeCount?: number;
  changedFields?: GovernanceAuditFieldChange[];
};

type GovernanceHistoryListProps = {
  title: string;
  items?: GovernanceAuditEntry[];
  emptyText?: string;
};

const ACTION_COLOR_MAP = {
  activate: 'processing',
  create: 'green',
  delete: 'red',
  publish: 'gold',
  update: 'blue',
};

function getActionTag(action = '') {
  const normalizedAction = String(action || '').trim().toLowerCase();
  const color = ACTION_COLOR_MAP[normalizedAction as keyof typeof ACTION_COLOR_MAP] || 'default';
  const label = normalizedAction || 'unknown';
  return <Tag color={color}>{label}</Tag>;
}

export default function GovernanceHistoryList({
  title,
  items = [],
  emptyText = '暂无治理变更',
}: GovernanceHistoryListProps) {
  return (
    <Card size="small" title={title} style={{ borderRadius: 12 }}>
      <List
        dataSource={items}
        locale={{ emptyText }}
        renderItem={(item) => (
          <List.Item key={item.id} style={{ padding: '12px 0' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                {getActionTag(item.action)}
                <Tag>{item.actor || 'assistant-center'}</Tag>
                <span style={{ color: '#64748B', fontSize: 12 }}>
                  {item.createdAt || '未返回时间'}
                </span>
              </Space>
              <div style={{ color: '#111827', fontWeight: 600 }}>
                {item.summary || '治理变更'}
              </div>
              {item.changeCount ? (
                <div style={{ color: '#64748B', fontSize: 12 }}>
                  变更字段数：{item.changeCount}
                </div>
              ) : null}
              {item.changedFields?.length ? (
                <Space wrap size={[6, 6]}>
                  {item.changedFields.slice(0, 4).map((change) => (
                    <Tag key={`${item.id}-${change.field}`}>
                      {change.field}
                      {change.after ? ` → ${change.after}` : ''}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <div style={{ color: '#94A3B8', fontSize: 12 }}>这次变更没有字段 diff，通常是激活或删除动作。</div>
              )}
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
