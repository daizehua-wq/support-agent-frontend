

import React from 'react';
import { Card } from 'antd';

type DatabaseRelationSummaryCardProps = {
  title: string;
  defaultDatabase?: string;
  visibleDatabases?: string[];
  relationSource?: string;
  healthStatus?: string;
};

function FieldRow({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px dashed #F0F0F0',
      }}
    >
      <div style={{ color: '#6B7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 14, wordBreak: 'break-all' }}>
        {value ?? '-'}
      </div>
    </div>
  );
}

export default function DatabaseRelationSummaryCard({
  title,
  defaultDatabase,
  visibleDatabases,
  relationSource,
  healthStatus,
}: DatabaseRelationSummaryCardProps) {
  return (
    <Card title={title} size="small" style={{ borderRadius: 12 }}>
      <FieldRow label="默认关联数据库" value={defaultDatabase || '未设置'} />
      <FieldRow
        label="可见数据库"
        value={visibleDatabases?.length ? visibleDatabases.join('、') : '未设置'}
      />
      <FieldRow label="数据库关系来源" value={relationSource || '未说明'} />
      <FieldRow label="健康状态" value={healthStatus || '未返回'} />
    </Card>
  );
}