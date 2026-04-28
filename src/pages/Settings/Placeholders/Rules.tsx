import { Card, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

function SettingsRulesPage() {
  return (
    <Card style={{ borderRadius: 28, minHeight: 400 }}>
      <SafetyCertificateOutlined style={{ fontSize: 36, color: '#2563eb', marginBottom: 16, display: 'block' }} />
      <Typography.Title level={3}>规则与知识</Typography.Title>
      <Typography.Paragraph type="secondary">
        规则引擎配置、知识库管理和确定性规则编排即将在此统一管理。
        当前规则与知识配置暂保留在设置总览中，后续将独立为完整模块。
      </Typography.Paragraph>
    </Card>
  );
}

export default SettingsRulesPage;
