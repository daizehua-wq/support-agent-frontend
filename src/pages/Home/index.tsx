import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Space, Tag, Typography, Alert } from 'antd';
import {
  ArrowUpOutlined,
  FileTextOutlined,
  HistoryOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  WarningFilled,
  CloseCircleFilled,
} from '@ant-design/icons';
import type { CapabilityStatus, RecentTask } from '../../types/taskPlan';

type HomeScenario = 'firstUse' | 'default' | 'degraded' | 'missingDefaults';

function resolveHomeScenario(tasksCount: number, capability: CapabilityStatus): HomeScenario {
  if (!capability.assistant.name || !capability.model.name) {
    return 'missingDefaults';
  }

  if (tasksCount === 0) {
    return 'firstUse';
  }

  if (
    capability.dataSources.some(
      (ds) => ds.status === 'degraded' || ds.status === 'unavailable',
    )
  ) {
    return 'degraded';
  }

  return 'default';
}

const MOCK_RECENT_TASKS: RecentTask[] = [
  { taskId: 't-001', title: '分析 XX 半导体客户的应用工序', status: 'completed', lastStep: 'Output 生成完成', updatedAt: '2026-04-27' },
  { taskId: 't-002', title: '检索锂电池涂布工艺案例', status: 'continuable', lastStep: 'Analysis 完成', updatedAt: '2026-04-26' },
  { taskId: 't-003', title: '生成 PCB 客户技术方案', status: 'completed', lastStep: 'Output 生成完成', updatedAt: '2026-04-25' },
];

const MOCK_CAPABILITY: CapabilityStatus = {
  assistant: { name: '默认销售支持助手', status: 'active' },
  model: { name: 'gpt-4o-mini', status: 'connected' },
  dataSources: [
    { name: '本地知识库', status: 'healthy' },
    { name: '企业内部数据库', status: 'healthy' },
    { name: '企查查', status: 'degraded' },
  ],
  taskPlanner: { status: 'ready', source: 'embedded_model' },
};

const RECOMMENDED_ACTIONS = [
  { label: '分析新客户场景', goal: '帮我分析一家新客户的业务背景、潜在需求和风险点。' },
  { label: '检索行业案例', goal: '检索近期关于半导体材料涂布工艺的行业案例和最佳实践。' },
  { label: '生成销售沟通建议', goal: '根据之前的客户分析结果，生成一份正式的销售沟通方案。' },
];

function HomePage() {
  const navigate = useNavigate();
  const [taskGoal, setTaskGoal] = useState('');
  const [sending, setSending] = useState(false);

  const tasks = MOCK_RECENT_TASKS;
  const capability = MOCK_CAPABILITY;
  const homeScenario = resolveHomeScenario(tasks.length, capability);
  const isDisabled = homeScenario === 'missingDefaults';
  const handleStartTask = () => {
    if (!taskGoal.trim()) return;
    setSending(true);
    setTimeout(() => {
      navigate('/workbench', { state: { draft: taskGoal } });
    }, 300);
  };

  const handleRecommendedAction = (goal: string) => {
    navigate('/workbench', { state: { draft: goal } });
  };

  return (
    <div className="ap-home-dashboard">
      {homeScenario === 'degraded' && (
        <Alert
          type="warning"
          banner
          showIcon
          message="部分数据源出现降级，可能影响检索精确度。仍可继续使用可用能力创建任务。"
          style={{ marginBottom: 16, borderRadius: 20 }}
        />
      )}

      {homeScenario === 'missingDefaults' && (
        <Alert
          type="error"
          banner
          showIcon
          message="未配置默认 Assistant 或大模型。请联系管理员在设置管理中心完成初始配置。"
          style={{ marginBottom: 16, borderRadius: 20 }}
        />
      )}

      <section className="ap-hero">
        <h1 className="ap-hero__headline">输入任务目标</h1>
        <p className="ap-hero__subline">系统会自动规划分析步骤、检索资料并生成专业交付</p>

        <div className="ap-command">
          <textarea
            className="ap-command__input"
            placeholder={
              isDisabled
                ? '暂未配置默认 Assistant，请联系管理员完成设置管理中心初始配置。'
                : '描述你的任务目标。例如：帮我分析这家客户的背景，检索相关案例，生成一份销售沟通建议。'
            }
            value={taskGoal}
            onChange={(e) => setTaskGoal(e.target.value)}
            rows={2}
            disabled={isDisabled}
          />
          <Button
            className="ap-command__send"
            type="primary"
            icon={<ArrowUpOutlined />}
            onClick={handleStartTask}
            disabled={!taskGoal.trim() || isDisabled}
            loading={sending}
          />
        </div>

        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          onClick={handleStartTask}
          disabled={!taskGoal.trim() || isDisabled}
          loading={sending}
          style={{ marginTop: 18, height: 48, borderRadius: 20, paddingInline: 28, fontSize: 16 }}
        >
          进入工作台生成任务计划
        </Button>

        <div className="ap-suggestions">
          {RECOMMENDED_ACTIONS.map((action) => (
            <Button
              key={action.label}
              className="ap-suggestion-pill"
              onClick={() => handleRecommendedAction(action.goal)}
              disabled={isDisabled}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="ap-home-sections">
        <div className="ap-home-section">
          <Typography.Title level={5} style={{ margin: '0 0 12px' }}>
            <HistoryOutlined style={{ marginRight: 8 }} />
            最近任务
          </Typography.Title>

          {homeScenario === 'firstUse' ? (
            <Card
              className="ap-session-item"
              styles={{ body: { padding: '28px 20px', textAlign: 'center', display: 'grid', gap: 10 } }}
            >
              <FileTextOutlined style={{ fontSize: 36, color: '#94a3b8', margin: '0 auto' }} />
              <Typography.Text type="secondary" style={{ fontSize: 15 }}>
                还没有历史任务
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                输入目标开始创建第一个任务，完成后会自动保存到历史任务。
              </Typography.Text>
            </Card>
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {tasks.map((task) => (
                <Card
                  key={task.taskId}
                  size="small"
                  className="ap-session-item"
                  styles={{ body: { padding: '12px 14px' } }}
                >
                  <div className="ap-session-item__title">{task.title}</div>
                  <div className="ap-session-item__meta">
                    {task.status === 'completed' ? (
                      <Tag color="green" style={{ fontSize: 11 }}>已完成</Tag>
                    ) : (
                      <Tag color="processing" style={{ fontSize: 11 }}>可继续</Tag>
                    )}
                    <span>{task.lastStep} · {task.updatedAt}</span>
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </div>

        <div className="ap-home-section">
          <Typography.Title level={5} style={{ margin: '0 0 12px' }}>
            <SafetyCertificateOutlined style={{ marginRight: 8 }} />
            当前能力
          </Typography.Title>
          <Card className="ap-capability-summary" size="small" styles={{ body: { padding: 16 } }}>
            <div className="ap-capability-summary__grid">
              <div className="ap-capability-summary__item">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Assistant</Typography.Text>
                <Typography.Text strong style={{ fontSize: 14 }}>
                  {capability.assistant.name || '未配置'}
                </Typography.Text>
                <Tag color={capability.assistant.status === 'active' ? 'green' : 'red'} style={{ fontSize: 11, marginLeft: 0 }}>
                  {capability.assistant.status === 'active' ? '已激活' : '未激活'}
                </Tag>
              </div>
              <div className="ap-capability-summary__item">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>大模型</Typography.Text>
                <Typography.Text strong style={{ fontSize: 14 }}>
                  {capability.model.name || '未配置'}
                </Typography.Text>
                <Tag color={capability.model.status === 'connected' ? 'green' : 'red'} style={{ fontSize: 11, marginLeft: 0 }}>
                  {capability.model.status === 'connected' ? '已连接' : '未连接'}
                </Tag>
              </div>
              <div className="ap-capability-summary__item">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>资料源</Typography.Text>
                <Space size={4} wrap style={{ marginTop: 4 }}>
                  {capability.dataSources.map((ds) => (
                    <Tag
                      key={ds.name}
                      icon={
                        ds.status === 'healthy' ? <CheckCircleFilled /> :
                        ds.status === 'degraded' ? <WarningFilled /> :
                        <CloseCircleFilled />
                      }
                      color={ds.status === 'healthy' ? 'green' : ds.status === 'degraded' ? 'orange' : 'red'}
                      style={{ fontSize: 11 }}
                    >
                      {ds.name}
                    </Tag>
                  ))}
                </Space>
              </div>
            </div>
          </Card>

          <Typography.Title level={5} style={{ margin: '18px 0 12px' }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            推荐动作
          </Typography.Title>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {RECOMMENDED_ACTIONS.map((action) => (
              <Card
                key={action.label}
                size="small"
                hoverable
                className="ap-session-item"
                styles={{ body: { padding: '12px 14px' } }}
                onClick={() => handleRecommendedAction(action.goal)}
              >
                <Typography.Text strong style={{ fontSize: 14 }}>{action.label}</Typography.Text>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{action.goal}</Typography.Text>
              </Card>
            ))}
          </Space>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
