import { Card, Typography } from 'antd';
import { AppstoreOutlined, LockOutlined } from '@ant-design/icons';
import AdminOnlyEntry from '../../components/settings/AdminOnlyEntry';
import AppsPage from '../Apps';

function SettingsAppsPage() {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <AppstoreOutlined style={{ marginRight: 10 }} />
          应用与渠道
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          管理 Apps、API Key、Channels、Application Pack，以及受控的 Platform Manager / Admin UI 高级入口。
        </Typography.Paragraph>
      </div>

      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
          <LockOutlined style={{ marginRight: 6 }} />
          安全与权限说明
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Webhook 当前仅内部使用。公网暴露前必须完成平台签名校验。Apps / Manage 旧入口已合并到应用与渠道。Platform Manager / Admin UI 仅系统管理员 / 内部运维可见。
        </Typography.Text>
      </Card>

      <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      <AppsPage />
    </div>
  );
}

export default SettingsAppsPage;
