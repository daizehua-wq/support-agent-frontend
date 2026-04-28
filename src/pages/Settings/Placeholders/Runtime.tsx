import { Card, Tag, Typography } from 'antd';
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useState } from 'react';
import DataSourceHealthCheckDrawer from '../../../components/settings/DataSourceHealthCheckDrawer';
import SettingsSecretReferenceDrawer from '../../../components/settings/SettingsSecretReferenceDrawer';
import PermissionDeniedModal from '../../../components/settings/PermissionDeniedModal';
import RuntimeStatusCard from '../../../components/settings/RuntimeStatusCard';
import SettingsModuleShell from '../../../components/settings/SettingsModuleShell';
import { MOCK_RUNTIME } from '../../../utils/mockSettingsModules';

function SettingsRuntimePage() {
  const rt = MOCK_RUNTIME;
  const [showHealth, setShowHealth] = useState(false);
  const [showSecretRef, setShowSecretRef] = useState(false);
  const [showPermDenied, setShowPermDenied] = useState(false);
  return (
    <>
    <SettingsModuleShell
      title="运行状态与安全"
      description="查看服务健康、Runtime、Secret Vault、API Gateway、Webhook 安全边界、Rate Limit 和安全提示。"
    >
      <div style={{ marginBottom: 14 }}>
        <RuntimeStatusCard items={rt.health} title="服务健康" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Python Runtime</Typography.Text>
          <Tag color="green">{rt.pythonRuntime.status === 'healthy' ? '正常' : rt.pythonRuntime.status}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{rt.pythonRuntime.detail}</Typography.Text>
        </Card>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Embedded Model</Typography.Text>
          <Tag color="green">{rt.embeddedModel.status === 'healthy' ? '正常' : rt.embeddedModel.status}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{rt.embeddedModel.detail}</Typography.Text>
        </Card>
      </div>
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}><LockOutlined style={{ marginRight: 6 }} />Secret Vault</Typography.Text>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>状态</Typography.Text><br /><Tag color="green">正常</Tag></div>
          <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>托管凭据数量</Typography.Text><br /><Typography.Text strong>{rt.secretVault.credentialCount}</Typography.Text></div>
          {rt.secretVault.lastRotation && <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>最近轮换</Typography.Text><br /><Typography.Text>{rt.secretVault.lastRotation}</Typography.Text></div>}
        </div>
      </Card>
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>内部路由</Typography.Text>
        {rt.internalRoutes.map((r) => (
          <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{r.name}</span><Tag style={{ fontSize: 10 }}>{r.path}</Tag><Typography.Text type="secondary" style={{ fontSize: 11 }}>{r.access}</Typography.Text>
          </div>
        ))}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>API Gateway</Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tag color="green" style={{ fontSize: 11 }}>服务状态 · 正常</Tag>
            <Tag color={rt.apiGateway.authEnabled ? 'green' : 'red'} style={{ fontSize: 11 }}>API 鉴权 · {rt.apiGateway.authEnabled ? '启用' : '未启用'}</Tag>
            <Tag color={rt.apiGateway.rateLimitEnabled ? 'green' : 'red'} style={{ fontSize: 11 }}>限流策略 · {rt.apiGateway.rateLimitEnabled ? '启用' : '未启用'}</Tag>
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}><SafetyCertificateOutlined style={{ marginRight: 4 }} />Webhook 安全边界</Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tag color="red" style={{ fontSize: 11 }}>公网签名校验 · 未启用</Tag>
            <Tag style={{ fontSize: 11 }}>当前边界 · internal only</Tag>
            <Tag color="orange" style={{ fontSize: 11 }}>状态 · 仅内部使用</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>Webhook 当前仅内部使用。公网暴露前必须完成平台签名校验。</Typography.Text>
        </Card>
      </div>
      <Card size="small" style={{ borderRadius: 22 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Rate Limit</Typography.Text>
        {rt.rateLimits.map((rl) => (
          <div key={rl.level} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{rl.level}</span>
            <span><Tag style={{ fontSize: 10 }}>{rl.limit}/min</Tag><Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>burst {rl.burst}</Typography.Text></span>
          </div>
        ))}
      </Card>
    </SettingsModuleShell>
      <DataSourceHealthCheckDrawer
        open={showHealth}
        sourceName="外部资料源"
        overallStatus="degraded"
        lastCheckTime="2026-04-28 15:00"
        providers={[
          { name: 'internal-kb-provider', status: 'healthy' },
          { name: 'reference-pack-provider', status: 'ready' },
          { name: 'external-company-provider', status: 'degraded', detail: '企查查连接中断' },
        ]}
        degradedReason="外部资料源 API 超时，已降级为内部检索。"
        onRecheck={() => setShowHealth(false)}
        onViewSecretRef={() => { setShowHealth(false); setShowSecretRef(true); }}
        onClose={() => setShowHealth(false)}
      />

      <SettingsSecretReferenceDrawer
        open={showSecretRef}
        references={[
          { envKey: 'QICHACHA_API_KEY', secretRef: 'secret://providers/qichacha/default', binding: '外部资料源 · 企查查', lastRotation: '2026-04-28 08:00', status: 'active' },
          { envKey: 'OPENAI_API_KEY', secretRef: 'secret://providers/openai/default', binding: '大模型 · API', lastRotation: '2026-04-27 16:00', status: 'active' },
        ]}
        onClose={() => setShowSecretRef(false)}
        onRequestRotation={() => {}}
      />

      <PermissionDeniedModal
        open={showPermDenied}
        currentRole="普通用户"
        requiredPermission="系统管理员"
        onClose={() => setShowPermDenied(false)}
      />
    </>
  );
}

export default SettingsRuntimePage;
