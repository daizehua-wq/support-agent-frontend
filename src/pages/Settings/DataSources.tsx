import { Card, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import DatabaseManagerPage from '../DatabaseManager';

function SettingsDataSourcesPage() {
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
      </Card>

      <DatabaseManagerPage />
    </SettingsModuleShell>
  );
}

export default SettingsDataSourcesPage;
