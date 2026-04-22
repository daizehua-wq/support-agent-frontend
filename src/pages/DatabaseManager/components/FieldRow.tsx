import type { ReactNode } from 'react';

function FieldRow({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
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

export default FieldRow;
