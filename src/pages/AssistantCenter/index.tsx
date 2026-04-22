import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import PageHeader from '../../components/common/PageHeader';
import GovernanceHistoryList from '../../components/governance/GovernanceHistoryList';
import {
  activateAssistantCenterAssistant,
  createAssistantCenterAssistant,
  createAssistantCenterPrompt,
  deleteAssistantCenterAssistant,
  deleteAssistantCenterPrompt,
  getAssistantCenterAssistantDetail,
  getAssistantCenterAssistants,
  getAssistantCenterPromptDetail,
  getAssistantCenterPrompts,
  type GovernanceAuditEntry,
  publishAssistantCenterAssistant,
  publishAssistantCenterPrompt,
  updateAssistantCenterAssistant,
  updateAssistantCenterPrompt,
  type AssistantCenterDetail,
  type AssistantCenterListItem,
  type AssistantMutationRequest,
  type PromptCenterDetail,
  type PromptCenterListItem,
  type PromptMutationRequest,
} from '../../api/assistantCenter';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';

const industryPresetOptions = [
  { label: '通用', value: 'other' },
  { label: '法务', value: 'legal' },
  { label: '制造', value: 'manufacturing' },
  { label: '医疗', value: 'healthcare' },
  { label: '教育', value: 'education' },
  { label: '零售', value: 'retail' },
];

const moduleOptions = [
  { label: '判断', value: 'analyze' },
  { label: '检索', value: 'search' },
  { label: '写作', value: 'script' },
];

const analyzeStrategyOptions = [
  { label: 'rules-only', value: 'rules-only' },
  { label: 'api-enhanced', value: 'api-enhanced' },
];

const searchStrategyOptions = [
  { label: 'local-only', value: 'local-only' },
  { label: 'external-enabled', value: 'external-enabled' },
];

const scriptStrategyOptions = [
  { label: 'local-model', value: 'local-model' },
  { label: 'api-model', value: 'api-model' },
  { label: 'template-only', value: 'template-only' },
];

type AssistantModalMode = 'create' | 'edit';
type PromptModalMode = 'create' | 'edit';

function getStatusTag(status?: string) {
  if (status === 'published' || status === 'active') {
    return <Tag color="green">published</Tag>;
  }

  if (status === 'archived') {
    return <Tag color="default">archived</Tag>;
  }

  return <Tag color="gold">draft</Tag>;
}

function getModuleTag(module?: string) {
  if (module === 'analyze') return <Tag color="blue">判断</Tag>;
  if (module === 'search') return <Tag color="cyan">检索</Tag>;
  return <Tag color="purple">写作</Tag>;
}

function getIndustryLabel(industryType?: string) {
  const normalizedIndustryType = String(industryType || '').trim();
  if (!normalizedIndustryType || normalizedIndustryType === 'other') {
    return '通用';
  }

  return normalizedIndustryType;
}

function AssistantListCard({
  item,
  active,
  onClick,
}: {
  item: AssistantCenterListItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{
        borderRadius: 12,
        borderColor: active ? '#1677ff' : '#e5e7eb',
        boxShadow: active ? '0 0 0 1px rgba(22,119,255,0.18)' : undefined,
      }}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space wrap>
          <strong>{item.assistantName}</strong>
          <Tag color={item.templateOrigin === 'builtin' ? 'geekblue' : 'default'}>
            {item.templateOrigin === 'builtin' ? '内置模板' : '自定义模板'}
          </Tag>
          {getStatusTag(item.status)}
          {item.activeFlag ? <Tag color="processing">active</Tag> : null}
        </Space>
        <div style={{ color: '#64748B', fontSize: 12 }}>{item.assistantId}</div>
        <div style={{ color: '#475569', fontSize: 13 }}>{item.description || '暂无说明'}</div>
        <Space wrap size={4}>
          <Tag>{getIndustryLabel(item.industryType)}</Tag>
          <Tag>v{item.currentVersion}</Tag>
        </Space>
      </Space>
    </Card>
  );
}

function PromptListCard({
  item,
  active,
  onClick,
}: {
  item: PromptCenterListItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{
        borderRadius: 12,
        borderColor: active ? '#1677ff' : '#e5e7eb',
        boxShadow: active ? '0 0 0 1px rgba(22,119,255,0.18)' : undefined,
      }}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space wrap>
          {getModuleTag(item.module)}
          {getStatusTag(item.status)}
        </Space>
        <strong>{item.name}</strong>
        <div style={{ color: '#64748B', fontSize: 12 }}>
          {item.promptId} / {item.version}
        </div>
        <div style={{ color: '#475569', fontSize: 13 }}>
          {item.description || item.contentPreview || '暂无说明'}
        </div>
        <Tag>绑定模板：{item.assistantCount || 0}</Tag>
      </Space>
    </Card>
  );
}

function buildAssistantFormValues(detail?: AssistantCenterDetail | null) {
  return {
    assistantName: detail?.assistantName || '',
    description: detail?.description || '',
    industryType: detail?.industryType || 'other',
    templateOrigin: detail?.templateOrigin || 'custom',
    templateCategory: detail?.templateCategory || 'role-template',
    templateRole: detail?.templateRole || '',
    defaultTaskContext: detail?.defaultTaskContext || detail?.defaultCustomerType || '',
    defaultSubjectHint: detail?.defaultSubjectHint || detail?.defaultProductDirection || '',
    dataScopes: {
      rulesScope: detail?.dataScopes?.rulesScope || [],
      productScope: detail?.dataScopes?.productScope || [],
      docScope: detail?.dataScopes?.docScope || [],
    },
    defaultStrategies: {
      analyzeStrategy: detail?.defaultStrategies?.analyzeStrategy || '',
      searchStrategy: detail?.defaultStrategies?.searchStrategy || '',
      scriptStrategy: detail?.defaultStrategies?.scriptStrategy || '',
    },
    defaultModuleBindings: {
      analyze: detail?.defaultModuleBindings?.analyze || undefined,
      search: detail?.defaultModuleBindings?.search || undefined,
      script: detail?.defaultModuleBindings?.script || undefined,
    },
  };
}

function buildPromptFormValues(detail?: PromptCenterDetail | null) {
  return {
    name: detail?.name || '',
    module: detail?.module || 'analyze',
    version: detail?.version || 'v1',
    description: detail?.description || '',
    industryType: detail?.industryType || undefined,
    tags: detail?.tags || [],
    content: detail?.content || '',
  };
}

export default function AssistantCenterPage() {
  const [assistantForm] = Form.useForm();
  const [promptForm] = Form.useForm();

  const [assistants, setAssistants] = useState<AssistantCenterListItem[]>([]);
  const [prompts, setPrompts] = useState<PromptCenterListItem[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [assistantDetail, setAssistantDetail] = useState<AssistantCenterDetail | null>(null);
  const [promptDetail, setPromptDetail] = useState<PromptCenterDetail | null>(null);

  const [loading, setLoading] = useState(false);
  const [assistantDetailLoading, setAssistantDetailLoading] = useState(false);
  const [promptDetailLoading, setPromptDetailLoading] = useState(false);
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [assistantModalMode, setAssistantModalMode] = useState<AssistantModalMode>('create');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptModalMode, setPromptModalMode] = useState<PromptModalMode>('create');
  const [assistantSubmitting, setAssistantSubmitting] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);
  const [publishingAssistant, setPublishingAssistant] = useState(false);
  const [activatingAssistant, setActivatingAssistant] = useState(false);
  const [deletingAssistant, setDeletingAssistant] = useState(false);
  const [publishingPrompt, setPublishingPrompt] = useState(false);
  const [deletingPrompt, setDeletingPrompt] = useState(false);

  const loadGovernance = async () => {
    try {
      setLoading(true);
      const [assistantResponse, promptResponse] = await Promise.all([
        getAssistantCenterAssistants(),
        getAssistantCenterPrompts(),
      ]);

      const nextAssistants = assistantResponse.data?.items || [];
      const nextPrompts = promptResponse.data?.items || [];
      const activeAssistantId =
        assistantResponse.data?.activeAssistantId ||
        nextAssistants.find((item) => item.activeFlag)?.assistantId ||
        nextAssistants[0]?.assistantId ||
        '';

      setAssistants(nextAssistants);
      setPrompts(nextPrompts);
      setSelectedAssistantId((current) =>
        nextAssistants.some((item) => item.assistantId === current)
          ? current
          : activeAssistantId,
      );
      setSelectedPromptId((current) =>
        nextPrompts.some((item) => item.promptId === current)
          ? current
          : nextPrompts[0]?.promptId || '',
      );
    } catch (error) {
      message.error(getApiErrorMessage(error, '治理数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadAssistantDetail = async (assistantId: string) => {
    if (!assistantId) {
      setAssistantDetail(null);
      return;
    }

    try {
      setAssistantDetail(null);
      setAssistantDetailLoading(true);
      const response = await getAssistantCenterAssistantDetail(assistantId);
      setAssistantDetail(response.data?.detail || null);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Assistant 详情加载失败'));
    } finally {
      setAssistantDetailLoading(false);
    }
  };

  const loadPromptDetail = async (promptId: string) => {
    if (!promptId) {
      setPromptDetail(null);
      return;
    }

    try {
      setPromptDetail(null);
      setPromptDetailLoading(true);
      const response = await getAssistantCenterPromptDetail(promptId);
      setPromptDetail(response.data?.detail || null);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Prompt 详情加载失败'));
    } finally {
      setPromptDetailLoading(false);
    }
  };

  useEffect(() => {
    loadGovernance();
  }, []);

  useEffect(() => {
    loadAssistantDetail(selectedAssistantId);
  }, [selectedAssistantId]);

  useEffect(() => {
    loadPromptDetail(selectedPromptId);
  }, [selectedPromptId]);

  const selectedAssistant = useMemo(() => {
    const assistantSnapshot =
      assistants.find((item) => item.assistantId === selectedAssistantId) || null;

    if (!assistantSnapshot && !assistantDetail) {
      return null;
    }

    return {
      ...(assistantSnapshot || {}),
      ...(assistantDetail || {}),
    } as AssistantCenterDetail;
  }, [assistantDetail, assistants, selectedAssistantId]);

  const selectedPrompt = useMemo(() => {
    const promptSnapshot =
      prompts.find((item) => item.promptId === selectedPromptId) || null;

    if (!promptSnapshot && !promptDetail) {
      return null;
    }

    return {
      ...(promptSnapshot || {}),
      ...(promptDetail || {}),
    } as PromptCenterDetail & Partial<PromptCenterListItem>;
  }, [promptDetail, prompts, selectedPromptId]);

  const promptOptionsByModule = useMemo(() => {
    return {
      analyze: prompts
        .filter((item) => item.module === 'analyze')
        .map((item) => ({ label: `${item.name} (${item.version})`, value: item.promptId })),
      search: prompts
        .filter((item) => item.module === 'search')
        .map((item) => ({ label: `${item.name} (${item.version})`, value: item.promptId })),
      script: prompts
        .filter((item) => item.module === 'script')
        .map((item) => ({ label: `${item.name} (${item.version})`, value: item.promptId })),
    };
  }, [prompts]);

  const governanceDefinitionSummary = (selectedAssistant?.governanceDefinitionSummary ||
    {}) as Record<string, unknown>;
  const governancePromptDefinition =
    (governanceDefinitionSummary.promptDefinition as Record<string, unknown> | undefined) || {};
  const assistantHistory = (selectedAssistant?.history || []) as GovernanceAuditEntry[];
  const promptHistory = (selectedPrompt?.history || []) as GovernanceAuditEntry[];

  const openCreateAssistantModal = () => {
    setAssistantModalMode('create');
    assistantForm.setFieldsValue(buildAssistantFormValues(null));
    setAssistantModalOpen(true);
  };

  const openEditAssistantModal = () => {
    if (!selectedAssistant) return;
    setAssistantModalMode('edit');
    assistantForm.setFieldsValue(buildAssistantFormValues(selectedAssistant));
    setAssistantModalOpen(true);
  };

  const openCreatePromptModal = () => {
    setPromptModalMode('create');
    promptForm.setFieldsValue(buildPromptFormValues(null));
    setPromptModalOpen(true);
  };

  const openEditPromptModal = () => {
    if (!selectedPrompt) return;
    setPromptModalMode('edit');
    promptForm.setFieldsValue(buildPromptFormValues(selectedPrompt));
    setPromptModalOpen(true);
  };

  const handleAssistantSubmit = async () => {
    try {
      const values = (await assistantForm.validateFields()) as AssistantMutationRequest;
      setAssistantSubmitting(true);
      const mergedValues = {
        ...values,
        defaultVariables:
          values.defaultVariables ||
          selectedAssistant?.defaultVariables ||
          {},
        variableSchema:
          values.variableSchema ||
          selectedAssistant?.variableSchema ||
          [],
      } as AssistantMutationRequest;

      if (assistantModalMode === 'create') {
        const response = await createAssistantCenterAssistant(mergedValues);
        const nextId = response.data?.detail?.assistantId || '';
        message.success('Assistant 创建成功');
        setAssistantModalOpen(false);
        await loadGovernance();
        if (nextId) {
          setSelectedAssistantId(nextId);
        }
        return;
      }

      if (!selectedAssistant?.assistantId) return;

      await updateAssistantCenterAssistant(selectedAssistant.assistantId, {
        ...mergedValues,
        version: Number(selectedAssistant.currentVersion || 1),
      });
      message.success('Assistant 保存成功');
      setAssistantModalOpen(false);
      await loadGovernance();
      await loadAssistantDetail(selectedAssistant.assistantId);
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('Assistant 版本冲突，请刷新后重试');
      } else {
        message.error(getApiErrorMessage(error, 'Assistant 保存失败'));
      }
    } finally {
      setAssistantSubmitting(false);
    }
  };

  const handlePromptSubmit = async () => {
    try {
      const values = (await promptForm.validateFields()) as PromptMutationRequest;
      setPromptSubmitting(true);

      if (promptModalMode === 'create') {
        const response = await createAssistantCenterPrompt(values);
        const nextId = response.data?.detail?.promptId || '';
        message.success('Prompt 创建成功');
        setPromptModalOpen(false);
        await loadGovernance();
        if (nextId) {
          setSelectedPromptId(nextId);
        }
        return;
      }

      if (!selectedPrompt?.promptId || !selectedPrompt?.recordVersion) return;

      await updateAssistantCenterPrompt(selectedPrompt.promptId, {
        ...values,
        recordVersion: selectedPrompt.recordVersion,
      });
      message.success('Prompt 保存成功');
      setPromptModalOpen(false);
      await loadGovernance();
      await loadPromptDetail(selectedPrompt.promptId);
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('Prompt 版本冲突，请刷新后重试');
      } else {
        message.error(getApiErrorMessage(error, 'Prompt 保存失败'));
      }
    } finally {
      setPromptSubmitting(false);
    }
  };

  const handlePublishAssistant = async () => {
    if (!selectedAssistant?.assistantId) return;

    try {
      setPublishingAssistant(true);
      await publishAssistantCenterAssistant(selectedAssistant.assistantId);
      message.success('Assistant 发布成功');
      await loadGovernance();
      await loadAssistantDetail(selectedAssistant.assistantId);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Assistant 发布失败'));
    } finally {
      setPublishingAssistant(false);
    }
  };

  const handleActivateAssistant = async () => {
    if (!selectedAssistant?.assistantId) return;

    try {
      setActivatingAssistant(true);
      await activateAssistantCenterAssistant(selectedAssistant.assistantId);
      message.success('Assistant 已激活');
      await loadGovernance();
      await loadAssistantDetail(selectedAssistant.assistantId);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Assistant 激活失败'));
    } finally {
      setActivatingAssistant(false);
    }
  };

  const handleDeleteAssistant = async () => {
    if (!selectedAssistant?.assistantId) return;
    const confirmed = window.confirm('确认删除当前 Assistant 吗？');
    if (!confirmed) return;

    try {
      setDeletingAssistant(true);
      await deleteAssistantCenterAssistant(selectedAssistant.assistantId);
      message.success('Assistant 删除成功');
      await loadGovernance();
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Assistant 删除失败'));
    } finally {
      setDeletingAssistant(false);
    }
  };

  const handlePublishPrompt = async () => {
    if (!selectedPrompt?.promptId) return;

    try {
      setPublishingPrompt(true);
      await publishAssistantCenterPrompt(selectedPrompt.promptId);
      message.success('Prompt 发布成功');
      await loadGovernance();
      await loadPromptDetail(selectedPrompt.promptId);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Prompt 发布失败'));
    } finally {
      setPublishingPrompt(false);
    }
  };

  const handleDeletePrompt = async () => {
    if (!selectedPrompt?.promptId) return;
    const confirmed = window.confirm('确认删除当前 Prompt 吗？');
    if (!confirmed) return;

    try {
      setDeletingPrompt(true);
      await deleteAssistantCenterPrompt(selectedPrompt.promptId);
      message.success('Prompt 删除成功');
      await loadGovernance();
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Prompt 删除失败'));
    } finally {
      setDeletingPrompt(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="助手模板 / Prompt 治理台"
        description="把岗位模板、作用域、默认策略和 Prompt 绑定统一收口到治理层；模型绑定继续留在 ModelCenter，避免平台能力被单一模板绑死。"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前页已改成模板治理工作台"
        description="模板负责岗位/场景、范围、策略和 Prompt 绑定；Prompt 负责模块表达与版本迭代；ModelCenter 只负责模型路由。三者分层后，后续新增岗位、替换 Prompt、切模型都会更稳定。"
      />

      <Spin spinning={loading}>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} xl={7}>
            <Card
              title="模板列表"
              extra={
                <Button type="primary" onClick={openCreateAssistantModal}>
                  新增模板
                </Button>
              }
              style={{ borderRadius: 12 }}
            >
              <List
                dataSource={assistants}
                split={false}
                locale={{ emptyText: '暂无模板' }}
                renderItem={(item) => (
                  <List.Item style={{ padding: '0 0 12px' }}>
                    <AssistantListCard
                      item={item}
                      active={item.assistantId === selectedAssistant?.assistantId}
                      onClick={() => setSelectedAssistantId(item.assistantId)}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} xl={17}>
            <Card
              title="模板治理详情"
              extra={
                <Space wrap>
                  <Button onClick={openEditAssistantModal} disabled={!selectedAssistant}>
                    编辑配置
                  </Button>
                  <Button
                    onClick={handleActivateAssistant}
                    loading={activatingAssistant}
                    disabled={!selectedAssistant}
                  >
                    激活
                  </Button>
                  <Button
                    type="primary"
                    onClick={handlePublishAssistant}
                    loading={publishingAssistant}
                    disabled={!selectedAssistant}
                  >
                    发布
                  </Button>
                  <Button
                    danger
                    onClick={handleDeleteAssistant}
                    loading={deletingAssistant}
                    disabled={!selectedAssistant}
                  >
                    删除
                  </Button>
                </Space>
              }
              style={{ borderRadius: 12, marginBottom: 16 }}
            >
              <Spin spinning={assistantDetailLoading}>
                {!selectedAssistant ? (
                    <div style={{ color: '#64748B' }}>请选择一个模板。</div>
                ) : (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Descriptions bordered column={2} size="small">
                      <Descriptions.Item label="模板名称">
                        {selectedAssistant.assistantName}
                      </Descriptions.Item>
                      <Descriptions.Item label="模板 ID">
                        {selectedAssistant.assistantId}
                      </Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Space wrap>
                          {getStatusTag(selectedAssistant.status)}
                          {selectedAssistant.activeFlag ? <Tag color="processing">active</Tag> : null}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="版本">
                        {selectedAssistant.currentVersion}
                      </Descriptions.Item>
                      <Descriptions.Item label="行业">
                        {getIndustryLabel(selectedAssistant.industryType)}
                      </Descriptions.Item>
                      <Descriptions.Item label="最近更新时间">
                        {selectedAssistant.updatedAt || '未返回'}
                      </Descriptions.Item>
                      <Descriptions.Item label="模板来源">
                        {selectedAssistant.templateOrigin === 'builtin' ? '内置模板' : '自定义模板'}
                      </Descriptions.Item>
                      <Descriptions.Item label="模板角色">
                        {selectedAssistant.templateRole || '未返回'}
                      </Descriptions.Item>
                      <Descriptions.Item label="默认任务上下文">
                        {selectedAssistant.defaultTaskContext || '未返回'}
                      </Descriptions.Item>
                      <Descriptions.Item label="默认主题提示">
                        {selectedAssistant.defaultSubjectHint || '未返回'}
                      </Descriptions.Item>
                      <Descriptions.Item label="说明" span={2}>
                        {selectedAssistant.description || '暂无说明'}
                      </Descriptions.Item>
                    </Descriptions>

                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={12}>
                        <Card size="small" title="数据范围" style={{ borderRadius: 12 }}>
                          <p>
                            <strong>rulesScope：</strong>
                            {(selectedAssistant.dataScopes?.rulesScope || []).join(' / ') || '未配置'}
                          </p>
                          <p>
                            <strong>productScope：</strong>
                            {(selectedAssistant.dataScopes?.productScope || []).join(' / ') || '未配置'}
                          </p>
                          <p style={{ marginBottom: 0 }}>
                            <strong>docScope：</strong>
                            {(selectedAssistant.dataScopes?.docScope || []).join(' / ') || '未配置'}
                          </p>
                        </Card>
                      </Col>

                      <Col xs={24} md={12}>
                          <Card size="small" title="默认策略" style={{ borderRadius: 12 }}>
                          <p>
                            <strong>判断：</strong>
                            {selectedAssistant.defaultStrategies?.analyzeStrategy || '未配置'}
                          </p>
                          <p>
                            <strong>检索：</strong>
                            {selectedAssistant.defaultStrategies?.searchStrategy || '未配置'}
                          </p>
                          <p style={{ marginBottom: 0 }}>
                            <strong>写作：</strong>
                            {selectedAssistant.defaultStrategies?.scriptStrategy || '未配置'}
                          </p>
                        </Card>
                      </Col>
                    </Row>

                    <Card size="small" title="默认变量约定" style={{ borderRadius: 12 }}>
                      {(selectedAssistant.variableSchema || []).length ? (
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          {(selectedAssistant.variableSchema || []).map((item) => (
                            <Card key={item.key} size="small" style={{ borderRadius: 10 }}>
                              <p style={{ marginBottom: 8 }}>
                                <strong>{item.label || item.key}</strong>
                                <span style={{ color: '#64748B', marginLeft: 8 }}>{item.key}</span>
                                {item.required ? <Tag color="red" style={{ marginLeft: 8 }}>required</Tag> : null}
                              </p>
                              <p style={{ marginBottom: 8, color: '#475569' }}>
                                {item.description || '暂无说明'}
                              </p>
                              <p style={{ marginBottom: 4 }}>
                                <strong>默认值：</strong>
                                {(selectedAssistant.defaultVariables || {})[item.key] || item.defaultValue || '未配置'}
                              </p>
                              <p style={{ marginBottom: 0 }}>
                                <strong>示例：</strong>
                                {item.example || '未配置'}
                              </p>
                            </Card>
                          ))}
                        </Space>
                      ) : (
                        <div style={{ color: '#64748B' }}>当前模板未配置默认变量约定。</div>
                      )}
                    </Card>

                    <Card size="small" title="Prompt 绑定" style={{ borderRadius: 12 }}>
                        <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="判断 Prompt">
                          {selectedAssistant.defaultModuleBindings?.analyze || '未绑定'}
                        </Descriptions.Item>
                        <Descriptions.Item label="检索 Prompt">
                          {selectedAssistant.defaultModuleBindings?.search || '未绑定'}
                        </Descriptions.Item>
                        <Descriptions.Item label="写作 Prompt">
                          {selectedAssistant.defaultModuleBindings?.script || '未绑定'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <Card size="small" title="治理摘要" style={{ borderRadius: 12 }}>
                      <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="当前发布 Prompt">
                          {String(
                            selectedAssistant.currentPublishedPrompt ||
                              governancePromptDefinition.promptName ||
                              '未返回',
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="当前发布 PromptVersion">
                          {String(selectedAssistant.currentPublishedPromptVersion || '未返回')}
                        </Descriptions.Item>
                        <Descriptions.Item label="当前发布策略">
                          {String(selectedAssistant.currentPublishedStrategy || '未返回')}
                        </Descriptions.Item>
                        <Descriptions.Item label="治理状态">
                          {String(governanceDefinitionSummary.definitionStatus || selectedAssistant.status)}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <GovernanceHistoryList
                      title="模板变更历史"
                      items={assistantHistory}
                      emptyText="当前模板暂无治理历史"
                    />
                  </Space>
                )}
              </Spin>
            </Card>

            <Card
              title="Prompt 注册表"
              extra={
                <Button type="primary" onClick={openCreatePromptModal}>
                  新增 Prompt
                </Button>
              }
              style={{ borderRadius: 12 }}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} xl={10}>
                  <List
                    dataSource={prompts}
                    split={false}
                    locale={{ emptyText: '暂无 Prompt' }}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '0 0 12px' }}>
                        <PromptListCard
                          item={item}
                          active={item.promptId === selectedPrompt?.promptId}
                          onClick={() => setSelectedPromptId(item.promptId)}
                        />
                      </List.Item>
                    )}
                  />
                </Col>

                <Col xs={24} xl={14}>
                  <Card
                    size="small"
                    title="Prompt 详情"
                    extra={
                      <Space wrap>
                        <Button onClick={openEditPromptModal} disabled={!selectedPrompt}>
                          编辑 Prompt
                        </Button>
                        <Button
                          onClick={handlePublishPrompt}
                          loading={publishingPrompt}
                          disabled={!selectedPrompt}
                        >
                          发布
                        </Button>
                        <Button
                          danger
                          onClick={handleDeletePrompt}
                          loading={deletingPrompt}
                          disabled={!selectedPrompt}
                        >
                          删除
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <Spin spinning={promptDetailLoading}>
                      {!selectedPrompt ? (
                        <div style={{ color: '#64748B' }}>请选择一个 Prompt。</div>
                      ) : (
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                          <Descriptions bordered column={2} size="small">
                            <Descriptions.Item label="Prompt 名称">
                              {selectedPrompt.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Prompt ID">
                              {selectedPrompt.promptId}
                            </Descriptions.Item>
                            <Descriptions.Item label="模块">
                              {getModuleTag(selectedPrompt.module)}
                            </Descriptions.Item>
                            <Descriptions.Item label="版本">
                              {selectedPrompt.version}
                            </Descriptions.Item>
                            <Descriptions.Item label="状态">
                              {getStatusTag(selectedPrompt.status)}
                            </Descriptions.Item>
                            <Descriptions.Item label="绑定模板数">
                              {selectedPrompt.usageSummary?.assistantCount || selectedPrompt.assistantCount || 0}
                            </Descriptions.Item>
                            <Descriptions.Item label="行业">
                              {getIndustryLabel(selectedPrompt.industryType)}
                            </Descriptions.Item>
                            <Descriptions.Item label="最近更新时间">
                              {selectedPrompt.updatedAt || '未返回'}
                            </Descriptions.Item>
                            <Descriptions.Item label="说明" span={2}>
                              {selectedPrompt.description || '暂无说明'}
                            </Descriptions.Item>
                          </Descriptions>

                          <Card size="small" title="Prompt 内容" style={{ borderRadius: 12 }}>
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontFamily: 'monospace',
                                fontSize: 13,
                                lineHeight: 1.7,
                              }}
                            >
                              {selectedPrompt.content || '当前未配置 Prompt 内容。'}
                            </pre>
                          </Card>

                          <Card size="small" title="绑定关系" style={{ borderRadius: 12 }}>
                            {selectedPrompt.usageSummary?.usedBy?.length ? (
                              <Space wrap>
                                {selectedPrompt.usageSummary.usedBy.map((item) => (
                                  <Tag key={`${item.assistantId}-${item.modules.join('-')}`}>
                                    {item.assistantName} / {item.modules.join(', ')}
                                  </Tag>
                                ))}
                              </Space>
                            ) : (
                              <div style={{ color: '#64748B' }}>当前未被模板绑定。</div>
                            )}
                          </Card>

                          <GovernanceHistoryList
                            title="Prompt 变更历史"
                            items={promptHistory}
                            emptyText="当前 Prompt 暂无治理历史"
                          />
                        </Space>
                      )}
                    </Spin>
                  </Card>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>

      <Modal
        title={assistantModalMode === 'create' ? '新增模板' : '编辑模板'}
        open={assistantModalOpen}
        onOk={handleAssistantSubmit}
        onCancel={() => setAssistantModalOpen(false)}
        confirmLoading={assistantSubmitting}
        width={860}
        destroyOnHidden
      >
        <Form form={assistantForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="模板名称"
                name="assistantName"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="例如：法务支持模板" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="领域标识" name="industryType" extra="支持任意领域标识，例如 legal、retail、education；留空会按通用处理。">
                <Input list="assistant-industry-presets" placeholder="例如：legal" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="说明这个模板面向的岗位与场景" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="模板角色" name="templateRole">
                <Input placeholder="例如：sales-support / legal-review / operations" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="模板来源" name="templateOrigin">
                <Select
                  options={[
                    { label: '自定义模板', value: 'custom' },
                    { label: '内置模板', value: 'builtin' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="默认任务上下文" name="defaultTaskContext">
                <Input placeholder="例如：合同审核 / 企业客户沟通 / 采购审批" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="默认主题提示" name="defaultSubjectHint">
                <Input placeholder="例如：违约责任 / 课程推荐 / 采购协同" />
              </Form.Item>
            </Col>
          </Row>

          <Card size="small" title="作用域" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="rulesScope" name={['dataScopes', 'rulesScope']}>
                  <Select mode="tags" placeholder="输入 scope 后回车" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="productScope" name={['dataScopes', 'productScope']}>
                  <Select mode="tags" placeholder="输入 scope 后回车" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="docScope" name={['dataScopes', 'docScope']}>
                  <Select mode="tags" placeholder="输入 scope 后回车" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="默认策略" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="判断策略" name={['defaultStrategies', 'analyzeStrategy']}>
                  <Select allowClear showSearch options={analyzeStrategyOptions} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="检索策略" name={['defaultStrategies', 'searchStrategy']}>
                  <Select allowClear showSearch options={searchStrategyOptions} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="写作策略" name={['defaultStrategies', 'scriptStrategy']}>
                  <Select allowClear showSearch options={scriptStrategyOptions} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="Prompt 绑定">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="判断 Prompt" name={['defaultModuleBindings', 'analyze']}>
                  <Select allowClear options={promptOptionsByModule.analyze} placeholder="选择判断 Prompt" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="检索 Prompt" name={['defaultModuleBindings', 'search']}>
                  <Select allowClear options={promptOptionsByModule.search} placeholder="选择检索 Prompt" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="写作 Prompt" name={['defaultModuleBindings', 'script']}>
                  <Select allowClear options={promptOptionsByModule.script} placeholder="选择写作 Prompt" />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Form>
      </Modal>

      <Modal
        title={promptModalMode === 'create' ? '新增 Prompt' : '编辑 Prompt'}
        open={promptModalOpen}
        onOk={handlePromptSubmit}
        onCancel={() => setPromptModalOpen(false)}
        confirmLoading={promptSubmitting}
        width={860}
        destroyOnHidden
      >
        <Form form={promptForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Prompt 名称"
                name="name"
                rules={[{ required: true, message: '请输入 Prompt 名称' }]}
              >
                <Input placeholder="例如：售后支持 Analyze Prompt" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label="模块"
                name="module"
                rules={[{ required: true, message: '请选择模块' }]}
              >
                <Select options={moduleOptions} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label="Prompt Version"
                name="version"
                rules={[{ required: true, message: '请输入版本号' }]}
              >
                <Input placeholder="v1" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="行业标识" name="industryType" extra="可选。支持任意行业标识，留空或 other 代表通用。">
                <Input list="prompt-industry-presets" placeholder="例如：legal" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="标签" name="tags">
                <Select mode="tags" placeholder="输入标签后回车" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="说明这个 Prompt 的目标和适用边界" />
          </Form.Item>

          <Form.Item
            label="Prompt 内容"
            name="content"
            rules={[{ required: true, message: '请输入 Prompt 内容' }]}
          >
            <Input.TextArea rows={14} placeholder="请输入 Prompt 内容" />
          </Form.Item>
        </Form>
      </Modal>
      <datalist id="assistant-industry-presets">
        {industryPresetOptions.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </datalist>
      <datalist id="prompt-industry-presets">
        {industryPresetOptions.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
