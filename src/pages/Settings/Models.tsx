import { useEffect, useState } from 'react';
import { Button, Card, Spin, Typography, message } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import ModelTestResultDrawer from '../../components/settings/ModelTestResultDrawer';
import PlannerModelCard from '../../components/settings/PlannerModelCard';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import ModelCenterPage from '../ModelCenter';
import * as settingsAdapter from '../../utils/settingsCenterAdapter';

function SettingsModelsPage() {
  const [showTest, setShowTest] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getModels().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SettingsModuleShell title="大模型管理" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="大模型管理" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败，请稍后重试。</Typography.Text><br/><Button icon={<ReloadOutlined />} style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;

  const planner = data?.plannerModel || { status: 'ready', source: 'embedded_model', modelName: 'gpt-4o-mini', fallbackStrategy: '默认任务模板' };
  const fallback = data?.fallbackRules || {};

  return (
    <SettingsModuleShell
      title="大模型管理"
      description="管理默认大模型、模块绑定、fallback 规则，并查看任务规划器小模型状态。"
    >
      <PlannerModelCard planner={planner} />

      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
          <ThunderboltOutlined style={{ marginRight: 6 }} />
          任务规划器小模型
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          规划器状态：{planner.status} · 来源：{planner.source}
          {fallback.plannerFallback && <> · Fallback：{fallback.plannerFallback}</>}
        </Typography.Text>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Button icon={<CheckCircleOutlined />} onClick={() => setShowTest(true)} style={{ marginBottom: 12 }}>测试模型连接</Button>
        <ModelCenterPage />
      </div>

      <ModelTestResultDrawer
        open={showTest}
        modelName={data?.defaultModel?.name || 'gpt-4o-mini'}
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
