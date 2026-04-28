import {
  ApiOutlined,
  AuditOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  ControlOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Col, Row, Space, Tag } from 'antd';

import type {
  EmbeddedModelSettings,
  OpsDashboardData,
  SettingsGovernanceOverviewData,
  SettingsSecurityPostureData,
} from '../../../api/settings';
import {
  formatSlashSeparatedLabels,
  formatTechnicalLabel,
} from '../../../utils/displayLabel';

type SettingsRulesOverviewSectionProps = {
  activeAssistantName: string;
  activeAssistantId: string;
  promptVersion: string;
  strategySummary: string;
  modelLabel: string;
  databaseName: string;
  databaseType: string;
  workflowRouteCount: number;
  embeddedModel?: EmbeddedModelSettings | null;
  opsDashboard: OpsDashboardData | null;
  securityPosture: SettingsSecurityPostureData | null;
  governanceOverview: SettingsGovernanceOverviewData | null;
  onTestModelConnection: () => void;
  onTestDatabaseConnection: () => void;
};

const getOpenAlertCount = (opsDashboard: OpsDashboardData | null) =>
  Number(opsDashboard?.alerts?.summary?.open || 0);

const getSecurityLabel = (securityPosture: SettingsSecurityPostureData | null) => {
  const ssoEnabled =
    (securityPosture?.security as { sso?: { enabled?: boolean } } | undefined)?.sso?.enabled === true;
  const vaultEnabled = securityPosture?.secretVault?.enabled === true;

  if (ssoEnabled && vaultEnabled) return 'SSO + 密钥托管';
  if (ssoEnabled) return 'SSO 已启用';
  if (vaultEnabled) return '密钥托管已启用';
  return '基础保护';
};

const databaseTypeLabelMap: Record<string, string> = {
  sqlite: '本地 SQLite',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
};

const toDisplayLabel = (value = '', labelMap: Record<string, string>) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '未返回';
  return labelMap[normalizedValue] || normalizedValue;
};

const formatStrategySummary = (value = '') => {
  return formatSlashSeparatedLabels(value);
};

const formatModelLabel = (value = '') => {
  const parts = String(value || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return `${parts[0]} / ${formatTechnicalLabel(parts[1])}`;
  }

  return value || '未返回';
};

function SettingsRulesOverviewSection({
  activeAssistantName,
  activeAssistantId,
  promptVersion,
  strategySummary,
  modelLabel,
  databaseName,
  databaseType,
  workflowRouteCount,
  embeddedModel,
  opsDashboard,
  securityPosture,
  governanceOverview,
  onTestModelConnection,
  onTestDatabaseConnection,
}: SettingsRulesOverviewSectionProps) {
  const hasEmbeddedModelConfig = Boolean(embeddedModel && Object.keys(embeddedModel).length > 0);
  const localModelEnabled = hasEmbeddedModelConfig && embeddedModel?.enabled === true;
  const openAlertCount = getOpenAlertCount(opsDashboard);
  const publishedVersionId = governanceOverview?.tenant?.pointers?.publishedVersionId || '未发布';
  const versionCount = Number(governanceOverview?.tenant?.versionCount || 0);
  const routeTimeout = Number(embeddedModel?.routeDecisionTimeoutMs || embeddedModel?.defaultTimeoutMs || 0);
  const fallbackPolicy = embeddedModel?.fallback?.onTimeout || embeddedModel?.fallback?.onLoadFailed || 'main_workflow';
  const strategyDisplay = formatStrategySummary(strategySummary);
  const modelDisplay = formatModelLabel(modelLabel);
  const databaseTypeDisplay = toDisplayLabel(databaseType, databaseTypeLabelMap);
  const publishedDisplay = publishedVersionId === '未发布' ? '未发布' : '已发布';

  const ruleSignals = [
    {
      icon: <ControlOutlined />,
      label: '当前智能体',
      value: activeAssistantName || activeAssistantId || '未选择',
      meta: activeAssistantId ? '已绑定' : '等待绑定',
    },
    {
      icon: <ThunderboltOutlined />,
      label: 'P2.1 快速通道',
      value: hasEmbeddedModelConfig ? (localModelEnabled ? '本地模型启用' : '未启用') : '等待配置',
      meta: embeddedModel?.modelName ? '本地微模型' : '等待模型配置',
      tone: localModelEnabled ? 'good' : 'muted',
    },
    {
      icon: <BranchesOutlined />,
      label: '执行策略',
      value: strategyDisplay,
      meta: promptVersion ? `判断模板 ${promptVersion}` : '判断模板',
    },
    {
      icon: <AuditOutlined />,
      label: '治理版本',
      value: publishedDisplay,
      meta: `${versionCount} 个版本`,
    },
  ];

  const flowItems = [
    {
      icon: <SafetyCertificateOutlined />,
      title: '入口规则',
      eyebrow: 'P1 / 安全边界',
      primary: getSecurityLabel(securityPosture),
      secondary: openAlertCount > 0 ? `${openAlertCount} 个告警待处理` : '无未处理告警',
      status: openAlertCount > 0 ? '需要关注' : '正常',
      tone: openAlertCount > 0 ? 'warn' : 'good',
      href: '#settings-ops',
    },
    {
      icon: <ThunderboltOutlined />,
      title: '快速通道',
      eyebrow: 'P2.1 / 能力组件',
      primary: embeddedModel?.provider
        ? formatTechnicalLabel(embeddedModel.provider)
        : '未返回',
      secondary: routeTimeout > 0 ? `路由超时 ${routeTimeout}ms` : '等待配置',
      status: hasEmbeddedModelConfig ? (localModelEnabled ? '启用' : '关闭') : '待连接',
      tone: localModelEnabled ? 'good' : 'muted',
      href: '#settings-runtime',
    },
    {
      icon: <ApiOutlined />,
      title: '主链路',
      eyebrow: '任务执行 / 能力组件',
      primary: modelDisplay,
      secondary: `降级到${formatTechnicalLabel(fallbackPolicy)}`,
      status: '可回退',
      href: '#settings-transition',
    },
    {
      icon: <DatabaseOutlined />,
      title: '记忆库',
      eyebrow: 'P2.5',
      primary: `${databaseName || '未返回'} / ${databaseTypeDisplay}`,
      secondary: '会话、规则、模板、缓存',
      status: '已连接',
      href: '#settings-transition',
    },
    {
      icon: <CloudServerOutlined />,
      title: '发布控制',
      eyebrow: '反馈 / 决策',
      primary: `${workflowRouteCount} 条工作流路由`,
      secondary: '灰度、守护、回滚',
      status: '受控',
      href: '#settings-release',
    },
  ];

  return (
    <section className="ap-settings-rules">
      <div className="ap-settings-rules__hero">
        <div>
          <div className="ap-settings-rules__eyebrow">
            <SafetyCertificateOutlined />
            系统规则
          </div>
          <h1>规则先行，配置靠后。</h1>
          <p>这里展示当前真正影响请求流转的规则链路。</p>
        </div>
        <Space wrap>
          <Button shape="round" onClick={onTestModelConnection}>
            测试模型
          </Button>
          <Button shape="round" onClick={onTestDatabaseConnection}>
            测试数据库
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} className="ap-settings-signals">
        {ruleSignals.map((item) => (
          <Col xs={24} md={12} xl={6} key={item.label}>
            <div className={`ap-settings-signal ap-settings-signal--${item.tone || 'default'}`}>
              <span className="ap-settings-signal__icon">{item.icon}</span>
              <span className="ap-settings-signal__label">{item.label}</span>
              <strong>{item.value}</strong>
              <span className="ap-settings-signal__meta">{item.meta}</span>
            </div>
          </Col>
        ))}
      </Row>

      <div className="ap-settings-flow">
        {flowItems.map((item) => (
          <a className="ap-settings-flow__item" href={item.href} key={item.title}>
            <span className="ap-settings-flow__icon">{item.icon}</span>
            <span className="ap-settings-flow__body">
              <span className="ap-settings-flow__eyebrow">{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <span>{item.primary}</span>
              <em>{item.secondary}</em>
            </span>
            <Tag color={item.tone === 'warn' ? 'orange' : item.tone === 'muted' ? 'default' : 'green'}>
              {item.status}
            </Tag>
          </a>
        ))}
      </div>

      <div className="ap-settings-jumps">
        <a href="#settings-ops">
          <CheckCircleOutlined />
          运行状态
        </a>
        <a href="#settings-runtime">模型路由</a>
        <a href="#settings-release">灰度发布</a>
        <a href="#settings-governance">治理版本</a>
        <a href="#settings-agent">智能体绑定</a>
      </div>
    </section>
  );
}

export default SettingsRulesOverviewSection;
