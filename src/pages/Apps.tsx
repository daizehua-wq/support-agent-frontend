import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

import {
  createApp,
  deleteApp,
  getAppUsage,
  getApps,
  getInternalStats,
  updateApp,
  type AppUsageRecord,
  type InternalStats,
  type ManagedApp,
} from '../api/admin';
import PageHeader from '../components/common/PageHeader';
import { formatDateToLocalDateKey } from '../utils/dateTime';

type AppFormValues = {
  name: string;
  description?: string;
  rateLimit?: number;
  maxTokens?: number;
};

const todayKey = () => formatDateToLocalDateKey();

const dateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDateToLocalDateKey(date);
};

const readUsageCalls = (record?: AppUsageRecord) => {
  return Number(record?.apiCalls ?? record?.api_calls ?? 0);
};

const readUsageTokens = (record?: AppUsageRecord) => {
  return Number(record?.tokensUsed ?? record?.tokens_used ?? 0);
};

const buildIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `app-create-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function AppsPage() {
  const [form] = Form.useForm<AppFormValues>();
  const [editForm] = Form.useForm<AppFormValues>();
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [usageByApp, setUsageByApp] = useState<Record<string, AppUsageRecord>>({});
  const [usageTrend, setUsageTrend] = useState<AppUsageRecord[]>([]);
  const [stats, setStats] = useState<InternalStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedApp | null>(null);
  const [detailTarget, setDetailTarget] = useState<ManagedApp | null>(null);
  const [createdApiKey, setCreatedApiKey] = useState('');
  const creatingRef = useRef(false);

  const loadApps = async () => {
    try {
      setLoading(true);
      const [nextApps, nextStats] = await Promise.all([getApps(), getInternalStats()]);
      setApps(nextApps);
      setStats(nextStats);

      const today = todayKey();
      const usagePairs = await Promise.all(
        nextApps.map(async (app) => {
          const usage = await getAppUsage(app.id, today, today);
          return [app.id, usage[0]] as const;
        }),
      );
      setUsageByApp(Object.fromEntries(usagePairs.filter(([, usage]) => Boolean(usage))));
    } catch (error) {
      console.error('应用列表加载失败：', error);
      message.error('应用列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsageTrend = async (app: ManagedApp) => {
    try {
      const usage = await getAppUsage(app.id, dateDaysAgo(6), todayKey());
      setUsageTrend(usage);
    } catch (error) {
      console.error('用量趋势加载失败：', error);
      message.error('用量趋势加载失败');
    }
  };

  const handleCreate = async () => {
    if (creatingRef.current) {
      return;
    }

    creatingRef.current = true;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const app = await createApp({
        ...values,
        idempotencyKey: buildIdempotencyKey(),
      });
      const apiKey = app.apiKey || app.api_key || '';
      setCreateOpen(false);
      form.resetFields();
      setCreatedApiKey(apiKey);
      await loadApps();
    } catch (error) {
      if (error instanceof Error) {
        console.error('应用创建失败：', error);
      }
    } finally {
      creatingRef.current = false;
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget) {
      return;
    }

    try {
      const values = await editForm.validateFields();
      setSaving(true);
      await updateApp(editTarget.id, values);
      setEditTarget(null);
      await loadApps();
      message.success('应用配置已更新');
    } catch (error) {
      if (error instanceof Error) {
        console.error('应用更新失败：', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (app: ManagedApp, checked: boolean) => {
    await updateApp(app.id, {
      status: checked ? 'active' : 'suspended',
    });
    await loadApps();
  };

  const handleDelete = async (app: ManagedApp) => {
    await deleteApp(app.id);
    await loadApps();
    message.success('应用已删除');
  };

  const openEdit = (app: ManagedApp) => {
    setEditTarget(app);
    editForm.setFieldsValue({
      name: app.name,
      description: app.description,
      rateLimit: app.rateLimitPerMin ?? app.rate_limit_per_min,
      maxTokens: app.maxTokensPerDay ?? app.max_tokens_per_day,
    });
  };

  const openDetail = (app: ManagedApp) => {
    setDetailTarget(app);
    void loadUsageTrend(app);
  };

  const columns: ColumnsType<ManagedApp> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (value: string, record) => (
        <Button type="link" onClick={() => openDetail(record)} style={{ padding: 0 }}>
          {value}
        </Button>
      ),
    },
    {
      title: 'API Key 前缀',
      dataIndex: 'apiKeyPrefix',
      render: (_value, record) => record.apiKeyPrefix || record.api_key_prefix || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: ManagedApp['status']) => (
        <Tag color={status === 'active' ? 'green' : 'gold'}>
          {status === 'active' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '今日调用量',
      render: (_value, record) => readUsageCalls(usageByApp[record.id]),
    },
    {
      title: '今日 Token',
      render: (_value, record) => readUsageTokens(usageByApp[record.id]),
    },
    {
      title: '操作',
      width: 240,
      render: (_value, record) => (
        <Space>
          <Switch
            checked={record.status === 'active'}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={(checked) => void handleToggleStatus(record, checked)}
          />
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这个应用？"
            description="删除后该应用无法继续调用开放 API。"
            onConfirm={() => void handleDelete(record)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  useEffect(() => {
    void loadApps();
  }, []);

  return (
    <div>
      <PageHeader
        title="应用管理"
        description="管理开放 API 的调用方、API Key、速率限制、Token 配额和用量统计。"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={6}>
          <Card>
            <Typography.Text type="secondary">应用总数</Typography.Text>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.totalApps ?? 0}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Typography.Text type="secondary">活跃应用</Typography.Text>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.activeApps ?? 0}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Typography.Text type="secondary">今日 API 调用</Typography.Text>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.todayApiCalls ?? 0}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Typography.Text type="secondary">今日 Token 消耗</Typography.Text>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.todayTokensUsed ?? 0}</div>
          </Card>
        </Col>
      </Row>

      <Card
        title="接入应用"
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            新建应用
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={apps}
          pagination={{ pageSize: 8 }}
        />
      </Card>

      <Modal
        title="新建应用"
        open={createOpen}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
      >
        <Form form={form} layout="vertical" initialValues={{ rateLimit: 60, maxTokens: 100000 }}>
          <Form.Item name="name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input placeholder="例如：官网客服机器人" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="说明用途、负责人或接入系统" />
          </Form.Item>
          <Form.Item name="rateLimit" label="每分钟速率限制">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxTokens" label="每日 Token 配额">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑应用"
        open={Boolean(editTarget)}
        confirmLoading={saving}
        onCancel={() => setEditTarget(null)}
        onOk={() => void handleEdit()}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="rateLimit" label="每分钟速率限制">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxTokens" label="每日 Token 配额">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="请立即保存 API Key"
        open={Boolean(createdApiKey)}
        onCancel={() => setCreatedApiKey('')}
        footer={
          <Button type="primary" onClick={() => setCreatedApiKey('')}>
            我已保存
          </Button>
        }
      >
        <Alert
          type="warning"
          showIcon
          message="API Key 只会在创建时展示一次，之后后台只保存不可逆哈希。"
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea value={createdApiKey} readOnly rows={2} />
        <Button
          style={{ marginTop: 12 }}
          onClick={() => {
            void navigator.clipboard.writeText(createdApiKey);
            message.success('API Key 已复制');
          }}
        >
          复制 API Key
        </Button>
      </Modal>

      <Modal
        title="应用详情"
        open={Boolean(detailTarget)}
        width={760}
        footer={null}
        onCancel={() => setDetailTarget(null)}
      >
        {detailTarget ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="名称">{detailTarget.name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {detailTarget.status === 'active' ? '启用' : '停用'}
              </Descriptions.Item>
              <Descriptions.Item label="API Key 前缀">
                {detailTarget.apiKeyPrefix || detailTarget.api_key_prefix || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="每分钟限制">
                {detailTarget.rateLimitPerMin ?? detailTarget.rate_limit_per_min}
              </Descriptions.Item>
              <Descriptions.Item label="每日 Token 配额">
                {detailTarget.maxTokensPerDay ?? detailTarget.max_tokens_per_day}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {detailTarget.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Table
              rowKey="date"
              size="small"
              pagination={false}
              dataSource={usageTrend}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '调用量', render: (_value, record) => readUsageCalls(record) },
                { title: 'Token', render: (_value, record) => readUsageTokens(record) },
              ]}
              locale={{ emptyText: '最近 7 天暂无调用数据' }}
            />
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}

export default AppsPage;
