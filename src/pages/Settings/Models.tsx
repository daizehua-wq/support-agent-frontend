import { Card, Typography, Button, message } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ModelTestResultDrawer from '../../components/settings/ModelTestResultDrawer';
import PlannerModelCard from '../../components/settings/PlannerModelCard';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import ModelCenterPage from '../ModelCenter';

function SettingsModelsPage() {
  const [showTest, setShowTest] = useState(false);
  return (
    <SettingsModuleShell
      title="大模型管理"
      description="管理默认大模型、模块绑定、fallback 规则，并查看任务规划器小模型状态。"
    >
      <PlannerModelCard
        planner={{
          status: 'ready',
          source: 'embedded-planner',
          modelName: 'gpt-4o-mini',
          lastCallCount: 142,
          successRate: 94.3,
          fallbackStrategy: '默认任务模板',
        }}
      />

      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
          <ThunderboltOutlined style={{ marginRight: 6 }} />
          任务规划器小模型
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          这里用于治理平台的大模型能力、模块绑定和 fallback 策略。
          任务规划器小模型作为独立能力展示，用于任务拆解、模块路由和结构化计划生成。
        </Typography.Text>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Button icon={<CheckCircleOutlined />} onClick={() => setShowTest(true)} style={{ marginBottom: 12 }}>测试模型连接</Button>
        <ModelCenterPage />
      </div>

      <ModelTestResultDrawer
        open={showTest}
        modelName="gpt-4o-mini"
        status="success"
        responseTime={342}
        fallbackTriggered={false}
        outputPreview="模型已成功返回结构化响应：识别为销售跟进场景..."
        onReTest={() => message.info('已发起重新测试')}
        onClose={() => setShowTest(false)}
      />
    </SettingsModuleShell>
  );
}

export default SettingsModelsPage;
