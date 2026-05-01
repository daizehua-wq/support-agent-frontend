import { Card, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, QuestionCircleFilled } from '@ant-design/icons';
import type { HealthStatus, CapabilityItem } from '../../types/settingsCenter';

type CapabilityStatusSummaryProps = {
  assistant: CapabilityItem;
  model: CapabilityItem;
  dataSource: CapabilityItem;
  externalSources: Array<{ name: string; status: HealthStatus }>;
  pythonRuntimeStatus: HealthStatus;
  compact?: boolean;
};

const STATUS_CONFIG: Record<HealthStatus, { icon: React.ReactNode; color: string; label: string }> = {
  healthy: { icon: <CheckCircleFilled style={{ color: '#22c55e' }} />, color: 'green', label: '正常' },
  degraded: { icon: <ExclamationCircleFilled style={{ color: '#f59e0b' }} />, color: 'orange', label: '降级' },
  unavailable: { icon: <CloseCircleFilled style={{ color: '#ef4444' }} />, color: 'red', label: '不可用' },
  unknown: { icon: <QuestionCircleFilled style={{ color: '#94a3b8' }} />, color: 'default', label: '未知' },
};

function CapabilityStatusSummary({
  assistant,
  model,
  dataSource,
  externalSources,
  pythonRuntimeStatus,
  compact = false,
}: CapabilityStatusSummaryProps) {
  return (
    <Card className="ap-capability-summary" size="small" styles={{ body: { padding: compact ? 14 : 20 } }}>
      <Typography.Text strong style={{ fontSize: compact ? 13 : 15, display: 'block', marginBottom: 10 }}>
        当前默认能力
      </Typography.Text>

      <div className="ap-capability-summary__grid">
        <div className="ap-capability-summary__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>默认 Assistant</Typography.Text>
          <div style={{ marginTop: 2 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{assistant.name || '未配置'}</Typography.Text>
            {assistant.status !== 'unknown' && <Tag color={STATUS_CONFIG[assistant.status].color} style={{ fontSize: 10, marginLeft: 6 }}>{STATUS_CONFIG[assistant.status].label}</Tag>}
          </div>
        </div>
        <div className="ap-capability-summary__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>默认模型</Typography.Text>
          <div style={{ marginTop: 2 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{model.name || '未配置'}</Typography.Text>
            <Tag color={STATUS_CONFIG[model.status].color} style={{ fontSize: 10, marginLeft: 6 }}>{STATUS_CONFIG[model.status].label}</Tag>
          </div>
        </div>
        <div className="ap-capability-summary__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>默认数据源</Typography.Text>
          <div style={{ marginTop: 2 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{dataSource.name || '未配置'}</Typography.Text>
            <Tag color={STATUS_CONFIG[dataSource.status].color} style={{ fontSize: 10, marginLeft: 6 }}>{STATUS_CONFIG[dataSource.status].label}</Tag>
          </div>
        </div>
        <div className="ap-capability-summary__item">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>Python Runtime</Typography.Text>
          <div style={{ marginTop: 2 }}>
            <Tag icon={STATUS_CONFIG[pythonRuntimeStatus].icon} color={STATUS_CONFIG[pythonRuntimeStatus].color} style={{ fontSize: 10 }}>{STATUS_CONFIG[pythonRuntimeStatus].label}</Tag>
          </div>
        </div>
      </div>

      {externalSources.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>外部资料源</Typography.Text>
          <Space size={4} wrap>
            {externalSources.map((es) => {
              const cfg = STATUS_CONFIG[es.status];
              return (
                <Tag key={es.name} icon={cfg.icon} color={cfg.color} style={{ fontSize: 10 }}>{es.name} · {cfg.label}</Tag>
              );
            })}
          </Space>
        </div>
      )}
    </Card>
  );
}

export default CapabilityStatusSummary;
