import { Card, Typography, Button } from 'antd';
import { SafetyCertificateOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import DataSourceHealthCheckDrawer from '../../components/settings/DataSourceHealthCheckDrawer';
import SettingsSecretReferenceDrawer from '../../components/settings/SettingsSecretReferenceDrawer';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import DatabaseManagerPage from '../DatabaseManager';

function SettingsDataSourcesPage() {
  const [showHealth, setShowHealth] = useState(false);
  const [showSecretRef, setShowSecretRef] = useState(false);
  return (
    <SettingsModuleShell
      title="数据源管理"
      description="统一管理内部数据库、内部知识库、Reference Pack、外部资料源、轻绑定和 provider 状态。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />
          凭据安全说明
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          真实凭据不会在界面中展示。仅展示 secret:// 或 env 引用。数据库和外部资料源统一称为"数据源"。外部源 degraded 不等于失败，系统会在降级状态下继续使用内部资料源完成检索。
        </Typography.Text>
        <Button size="small" icon={<CheckCircleOutlined />} style={{ marginTop: 8 }} onClick={() => setShowHealth(true)}>健康检查</Button>
        <Button size="small" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setShowSecretRef(true)}>查看凭据引用</Button>
      </Card>

      <DatabaseManagerPage />
      <DataSourceHealthCheckDrawer
        open={showHealth}
        sourceName="企业内部数据库 (SQLite) + 外部资料源 (企查查)"
        overallStatus="degraded"
        lastCheckTime="2026-04-28 15:00"
        providers={[
          { name: 'internal-kb-provider', status: 'healthy' },
          { name: 'reference-pack-provider', status: 'ready' },
          { name: 'external-company-provider', status: 'degraded', detail: '连接中断' },
        ]}
        degradedReason="外部资料源 API 超时。"
        onRecheck={() => setShowHealth(false)}
        onViewSecretRef={() => { setShowHealth(false); setShowSecretRef(true); }}
        onClose={() => setShowHealth(false)}
      />

      <SettingsSecretReferenceDrawer
        open={showSecretRef}
        references={[
          { envKey: 'QICHACHA_API_KEY', secretRef: 'secret://providers/qichacha/default', binding: '外部资料源 · 企查查', lastRotation: '2026-04-28 08:00', status: 'active' },
          { envKey: 'DB_PASSWORD', secretRef: 'secret://databases/internal/default', binding: '企业内部数据库', status: 'active' },
        ]}
        onClose={() => setShowSecretRef(false)}
        onRequestRotation={() => {}}
      />
    </SettingsModuleShell>
  );
}

export default SettingsDataSourcesPage;
