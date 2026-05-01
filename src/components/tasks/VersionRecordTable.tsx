import { Button, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { EyeOutlined, RedoOutlined, SwapOutlined } from '@ant-design/icons';
import type { TaskVersionRecord, TaskVersionKind } from '../../types/taskArchive';

type VersionRecordTableProps = {
  versions: TaskVersionRecord[];
  onSetCurrent: (version: TaskVersionRecord) => void;
  readonly?: boolean;
};

const KIND_LABELS: Record<TaskVersionKind, string> = {
  task_plan: '任务计划',
  evidence_pack: '证据资料',
  output: 'Output',
};

function VersionRecordTable({ versions, onSetCurrent, readonly = false }: VersionRecordTableProps) {
  if (versions.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 14 }}>暂无版本记录</Typography.Text>
      </div>
    );
  }

  return (
    <Table<TaskVersionRecord>
      className="ap-version-record"
      dataSource={versions}
      rowKey="versionId"
      size="small"
      pagination={false}
      columns={[
        {
          title: '版本',
          dataIndex: 'label',
          width: 60,
          render: (label: string, record) => (
            <Space size={4}>
              <Tag color={record.status === 'active' ? 'green' : record.status === 'failed' ? 'red' : 'default'} style={{ fontSize: 11 }}>
                {label}
              </Tag>
              {record.status === 'active' && <Tag color="blue" style={{ fontSize: 10 }}>当前</Tag>}
            </Space>
          ),
        },
        {
          title: '类型',
          dataIndex: 'kind',
          width: 90,
          render: (kind: TaskVersionKind) => (
            <Tag style={{ fontSize: 11 }}>{KIND_LABELS[kind] || kind}</Tag>
          ),
        },
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 140,
          render: (time: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{time}</Typography.Text>,
        },
        {
          title: '原因',
          dataIndex: 'reason',
          ellipsis: true,
          render: (reason: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{reason}</Typography.Text>,
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 80,
          render: (status: string) => {
            const cfg = status === 'active' ? { color: 'green' as const, label: '当前' } : status === 'failed' ? { color: 'red' as const, label: '失败' } : { color: 'default' as const, label: '归档' };
            return <Tag color={cfg.color} style={{ fontSize: 10 }}>{cfg.label}</Tag>;
          },
        },
        {
          title: '操作',
          width: 180,
          render: (_: unknown, record: TaskVersionRecord) => {
            const isFailed = record.status === 'failed';
            const isActive = record.status === 'active';
            const setLabel = record.kind === 'task_plan' ? '设为当前计划' : record.kind === 'evidence_pack' ? '设为当前证据包' : '设为当前版本';

            return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {isFailed ? (
                <>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => message.info(`失败原因：${record.failureReason || '未知'}`)}>查看失败原因</Button>
                  <Button size="small" icon={<RedoOutlined />} onClick={() => message.info('重试将在后续阶段接入真实 API')}>重试生成</Button>
                </>
              ) : isActive ? (
                <Button size="small" icon={<EyeOutlined />} onClick={() => message.info('当前版本')}>查看</Button>
              ) : (
                <>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => message.info('查看版本详情')}>查看</Button>
                  {readonly ? (
                    <Tooltip title="旧版 Session 不支持版本切换">
                      <Button size="small" icon={<SwapOutlined />} disabled>{setLabel}</Button>
                    </Tooltip>
                  ) : (
                    <Button size="small" icon={<SwapOutlined />} onClick={() => onSetCurrent(record)}>{setLabel}</Button>
                  )}
                </>
              )}
            </div>
            );
          },
        },
      ]}
    />
  );
}

export default VersionRecordTable;
