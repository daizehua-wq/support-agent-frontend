import { Alert, Space, Typography, Input } from 'antd';
import {
  ExclamationCircleFilled,
  InfoCircleFilled,
  WarningFilled,
} from '@ant-design/icons';
import type { MissingInfoItem, MissingInfoLevel } from '../../types/taskPlan';

type MissingInfoValues = Record<string, string>;

type MissingInfoPanelProps = {
  items: MissingInfoItem[];
  values: MissingInfoValues;
  onChangeValue: (field: string, value: string) => void;
};

const LEVEL_CONFIG: Record<MissingInfoLevel, { color: string; icon: React.ReactNode; label: string }> = {
  required: {
    color: '#ef4444',
    icon: <ExclamationCircleFilled style={{ color: '#ef4444' }} />,
    label: '必填',
  },
  recommended: {
    color: '#f59e0b',
    icon: <WarningFilled style={{ color: '#f59e0b' }} />,
    label: '强建议',
  },
  optional: {
    color: '#94a3b8',
    icon: <InfoCircleFilled style={{ color: '#94a3b8' }} />,
    label: '可选',
  },
};

function MissingInfoPanel({ items, values, onChangeValue }: MissingInfoPanelProps) {
  if (items.length === 0) return null;

  const requiredItems = items.filter((i) => i.level === 'required');
  const recommendedItems = items.filter((i) => i.level === 'recommended');
  const optionalItems = items.filter((i) => i.level === 'optional');
  const hasRequiredMissing = requiredItems.some((i) => !values[i.field]?.trim());

  return (
    <div className="ap-missing-info">
      <Typography.Title level={5} style={{ margin: '0 0 12px' }}>
        需要补充的信息
      </Typography.Title>

      {items.map((item) => {
        const cfg = LEVEL_CONFIG[item.level];
        return (
          <div key={item.field} className="ap-missing-info__row">
            <Space align="start">
              {cfg.icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={6} style={{ marginBottom: 4 }}>
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {item.label}
                  </Typography.Text>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: cfg.color,
                      background: `${cfg.color}18`,
                      padding: '1px 7px',
                      borderRadius: 999,
                    }}
                  >
                    {cfg.label}
                  </span>
                </Space>
                {item.reason && (
                  <Typography.Paragraph
                    type="secondary"
                    style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}
                  >
                    {item.reason}
                  </Typography.Paragraph>
                )}
                <Input
                  style={{ marginTop: 6 }}
                  placeholder={`输入${item.label}`}
                  value={values[item.field] || ''}
                  onChange={(e) => onChangeValue(item.field, e.target.value)}
                  status={item.level === 'required' && !values[item.field]?.trim() ? 'error' : undefined}
                />
              </div>
            </Space>
          </div>
        );
      })}

      {hasRequiredMissing && (
        <Alert
          type="error"
          showIcon
          message="必填信息未完成"
          description="请先填写所有标记为「必填」的信息，才能确认并开始执行任务。"
          style={{ marginTop: 12 }}
        />
      )}

      {!hasRequiredMissing && (recommendedItems.length > 0 || optionalItems.length > 0) && (
        <Alert
          type="warning"
          showIcon
          message="建议补充信息"
          description="部分推荐信息尚未填写，不影响确认执行，但可能影响分析精确度。"
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}

export default MissingInfoPanel;
