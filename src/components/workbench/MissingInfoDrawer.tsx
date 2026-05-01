import { Button, Drawer, Input, Space, Typography } from 'antd';
import { ExclamationCircleFilled, InfoCircleFilled, WarningFilled } from '@ant-design/icons';
import { useState } from 'react';

type MissingInfoField = {
  key: string;
  label: string;
  level: 'required' | 'recommended' | 'optional';
  value: string;
};

type MissingInfoDrawerProps = {
  open: boolean;
  fields: MissingInfoField[];
  onSave: (values: Record<string, string>) => void;
  onContinueLimited: () => void;
  onClose: () => void;
};

const LEVEL_CONFIG: Record<string, { icon: React.ReactNode; color: string; text: string }> = {
  required: { icon: <ExclamationCircleFilled style={{ color: '#ef4444' }} />, color: '#ef4444', text: '必填' },
  recommended: { icon: <WarningFilled style={{ color: '#f59e0b' }} />, color: '#f59e0b', text: '强建议' },
  optional: { icon: <InfoCircleFilled style={{ color: '#94a3b8' }} />, color: '#94a3b8', text: '可选' },
};

function MissingInfoDrawer({ open, fields, onSave, onContinueLimited, onClose }: MissingInfoDrawerProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const hasRequiredMissing = fields.some((f) => f.level === 'required' && !values[f.key]?.trim());

  const handleSave = () => {
    onSave(values);
    setValues({});
  };

  const handleContinue = () => {
    if (!hasRequiredMissing) onContinueLimited();
  };

  return (
    <Drawer title="补充缺失信息" open={open} onClose={onClose} width={460} extra={<Button type="primary" onClick={handleSave}>保存补充信息</Button>}>
      {hasRequiredMissing && (
        <Typography.Text type="danger" style={{ display: 'block', fontSize: 13, marginBottom: 16 }}>
          存在必填信息缺失，无法基于有限信息继续。
        </Typography.Text>
      )}
      {!hasRequiredMissing && (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 16 }}>
          你可以继续执行，但缺失信息会进入 Output 风险区。
        </Typography.Text>
      )}

      {fields.map((field) => {
        const cfg = LEVEL_CONFIG[field.level];
        return (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <Space size={6} style={{ marginBottom: 6 }}>
              {cfg.icon}
              <Typography.Text strong style={{ fontSize: 13 }}>{field.label}</Typography.Text>
              <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: `${cfg.color}18`, padding: '1px 7px', borderRadius: 999 }}>
                {cfg.text}
              </span>
            </Space>
            <Input
              placeholder={`输入${field.label}`}
              value={values[field.key] || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              status={field.level === 'required' && !values[field.key]?.trim() ? 'error' : undefined}
            />
          </div>
        );
      })}

      <div style={{ marginTop: 20 }}>
        <Button block onClick={handleContinue} disabled={hasRequiredMissing}>
          基于有限信息继续
        </Button>
      </div>
    </Drawer>
  );
}

export default MissingInfoDrawer;
