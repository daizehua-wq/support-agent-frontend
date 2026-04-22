import React from 'react';
import { Card, Tag } from 'antd';

type BindingCardProps = {
  title: string;
  bindingLabel: string;
  bindingValue?: string;
  defaultValue?: string;
  overrideAllowed?: boolean;
  fallbackPolicySummary?: string;
  effectScopeNote?: string;
};

function getOverrideTag(overrideAllowed?: boolean) {
  if (overrideAllowed === undefined) return <Tag>未说明</Tag>;
  return overrideAllowed ? <Tag color="success">允许 override</Tag> : <Tag color="default">不允许 override</Tag>;
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

export default function BindingCard({
  title,
  bindingLabel,
  bindingValue,
  defaultValue,
  overrideAllowed,
  fallbackPolicySummary,
  effectScopeNote,
}: BindingCardProps) {
  return (
    <Card title={title} size="small" style={{ borderRadius: 12 }}>
      <FieldRow label={bindingLabel} value={bindingValue || '未设置'} />
      <FieldRow label="默认值" value={defaultValue || '未设置'} />
      <FieldRow label="override 规则" value={getOverrideTag(overrideAllowed)} />
      <FieldRow label="fallback 规则" value={fallbackPolicySummary || '未说明'} />
      <FieldRow label="影响范围" value={effectScopeNote || '未说明'} />
    </Card>
  );
}
