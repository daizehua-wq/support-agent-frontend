import { Button, Card, Space, Tag, Typography } from 'antd';
import { EyeOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { TaskArchiveItem } from '../../types/taskArchive';

type HistoryTaskCardProps = {
  task: TaskArchiveItem;
  onContinue: (task: TaskArchiveItem) => void;
};

function HistoryTaskCard({ task, onContinue }: HistoryTaskCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="ap-task-card" size="small" styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 15 }}>{task.taskTitle}</Typography.Text>
            <Tag color="processing" style={{ fontSize: 11 }}>可继续</Tag>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              最近步骤：{task.recentStep}
            </Typography.Text>
          </div>
          <div style={{ marginTop: 4 }}>
            {task.completedSteps?.map((s, i) => (
              <Tag key={i} color="green" style={{ fontSize: 10, marginBottom: 4 }}>✅ {s}</Tag>
            ))}
            {task.pendingSteps?.map((s, i) => (
              <Tag key={i} color="default" style={{ fontSize: 10, marginBottom: 4 }}>⏳ {s}</Tag>
            ))}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            {task.updatedAt}
          </Typography.Text>
        </div>
        <Space size={8} style={{ flexShrink: 0 }}>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => onContinue(task)}>继续推进</Button>
          <Button icon={<EyeOutlined />} onClick={() => navigate(`/tasks/${task.taskId}`)}>查看详情</Button>
        </Space>
      </div>
    </Card>
  );
}

export default HistoryTaskCard;
