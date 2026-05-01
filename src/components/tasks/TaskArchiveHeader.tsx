import { Button, Space, Tag, Typography, Alert } from 'antd';
import { ExportOutlined, PlayCircleOutlined } from '@ant-design/icons';
import CopyOutputMenu from './CopyOutputMenu';
import type { TaskArchiveItem } from '../../types/taskArchive';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  completed: { color: 'green', label: '已完成' },
  continuable: { color: 'processing', label: '可继续' },
  failed: { color: 'red', label: '失败' },
  running: { color: 'processing', label: '执行中' },
  needs_info: { color: 'orange', label: '需补充信息' },
  draft: { color: 'default', label: '草稿' },
};

type TaskArchiveHeaderProps = {
  task: TaskArchiveItem;
  onContinue: (task: TaskArchiveItem) => void;
  onGoOutput: () => void;
};

function TaskArchiveHeader({ task, onContinue, onGoOutput }: TaskArchiveHeaderProps) {
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
  const outputVersion = task.outputVersions.find((v) => v.status === 'active') || task.outputVersions[task.outputVersions.length - 1];

  return (
    <div className="ap-task-archive-header">
      {task.source === 'legacy_session' && (
        <Alert
          type="info" banner showIcon
          message="旧版 Session 只读视图"
          description="该任务来自旧版 Session，只支持回看和基于上下文继续，不支持版本切换。"
          style={{ borderRadius: 20, marginBottom: 14 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>{task.taskTitle}</Typography.Title>
          <Space size={6} style={{ marginTop: 8 }} wrap>
            <Tag color={statusCfg.color} style={{ fontSize: 11 }}>{statusCfg.label}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>最近步骤：{task.recentStep}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>· Assistant：{task.assistantName}</Typography.Text>
            {outputVersion && (
              <Tag color="blue" style={{ fontSize: 10 }}>Output {outputVersion.label}</Tag>
            )}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{task.updatedAt}</Typography.Text>
        </div>
        <Space size={8} style={{ flexShrink: 0, marginTop: 4 }}>
          {task.hasOutput && (
            <>
              <Button type="primary" icon={<ExportOutlined />} onClick={onGoOutput}>进入 Output 工作台</Button>
              <CopyOutputMenu hasOutput={task.hasOutput} formalPreview="尊敬的客户：根据我们的分析……" />
            </>
          )}
          {['continuable', 'failed'].includes(task.status) && (
            <Button icon={<PlayCircleOutlined />} onClick={() => onContinue(task)}>继续推进</Button>
          )}
        </Space>
      </div>
    </div>
  );
}

export default TaskArchiveHeader;
