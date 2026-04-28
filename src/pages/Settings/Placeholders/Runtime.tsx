import { Card, Typography } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';

function SettingsRuntimePage() {
  return (
    <Card style={{ borderRadius: 28, minHeight: 400 }}>
      <DashboardOutlined style={{ fontSize: 36, color: '#22c55e', marginBottom: 16, display: 'block' }} />
      <Typography.Title level={3}>运行状态与安全</Typography.Title>
      <Typography.Paragraph type="secondary">
        Python Runtime 健康、系统看板、安全态势和运维事件将在此统一展示。
        当前运行状态数据暂保留在设置总览中，后续将独立为完整模块。
      </Typography.Paragraph>
    </Card>
  );
}

export default SettingsRuntimePage;
