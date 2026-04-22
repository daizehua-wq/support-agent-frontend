import { Button, Card, Input, Select, Space } from 'antd';

import {
  getAvailabilityTag,
  getDatabaseTypeLabel,
  getHealthTag,
  type DatabaseItem,
} from '../helpers';

type DatabaseManagerListPanelProps = {
  searchText: string;
  environmentFilter: string;
  filteredDatabases: DatabaseItem[];
  selectedId: string;
  onSearchTextChange: (value: string) => void;
  onEnvironmentFilterChange: (value: string) => void;
  onSelectDatabase: (databaseId: string) => void;
  onOpenCreate: () => void;
};

function DatabaseManagerListPanel({
  searchText,
  environmentFilter,
  filteredDatabases,
  selectedId,
  onSearchTextChange,
  onEnvironmentFilterChange,
  onSelectDatabase,
  onOpenCreate,
}: DatabaseManagerListPanelProps) {
  return (
    <Card
      title="数据库列表区"
      extra={
        <Button type="primary" onClick={onOpenCreate}>
          新增数据库
        </Button>
      }
      style={{ borderRadius: 12 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="搜索数据库名称 / 数据库 ID"
        />

        <Select
          value={environmentFilter}
          onChange={onEnvironmentFilterChange}
          options={[
            { label: '全部环境', value: 'all' },
            { label: '生产', value: '生产' },
            { label: '测试', value: '测试' },
            { label: '归档', value: '归档' },
          ]}
        />

        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {filteredDatabases.map((item) => {
            const active = item.id === selectedId;

            return (
              <Card
                key={item.id}
                size="small"
                hoverable
                onClick={() => onSelectDatabase(item.id)}
                style={{
                  borderRadius: 12,
                  border: active ? '1px solid #1677FF' : '1px solid #E5E7EB',
                  background: active ? '#F0F7FF' : '#FFFFFF',
                }}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                      {item.name}
                    </div>
                    {getAvailabilityTag(item.available)}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 12 }}>{item.id}</div>
                  <div style={{ color: '#374151', fontSize: 13 }}>
                    {getDatabaseTypeLabel(item.type)} · {item.environment}
                  </div>
                  <div>{getHealthTag(item.healthStatus)}</div>
                  <div style={{ color: '#6B7280', fontSize: 12 }}>
                    最近检测：{item.lastCheckedAt}
                  </div>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Space>
    </Card>
  );
}

export default DatabaseManagerListPanel;
