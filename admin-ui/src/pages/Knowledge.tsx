import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  createGenerationTemplate,
  createGuidanceNote,
  createKnowledgeResource,
  createKnowledgeRule,
  deleteGenerationTemplate,
  deleteGuidanceNote,
  deleteKnowledgeResource,
  deleteKnowledgeRule,
  fetchGenerationTemplates,
  fetchGuidanceNotes,
  fetchKnowledgeResources,
  fetchKnowledgeRules,
  updateGenerationTemplate,
  updateGuidanceNote,
  updateKnowledgeResource,
  updateKnowledgeRule,
  type GenerationTemplate,
  type GuidanceNote,
  type KnowledgeResource,
  type KnowledgeRule,
} from '../api/admin';

type RuleForm = {
  domainType: string;
  topic?: string;
  workflowStage?: string;
  keywords?: string;
  scenario?: string;
  suggestions?: string;
  riskNotes?: string;
};

type ResourceForm = {
  domainType: string;
  title: string;
  summary?: string;
  applicableScenarios?: string;
  isShareable?: boolean;
  contentType?: string;
  link?: string;
};

type TemplateForm = {
  scene: string;
  outputTarget?: string;
  templateContent: string;
  variables?: string;
};

type NoteForm = {
  scene: string;
  noteType?: string;
  content: string;
};

const toText = (value: unknown) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
};

const parseJsonLike = (value = ''): unknown => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const parseKeywords = (value = '') =>
  value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const isShareable = (record: KnowledgeResource) =>
  Boolean(record.isShareable ?? record.is_shareable);

function Knowledge() {
  const [ruleForm] = Form.useForm<RuleForm>();
  const [resourceForm] = Form.useForm<ResourceForm>();
  const [templateForm] = Form.useForm<TemplateForm>();
  const [noteForm] = Form.useForm<NoteForm>();
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [resources, setResources] = useState<KnowledgeResource[]>([]);
  const [templates, setTemplates] = useState<GenerationTemplate[]>([]);
  const [notes, setNotes] = useState<GuidanceNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ruleTarget, setRuleTarget] = useState<KnowledgeRule | null | undefined>(undefined);
  const [resourceTarget, setResourceTarget] = useState<KnowledgeResource | null | undefined>(undefined);
  const [templateTarget, setTemplateTarget] = useState<GenerationTemplate | null | undefined>(undefined);
  const [noteTarget, setNoteTarget] = useState<GuidanceNote | null | undefined>(undefined);

  const loadKnowledge = async () => {
    try {
      setLoading(true);
      const [nextRules, nextResources, nextTemplates, nextNotes] = await Promise.all([
        fetchKnowledgeRules(),
        fetchKnowledgeResources(),
        fetchGenerationTemplates(),
        fetchGuidanceNotes(),
      ]);
      setRules(nextRules);
      setResources(nextResources);
      setTemplates(nextTemplates);
      setNotes(nextNotes);
    } catch (error) {
      console.error('knowledge load failed:', error);
      message.error('知识库加载失败');
    } finally {
      setLoading(false);
    }
  };

  const openRule = (record?: KnowledgeRule) => {
    setRuleTarget(record ?? null);
    ruleForm.setFieldsValue({
      domainType: record?.domainType || record?.domain_type || 'general',
      topic: record?.topic || '',
      workflowStage: record?.workflowStage || record?.workflow_stage || '',
      keywords: (record?.keywords || []).join('，'),
      scenario: record?.scenario || '',
      suggestions: toText(record?.suggestions),
      riskNotes: toText(record?.riskNotes ?? record?.risk_notes),
    });
  };

  const openResource = (record?: KnowledgeResource) => {
    setResourceTarget(record ?? null);
    resourceForm.setFieldsValue({
      domainType: record?.domainType || record?.domain_type || 'general',
      title: record?.title || '',
      summary: record?.summary || '',
      applicableScenarios: toText(record?.applicableScenarios ?? record?.applicable_scenarios),
      isShareable: record ? isShareable(record) : false,
      contentType: record?.contentType || record?.content_type || '',
      link: record?.link || '',
    });
  };

  const openTemplate = (record?: GenerationTemplate) => {
    setTemplateTarget(record ?? null);
    templateForm.setFieldsValue({
      scene: record?.scene || 'first_reply',
      outputTarget: record?.outputTarget || record?.output_target || '',
      templateContent: record?.templateContent || record?.template_content || '',
      variables: toText(record?.variables),
    });
  };

  const openNote = (record?: GuidanceNote) => {
    setNoteTarget(record ?? null);
    noteForm.setFieldsValue({
      scene: record?.scene || 'general',
      noteType: record?.noteType || record?.note_type || 'info',
      content: record?.content || '',
    });
  };

  const saveRule = async () => {
    const values = await ruleForm.validateFields();
    const payload = {
      ...values,
      keywords: parseKeywords(values.keywords || ''),
      suggestions: parseJsonLike(values.suggestions || ''),
      riskNotes: parseJsonLike(values.riskNotes || ''),
    };

    setSaving(true);
    try {
      if (ruleTarget?.id) {
        await updateKnowledgeRule(ruleTarget.id, payload);
      } else {
        await createKnowledgeRule(payload);
      }
      setRuleTarget(undefined);
      await loadKnowledge();
      message.success('知识规则已保存');
    } finally {
      setSaving(false);
    }
  };

  const saveResource = async () => {
    const values = await resourceForm.validateFields();
    const payload = {
      ...values,
      applicableScenarios: parseJsonLike(values.applicableScenarios || ''),
    };

    setSaving(true);
    try {
      if (resourceTarget?.id) {
        await updateKnowledgeResource(resourceTarget.id, payload);
      } else {
        await createKnowledgeResource(payload);
      }
      setResourceTarget(undefined);
      await loadKnowledge();
      message.success('知识资源已保存');
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    const values = await templateForm.validateFields();
    const payload = {
      ...values,
      variables: parseJsonLike(values.variables || ''),
    };

    setSaving(true);
    try {
      if (templateTarget?.id) {
        await updateGenerationTemplate(templateTarget.id, payload);
      } else {
        await createGenerationTemplate(payload);
      }
      setTemplateTarget(undefined);
      await loadKnowledge();
      message.success('生成模板已保存');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    const values = await noteForm.validateFields();

    setSaving(true);
    try {
      if (noteTarget?.id) {
        await updateGuidanceNote(noteTarget.id, values);
      } else {
        await createGuidanceNote(values);
      }
      setNoteTarget(undefined);
      await loadKnowledge();
      message.success('注意事项已保存');
    } finally {
      setSaving(false);
    }
  };

  const ruleColumns: ColumnsType<KnowledgeRule> = [
    { title: '领域', render: (_, record) => record.domainType || record.domain_type || '-' },
    { title: '主题', dataIndex: 'topic' },
    { title: '阶段', render: (_, record) => record.workflowStage || record.workflow_stage || '-' },
    { title: '关键词', render: (_, record) => (record.keywords || []).join('，') || '-' },
    { title: '场景', dataIndex: 'scenario' },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openRule(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这条规则？"
            onConfirm={() => deleteKnowledgeRule(record.id).then(loadKnowledge)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const resourceColumns: ColumnsType<KnowledgeResource> = [
    { title: '领域', render: (_, record) => record.domainType || record.domain_type || '-' },
    { title: '标题', dataIndex: 'title' },
    { title: '类型', render: (_, record) => record.contentType || record.content_type || '-' },
    {
      title: '可外发',
      render: (_, record) => (
        <Tag color={isShareable(record) ? 'green' : 'default'}>
          {isShareable(record) ? '可共享' : '内部'}
        </Tag>
      ),
    },
    { title: '摘要', dataIndex: 'summary', ellipsis: true },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openResource(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这个资源？"
            onConfirm={() => deleteKnowledgeResource(record.id).then(loadKnowledge)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const templateColumns: ColumnsType<GenerationTemplate> = [
    { title: '场景', dataIndex: 'scene' },
    { title: '输出目标', render: (_, record) => record.outputTarget || record.output_target || '-' },
    {
      title: '模板内容',
      render: (_, record) => record.templateContent || record.template_content || '',
      ellipsis: true,
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openTemplate(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这个模板？"
            onConfirm={() => deleteGenerationTemplate(record.id).then(loadKnowledge)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const noteColumns: ColumnsType<GuidanceNote> = [
    { title: '场景', dataIndex: 'scene' },
    { title: '类型', render: (_, record) => record.noteType || record.note_type || 'info' },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openNote(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这条注意事项？"
            onConfirm={() => deleteGuidanceNote(record.id).then(loadKnowledge)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  useEffect(() => {
    void loadKnowledge();
  }, []);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          知识库管理
        </Typography.Title>
        <Typography.Text type="secondary">
          管理 P2.5 数据层中的业务规则、资料资源、生成模板和注意事项。
        </Typography.Text>
      </div>

      <Card>
        <Tabs
          items={[
            {
              key: 'rules',
              label: '知识规则',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Button type="primary" onClick={() => openRule()}>
                    新增规则
                  </Button>
                  <Table rowKey="id" loading={loading} columns={ruleColumns} dataSource={rules} />
                </Space>
              ),
            },
            {
              key: 'resources',
              label: '资料资源',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Button type="primary" onClick={() => openResource()}>
                    新增资源
                  </Button>
                  <Table
                    rowKey="id"
                    loading={loading}
                    columns={resourceColumns}
                    dataSource={resources}
                  />
                </Space>
              ),
            },
            {
              key: 'templates',
              label: '生成模板',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Button type="primary" onClick={() => openTemplate()}>
                    新增模板
                  </Button>
                  <Table
                    rowKey="id"
                    loading={loading}
                    columns={templateColumns}
                    dataSource={templates}
                  />
                </Space>
              ),
            },
            {
              key: 'notes',
              label: '注意事项',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Button type="primary" onClick={() => openNote()}>
                    新增注意事项
                  </Button>
                  <Table rowKey="id" loading={loading} columns={noteColumns} dataSource={notes} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={ruleTarget?.id ? '编辑知识规则' : '新增知识规则'}
        open={ruleTarget !== undefined}
        confirmLoading={saving}
        onOk={() => void saveRule()}
        onCancel={() => setRuleTarget(undefined)}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="domainType" label="领域" rules={[{ required: true }]}>
            <Input placeholder="pcb / semiconductor / general" />
          </Form.Item>
          <Form.Item name="topic" label="主题">
            <Input placeholder="h2o2 / cleaning / sample_test" />
          </Form.Item>
          <Form.Item name="workflowStage" label="工作流阶段">
            <Input placeholder="analyze / search / script" />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <Input.TextArea rows={2} placeholder="用逗号或空格分隔" />
          </Form.Item>
          <Form.Item name="scenario" label="场景">
            <Input />
          </Form.Item>
          <Form.Item name="suggestions" label="建议内容（可填 JSON）">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="riskNotes" label="风险提示（可填 JSON）">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={resourceTarget?.id ? '编辑资料资源' : '新增资料资源'}
        open={resourceTarget !== undefined}
        confirmLoading={saving}
        onOk={() => void saveResource()}
        onCancel={() => setResourceTarget(undefined)}
        destroyOnClose
      >
        <Form form={resourceForm} layout="vertical">
          <Form.Item name="domainType" label="领域" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="contentType" label="内容类型">
            <Input placeholder="规格书 / FAQ / solution" />
          </Form.Item>
          <Form.Item name="applicableScenarios" label="适用场景（可填 JSON）">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="link" label="链接">
            <Input />
          </Form.Item>
          <Form.Item name="isShareable" valuePropName="checked" label="是否可外发">
            <Switch checkedChildren="可共享" unCheckedChildren="内部" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={templateTarget?.id ? '编辑生成模板' : '新增生成模板'}
        open={templateTarget !== undefined}
        confirmLoading={saving}
        onOk={() => void saveTemplate()}
        onCancel={() => setTemplateTarget(undefined)}
        destroyOnClose
      >
        <Form form={templateForm} layout="vertical">
          <Form.Item name="scene" label="场景" rules={[{ required: true }]}>
            <Input placeholder="first_reply / technical_reply" />
          </Form.Item>
          <Form.Item name="outputTarget" label="输出目标">
            <Input placeholder="formal / concise / spoken" />
          </Form.Item>
          <Form.Item name="templateContent" label="模板内容" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item name="variables" label="变量定义（可填 JSON）">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={noteTarget?.id ? '编辑注意事项' : '新增注意事项'}
        open={noteTarget !== undefined}
        confirmLoading={saving}
        onOk={() => void saveNote()}
        onCancel={() => setNoteTarget(undefined)}
        destroyOnClose
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item name="scene" label="场景" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="noteType" label="类型">
            <Input placeholder="warning / suggestion / info" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default Knowledge;
