import { Card, Tag, Typography } from 'antd';
import {
  ExclamationCircleFilled,
  InfoCircleFilled,
  WarningFilled,
} from '@ant-design/icons';
import type { OutputRisk } from '../../types/output';

type RiskPanelProps = {
  risks: OutputRisk[];
};

const LEVEL_CONFIG: Record<string, { icon: React.ReactNode; color: string; borderColor: string }> = {
  info: { icon: <InfoCircleFilled style={{ color: '#2563eb' }} />, color: 'blue', borderColor: 'rgba(37,99,235,0.12)' },
  warning: { icon: <WarningFilled style={{ color: '#f59e0b' }} />, color: 'orange', borderColor: 'rgba(245,158,11,0.12)' },
  danger: { icon: <ExclamationCircleFilled style={{ color: '#ef4444' }} />, color: 'red', borderColor: 'rgba(239,68,68,0.12)' },
  degraded: { icon: <ExclamationCircleFilled style={{ color: '#f59e0b' }} />, color: 'orange', borderColor: 'rgba(245,158,11,0.12)' },
};

function RiskPanel({ risks }: RiskPanelProps) {
  if (risks.length === 0) return (
    <Card className="ap-risk-panel" size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14 }}>风险与限制</Typography.Text>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 8 }}>暂无风险提示。</Typography.Text>
    </Card>
  );

  return (
    <Card className="ap-risk-panel" size="small" styles={{ body: { padding: 16 } }}>
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
        风险与限制
      </Typography.Text>
      {risks.map((risk) => {
        const cfg = LEVEL_CONFIG[risk.level] || LEVEL_CONFIG.info;
        return (
          <div
            key={risk.id}
            className="ap-risk-panel__item"
            style={{ borderLeft: `3px solid ${cfg.borderColor}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {cfg.icon}
              <Typography.Text strong style={{ fontSize: 13 }}>{risk.title}</Typography.Text>
              <Tag color={cfg.color} style={{ fontSize: 10, marginLeft: 'auto' }}>
                {risk.level === 'danger' ? '高风险' : risk.level === 'degraded' ? '降级' : risk.level === 'warning' ? '建议关注' : '提示'}
              </Tag>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6, display: 'block', marginTop: 4 }}>
              {risk.description}
            </Typography.Text>
          </div>
        );
      })}
    </Card>
  );
}

export default RiskPanel;
