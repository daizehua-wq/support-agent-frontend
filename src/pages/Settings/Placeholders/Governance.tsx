import { Card, Typography } from 'antd';
import { AuditOutlined } from '@ant-design/icons';

function SettingsGovernancePage() {
  return (
    <Card style={{ borderRadius: 28, minHeight: 400 }}>
      <AuditOutlined style={{ fontSize: 36, color: '#8b5cf6', marginBottom: 16, display: 'block' }} />
      <Typography.Title level={3}>治理历史</Typography.Title>
      <Typography.Paragraph type="secondary">
        Settings 配置的版本发布、回滚记录、审批轨迹和审计日志将在此统一展示。
        当前治理历史数据暂保留在设置总览中，后续将独立为完整模块。
      </Typography.Paragraph>
    </Card>
  );
}

export default SettingsGovernancePage;
