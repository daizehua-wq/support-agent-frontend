import { Button, Drawer, Tag, Typography, message } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

type TestStatus = 'success' | 'success_fallback' | 'failed';

type ModelTestResultDrawerProps = {
  open: boolean;
  modelName: string;
  status: TestStatus;
  responseTime?: number;
  fallbackTriggered: boolean;
  outputPreview?: string;
  errorReason?: string;
  onReTest: () => void;
  onClose: () => void;
};

const STATUS_CFG: Record<TestStatus, { color: string; icon: React.ReactNode; title: string; description: string }> = {
  success: { color: 'green', icon: <CheckCircleFilled />, title: '测试成功', description: '模型已成功返回结构化响应。' },
  success_fallback: { color: 'orange', icon: <ExclamationCircleFilled />, title: '成功 · 使用 fallback', description: '默认大模型不可用，系统已切换 fallback 模型完成测试。后续 Output 会标记为 degraded。' },
  failed: { color: 'red', icon: <CloseCircleFilled />, title: '测试失败', description: '默认大模型和 fallback 模型均不可用。Output 生成将被阻断。' },
};

function ModelTestResultDrawer({ open, modelName, status, responseTime, fallbackTriggered, outputPreview, errorReason, onReTest, onClose }: ModelTestResultDrawerProps) {
  const navigate = useNavigate();
  const cfg = STATUS_CFG[status];

  return (
    <Drawer title="模型测试结果" open={open} onClose={onClose} width={480}>
      <div style={{ marginBottom: 14 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>测试对象</Typography.Text><br /><Typography.Text strong>{modelName}</Typography.Text>
      </div>
      <div style={{ padding: 14, borderRadius: 16, background: `${cfg.color === 'green' ? 'rgba(34,197,94,0.08)' : cfg.color === 'orange' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'}`, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{cfg.icon}<Typography.Text strong>{cfg.title}</Typography.Text></div>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>{cfg.description}</Typography.Text>
      </div>
      {responseTime !== undefined && <div style={{ marginBottom: 14 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>响应时间</Typography.Text><br /><Typography.Text>{responseTime}ms</Typography.Text></div>}
      {fallbackTriggered && <div style={{ marginBottom: 14 }}><Tag color="orange">fallback 已触发</Tag></div>}
      {outputPreview && <div style={{ padding: 12, borderRadius: 14, background: 'rgba(248,250,252,0.72)', marginBottom: 14 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>输出摘要</Typography.Text><br /><Typography.Text style={{ fontSize: 13 }}>{outputPreview}</Typography.Text></div>}
      {errorReason && <div style={{ padding: 12, borderRadius: 14, background: 'rgba(239,68,68,0.06)', marginBottom: 14 }}><Typography.Text type="danger" style={{ fontSize: 13 }}>{errorReason}</Typography.Text></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button block icon={<ReloadOutlined />} onClick={() => { onReTest(); message.info('已发起重新测试'); }}>重新测试</Button>
        <Button block icon={<SettingOutlined />} onClick={() => { navigate('/settings/models'); onClose(); }}>查看模型配置</Button>
      </div>
    </Drawer>
  );
}

export default ModelTestResultDrawer;
