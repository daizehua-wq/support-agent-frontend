import React from 'react';
import { Card, Tag } from 'antd';
import { formatTechnicalLabel } from '../../utils/displayLabel';

type VersionCardProps = {
  title: string;
  currentVersion?: string;
  publishedAt?: string;
  versionNote?: string;
  publishStatus?: 'published' | 'draft' | 'archived' | string;
};

function getPublishStatusTag(status?: string) {
  if (!status) return <Tag>未说明</Tag>;

  if (status === 'published') {
    return <Tag color="success">已发布</Tag>;
  }

  if (status === 'draft') {
    return <Tag color="warning">草稿</Tag>;
  }

  if (status === 'archived') {
    return <Tag color="default">已归档</Tag>;
  }

  return <Tag>{formatTechnicalLabel(status)}</Tag>;
}

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

export default function VersionCard({
  title,
  currentVersion,
  publishedAt,
  versionNote,
  publishStatus,
}: VersionCardProps) {
  return (
    <Card title={title} size="small" style={{ borderRadius: 12 }}>
      <FieldRow label="当前发布版本" value={currentVersion || '未返回'} />
      <FieldRow label="发布时间" value={publishedAt || '未返回'} />
      <FieldRow label="发布状态" value={getPublishStatusTag(publishStatus)} />
      <FieldRow label="发布说明" value={versionNote || '未说明'} />
    </Card>
  );
}
