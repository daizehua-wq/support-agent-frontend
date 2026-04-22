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
        borderBottom: '1px dashed #E2E8F0',
      }}
    >
      <div style={{ color: '#64748B', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#1E293B', fontSize: 14, wordBreak: 'break-all' }}>
        {value ?? '-'}
      </div>
    </div>
  );
}

export default FieldRow;
