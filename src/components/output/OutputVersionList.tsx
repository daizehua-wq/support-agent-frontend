import { Button, List, Tag, Typography, message } from 'antd';
import { CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, ExclamationCircleFilled, RedoOutlined } from '@ant-design/icons';
import type { OutputVersion } from '../../types/output';

type OutputVersionListProps = {
  versions: OutputVersion[];
  currentVersionId: string;
  onSetCurrent: (versionId: string) => void;
  onRetry: (versionId: string) => void;
  onView: (versionId: string) => void;
};

const STATUS_TAG: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
  success: { color: 'green', icon: <CheckCircleFilled />, text: '已生成' },
  evidence_insufficient: { color: 'orange', icon: <ExclamationCircleFilled />, text: '证据不足' },
  degraded: { color: 'orange', icon: <ExclamationCircleFilled />, text: '降级' },
  generating: { color: 'processing', icon: <ClockCircleFilled />, text: '生成中' },
  failed: { color: 'red', icon: <CloseCircleFilled />, text: '失败' },
};

function OutputVersionList({ versions, currentVersionId, onSetCurrent, onRetry, onView }: OutputVersionListProps) {
  return (
    <div className="ap-output-version-list">
      <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
        版本历史
      </Typography.Text>
      <List
        size="small"
        dataSource={versions}
        renderItem={(version) => {
          const tag = STATUS_TAG[version.status] || STATUS_TAG.success;
          const isCurrent = version.versionId === currentVersionId;

          return (
            <List.Item
              key={version.versionId}
              style={{ padding: '10px 0', borderBottom: '1px solid rgba(203,213,225,0.36)' }}
            >
              <List.Item.Meta
                avatar={
                  <Tag color={tag.color} icon={tag.icon} style={{ marginRight: 0 }}>
                    {version.label}
                    {isCurrent ? ' · 当前' : ''}
                  </Tag>
                }
                title={<Typography.Text style={{ fontSize: 13 }}>{version.reason}</Typography.Text>}
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{version.createdAt}</Typography.Text>
                }
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {isCurrent && version.status === 'failed' && (
                  <Button size="small" icon={<RedoOutlined />} onClick={() => onRetry(version.versionId)}>重试</Button>
                )}
                {isCurrent && version.status !== 'failed' && (
                  <>
                    <Button size="small" onClick={() => onView(version.versionId)}>查看</Button>
                    <Button size="small" onClick={() => {
                      const text = [version.formalVersion, version.conciseVersion, version.spokenVersion].filter(Boolean).join('\n\n');
                      navigator.clipboard.writeText(text || '').then(() => message.success('已复制该版本全部内容')).catch(() => message.error('复制失败'));
                    }}>复制该版本全部内容</Button>
                  </>
                )}
                {!isCurrent && version.status !== 'failed' && (
                  <>
                    <Button size="small" onClick={() => onView(version.versionId)}>查看</Button>
                    <Button size="small" onClick={() => {
                      const text = [version.formalVersion, version.conciseVersion, version.spokenVersion].filter(Boolean).join('\n\n');
                      navigator.clipboard.writeText(text || '').then(() => message.success('已复制该版本全部内容')).catch(() => message.error('复制失败'));
                    }}>复制该版本全部内容</Button>
                    <Button size="small" onClick={() => { onSetCurrent(version.versionId); message.info('已设为当前版本（本地预览）'); }}>设为当前</Button>
                  </>
                )}
                {!isCurrent && version.status === 'failed' && (
                  <Button size="small" danger onClick={() => onRetry(version.versionId)}>重试</Button>
                )}
              </div>
            </List.Item>
          );
        }}
      />
    </div>
  );
}

export default OutputVersionList;
