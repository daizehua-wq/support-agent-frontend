import { Card, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';
import type { OutputEvidence, EvidenceStatus } from '../../types/output';

type EvidenceCardProps = {
  evidences: OutputEvidence[];
};

const STATUS_MAP: Record<EvidenceStatus, { icon: React.ReactNode; color: string; label: string }> = {
  healthy: { icon: <CheckCircleFilled style={{ color: '#22c55e' }} />, color: 'green', label: '正常' },
  degraded: { icon: <ExclamationCircleFilled style={{ color: '#f59e0b' }} />, color: 'orange', label: '降级' },
  unavailable: { icon: <CloseCircleFilled style={{ color: '#ef4444' }} />, color: 'red', label: '不可用' },
  not_used: { icon: <MinusCircleFilled style={{ color: '#94a3b8' }} />, color: 'default', label: '未使用' },
};

function EvidenceCard({ evidences }: EvidenceCardProps) {
  return (
    <Card className="ap-evidence-card" size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
        关键依据
      </Typography.Text>
      {evidences.map((ev) => {
        const st = STATUS_MAP[ev.status];
        return (
          <div key={ev.id} className="ap-evidence-card__item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {st.icon}
              <Typography.Text strong style={{ fontSize: 13 }}>{ev.title}</Typography.Text>
              <Tag color={st.color} style={{ fontSize: 10, marginLeft: 'auto' }}>{st.label}</Tag>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6, display: 'block', marginTop: 4 }}>
              来源：{ev.sourceName}
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, lineHeight: 1.6, margin: '4px 0 0' }}>
              {ev.summary}
            </Typography.Paragraph>
          </div>
        );
      })}
    </Card>
  );
}

export default EvidenceCard;
