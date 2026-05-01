import { Table, Tag, Typography, Button, Space, Tooltip } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExportOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { TaskArchiveItem, TaskArchiveType } from '../../types/taskArchive';
import CopyOutputMenu from './CopyOutputMenu';

type HistoryTaskTableProps = {
  tasks: TaskArchiveItem[];
  onContinue: (task: TaskArchiveItem) => void;
};

const TYPE_LABELS: Record<TaskArchiveType, string> = {
  full_workflow: '完整任务流',
  customer_analysis: '客户分析',
  evidence_search: '资料检索',
  output_generation: '输出生成',
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  completed: { color: 'green', icon: <CheckCircleFilled />, label: '已完成' },
  continuable: { color: 'processing', icon: <ClockCircleFilled />, label: '可继续' },
  failed: { color: 'red', icon: <CloseCircleFilled />, label: '失败' },
  running: { color: 'processing', icon: <ClockCircleFilled />, label: '执行中' },
  needs_info: { color: 'orange', icon: <WarningFilled />, label: '需补充信息' },
  draft: { color: 'default', icon: <ClockCircleFilled />, label: '草稿' },
};

const STATUS_ORDER: Record<string, number> = {
  continuable: 0,
  failed: 1,
  running: 2,
  needs_info: 3,
  completed: 4,
  draft: 5,
};

function HistoryTaskTable({ tasks, onContinue }: HistoryTaskTableProps) {
  const navigate = useNavigate();

  const sortedTasks = [...tasks].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99),
  );

  return (
    <Table<TaskArchiveItem>
      className="ap-task-table"
      dataSource={sortedTasks}
      rowKey="taskId"
      pagination={false}
      columns={[
        {
          title: '任务标题',
          dataIndex: 'taskTitle',
          render: (title: string, record) => (
            <Space size={4}>
              <Button type="link" style={{ padding: 0, fontWeight: 650, fontSize: 14, textAlign: 'left' }} onClick={() => navigate(`/tasks/${record.taskId}`)}>
                {title}
              </Button>
              {record.source === 'legacy_session' && <Tag style={{ fontSize: 10, color: '#6366f1' }}>旧版 Session</Tag>}
            </Space>
          ),
        },
        {
          title: '任务类型',
          dataIndex: 'taskType',
          width: 110,
          render: (type: TaskArchiveType) => (
            <Tag style={{ fontSize: 11 }}>{TYPE_LABELS[type] || type}</Tag>
          ),
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 110,
          render: (status: string) => {
            const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
            return <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 11 }}>{cfg.label}</Tag>;
          },
        },
        {
          title: '最近步骤',
          dataIndex: 'recentStep',
          ellipsis: true,
          render: (step: string) => <Typography.Text type="secondary" style={{ fontSize: 13 }}>{step || '—'}</Typography.Text>,
        },
        {
          title: 'Assistant',
          dataIndex: 'assistantName',
          width: 140,
          ellipsis: true,
          render: (name: string) => <Typography.Text type="secondary" style={{ fontSize: 13 }}>{name || '—'}</Typography.Text>,
        },
        {
          title: '更新时间',
          dataIndex: 'updatedAt',
          width: 140,
          render: (time: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{time}</Typography.Text>,
        },
        {
          title: '操作',
          width: 240,
          render: (_: unknown, record: TaskArchiveItem) => (
            <Space size={4} wrap>
              <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/tasks/${record.taskId}`)}>查看</Button>
              {record.status === 'continuable' && (
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => onContinue(record)}>继续</Button>
              )}
              {record.status === 'failed' && (
                <>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/tasks/${record.taskId}`)}>查看失败</Button>
                  <Button size="small" icon={<RedoOutlined />} onClick={() => onContinue(record)}>重试</Button>
                </>
              )}
              {!['continuable', 'failed', 'running'].includes(record.status) && record.hasOutput && (
                <>
                  <Button size="small" icon={<ExportOutlined />} onClick={() => navigate(`/tasks/${record.taskId}/output`)}>进入 Output</Button>
                  <CopyOutputMenu hasOutput={record.hasOutput} formalPreview={record.outputVersions.length > 0 ? FORMAL_PREVIEW : undefined} />
                </>
              )}
              {!['continuable', 'failed', 'running'].includes(record.status) && !record.hasOutput && (
                <Tooltip title="该任务尚未生成 Output">
                  <Button size="small" icon={<ExportOutlined />} disabled>复制输出</Button>
                </Tooltip>
              )}
            </Space>
          ),
        },
      ]}
    />
  );
}

const FORMAL_PREVIEW = '尊敬的客户：根据我们的分析，贵司当前处于半导体材料应用的关键阶段。我们建议从涂布工艺参数优化入手……';

export default HistoryTaskTable;
