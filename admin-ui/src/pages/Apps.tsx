import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
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
  fetchAppUsage,
  fetchApps,
  updateApp,
  type AppUsage,
  type ManagedApp,
} from '../api/admin';

type AppForm = {
  name: string;
  description?: string;
  rateLimit?: number;
  maxTokens?: number;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const getCalls = (usage?: AppUsage) => Number(usage?.apiCalls ?? usage?.api_calls ?? 0);
const getTokens = (usage?: AppUsage) => Number(usage?.tokensUsed ?? usage?.tokens_used ?? 0);

const buildIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `app-create-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function Apps() {
  const [createForm] = Form.useForm<AppForm>();
  const [editForm] = Form.useForm<AppForm>();
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, AppUsage>>({});
  const [usageTrend, setUsageTrend] = useState<AppUsage[]>([]);
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
      const nextApps = await fetchApps();
      setApps(nextApps);

      const today = todayKey();
      const pairs = await Promise.all(
        nextApps.map(async (app) => {
          const usage = await fetchAppUsage(app.id, today, today);
          return [app.id, usage[0]] as const;
        }),
      );
      setUsageMap(Object.fromEntries(pairs.filter(([, usage]) => Boolean(usage))));
    } catch (error) {
      console.error('apps load failed:', error);
      message.error('应用列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (creatingRef.current) {
      return;
    }

    creatingRef.current = true;
    try {
      const values = await createForm.validateFields();
      setSaving(true);
      const app = await createApp({
        ...values,
        idempotencyKey: buildIdempotencyKey(),
      });
      setCreatedApiKey(app.apiKey || app.api_key || '');
      setCreateOpen(false);
      createForm.resetFields();
      await loadApps();
    } catch (error) {
      if (error instanceof Error) {
        console.error('app create failed:', error);
      }
    } finally {
      creatingRef.current = false;
      setSaving(false);
    }
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
      message.success('应用已更新');
    } catch (error) {
      if (error instanceof Error) {
        console.error('app update failed:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (app: ManagedApp, checked: boolean) => {
    await updateApp(app.id, { status: checked ? 'active' : 'suspended' });
    await loadApps();
  };

  const handleDelete = async (app: ManagedApp) => {
    await deleteApp(app.id);
    await loadApps();
    message.success('应用已删除');
  };

  const openDetail = async (app: ManagedApp) => {
    setDetailTarget(app);
    setUsageTrend(await fetchAppUsage(app.id, daysAgo(6), todayKey()));
  };

  const columns: ColumnsType<ManagedApp> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => void openDetail(record)}>
          {value}
        </Button>
      ),
    },
    {
      title: 'API Key 前缀',
      render: (_, record) => record.apiKeyPrefix || record.api_key_prefix || '-',
    },
    {
      title: '状态',
      render: (_, record) => (
        <Tag color={record.status === 'active' ? 'green' : 'gold'}>
          {record.status === 'active' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '今日调用量',
      render: (_, record) => getCalls(usageMap[record.id]),
    },
    {
      title: '操作',
      width: 260,
      render: (_, record) => (
        <Space>
          <Switch
            checked={record.status === 'active'}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={(checked) => void handleToggle(record, checked)}
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
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          应用管理
        </Typography.Title>
        <Typography.Text type="secondary">
          管理开放 API 的接入应用、API Key、速率限制和 Token 配额。
        </Typography.Text>
      </div>

      <Card
        title="Apps"
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            新建应用
          </Button>
        }
      >
        <Table rowKey="id" loading={loading} columns={columns} dataSource={apps} />
      </Card>

      <Modal
        title="新建应用"
        open={createOpen}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ rateLimit: 60, maxTokens: 100000 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input placeholder="例如：CRM 客服插件" />
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
        title="编辑应用"
        open={Boolean(editTarget)}
        confirmLoading={saving}
        onOk={() => void handleEdit()}
        onCancel={() => setEditTarget(null)}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入应用名称' }]}>
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
          message="API Key 只会展示一次，后续无法再次查看明文。"
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea value={createdApiKey} readOnly rows={2} />
      </Modal>

      <Modal
        title="应用用量"
        open={Boolean(detailTarget)}
        width={760}
        footer={null}
        onCancel={() => setDetailTarget(null)}
      >
        {detailTarget ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="名称">{detailTarget.name}</Descriptions.Item>
              <Descriptions.Item label="状态">{detailTarget.status}</Descriptions.Item>
              <Descriptions.Item label="API Key 前缀">
                {detailTarget.apiKeyPrefix || detailTarget.api_key_prefix || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="速率限制">
                {detailTarget.rateLimitPerMin ?? detailTarget.rate_limit_per_min}
              </Descriptions.Item>
              <Descriptions.Item label="Token 配额">
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
                { title: 'API 调用量', render: (_, record) => getCalls(record) },
                { title: 'Token 消耗量', render: (_, record) => getTokens(record) },
              ]}
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}

export default Apps;
