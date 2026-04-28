import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Space, Tag, Typography, message } from 'antd';
import {
  AuditOutlined,
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
import type { SettingsCenterState, SettingsNavItem } from '../../types/settingsCenter';

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

  const state: SettingsCenterState = useMemo(() => {
    switch (scenarioKey) {
      case 'degraded': return getDegraded();
      case 'missingDefaults': return getMissingDefaults();
      case 'user': return getUserView(getMockSettingsCenter());
      case 'noPermission': return getNoPermission();
      default: return getMockSettingsCenter();
    }
  }, [scenarioKey]);

  const isAdmin = state.role === 'admin';
  const isUser = state.role === 'user';
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
          <Typography.Title level={2} style={{ margin: 0 }}>
            <SettingOutlined style={{ marginRight: 12 }} />
            设置管理中心
          </Typography.Title>
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

        {/* Scenario Alerts */}
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
        {isAdmin && (
          <PlannerModelCard planner={state.plannerModel} />
        )}

        {/* Capability Summary */}
        <CapabilityStatusSummary
          assistant={state.defaultAssistant}
          model={state.defaultModel}
          dataSource={state.defaultDataSource}
          externalSources={state.externalSources}
          pythonRuntimeStatus={state.pythonRuntimeStatus}
          compact={isUser}
        />

        {/* Admin: System Health + External Source */}
        {isAdmin && (
          <>
            <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>系统健康</Typography.Text>
              <Space size={6} wrap>
                <Tag color={state.plannerModel.status === 'ready' ? 'green' : state.plannerModel.status === 'degraded' ? 'orange' : 'red'} style={{ fontSize: 11 }}>
                  Model Provider · {state.plannerModel.status === 'ready' ? '正常' : state.plannerModel.status}
                </Tag>
                <Tag color={state.defaultAssistant.status === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                  Assistant Runtime · {state.defaultAssistant.status === 'healthy' ? '正常' : '异常'}
                </Tag>
                <Tag color={state.defaultDataSource.status === 'healthy' ? 'green' : state.defaultDataSource.status === 'degraded' ? 'orange' : 'red'} style={{ fontSize: 11 }}>
                  Data Source · {state.defaultDataSource.status === 'healthy' ? '正常' : state.defaultDataSource.status}
                </Tag>
                <Tag color={state.pythonRuntimeStatus === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                  PythonRuntime · {state.pythonRuntimeStatus === 'healthy' ? '正常' : '异常'}
                </Tag>
                <Tag color={state.secretVaultStatus === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                  Secret Vault · {state.secretVaultStatus === 'healthy' ? '正常' : '异常'}
                </Tag>
                <Tag color={state.apiGatewayStatus === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                  API Gateway · {state.apiGatewayStatus === 'healthy' ? '正常' : '异常'}
                </Tag>
              </Space>
            </Card>

            {/* Recent Governance */}
            {state.recentGovernance.length > 0 && (
              <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  <AuditOutlined style={{ marginRight: 6 }} />最近治理变更
                </Typography.Text>
                {state.recentGovernance.map((g, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: i < state.recentGovernance.length - 1 ? '1px solid rgba(203,213,225,0.36)' : 'none', fontSize: 13 }}>
                    <Tag style={{ fontSize: 10 }}>{g.action}</Tag>
                    <Typography.Text>{g.target}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{g.changedAt}</Typography.Text>
                  </div>
                ))}
              </Card>
            )}

            {/* Admin Only Entries */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AdminOnlyEntry
                label="Platform Manager"
                description="工厂 Agent、渠道配置、演化调度器"
                permissionLabel="系统管理员"
              />
              <AdminOnlyEntry
                label="Admin UI"
                description="API 密钥管理、应用统计、渠道监控"
                permissionLabel="内部运维"
              />
            </div>
          </>
        )}

        {/* User View: Simplified Health */}
        {isUser && !isAdmin && (
          <>
            <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>系统健康摘要</Typography.Text>
              <Space size={6} wrap>
                <Tag color={state.plannerModel.status === 'ready' ? 'green' : 'orange'} style={{ fontSize: 11 }}>任务规划器 · {state.plannerModel.status === 'ready' ? '正常' : '降级'}</Tag>
                <Tag color={state.defaultAssistant.status === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>Assistant · {state.defaultAssistant.status === 'healthy' ? '正常' : '异常'}</Tag>
                <Tag color={state.pythonRuntimeStatus === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>Runtime · {state.pythonRuntimeStatus === 'healthy' ? '正常' : '异常'}</Tag>
              </Space>
            </Card>

            {(state.scenario === 'degraded' || state.degradedCapabilities.length > 0) && (
              <Alert
                type="warning" showIcon
                message="部分能力降级"
                description={`以下能力处于降级状态：${state.degradedCapabilities.join('、')}。如影响你当前的任务，请联系管理员。`}
                style={{ borderRadius: 20, marginTop: 14 }}
              />
            )}

            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <Button icon={<ToolOutlined />} onClick={() => message.info('联系管理员功能将在后续阶段接入。')}>联系管理员</Button>
            </div>
          </>
        )}

        {/* Quick Links - Admin only */}
        {isAdmin && (
          <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 10, fontSize: 14 }}>快捷入口</Typography.Text>
            <Space size={8} wrap>
              <Button size="small" onClick={() => navigate('/settings/models')}>配置默认模型</Button>
              <Button size="small" onClick={() => navigate('/settings/assistants')}>管理 Assistant</Button>
              <Button size="small" onClick={() => navigate('/settings/data-sources')}>检查数据源</Button>
              <Button size="small" onClick={() => navigate('/settings/runtime')}>查看运行状态</Button>
              <Button size="small" onClick={() => navigate('/settings/governance')}>查看治理历史</Button>
            </Space>
          </Card>
        )}
      </div>

    </div>
  );
}

export default SettingsPage;
