import { Modal, Input, Form, Typography, Tag, message } from 'antd';

type AssistantPublishConfirmModalProps = {
  open: boolean;
  assistantName: string;
  currentVersion: string;
  newVersion: string;
  affectedModules: string[];
  onPublish: (changeNote: string) => void;
  onCancel: () => void;
  onSuccess?: () => void;
};

function AssistantPublishConfirmModal({ open, assistantName, currentVersion, newVersion, affectedModules, onPublish, onCancel }: AssistantPublishConfirmModalProps) {
  const [form] = Form.useForm();

  return (
    <Modal
      title="发布 Assistant"
      open={open}
      onOk={() => form.validateFields().then((v) => { onPublish(v.changeNote); message.success(`${assistantName} 已发布为 ${newVersion}。本次变更已写入治理历史。`); })}
      onCancel={onCancel}
      okText="确认发布"
      width={520}
      centered
      forceRender
    >
      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>发布对象</Typography.Text><br /><Typography.Text strong>{assistantName}</Typography.Text>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>当前版本</Typography.Text><br /><Tag>{currentVersion}</Tag></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>新版本</Typography.Text><br /><Tag color="blue">{newVersion}</Tag></div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>影响模块</Typography.Text><br />{affectedModules.map((m) => <Tag key={m}>{m}</Tag>)}
      </div>
      <Form form={form} layout="vertical">
        <Form.Item name="changeNote" label="变更说明" rules={[{ required: true, message: '请填写本次发布的变更说明。' }]}>
          <Input.TextArea rows={3} placeholder="描述本次发布的变更内容…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default AssistantPublishConfirmModal;
