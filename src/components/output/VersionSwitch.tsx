import { Button, Space, Typography } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import type { OutputVersion } from '../../types/output';

type VersionSwitchProps = {
  versions: OutputVersion[];
  currentVersionId: string;
  onSwitch: (versionId: string) => void;
};

function VersionSwitch({ versions, currentVersionId, onSwitch }: VersionSwitchProps) {
  const current = versions.find((v) => v.versionId === currentVersionId);
  const others = versions.filter((v) => v.versionId !== currentVersionId && v.status !== 'failed');

  if (others.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        当前查看：{current?.label || '—'}
      </Typography.Text>
      <Space size={6} wrap>
        {others.map((v) => (
          <Button
            key={v.versionId}
            size="small"
            icon={<SwapOutlined />}
            onClick={() => onSwitch(v.versionId)}
          >
            切换到 {v.label}
          </Button>
        ))}
      </Space>
    </div>
  );
}

export default VersionSwitch;
