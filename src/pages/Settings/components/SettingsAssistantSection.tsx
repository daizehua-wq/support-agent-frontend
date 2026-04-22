import { Button, Card, Col, Form, Input, Row, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import GovernanceHistoryList from '../../../components/governance/GovernanceHistoryList';
import type { GovernanceAuditEntry } from '../../../api/settings';

type SelectOption = {
  label: string;
  value: string;
};

type SettingsAssistantSectionProps = {
  assistantForm: FormInstance;
  defaultAssistantValues: {
    activeAssistantId: string;
  };
  assistantSelectOptions: SelectOption[];
  currentSessionId: string;
  resolvedAssistantId: string;
  analyzePromptId: string;
  searchPromptId: string;
  scriptPromptId: string;
  publishedPromptId: string;
  publishedPromptVersion: string;
  analyzeStrategy: string;
  searchStrategy: string;
  scriptStrategy: string;
  activeAnalyzePromptName: string;
  activeAnalyzePromptVersion: string;
  assistantHistory: GovernanceAuditEntry[];
  promptHistory: GovernanceAuditEntry[];
  onSaveAssistantSettings: () => void;
};

function SettingsAssistantSection({
  assistantForm,
  defaultAssistantValues,
  assistantSelectOptions,
  currentSessionId,
  resolvedAssistantId,
  analyzePromptId,
  searchPromptId,
  scriptPromptId,
  publishedPromptId,
  publishedPromptVersion,
  analyzeStrategy,
  searchStrategy,
  scriptStrategy,
  activeAnalyzePromptName,
  activeAnalyzePromptVersion,
  assistantHistory,
  promptHistory,
  onSaveAssistantSettings,
}: SettingsAssistantSectionProps) {
  return (
    <>
      <Card title="当前激活助手摘要（串联 AssistantCenter）" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Form form={assistantForm} layout="vertical" initialValues={defaultAssistantValues}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item label="当前激活助手" name="activeAssistantId">
                <Select options={assistantSelectOptions} placeholder="请选择当前助手" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="当前会话 ID">
                <Input value={currentSessionId || '当前未带入会话 ID'} readOnly />
              </Form.Item>
            </Col>
          </Row>

          <Space wrap>
            <Button type="primary" onClick={onSaveAssistantSettings}>
              保存助手设置
            </Button>
          </Space>

          <Card size="small" style={{ marginTop: 16, borderRadius: 12, background: '#fafafa' }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <div style={{ fontWeight: 600, color: '#262626' }}>全局默认说明</div>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                当前默认激活助手为 <strong>{resolvedAssistantId}</strong>。这里表达的是系统默认如何串起来；Assistant 的治理定义、Prompt 绑定、发布版与历史记录现在都来自治理注册表，Settings 主要负责默认摘要与串联说明。
              </div>
            </Space>
          </Card>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title="当前治理绑定摘要" style={{ borderRadius: 12 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Analyze Prompt：{analyzePromptId}</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Search Prompt：{searchPromptId}</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Script Prompt：{scriptPromptId}</div>
                  <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                    当前发布 Prompt：{publishedPromptId} / {publishedPromptVersion}
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="当前治理策略摘要" style={{ borderRadius: 12 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Analyze：{analyzeStrategy}</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Search：{searchStrategy}</div>
                  <div style={{ color: '#595959', lineHeight: 1.8 }}>Script：{scriptStrategy}</div>
                  <div style={{ color: '#8c8c8c', lineHeight: 1.8 }}>
                    当前 Analyze Prompt：{activeAnalyzePromptName} / {activeAnalyzePromptVersion}
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </Form>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <GovernanceHistoryList
            title="当前 Assistant 最近治理变更"
            items={assistantHistory}
            emptyText="当前 Assistant 暂无治理历史"
          />
        </Col>
        <Col xs={24} md={12}>
          <GovernanceHistoryList
            title="当前 Analyze Prompt 最近治理变更"
            items={promptHistory}
            emptyText="当前 Analyze Prompt 暂无治理历史"
          />
        </Col>
      </Row>
    </>
  );
}

export default SettingsAssistantSection;
