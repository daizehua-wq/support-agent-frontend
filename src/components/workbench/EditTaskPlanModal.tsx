import { Modal, Input, Select, Form, Typography, Alert } from 'antd';

type EditTaskPlanModalProps = {
  open: boolean;
  taskTitle: string;
  outputTarget: string;
  tone: string;
  contextNote: string;
  source: 'workbench' | 'output';
  onSave: (values: { taskTitle: string; outputTarget: string; tone: string; contextNote: string }) => void;
  onCancel: () => void;
};

const TONE_OPTIONS = [
  { value: 'formal', label: '正式' },
  { value: 'concise', label: '简洁' },
  { value: 'spoken', label: '口语' },
];

function EditTaskPlanModal({ open, taskTitle, outputTarget, tone, contextNote, source, onSave, onCancel }: EditTaskPlanModalProps) {
  const [form] = Form.useForm();

  return (
    <Modal
      title="编辑任务计划"
      open={open}
      onOk={() => form.validateFields().then(onSave)}
      onCancel={onCancel}
      okText="保存修改"
      width={560}
      centered
      forceRender
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 16 }}>
        你可以调整任务标题、输出对象、语气和补充上下文。核心执行步骤和模型路由由系统管理，不能在这里直接修改。
        {source === 'output' && ' 修改任务计划会返回 Workbench，并在当前任务中生成新的 TaskPlan Version。'}
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        message="系统管理"
        description="以下内容由系统自动管理：技术模块名、内部 API 参数、模型路由、Python Runtime 调度、核心步骤顺序。"
        style={{ marginBottom: 16, borderRadius: 16 }}
      />

      <Form form={form} layout="vertical" initialValues={{ taskTitle, outputTarget, tone, contextNote }}>
        <Form.Item name="taskTitle" label="任务标题" rules={[{ required: true }]}>
          <Input placeholder="输入任务标题" />
        </Form.Item>
        <Form.Item name="outputTarget" label="输出对象">
          <Input placeholder="如 销售经理" />
        </Form.Item>
        <Form.Item name="tone" label="输出语气">
          <Select options={TONE_OPTIONS} />
        </Form.Item>
        <Form.Item name="contextNote" label="补充上下文">
          <Input.TextArea rows={3} placeholder="补充业务上下文说明…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default EditTaskPlanModal;
