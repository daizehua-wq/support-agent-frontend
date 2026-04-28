import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  approveEvolutionAction,
  fetchEvolutionStatus,
  rejectEvolutionAction,
  runEvolutionNow,
  type EvolutionAction,
  type EvolutionStatus,
} from '../api/admin';

const emptyStatus: EvolutionStatus = {
  enabled: false,
  autoConfirm: false,
  pendingActions: [],
  rejectedActions: [],
  summary: {},
};

const statusColor = (status = '') => {
  if (status === 'applied') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'rejected') return 'default';
  return 'gold';
};

const typeLabel = (type = '') => {
  const labels: Record<string, string> = {
    create_rule: '新增规则',
    disable_rule: '停用规则',
    modify_rule: '修改规则',
    disable_template: '停用模板',
    modify_template: '修改模板',
  };

  return labels[type] || type || '-';
};

const formatJson = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

function Evolution() {
  const [status, setStatus] = useState<EvolutionStatus>(emptyStatus);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [previewAction, setPreviewAction] = useState<EvolutionAction | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setStatus(await fetchEvolutionStatus());
    } catch (error) {
      console.error('evolution status load failed:', error);
      message.error('优化建议加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runNow = async (autoConfirm: boolean) => {
    setRunning(true);
    try {
      await runEvolutionNow(autoConfirm);
      message.success(autoConfirm ? '演化任务已执行' : '演化建议已生成');
      await loadStatus();
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (record: EvolutionAction) => {
    setActionLoadingId(record.id);
    try {
      await approveEvolutionAction(record.id);
      message.success('建议已批准并执行');
      await loadStatus();
    } finally {
      setActionLoadingId('');
    }
  };

  const handleReject = async (record: EvolutionAction) => {
    setActionLoadingId(record.id);
    try {
      await rejectEvolutionAction(record.id);
      message.success('建议已拒绝');
      await loadStatus();
    } finally {
      setActionLoadingId('');
    }
  };

  const lastRun = status.lastRun;
  const summary = useMemo(() => status.summary || lastRun?.summary || {}, [lastRun, status.summary]);
  const recentActions = lastRun?.actions || [];

  const pendingColumns: ColumnsType<EvolutionAction> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (value: string) => typeLabel(value),
    },
    {
      title: '建议',
      key: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.title || typeLabel(record.type)}</Typography.Text>
          <Typography.Text type="secondary">{record.reason || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 88,
      render: (value: string) => <Tag>{value || 'p5'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (value: string) => <Tag color={statusColor(value)}>{value || 'pending'}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => setPreviewAction(record)}>
            查看
          </Button>
          <Button
            size="small"
            type="primary"
            loading={actionLoadingId === record.id}
            onClick={() => void handleApprove(record)}
          >
            批准
          </Button>
          <Button
            size="small"
            danger
            loading={actionLoadingId === record.id}
            onClick={() => void handleReject(record)}
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ];

  const recentColumns: ColumnsType<EvolutionAction> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (value: string) => typeLabel(value),
    },
    {
      title: '动作',
      key: 'title',
      render: (_, record) => record.title || record.reason || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (value: string) => <Tag color={statusColor(value)}>{value || 'pending'}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          优化建议
        </Typography.Title>
        <Typography.Text type="secondary">
          查看 P0 到 P5 再到 P2.5 的知识演化结果，审批待确认的新增规则和停用建议。
        </Typography.Text>
      </div>

      <Card loading={loading}>
        <Descriptions column={{ xs: 1, md: 3 }} size="small">
          <Descriptions.Item label="调度状态">
            <Tag color={status.enabled ? 'green' : 'default'}>{status.enabled ? '启用' : '关闭'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="自动确认">
            <Tag color={status.autoConfirm ? 'green' : 'gold'}>
              {status.autoConfirm ? '开启' : '人工确认'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="最近运行">
            {lastRun?.completedAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="新增规则">
            {summary.createRuleCount || 0}
          </Descriptions.Item>
          <Descriptions.Item label="停用规则">
            {summary.disabledRuleCount || 0}
          </Descriptions.Item>
          <Descriptions.Item label="待确认">
            {status.pendingActions.length}
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" loading={running} onClick={() => void runNow(false)}>
            生成建议
          </Button>
          <Button loading={running} onClick={() => void runNow(true)}>
            立即执行
          </Button>
          <Button onClick={() => void loadStatus()}>刷新</Button>
        </Space>
      </Card>

      <Card title="待确认建议" loading={loading}>
        <Table
          rowKey="id"
          size="small"
          columns={pendingColumns}
          dataSource={status.pendingActions}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: '暂无待确认建议' }}
        />
      </Card>

      <Card title="最近一次执行">
        <Table
          rowKey="id"
          size="small"
          columns={recentColumns}
          dataSource={recentActions}
          pagination={false}
          locale={{ emptyText: '暂无执行记录' }}
        />
      </Card>

      <Modal
        title={previewAction?.title || '建议详情'}
        open={Boolean(previewAction)}
        onCancel={() => setPreviewAction(null)}
        footer={<Button onClick={() => setPreviewAction(null)}>关闭</Button>}
        width={760}
      >
        <Typography.Paragraph>
          <Typography.Text strong>原因：</Typography.Text>
          {previewAction?.reason || '-'}
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Text strong>目标：</Typography.Text>
          {previewAction?.targetId || '-'}
        </Typography.Paragraph>
        <Typography.Text strong>Payload</Typography.Text>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
          {formatJson(previewAction?.payload)}
        </pre>
        <Typography.Text strong>Evidence</Typography.Text>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
          {formatJson(previewAction?.evidence)}
        </pre>
      </Modal>
    </Space>
  );
}

export default Evolution;
