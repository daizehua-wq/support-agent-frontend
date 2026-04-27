import { useEffect, useMemo, useState } from 'react';

import {
  ArrowUpOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Input, List, Space, Tag, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import { getSessionList, type SessionOverviewRecord } from '../../api/agent';
import { getSettings, type SettingsResponseData } from '../../api/settings';
import { formatDateTimeToLocalTime } from '../../utils/dateTime';
import { buildContinueContext, buildContinueNavigationState } from '../../utils/sessionResume';

type SessionPreview = SessionOverviewRecord;

type HomeAssistantSnapshot = {
  assistantId: string;
  assistantName: string;
  assistantVersion: string;
};

const promptSuggestions = [
  {
    key: 'risk',
    label: '查企业风险',
    icon: <SearchOutlined />,
    prompt: '查一下深圳某某科技有限公司的信用风险',
  },
  {
    key: 'report',
    label: '生成信用报告',
    icon: <FileTextOutlined />,
    prompt: '基于已有资料生成一份标准版信用分析报告',
  },
  {
    key: 'deep',
    label: '深度分析',
    icon: <WarningOutlined />,
    prompt: '帮我分析这家公司的主要风险、证据和下一步建议',
  },
  {
    key: 'material',
    label: '整理资料',
    icon: <FolderOpenOutlined />,
    prompt: '整理这个客户相关的资料和可用证据',
  },
];

const resolveHomeAssistantSnapshot = (
  settings: SettingsResponseData,
): HomeAssistantSnapshot => {
  const activeAssistantSummary = settings.governanceSummary?.activeAssistantSummary;
  const assistantActivationSummary =
    settings.statusSummary?.assistantActivationSummary as Record<string, unknown> | undefined;
  const assistantId =
    activeAssistantSummary?.assistantId ||
    settings.governanceSummary?.activeAssistantId ||
    settings.configSummary?.assistant?.activeAssistantId ||
    settings.assistant?.activeAssistantId ||
    '';
  const assistantName =
    activeAssistantSummary?.assistantName ||
    settings.governanceSummary?.assistantOptions?.find((item) => item.assistantId === assistantId)
      ?.assistantName ||
    assistantId;
  const assistantVersion =
    activeAssistantSummary?.currentVersion ||
    (typeof assistantActivationSummary?.assistantVersion === 'string'
      ? assistantActivationSummary.assistantVersion
      : '') ||
    '';

  return {
    assistantId,
    assistantName,
    assistantVersion,
  };
};

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [recentSessions, setRecentSessions] = useState<SessionPreview[]>([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [currentAssistant, setCurrentAssistant] = useState<HomeAssistantSnapshot | null>(null);
  const [currentAssistantLoading, setCurrentAssistantLoading] = useState(false);
  const [quickInput, setQuickInput] = useState('');

  const currentAssistantLabel = currentAssistant?.assistantName || currentAssistant?.assistantId || '默认 Agent';
  const currentAssistantMeta = currentAssistant?.assistantId
    ? `${currentAssistant.assistantId}${
        currentAssistant.assistantVersion ? ` / v${currentAssistant.assistantVersion}` : ''
      }`
    : '准备就绪';
  const systemReady = !currentAssistantLoading && !recentSessionsLoading;

  const recentVisibleSessions = useMemo(() => recentSessions.slice(0, 6), [recentSessions]);

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
      setCurrentAssistant(resolveHomeAssistantSnapshot(settings));
    } catch (error) {
      console.error('当前 Agent 加载失败：', error);
      message.error('当前 Agent 加载失败');
    } finally {
      setCurrentAssistantLoading(false);
    }
  };

  const buildHomeCarryState = (carryPayload?: Record<string, unknown>) =>
    buildContinueNavigationState({
      continueContext: buildContinueContext({
        fromModule: 'home',
      }),
      carryPayload,
    });

  const startTask = (input = quickInput) => {
    const normalizedInput = input.trim();

    if (!normalizedInput) {
      message.info('先输入一个公司名、问题或任务');
      return;
    }

    navigate('/workbench', {
      state: {
        fromModule: 'home',
        initialTaskInput: normalizedInput,
        taskInput: normalizedInput,
        ...buildHomeCarryState({
          taskInput: normalizedInput,
        }),
      },
    });
  };

  const handleContinueSession = (sessionId: string) => {
    navigate(`/sessions/${sessionId}`, {
      state: buildContinueNavigationState({
        continueContext: buildContinueContext({
          sessionId,
          fromModule: 'home',
        }),
      }),
    });
  };

  useEffect(() => {
    if (location.pathname !== '/home') {
      return;
    }

    loadRecentSessions();
    loadCurrentAssistant();
  }, [location.pathname]);

  return (
    <div className="ap-workspace">
      <aside className="ap-workspace__rail">
        <div className="ap-agent-card">
          <div className="ap-agent-card__icon">
            <UserSwitchOutlined />
          </div>
          <div className="ap-agent-card__body">
            <div className="ap-agent-card__eyebrow">当前 Agent</div>
            <div className="ap-agent-card__name">{currentAssistantLabel}</div>
            <div className="ap-agent-card__meta">{currentAssistantMeta}</div>
          </div>
          <Button shape="circle" icon={<PlusOutlined />} onClick={() => navigate('/agent')} />
        </div>

        <div className="ap-rail-section">
          <div className="ap-rail-section__title">
            <ClockCircleOutlined />
            最近会话
          </div>
          <List
            loading={recentSessionsLoading}
            dataSource={recentVisibleSessions}
            locale={{ emptyText: '暂无会话' }}
            renderItem={(item) => (
              <List.Item className="ap-session-item" onClick={() => handleContinueSession(item.id)}>
                <div>
                  <div className="ap-session-item__title">{item.title || '未命名会话'}</div>
                  <div className="ap-session-item__meta">
                    {formatDateTimeToLocalTime(item.updatedAt) || item.sourceModule || '刚刚'}
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>
      </aside>

      <main className="ap-workspace__main">
        <div className="ap-workspace__topbar">
          <div className="ap-brand">
            <span className="ap-brand__mark" />
            AP 2.0
          </div>
          <Space size={8}>
            <Tag color={systemReady ? 'green' : 'gold'}>{systemReady ? '在线' : '同步中'}</Tag>
            <Button type="text" onClick={() => navigate('/manage')}>
              管理
            </Button>
          </Space>
        </div>

        <section className="ap-hero">
          <div className="ap-hero__headline">今天让 Agent 完成什么？</div>
          <div className="ap-hero__subline">{currentAssistantLabel} 已准备好。</div>

          <div className="ap-command">
            <Input.TextArea
              value={quickInput}
              onChange={(event) => setQuickInput(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  startTask();
                }
              }}
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder="输入公司名、问题或任务..."
              className="ap-command__input"
            />
            <Button
              type="primary"
              shape="circle"
              icon={<ArrowUpOutlined />}
              className="ap-command__send"
              onClick={() => startTask()}
            />
          </div>

          <div className="ap-suggestions">
            {promptSuggestions.map((item) => (
              <Button
                key={item.key}
                icon={item.icon}
                className="ap-suggestion-pill"
                onClick={() => {
                  setQuickInput(item.prompt);
                  startTask(item.prompt);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="ap-result-preview">
          <div className="ap-result-preview__status">
            <span className="ap-pulse" />
            快速通道、本地模型和主链路会自动协同。
          </div>
          <div className="ap-result-grid">
            <div className="ap-mini-card">
              <div className="ap-mini-card__label">输入</div>
              <div className="ap-mini-card__value">公司、问题、报告目标</div>
            </div>
            <div className="ap-mini-card">
              <div className="ap-mini-card__label">执行</div>
              <div className="ap-mini-card__value">分析、检索、生成</div>
            </div>
            <div className="ap-mini-card">
              <div className="ap-mini-card__label">交付</div>
              <div className="ap-mini-card__value">结论卡片、报告、证据</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default HomePage;
