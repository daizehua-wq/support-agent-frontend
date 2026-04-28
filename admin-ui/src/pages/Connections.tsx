import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
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
  createConnection,
  checkConnectionHealth,
  deleteConnection,
  fetchConnections,
  updateConnection,
  type Connection,
} from '../api/admin';

type ConnectionForm = {
  provider: string;
  apiKey: string;
};

function Connections() {
  const [form] = Form.useForm<ConnectionForm>();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const loadConnections = async () => {
    try {
      setLoading(true);
      setConnections(await fetchConnections());
    } catch (error) {
      console.error('connections load failed:', error);
      message.error('外部连接加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await createConnection(values);
      setModalOpen(false);
      form.resetFields();
      await loadConnections();
      message.success('连接已创建');
    } catch (error) {
      if (error instanceof Error) {
        console.error('connection create failed:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (record: Connection, checked: boolean) => {
    await updateConnection(record.id, { isActive: checked });
    await loadConnections();
  };

  const handleDelete = async (record: Connection) => {
    await deleteConnection(record.id);
    await loadConnections();
    message.success('连接已删除');
  };

  const handleHealthCheck = async (record: Connection) => {
    try {
      setCheckingId(record.id);
      await checkConnectionHealth(record.id);
      await loadConnections();
      message.success('健康检查已完成');
    } catch (error) {
      console.error('connection health check failed:', error);
      message.error('健康检查失败');
    } finally {
      setCheckingId('');
    }
  };

  const columns: ColumnsType<Connection> = [
    {
      title: 'Provider',
      dataIndex: 'provider',
    },
    {
      title: 'API Key 引用',
      render: (_, record) => record.apiKeyRef || record.api_key_ref || '-',
    },
    {
      title: '是否有密钥',
      render: (_, record) => (
        <Tag color={record.hasApiKey || record.has_api_key ? 'green' : 'default'}>
          {record.hasApiKey || record.has_api_key ? '已配置' : '未配置'}
        </Tag>
      ),
    },
    {
      title: '启用状态',
      render: (_, record) => (
        <Switch
          checked={Boolean(record.isActive ?? record.is_active)}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => void handleToggle(record, checked)}
        />
      ),
    },
    {
      title: '健康状态',
      render: (_, record) => {
        const status = record.healthStatus || record.health_status || 'unknown';
        const color = status === 'healthy' ? 'green' : status === 'unknown' ? 'default' : 'gold';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '最近检查',
      render: (_, record) => record.lastCheckedAt || record.last_checked_at || '-',
    },
    {
      title: '健康说明',
      render: (_, record) => record.healthMessage || record.health_message || '-',
    },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            loading={checkingId === record.id}
            onClick={() => void handleHealthCheck(record)}
          >
            健康检查
          </Button>
          <Popconfirm
            title="确认删除这个连接？"
            description="删除会清除运行时保存的该 provider 密钥。"
            onConfirm={() => void handleDelete(record)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  useEffect(() => {
    void loadConnections();
  }, []);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          外部连接
        </Typography.Title>
        <Typography.Text type="secondary">
          管理 OpenAI、CRM、ERP 等外部连接。列表永远只展示密钥引用，不返回明文。
        </Typography.Text>
      </div>

      <Card
        title="Connections"
        extra={
          <Button type="primary" onClick={() => setModalOpen(true)}>
            新增连接
          </Button>
        }
      >
        <Table rowKey="id" loading={loading} columns={columns} dataSource={connections} />
      </Card>

      <Modal
        title="新增外部连接"
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void handleCreate()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: '请输入 provider，例如 openai / crm' }]}
          >
            <Input placeholder="openai" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="仅提交给内部接口，列表不会展示明文" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default Connections;
