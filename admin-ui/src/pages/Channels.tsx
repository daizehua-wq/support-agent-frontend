import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  configureChannelByChat,
  createChannel,
  deleteChannel,
  fetchChannels,
  reloadChannels,
  updateChannel,
  type ChannelConfig,
  type ChannelConversationMessage,
} from '../api/admin';

type ChannelForm = {
  appId: string;
  channelType: string;
  channelName: string;
  app_id: string;
  app_secret: string;
  verification_token?: string;
  encrypt_key?: string;
};

const channelTypeLabel = (type = '') => {
  const labels: Record<string, string> = {
    feishu: '飞书',
    dingtalk: '钉钉',
    wecom: '企业微信',
  };
  return labels[type] || type || '-';
};

const buildChannelPayload = (values: ChannelForm) => ({
  app_id: values.appId || '',
  channel_type: values.channelType,
  channel_name: values.channelName,
  config: {
    app_id: values.app_id,
    app_secret: values.app_secret,
    verification_token: values.verification_token || '',
    encrypt_key: values.encrypt_key || '',
  },
});

const getChannelName = (record: ChannelConfig) => record.channelName || record.channel_name || '';
const getChannelType = (record: ChannelConfig) => record.channelType || record.channel_type || '';
const getAppId = (record: ChannelConfig) => record.appId || record.app_id || '';

function Channels() {
  const [form] = Form.useForm<ChannelForm>();
  const [chatForm] = Form.useForm<{ message: string }>();
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChannelConfig | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId] = useState(() => `channel-${Date.now()}`);
  const [chatHistory, setChatHistory] = useState<ChannelConversationMessage[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const currentFormTitle = editTarget ? '编辑渠道' : '新增渠道';

  const loadChannels = async () => {
    try {
      setLoading(true);
      setChannels(await fetchChannels());
    } catch (error) {
      console.error('channels load failed:', error);
      message.error('渠道列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditTarget(null);
    form.resetFields();
    form.setFieldsValue({ channelType: 'feishu' });
    setModalOpen(true);
  };

  const handleOpenEdit = (record: ChannelConfig) => {
    const config = (record.config || {}) as Record<string, string>;
    setEditTarget(record);
    form.setFieldsValue({
      appId: getAppId(record),
      channelType: getChannelType(record),
      channelName: getChannelName(record),
      app_id: config.app_id || '',
      app_secret: config.app_secret || '',
      verification_token: config.verification_token || '',
      encrypt_key: config.encrypt_key || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editTarget) {
        await updateChannel(editTarget.id, buildChannelPayload(values));
        message.success('渠道已更新');
      } else {
        await createChannel(buildChannelPayload(values));
        message.success('渠道已创建');
      }

      setModalOpen(false);
      form.resetFields();
      await loadChannels();
    } catch (error) {
      if (error instanceof Error) {
        console.error('channel save failed:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: ChannelConfig) => {
    await deleteChannel(record.id);
    await loadChannels();
    message.success('渠道已停用');
  };

  const handleReload = async () => {
    try {
      const result = await reloadChannels();
      message.success(`P4 网关已重新加载 ${result.channels_loaded ?? result.channelsLoaded ?? 0} 个渠道`);
    } catch (error) {
      console.error('channel reload failed:', error);
      message.error('P4 网关重载失败，请确认 api-gateway 已启动');
    }
  };

  const sendChatMessage = async (messageText?: string) => {
    const text = messageText || (await chatForm.validateFields()).message;
    const userMessage: ChannelConversationMessage = { role: 'user', content: text };
    const nextHistory = [...chatHistory, userMessage];

    try {
      setChatLoading(true);
      setChatHistory(nextHistory);
      chatForm.resetFields();

      const result = await configureChannelByChat(chatSessionId, text, chatHistory);
      const assistantMessage: ChannelConversationMessage = {
        role: 'assistant',
        content: result.reply || '已处理。',
      };
      setChatHistory([...nextHistory, assistantMessage]);
      setNeedsConfirmation(Boolean(result.needsConfirmation));

      if (result.channel_id || result.channelId) {
        message.success('渠道已通过对话创建');
        setNeedsConfirmation(false);
        await loadChannels();
      }
    } catch (error) {
      console.error('channel chat failed:', error);
      message.error('渠道配置对话失败');
    } finally {
      setChatLoading(false);
    }
  };

  const columns: ColumnsType<ChannelConfig> = useMemo(
    () => [
      {
        title: '渠道名称',
        render: (_, record) => getChannelName(record),
      },
      {
        title: '类型',
        render: (_, record) => <Tag color="blue">{channelTypeLabel(getChannelType(record))}</Tag>,
      },
      {
        title: '关联应用',
        render: (_, record) => getAppId(record) || '-',
      },
      {
        title: '状态',
        render: (_, record) => (
          <Tag color={record.status === 'disabled' ? 'default' : 'green'}>
            {record.status === 'disabled' ? '停用' : '启用'}
          </Tag>
        ),
      },
      {
        title: '创建来源',
        render: (_, record) => record.createdBy || record.created_by || 'human',
      },
      {
        title: '更新时间',
        render: (_, record) => record.updatedAt || record.updated_at || '-',
      },
      {
        title: '操作',
        width: 190,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => handleOpenEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="确认停用这个渠道？"
              description="停用后 P4 重新加载时不会再启用该渠道。"
              onConfirm={() => void handleDelete(record)}
            >
              <Button size="small" danger>
                停用
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  useEffect(() => {
    void loadChannels();
  }, []);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          渠道管理
        </Typography.Title>
        <Typography.Text type="secondary">
          管理 P4 感官与行动层的企业 IM 渠道。渠道配置只通过内部接口写入 P2.5，并支持网关热加载。
        </Typography.Text>
      </div>

      <Card
        title="Channels"
        extra={
          <Space>
            <Button onClick={() => setChatOpen(true)}>对话创建</Button>
            <Button onClick={() => void handleReload()}>重新加载渠道</Button>
            <Button type="primary" onClick={handleOpenCreate}>
              新增渠道
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" loading={loading} columns={columns} dataSource={channels} />
      </Card>

      <Modal
        title={currentFormTitle}
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ channelType: 'feishu' }}>
          <Form.Item name="channelType" label="渠道类型" rules={[{ required: true, message: '请选择渠道类型' }]}>
            <Select
              options={[
                { label: '飞书', value: 'feishu' },
                { label: '钉钉', value: 'dingtalk' },
                { label: '企业微信', value: 'wecom' },
              ]}
            />
          </Form.Item>
          <Form.Item name="channelName" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]}>
            <Input placeholder="例如：法务部风控助手" />
          </Form.Item>
          <Form.Item name="appId" label="关联应用 ID" rules={[{ required: true, message: '请输入关联应用 ID' }]}>
            <Input placeholder="填写 Apps 中的 app_id" />
          </Form.Item>
          <Form.Item name="app_id" label="App ID" rules={[{ required: true, message: '请输入 App ID' }]}>
            <Input placeholder="cli_xxxxx" />
          </Form.Item>
          <Form.Item name="app_secret" label="App Secret" rules={[{ required: true, message: '请输入 App Secret' }]}>
            <Input.Password placeholder="仅内部保存，列表不展示明文" />
          </Form.Item>
          <Form.Item name="verification_token" label="Verification Token">
            <Input.Password placeholder="飞书事件订阅校验 Token，可后续补充" />
          </Form.Item>
          <Form.Item name="encrypt_key" label="Encrypt Key">
            <Input.Password placeholder="事件加密 Key，可后续补充" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="对话创建渠道"
        open={chatOpen}
        confirmLoading={chatLoading}
        onCancel={() => setChatOpen(false)}
        footer={[
          needsConfirmation ? (
            <Button key="confirm" type="primary" loading={chatLoading} onClick={() => void sendChatMessage('确认执行')}>
              确认执行
            </Button>
          ) : null,
          <Button key="close" onClick={() => setChatOpen(false)}>
            关闭
          </Button>,
        ]}
        width={720}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="可以直接说：为法务部创建一个飞书机器人，关联应用 ID 是 app_xxx，App ID 是 cli_xxx，Secret 是 xxx。"
        />
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ maxHeight: 320, overflow: 'auto', paddingRight: 4 }}>
            {chatHistory.length === 0 ? (
              <Typography.Text type="secondary">还没有对话，先描述你要配置的渠道。</Typography.Text>
            ) : (
              chatHistory.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      whiteSpace: 'pre-wrap',
                      borderRadius: 14,
                      padding: '10px 12px',
                      background: item.role === 'user' ? '#1677ff' : '#f3f4f6',
                      color: item.role === 'user' ? '#fff' : '#111827',
                    }}
                  >
                    {item.content}
                  </div>
                </div>
              ))
            )}
          </div>

          <Form form={chatForm} layout="vertical">
            <Form.Item name="message" rules={[{ required: true, message: '请输入渠道需求' }]}>
              <Input.TextArea rows={3} placeholder="描述渠道需求，或补充 Agent 追问的信息" />
            </Form.Item>
            <Button type="primary" loading={chatLoading} onClick={() => void sendChatMessage()}>
              发送
            </Button>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}

export default Channels;
