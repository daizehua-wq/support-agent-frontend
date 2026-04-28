import { Card, Tag, Typography } from 'antd';
import { DashboardOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import RuntimeStatusCard from '../../../components/settings/RuntimeStatusCard';
import { MOCK_RUNTIME } from '../../../utils/mockSettingsModules';

function SettingsRuntimePage() {
  const rt = MOCK_RUNTIME;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <DashboardOutlined style={{ marginRight: 10 }} />
          运行状态与安全
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          查看服务健康、Runtime、Secret Vault、API Gateway、Webhook 安全边界、Rate Limit 和安全提示。
        </Typography.Paragraph>
      </div>

      {/* Health */}
      <div style={{ marginBottom: 14 }}>
        <RuntimeStatusCard items={rt.health} title="服务健康" />
      </div>

      {/* Python Runtime + Embedded Model */}
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

      {/* Secret Vault */}
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
          <LockOutlined style={{ marginRight: 6 }} />Secret Vault
        </Typography.Text>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>状态</Typography.Text>
            <br /><Tag color="green">正常</Tag>
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>托管凭据数量</Typography.Text>
            <br /><Typography.Text strong>{rt.secretVault.credentialCount}</Typography.Text>
          </div>
          {rt.secretVault.lastRotation && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>最近轮换</Typography.Text>
              <br /><Typography.Text>{rt.secretVault.lastRotation}</Typography.Text>
            </div>
          )}
        </div>
      </Card>

      {/* Internal Routes */}
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>内部路由</Typography.Text>
        {rt.internalRoutes.map((r) => (
          <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{r.name}</span>
            <Tag style={{ fontSize: 10 }}>{r.path}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{r.access}</Typography.Text>
          </div>
        ))}
      </Card>

      {/* API Gateway + Webhook */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>API Gateway</Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tag color="green">服务状态 · 正常</Tag>
            <Tag color={rt.apiGateway.authEnabled ? 'green' : 'red'} style={{ fontSize: 11 }}>API 鉴权 · {rt.apiGateway.authEnabled ? '启用' : '未启用'}</Tag>
            <Tag color={rt.apiGateway.rateLimitEnabled ? 'green' : 'red'} style={{ fontSize: 11 }}>限流策略 · {rt.apiGateway.rateLimitEnabled ? '启用' : '未启用'}</Tag>
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            <SafetyCertificateOutlined style={{ marginRight: 4 }} />Webhook 安全边界
          </Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tag color="red" style={{ fontSize: 11 }}>公网签名校验 · 未启用</Tag>
            <Tag style={{ fontSize: 11 }}>当前边界 · internal only</Tag>
            <Tag color="orange" style={{ fontSize: 11 }}>状态 · 仅内部使用</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
            Webhook 当前仅内部使用。公网暴露前必须完成平台签名校验。
          </Typography.Text>
        </Card>
      </div>

      {/* Rate Limit */}
      <Card size="small" style={{ borderRadius: 22 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Rate Limit</Typography.Text>
        {rt.rateLimits.map((rl) => (
          <div key={rl.level} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{rl.level}</span>
            <span>
              <Tag style={{ fontSize: 10 }}>{rl.limit}/min</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>burst {rl.burst}</Typography.Text>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default SettingsRuntimePage;
