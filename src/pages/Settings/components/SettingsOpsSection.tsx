import { Alert, Button, Card, Descriptions, List, Space, Tag } from 'antd';

import type {
  OpsAlertItem,
  OpsDashboardData,
  PythonRuntimeHealthData,
  SettingsSecurityPostureData,
} from '../../../api/settings';
import { formatDateTimeToLocalTime } from '../../../utils/dateTime';
import { formatTechnicalLabel } from '../../../utils/displayLabel';

type SettingsOpsSectionProps = {
  opsDashboard: OpsDashboardData | null;
  pythonRuntimeHealth: PythonRuntimeHealthData | null;
  securityPosture: SettingsSecurityPostureData | null;
  refreshingOps: boolean;
  refreshingSecurity: boolean;
  acknowledgingAlertId: string;
  onRefreshOps: () => void;
  onRefreshSecurity: () => void;
  onAcknowledgeAlert: (alertId: string) => void;
};

const getAlertLevelTag = (level = '') => {
  const normalizedLevel = String(level || '').trim().toLowerCase();
  if (normalizedLevel === 'critical') {
    return <Tag color="red">{formatTechnicalLabel(normalizedLevel)}</Tag>;
  }
  if (normalizedLevel === 'warning') {
    return <Tag color="orange">{formatTechnicalLabel(normalizedLevel)}</Tag>;
  }
  if (normalizedLevel === 'info') {
    return <Tag color="blue">{formatTechnicalLabel(normalizedLevel)}</Tag>;
  }

  return <Tag>{formatTechnicalLabel(normalizedLevel || 'unknown')}</Tag>;
};

function SettingsOpsSection({
  opsDashboard,
  pythonRuntimeHealth,
  securityPosture,
  refreshingOps,
  refreshingSecurity,
  acknowledgingAlertId,
  onRefreshOps,
  onRefreshSecurity,
  onAcknowledgeAlert,
}: SettingsOpsSectionProps) {
  const alertItems: OpsAlertItem[] = Array.isArray(opsDashboard?.alerts?.items)
    ? opsDashboard.alerts.items
    : [];

  const openAlertItems = alertItems.filter((item) => item.status === 'open');
  const topCostRoutes = Array.isArray(opsDashboard?.cost?.topRoutes)
    ? opsDashboard?.cost?.topRoutes || []
    : [];
  const pythonRuntimeStatus =
    String(opsDashboard?.health?.pythonRuntime?.status || '').trim() || 'unknown';

  return (
    <Card title="生产运维闭环（告警 / 成本 / 健康）" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="运维闭环说明"
          description="该区展示工作流成本估算、错误告警、Python Runtime 健康门禁状态，并支持告警确认。"
        />

        <Space wrap>
          <Button loading={refreshingOps} onClick={onRefreshOps}>
            刷新运维看板
          </Button>
          <Button loading={refreshingSecurity} onClick={onRefreshSecurity}>
            刷新安全态势
          </Button>
        </Space>

        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            {
              key: 'totalRequest',
              label: '总请求数',
              children: Number(opsDashboard?.totals?.requestCount || 0),
            },
            {
              key: 'errorRate',
              label: '全局错误率',
              children: `${Number(opsDashboard?.totals?.errorRatePercent || 0)}%`,
            },
            {
              key: 'totalCost',
              label: '累计成本估算(USD)',
              children: Number(opsDashboard?.totals?.totalCostUsd || 0).toFixed(6),
            },
            {
              key: 'tokenCount',
              label: '累计 Tokens',
              children: Number(opsDashboard?.totals?.totalTokens || 0),
            },
            {
              key: 'alertOpen',
              label: '未处理告警',
              children: Number(opsDashboard?.alerts?.summary?.open || 0),
            },
            {
              key: 'pythonRuntimeStatus',
              label: 'Python Runtime 状态',
              children:
                pythonRuntimeStatus === 'healthy' ? (
                  <Tag color="green">{formatTechnicalLabel(pythonRuntimeStatus)}</Tag>
                ) : pythonRuntimeStatus === 'unhealthy' ? (
                  <Tag color="red">{formatTechnicalLabel(pythonRuntimeStatus)}</Tag>
                ) : (
                  <Tag color="default">{formatTechnicalLabel(pythonRuntimeStatus)}</Tag>
                ),
            },
          ]}
        />

        <Card size="small" title="未处理告警" style={{ borderRadius: 12, background: '#fafafa' }}>
          <List
            dataSource={openAlertItems}
            locale={{ emptyText: '当前无未处理告警' }}
            renderItem={(item) => (
              <List.Item
                key={item.alertId}
                actions={[
                  <Button
                    key="ack"
                    size="small"
                    loading={acknowledgingAlertId === item.alertId}
                    onClick={() => onAcknowledgeAlert(item.alertId)}
                  >
                    确认
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space>
                    {getAlertLevelTag(item.level)}
                    <Tag>{formatTechnicalLabel(item.category || 'general')}</Tag>
                    <Tag>{formatTechnicalLabel(item.status || 'open')}</Tag>
                  </Space>
                  <div style={{ fontWeight: 600 }}>{item.title || '未命名告警'}</div>
                  <div style={{ color: '#595959' }}>{item.message || '-'}</div>
                  <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                    次数：{item.count || 1} / 最近：
                    {formatDateTimeToLocalTime(item.lastSeenAt || item.updatedAt) || '-'}
                  </div>
                </Space>
              </List.Item>
            )}
          />
        </Card>

        <Card size="small" title="高成本路由 Top 5" style={{ borderRadius: 12, background: '#fafafa' }}>
          <List
            dataSource={topCostRoutes.slice(0, 5)}
            locale={{ emptyText: '暂无成本数据' }}
            renderItem={(item) => (
              <List.Item key={String(item.routeKey || `${item.kind}:${item.route}`)}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div style={{ fontWeight: 600 }}>
                    {formatTechnicalLabel(item.kind || 'unknown')} / {formatTechnicalLabel(item.route || 'unknown')} /{' '}
                    {formatTechnicalLabel(item.pluginId || 'unknown-plugin')}
                  </div>
                  <div style={{ color: '#595959' }}>
                    成本：{Number(item.totalCostUsd || 0).toFixed(6)} USD，Tokens：
                    {Number(item.totalTokens || 0)}，错误率：{Number(item.errorRatePercent || 0)}%
                  </div>
                </Space>
              </List.Item>
            )}
          />
        </Card>

        <Card size="small" title="安全合规态势" style={{ borderRadius: 12, background: '#fafafa' }}>
          <Descriptions
            size="small"
            column={2}
            items={[
              {
                key: 'vaultEnabled',
                label: '密钥托管启用',
                children: securityPosture?.secretVault?.enabled ? '是' : '否',
              },
              {
                key: 'vaultProvider',
                label: '密钥托管提供方',
                children: securityPosture?.secretVault?.provider || '未返回',
              },
              {
                key: 'vaultMasterKey',
                label: '主密钥已加载',
                children: securityPosture?.secretVault?.hasMasterKey ? '是' : '否',
              },
              {
                key: 'vaultItems',
                label: '托管密钥数量',
                children: Number(securityPosture?.secretVault?.itemCount || 0),
              },
              {
                key: 'ssoEnabled',
                label: 'SSO 启用',
                children:
                  (securityPosture?.security as { sso?: { enabled?: boolean } } | undefined)?.sso
                    ?.enabled
                    ? '是'
                    : '否',
              },
              {
                key: 'ssoMode',
                label: 'SSO 模式',
                children:
                  (securityPosture?.security as { sso?: { mode?: string } } | undefined)?.sso?.mode ||
                  '未返回',
              },
              {
                key: 'pythonProbe',
                label: 'Runtime 最近探针',
                children:
                  formatDateTimeToLocalTime(
                    (pythonRuntimeHealth?.snapshot as { checkedAt?: string } | undefined)?.checkedAt ||
                      (pythonRuntimeHealth?.healthProbe as { checkedAt?: string } | undefined)
                        ?.checkedAt,
                  ) || '-',
              },
              {
                key: 'pythonProbeReason',
                label: 'Runtime 探针结果',
                children:
                  String(
                    (pythonRuntimeHealth?.snapshot as { message?: string } | undefined)?.message ||
                      (pythonRuntimeHealth?.healthProbe as { reason?: string } | undefined)?.reason ||
                      '-',
                  ) || '-',
              },
            ]}
          />
        </Card>
      </Space>
    </Card>
  );
}

export default SettingsOpsSection;
