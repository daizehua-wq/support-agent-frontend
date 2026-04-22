import { useEffect, useState } from 'react';

import { Button, Card, Col, Input, List, Row, Space, Tag, message } from 'antd';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../../components/common/PageHeader';
import { getSessionList, type SessionOverviewRecord } from '../../api/agent';
import { getSettings } from '../../api/settings';
import { formatDateTimeToBeijingTime } from '../../utils/dateTime';

const actionEntries = [
  {
    key: 'analyze',
    title: '判断分析',
    description: '把自然语言任务拆成目标、风险、约束和下一步建议。',
    path: '/judge',
    buttonText: '进入判断分析',
    tag: '决策支持',
  },
  {
    key: 'search',
    title: '资料整理',
    description: '按任务主题检索、汇总并整理出可直接复用的资料包。',
    path: '/retrieve',
    buttonText: '进入资料整理',
    tag: '知识支持',
  },
  {
    key: 'script',
    title: '参考写作',
    description: '基于任务目标与已知事实，生成参考邮件、纪要、方案或说明文稿。',
    path: '/compose',
    buttonText: '进入参考写作',
    tag: '文稿辅助',
  },
];

const governanceEntries = [
  {
    key: 'settings',
    title: 'Settings',
    description: '查看系统当前怎么串起来，并进入系统配置页。',
    path: '/settings',
    buttonText: '进入 Settings',
    tag: '系统串联',
    disabled: false,
  },
  {
    key: 'model-center',
    title: 'ModelCenter',
    description: '承接模型资源、默认模型、模块绑定与 fallback。',
    path: '/model-center',
    buttonText: '进入 ModelCenter',
    tag: '模型治理',
    disabled: false,
  },
  {
    key: 'assistant-center',
    title: 'AssistantCenter',
    description: '承接 Assistant / Prompt / Strategy 治理定义与发布版。',
    path: '/assistant-center',
    buttonText: '进入 AssistantCenter',
    tag: '治理定义',
    disabled: false,
  },
  {
    key: 'database-manager',
    title: 'DatabaseManager',
    description: '承接数据库列表、详情、健康状态与轻绑定关系。',
    path: '/database-manager',
    buttonText: '进入 DatabaseManager',
    tag: '数据治理',
    disabled: false,
  },
];

const sceneShortcuts = ['任务判断', '资料整理', '参考文稿起草'];

type SessionPreview = SessionOverviewRecord;

function HomePage() {
  const navigate = useNavigate();

  const [recentSessions, setRecentSessions] = useState<SessionPreview[]>([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [currentAssistantId, setCurrentAssistantId] = useState('');
  const [currentAssistantLoading, setCurrentAssistantLoading] = useState(false);
  const [quickInput, setQuickInput] = useState('');

  const loadRecentSessions = async () => {
    try {
      setRecentSessionsLoading(true);
      const result = await getSessionList(8);
      const sessions = Array.isArray(result?.data) ? result.data : [];
      setRecentSessions(sessions);
    } catch (error) {
      console.error('最近会话加载失败：', error);
      message.error('最近会话加载失败');
    } finally {
      setRecentSessionsLoading(false);
    }
  };

  const loadCurrentAssistant = async () => {
    try {
      setCurrentAssistantLoading(true);
      const settings = await getSettings();
      const assistantId = settings.governanceSummary?.activeAssistantId || '';
      setCurrentAssistantId(assistantId);
    } catch (error) {
      console.error('当前模板加载失败：', error);
      message.error('当前模板加载失败');
    } finally {
      setCurrentAssistantLoading(false);
    }
  };

  const createSessionState = () => ({
    sessionId: crypto.randomUUID(),
    fromModule: 'home',
  });

  const handleStartFromHome = (path: string, extraState?: Record<string, unknown>) => {
    navigate(path, {
      state: {
        ...createSessionState(),
        ...(extraState || {}),
      },
    });
  };

  const handleContinueSession = (path: string, sessionId: string) => {
    navigate(path, {
      state: {
        sessionId,
        fromModule: 'home',
      },
    });
  };

  const getRecommendedContinuePath = (session: SessionPreview) => {
    if (session.sourceModule === 'script') {
      return '/compose';
    }

    if (session.sourceModule === 'search') {
      return '/retrieve';
    }

    if (session.sourceModule === 'analyze') {
      return '/judge';
    }

    return '/judge';
  };

  const systemStatusText =
    currentAssistantLoading || recentSessionsLoading ? '加载中' : '系统正常';
  const latestSession = recentSessions[0];

  useEffect(() => {
    loadRecentSessions();
    loadCurrentAssistant();
  }, []);

  return (
    <div>
      <PageHeader
        title="通用 Agent 平台"
        description="基于 Template / Prompt / Workflow 的统一工作台，可识别任务、整理资料、辅助判断并生成参考文稿。"
      />

      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Tag color="blue">平台入口页</Tag>
          <Tag color={currentAssistantLoading || recentSessionsLoading ? 'gold' : 'green'}>
            {systemStatusText}
          </Tag>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={6}>
          <Card style={{ borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>当前激活模板</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
              {currentAssistantId || '未激活'}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={6}>
          <Card style={{ borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>最近会话数</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
              {recentSessions.length}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={6}>
          <Card style={{ borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>最近活跃模块</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
              {latestSession?.sourceModule || '未返回'}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={6}>
          <Card style={{ borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>系统状态</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
              {systemStatusText}
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1F3A5F', marginBottom: 8 }}>
              最小输入窗口
            </div>
            <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.8 }}>
              先输入任务，再让平台识别它更适合走判断、资料整理还是参考写作链路。
            </div>
          </div>

          <Input.TextArea
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            rows={4}
            placeholder="请输入当前任务、背景问题或希望平台帮你完成的工作"
          />

          <Space wrap>
            {sceneShortcuts.map((item) => (
              <Tag key={item} color="blue">
                {item}
              </Tag>
            ))}
          </Space>

          <Space wrap>
            <Button
              type="primary"
              onClick={() => handleStartFromHome('/workbench', { initialTaskInput: quickInput })}
            >
              进入任务工作台
            </Button>
            <Button
              onClick={() =>
                handleStartFromHome('/retrieve', {
                  taskInput: quickInput,
                })
              }
            >
              直接进资料整理
            </Button>
            <Button
              onClick={() =>
                handleStartFromHome('/compose', {
                  taskInput: quickInput,
                })
              }
            >
              直接进参考写作
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="核心治理入口" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          {governanceEntries.map((item) => (
            <Col xs={24} md={12} lg={6} key={item.key}>
              <Card style={{ height: '100%', borderRadius: 12 }} bodyStyle={{ height: '100%' }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16, color: '#1E293B' }}>{item.title}</strong>
                    <Tag color="blue">{item.tag}</Tag>
                  </div>
                  <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.8, minHeight: 66 }}>
                    {item.description}
                  </div>
                  <Button
                    type={item.disabled ? 'default' : 'primary'}
                    block
                    disabled={item.disabled}
                    onClick={() => item.path && navigate(item.path)}
                  >
                    {item.buttonText}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="主链入口" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          {actionEntries.map((item) => (
            <Col xs={24} md={8} key={item.key}>
              <Card style={{ height: '100%', borderRadius: 12 }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16, color: '#1E293B' }}>{item.title}</strong>
                    <Tag color="blue">{item.tag}</Tag>
                  </div>
                  <div style={{ color: '#64748B', fontSize: 14, lineHeight: 1.8, minHeight: 66 }}>
                    {item.description}
                  </div>
                  <Button type="primary" block onClick={() => handleStartFromHome(item.path)}>
                    {item.buttonText}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="最近会话" style={{ marginBottom: 24, borderRadius: 12 }}>
        <List
          loading={recentSessionsLoading}
          dataSource={recentSessions}
          locale={{ emptyText: '当前还没有最近会话' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="continue"
                  type="link"
                  onClick={() => handleContinueSession(getRecommendedContinuePath(item), item.id)}
                >
                  继续会话
                </Button>,
                <Button key="detail" type="link" onClick={() => navigate(`/sessions/${item.id}`)}>
                  查看详情
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={item.title || '未命名会话'}
                description={
                  <Space wrap size={[8, 8]}>
                    <Tag color="blue">来源：{item.sourceModule || '未返回'}</Tag>
                    <Tag color="purple">阶段：{item.currentStage || '未返回'}</Tag>
                    <Tag color="gold">目标：{item.currentGoal || '未返回'}</Tag>
                    <Tag color="magenta">模板：{item.assistantId || '未返回'}</Tag>
                    <Tag color="green">步骤：{item.stepCount ?? 0}</Tag>
                    <Tag color="cyan">资料：{item.assetCount ?? 0}</Tag>
                    <Tag>更新时间：{formatDateTimeToBeijingTime(item.updatedAt, { includeMilliseconds: true }) || '未返回'}</Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

export default HomePage;
