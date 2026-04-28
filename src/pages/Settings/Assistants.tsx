import { Card, Typography } from 'antd';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import AssistantCenterPage from '../AssistantCenter';

function SettingsAssistantsPage() {
  return (
    <SettingsModuleShell
      title="Assistant / Prompt"
      description="管理 Assistant、Prompt、发布版本、模块绑定和治理历史。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
          Assistant / Prompt
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          这里用于治理业务助手、Prompt 模板、当前发布版和模块绑定关系。
          这些配置会影响 Workbench 的任务规划、Analysis Step 和 Output 生成。
        </Typography.Text>
      </Card>

      <AssistantCenterPage />
    </SettingsModuleShell>
  );
}

export default SettingsAssistantsPage;
