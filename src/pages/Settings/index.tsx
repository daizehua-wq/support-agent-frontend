import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import {
  AuditOutlined,
  ReloadOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import AdminOnlyEntry from '../../components/settings/AdminOnlyEntry';
import CapabilityStatusSummary from '../../components/settings/CapabilityStatusSummary';
import PermissionLock from '../../components/settings/PermissionLock';
import PlannerModelCard from '../../components/settings/PlannerModelCard';
import SettingsSideNav from '../../components/settings/SettingsSideNav';
import {
  getMockSettingsCenter,
  getDegraded,
  getMissingDefaults,
  getUserView,
  getNoPermission,
} from '../../utils/mockSettingsCenter';
import * as permissionAdapter from '../../utils/permissionAdapter';
import * as settingsAdapter from '../../utils/settingsCenterAdapter';
import type { PermissionSummary } from '../../types/permissions';
import type { SettingsCenterState, SettingsNavItem } from '../../types/settingsCenter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = any;

const NAV_ITEMS: SettingsNavItem[] = [
  { key: 'overview', label: '系统总览', path: '/settings/overview', status: 'ok' },
  { key: 'models', label: '大模型管理', path: '/settings/models', status: 'ok' },
  { key: 'assistants', label: 'Assistant / Prompt', path: '/settings/assistants', status: 'ok' },
  { key: 'data-sources', label: '数据源管理', path: '/settings/data-sources', status: 'ok' },
  { key: 'apps', label: '应用与渠道', path: '/settings/apps', status: 'ok' },
  { key: 'rules', label: '规则与知识', path: '/settings/rules', status: 'ok' },
  { key: 'runtime', label: '运行状态与安全', path: '/settings/runtime', status: 'ok' },
  { key: 'governance', label: '治理历史', path: '/settings/governance', status: 'ok' },
];

const DEMO_SCENARIOS: Array<{ key: string; label: string }> = [
  { key: 'default', label: 'Admin 默认' },
  { key: 'degraded', label: 'Admin 降级' },
  { key: 'missingDefaults', label: 'Admin 缺失默认' },
  { key: 'user', label: 'User 视图' },
  { key: 'noPermission', label: 'User 无权限' },
];

function SettingsPage() {
  const navigate = useNavigate();
  const [scenarioKey, setScenarioKey] = useState('default');
  const [permissionSummary, setPermissionSummary] = useState<PermissionSummary | null>(null);
  const [overviewData, setOverviewData] = useState<ApiData>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);

  useEffect(() => {
    permissionAdapter.getPermissionSummary().then((summary) => {
      setPermissionSummary(summary);
    });
  }, []);

  const loadOverview = () => {
    setOverviewLoading(true); setOverviewError(false);
    settingsAdapter.getOverview().then((d) => {
      setOverviewData(d);
    }).catch(() => {
      setOverviewError(true);
    }).finally(() => {
      setOverviewLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    settingsAdapter.getOverview().then((d) => {
      if (!cancelled) setOverviewData(d);
    }).catch(() => {
      if (!cancelled) setOverviewError(true);
    }).finally(() => {
      if (!cancelled) setOverviewLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const state: SettingsCenterState = useMemo(() => {
    switch (scenarioKey) {
      case 'degraded': return getDegraded();
      case 'missingDefaults': return getMissingDefaults();
      case 'user': return getUserView(getMockSettingsCenter());
      case 'noPermission': return getNoPermission();
      default: return getMockSettingsCenter();
    }
  }, [scenarioKey]);

  const realIsAdmin = permissionSummary
    ? permissionSummary.role === 'system_admin' || permissionSummary.role === 'internal_ops'
    : false;

  const capApi = overviewData?.capabilitySummary;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const capabilitySource = useMemo(() => ({
    assistant: (capApi?.assistant || capApi?.defaultAssistant || state.defaultAssistant) as any,
    model: (capApi?.model || capApi?.defaultModel || state.defaultModel) as any,
    dataSource: (capApi?.dataSource || capApi?.defaultDataSource || state.defaultDataSource) as any,
    externalSources: (capApi?.externalSources || state.externalSources) as any,
    pythonRuntimeStatus: (capApi?.pythonRuntimeStatus || state.pythonRuntimeStatus) as any,
  }), [capApi, state]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const realCanAccessPlatform = permissionSummary?.permissions?.canAccessPlatformManager ?? false;
  const realCanAccessAdminUi = permissionSummary?.permissions?.canAccessAdminUi ?? false;
  const realRoleLabel = permissionSummary?.displayName ?? '普通用户';
  const navItems = state.scenario === 'noPermission'
    ? NAV_ITEMS.map((item) => ({ ...item, status: 'locked' as const }))
    : state.scenario === 'degraded'
      ? NAV_ITEMS.map((item) =>
        item.key === 'data-sources' || item.key === 'runtime'
          ? { ...item, status: 'warning' as const }
          : item,
      )
      : NAV_ITEMS;

  if (state.scenario === 'noPermission') {
    return (
      <div className="ap-settings-center">
        <SettingsSideNav items={navItems} />
        <div className="ap-settings-overview">
          <Typography.Title level={2} style={{ margin: '0 0 24px' }}>
            <SettingOutlined style={{ marginRight: 12 }} />
            设置管理中心
          </Typography.Title>
          <PermissionLock requiredRole="管理员" currentRole="普通用户" onContactAdmin={() => message.info('联系管理员功能将在后续阶段接入。')} />
        </div>
      </div>
    );
  }

  return (
    <div className="ap-settings-center">
      <SettingsSideNav items={navItems} />

      <div className="ap-settings-overview">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <Space>
            <Typography.Title level={2} style={{ margin: 0 }}>
              <SettingOutlined style={{ marginRight: 12 }} />
              设置管理中心
            </Typography.Title>
            {permissionSummary && (
              <Tag color={realIsAdmin ? 'blue' : 'default'} style={{ fontSize: 11 }}>{realRoleLabel}</Tag>
            )}
          </Space>
          <Space size={6} wrap>
            {import.meta.env.DEV && DEMO_SCENARIOS.map((s) => (
              <Button
                key={s.key}
                size="small"
                type={scenarioKey === s.key ? 'primary' : 'default'}
                onClick={() => setScenarioKey(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </Space>
        </div>

        {/* Overview Loading */}
        {overviewLoading && (
          <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40 }}><Spin tip="加载设置数据…" /></Card>
        )}

        {/* Overview Error */}
        {!overviewLoading && overviewError && (
          <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40 }}>
            <Typography.Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>设置数据加载失败</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>暂时无法获取该设置模块数据，请稍后重试。</Typography.Text>
            <Button icon={<ReloadOutlined />} onClick={loadOverview}>重新加载</Button>
          </Card>
        )}

        {/* API Degraded Capabilities (primary data source) */}
        {!overviewLoading && overviewData?.degradedCapabilities?.length > 0 && (
          <Alert type="warning" banner showIcon message="部分能力降级"
            description={overviewData.degradedCapabilities.map((d: { label?: string; key?: string }) => d.label || d.key).join('、') + '。部分任务可能受影响，建议尽快检查并恢复。'}
            style={{ borderRadius: 20, marginBottom: 18 }}
          />
        )}

        {/* Scenario Alerts (dev-only fallback) */}
        {state.scenario === 'degraded' && (
          <Alert type="warning" banner showIcon message="部分能力降级"
            description={`以下能力处于降级状态：${state.degradedCapabilities.join('、')}。部分任务可能受影响，建议尽快检查并恢复。`}
            style={{ borderRadius: 20, marginBottom: 18 }}
          />
        )}
        {state.scenario === 'missingDefaults' && (
          <Alert type="error" banner showIcon message="缺少默认配置"
            description="未配置默认 Assistant 和默认模型。请在对应管理页面完成初始配置，否则新任务将无法正常创建。"
            style={{ borderRadius: 20, marginBottom: 18 }}
            action={
              <Space direction="vertical" size={4}>
                <Button size="small" onClick={() => navigate('/settings/assistants')}>配置 Assistant</Button>
                <Button size="small" onClick={() => navigate('/settings/models')}>配置模型</Button>
              </Space>
            }
          />
        )}

        {/* Planner Model Card */}
        {realIsAdmin && (
          <PlannerModelCard planner={state.plannerModel} />
        )}

        {/* Capability Summary */}
        <CapabilityStatusSummary
          assistant={capabilitySource.assistant}
          model={capabilitySource.model}
          dataSource={capabilitySource.dataSource}
          externalSources={capabilitySource.externalSources}
          pythonRuntimeStatus={capabilitySource.pythonRuntimeStatus}
          compact={!realIsAdmin}
        />

        {/* Admin: System Health (API-first) */}
        {realIsAdmin && (
          <>
            <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>系统健康</Typography.Text>
              <Space size={6} wrap>
                {(overviewData?.systemHealth || [
                  { key: 'planner', label: '任务规划器', status: 'ok', summary: state.plannerModel.modelName },
                  { key: 'assistant', label: 'Assistant', status: 'ok', summary: state.defaultAssistant.name },
                  { key: 'model', label: '默认模型', status: 'ok', summary: state.defaultModel.name },
                  { key: 'runtime', label: 'Python Runtime', status: 'ok', summary: '—' },
                ]).map((h: { key?: string; label?: string; status?: string }) => (
                  <Tag key={h.key} color={h.status === 'ok' ? 'green' : h.status === 'warning' ? 'orange' : 'red'} style={{ fontSize: 11 }}>
                    {h.label} · {h.status === 'ok' ? '正常' : h.status}
                  </Tag>
                ))}
              </Space>
            </Card>

            {/* Recent Governance (API-first) */}
            {(overviewData?.recentGovernanceEvents || state.recentGovernance).length > 0 && (
              <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  <AuditOutlined style={{ marginRight: 6 }} />最近治理变更
                </Typography.Text>
                {(overviewData?.recentGovernanceEvents || state.recentGovernance).map((g: { eventId?: string; type?: string; action?: string; title?: string; target?: string; createdAt?: string; changedAt?: string }, i: number) => (
                  <div key={g.eventId || i} style={{ padding: '6px 0', borderBottom: i < (overviewData?.recentGovernanceEvents || state.recentGovernance).length - 1 ? '1px solid rgba(203,213,225,0.36)' : 'none', fontSize: 13 }}>
                    <Tag style={{ fontSize: 10 }}>{g.type || g.action}</Tag>
                    <Typography.Text>{g.title || g.target}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{g.createdAt || g.changedAt}</Typography.Text>
                  </div>
                ))}
              </Card>
            )}

            {/* Admin Only Entries — gated by real permissions */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {realCanAccessPlatform && (
                <AdminOnlyEntry
                  label="Platform Manager"
                  description="工厂 Agent、渠道配置、演化调度器"
                  permissionLabel="系统管理员"
                />
              )}
              {realCanAccessAdminUi && (
                <AdminOnlyEntry
                  label="Admin UI"
                  description="API 密钥管理、应用统计、渠道监控"
                  permissionLabel="内部运维"
                />
              )}
            </div>
          </>
        )}

        {/* User View: Simplified Health */}
        {!realIsAdmin && (
          <>
            <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>系统健康摘要</Typography.Text>
              <Space size={6} wrap>
                <Tag color={state.plannerModel.status === 'ready' ? 'green' : 'orange'} style={{ fontSize: 11 }}>任务规划器 · {state.plannerModel.status === 'ready' ? '正常' : '降级'}</Tag>
                <Tag color={state.defaultAssistant.status === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>Assistant · {state.defaultAssistant.status === 'healthy' ? '正常' : '异常'}</Tag>
                <Tag color={state.pythonRuntimeStatus === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>Runtime · {state.pythonRuntimeStatus === 'healthy' ? '正常' : '异常'}</Tag>
              </Space>
            </Card>

            {(overviewData?.degradedCapabilities?.length > 0 || state.degradedCapabilities.length > 0) && (
              <Alert
                type="warning" showIcon
                message="部分能力降级"
                description={`以下能力处于降级状态：${(overviewData?.degradedCapabilities || state.degradedCapabilities).map((d: { label?: string; key?: string }) => d.label || d.key || d).join('、')}。如影响你当前的任务，请联系管理员。`}
                style={{ borderRadius: 20, marginTop: 14 }}
              />
            )}

            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <Button icon={<ToolOutlined />} onClick={() => message.info('联系管理员功能将在后续阶段接入。')}>联系管理员</Button>
            </div>
          </>
        )}

        {/* Quick Links (API-first) */}
        {realIsAdmin && (
          <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 10, fontSize: 14 }}>快捷入口</Typography.Text>
            <Space size={8} wrap>
              {(overviewData?.quickActions || []).map((qa: { key?: string; targetRoute?: string; label?: string }) => (
                <Button key={qa.key} size="small" onClick={() => navigate(qa.targetRoute || '/settings')}>{qa.label}</Button>
              ))}
              {(!overviewData?.quickActions || overviewData.quickActions.length === 0) && (
                <>
                  <Button size="small" onClick={() => navigate('/settings/models')}>配置默认模型</Button>
                  <Button size="small" onClick={() => navigate('/settings/assistants')}>管理 Assistant</Button>
                </>
              )}
            </Space>
          </Card>
        )}

      </div>

    </div>
  );
}

export default SettingsPage;
