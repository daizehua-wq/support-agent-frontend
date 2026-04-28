import { Card, Typography, Button } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import AssistantPublishConfirmModal from '../../components/settings/AssistantPublishConfirmModal';
import SettingsModuleShell from '../../components/settings/SettingsModuleShell';
import AssistantCenterPage from '../AssistantCenter';

function SettingsAssistantsPage() {
  const [showPublish, setShowPublish] = useState(false);
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

      <div style={{ marginBottom: 18 }}>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setShowPublish(true)}>发布 Assistant 示例</Button>
        <AssistantPublishConfirmModal
          open={showPublish}
          assistantName="销售支持助手"
          currentVersion="v3"
          newVersion="v4"
          affectedModules={['workbench', 'output']}
          onPublish={() => setShowPublish(false)}
          onCancel={() => setShowPublish(false)}
        />
      </div>

      <AssistantCenterPage />
    </SettingsModuleShell>
  );
}

export default SettingsAssistantsPage;
