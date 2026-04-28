import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Popconfirm,
  Row,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  deleteSession,
  fetchSessionDetail,
  fetchSessions,
  type MessageItem,
  type SessionDetail,
  type SessionItem,
} from '../api/admin';

const roleColor: Record<MessageItem['role'], string> = {
  user: 'blue',
  assistant: 'green',
  system: 'gold',
};

const getSessionTime = (session: SessionItem) => session.updatedAt || session.updated_at || '';

function Conversations() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const updatedAt = getSessionTime(session);
      const day = updatedAt.slice(0, 10);

      if (startDate && day < startDate) {
        return false;
      }

      if (endDate && day > endDate) {
        return false;
      }

      return true;
    });
  }, [endDate, sessions, startDate]);

  const loadSessions = useCallback(async (queryUserId: string) => {
    try {
      setLoading(true);
      setSessions(await fetchSessions({ userId: queryUserId.trim() || undefined }));
    } catch (error) {
      console.error('sessions load failed:', error);
      message.error('会话列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setSelectedSession(await fetchSessionDetail(id));
    } catch (error) {
      console.error('session detail load failed:', error);
      message.error('会话详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setSelectedSession((current) => (current?.id === id ? null : current));
    await loadSessions(userId);
    message.success('会话已删除');
  };

  useEffect(() => {
    void loadSessions('');
  }, [loadSessions]);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          对话记录
        </Typography.Title>
        <Typography.Text type="secondary">
          浏览内部 SQLite 中保存的会话与消息时间线。
        </Typography.Text>
      </div>

      <Card>
        <Space wrap>
          <Input
            allowClear
            placeholder="按 userId 筛选"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            style={{ width: 220 }}
          />
          <Input
            placeholder="开始日期 YYYY-MM-DD"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            style={{ width: 180 }}
          />
          <Input
            placeholder="结束日期 YYYY-MM-DD"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            style={{ width: 180 }}
          />
          <Button type="primary" onClick={() => void loadSessions(userId)}>
            查询
          </Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card title="会话列表">
            <List
              loading={loading}
              dataSource={filteredSessions}
              locale={{ emptyText: '暂无会话' }}
              renderItem={(session) => (
                <List.Item
                  actions={[
                    <Button key="view" type="link" onClick={() => void loadDetail(session.id)}>
                      查看
                    </Button>,
                    <Popconfirm
                      key="delete"
                      title="确认删除这个会话？"
                      onConfirm={() => void handleDelete(session.id)}
                    >
                      <Button type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={session.title || session.id}
                    description={
                      <Space direction="vertical" size={4}>
                        <Typography.Text type="secondary">{session.id}</Typography.Text>
                        <Space wrap>
                          <Tag>{session.userId || session.user_id || 'no-user'}</Tag>
                          {session.appId || session.app_id ? (
                            <Tag color="purple">{session.appId || session.app_id}</Tag>
                          ) : null}
                          <Tag color="blue">{session.status || 'active'}</Tag>
                          <Tag>{getSessionTime(session) || '未返回时间'}</Tag>
                        </Space>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title={selectedSession ? selectedSession.title || selectedSession.id : '消息详情'}
            loading={detailLoading}
          >
            {selectedSession ? (
              <Timeline
                items={(selectedSession.messages || []).map((item) => ({
                  color: roleColor[item.role] || 'gray',
                  children: (
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space>
                        <Tag color={roleColor[item.role] || 'default'}>{item.role}</Tag>
                        <Typography.Text type="secondary">
                          {item.createdAt || item.created_at || ''}
                        </Typography.Text>
                      </Space>
                      <Typography.Paragraph
                        style={{
                          margin: 0,
                          padding: 12,
                          borderRadius: 10,
                          background: item.role === 'assistant' ? '#f0fdf4' : '#f8fafc',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {item.content || '(empty)'}
                      </Typography.Paragraph>
                    </Space>
                  ),
                }))}
              />
            ) : (
              <Empty description="请选择左侧会话查看消息时间线" />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

export default Conversations;
