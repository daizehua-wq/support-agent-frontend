import { Modal, Radio, Space, Typography } from 'antd';
import { useState } from 'react';

type RegenerateMode = 'tone' | 'current' | 'supplement' | 'edit-goal';

type RegenerateOutputModalProps = {
  open: boolean;
  onConfirm: (mode: RegenerateMode) => void;
  onCancel: () => void;
};

const OPTIONS: Array<{ value: RegenerateMode; label: string; description: string }> = [
  { value: 'tone', label: '仅调整语气', description: '保持当前内容，调整输出语气后生成新版本。' },
  { value: 'current', label: '基于当前依据重新生成', description: '使用当前证据和分析结果重新生成 Output。' },
  { value: 'supplement', label: '补充资料后重新生成', description: '打开补充信息面板，补充资料后生成新的 Output Version。' },
  { value: 'edit-goal', label: '修改任务计划后重新生成', description: '返回 Workbench 编辑任务目标和计划，生成新的 TaskPlan Version。' },
];

function RegenerateOutputModal({ open, onConfirm, onCancel }: RegenerateOutputModalProps) {
  const [mode, setMode] = useState<RegenerateMode>('current');

  return (
    <Modal
      title="生成新的 Output 版本"
      open={open}
      onOk={() => onConfirm(mode)}
      onCancel={onCancel}
      okText="生成新版本"
      width={540}
      centered
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 16 }}>
        新生成会创建一个新的 Output Version。当前版本不会被覆盖，你仍可以在版本历史中查看和设为当前版本。
      </Typography.Paragraph>

      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {OPTIONS.map((opt) => (
            <Radio key={opt.value} value={opt.value} style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(248,250,252,0.72)', width: '100%' }}>
              <Typography.Text strong style={{ fontSize: 14 }}>{opt.label}</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{opt.description}</Typography.Text>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </Modal>
  );
}

export default RegenerateOutputModal;
