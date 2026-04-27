import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
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
import {
  ApiOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
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
  publishAssistantCenterAssistant,
  publishAssistantCenterPrompt,
  updateAssistantCenterAssistant,
  updateAssistantCenterPrompt,
  type AssistantCenterListItem,
  type AssistantCenterDetail,
  type AssistantMutationRequest,
  type PromptCenterDetail,
  type PromptCenterListItem,
  type PromptMutationRequest,
} from '../../api/assistantCenter';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';
import { formatTechnicalLabel } from '../../utils/displayLabel';

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
  { label: formatTechnicalLabel('rules-only'), value: 'rules-only' },
  { label: formatTechnicalLabel('api-enhanced'), value: 'api-enhanced' },
];

const searchStrategyOptions = [
  { label: formatTechnicalLabel('local-only'), value: 'local-only' },
  { label: formatTechnicalLabel('external-enabled'), value: 'external-enabled' },
];

const scriptStrategyOptions = [
  { label: formatTechnicalLabel('local-model'), value: 'local-model' },
  { label: formatTechnicalLabel('api-model'), value: 'api-model' },
  { label: formatTechnicalLabel('template-only'), value: 'template-only' },
];

type AssistantModalMode = 'create' | 'edit';
type PromptModalMode = 'create' | 'edit';

function getStatusTag(status?: string) {
  if (status === 'published' || status === 'active') {
    return <Tag color="green">已发布</Tag>;
  }

  if (status === 'archived') {
    return <Tag color="default">已归档</Tag>;
  }

  return <Tag color="gold">草稿</Tag>;
}

function getModuleTag(module?: string) {
  if (module === 'analyze') return <Tag color="blue">判断</Tag>;
  if (module === 'search') return <Tag color="cyan">检索</Tag>;
  return <Tag color="purple">写作</Tag>;
}

function getStatusText(status?: string) {
  if (status === 'published' || status === 'active') {
    return '已发布';
  }

  if (status === 'archived') {
    return '已归档';
  }

  return '草稿';
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
    <button
      type="button"
      className={active ? 'ap-agent-tile ap-agent-tile--active' : 'ap-agent-tile'}
      onClick={onClick}
    >
      <span className="ap-agent-tile__orb">
        <SafetyCertificateOutlined />
      </span>
      <span className="ap-agent-tile__content">
        <span className="ap-agent-tile__name">{item.assistantName}</span>
        <span className="ap-agent-tile__description">{item.description || '暂无说明'}</span>
        <span className="ap-agent-tile__meta">
          {getIndustryLabel(item.industryType)} · v{item.currentVersion}
          {item.activeFlag ? ' · 当前使用' : ''}
        </span>
      </span>
      <span className="ap-agent-tile__status">{getStatusText(item.status)}</span>
    </button>
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
    <button
      type="button"
      className={active ? 'ap-prompt-row ap-prompt-row--active' : 'ap-prompt-row'}
      onClick={onClick}
    >
      <span>
        <span className="ap-prompt-row__title">{item.name}</span>
        <span className="ap-prompt-row__meta">
          {item.promptId} · {item.version} · 绑定 {item.assistantCount || 0}
        </span>
      </span>
      <span className="ap-prompt-row__tags">
        {getModuleTag(item.module)}
        {getStatusTag(item.status)}
      </span>
    </button>
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
  const navigate = useNavigate();
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
    <div className="ap-agent-page">
      <div className="ap-agent-page__hero">
        <div>
          <div className="ap-agent-page__eyebrow">
            <RocketOutlined />
            Agent
          </div>
          <h1>选择一个 Agent，然后开始工作。</h1>
          <p>能力、规则、模板和 Prompt 已按 Agent 聚合。</p>
        </div>
        <Space wrap>
          <Button shape="round" onClick={() => navigate('/home')}>
            回到工作台
          </Button>
          <Button type="primary" shape="round" icon={<PlusOutlined />} onClick={openCreateAssistantModal}>
            新建 Agent
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[18, 18]} align="top">
          <Col xs={24} xl={10}>
            <section className="ap-agent-library">
              <div className="ap-agent-library__header">
                <div>
                  <div className="ap-agent-library__title">Agent 库</div>
                  <div className="ap-agent-library__meta">{assistants.length} 个可用 Agent</div>
                </div>
              </div>
              <List
                dataSource={assistants}
                split={false}
                locale={{ emptyText: '暂无 Agent' }}
                renderItem={(item) => (
                  <List.Item className="ap-agent-library__item">
                    <AssistantListCard
                      item={item}
                      active={item.assistantId === selectedAssistant?.assistantId}
                      onClick={() => setSelectedAssistantId(item.assistantId)}
                    />
                  </List.Item>
                )}
              />
            </section>
          </Col>

          <Col xs={24} xl={14}>
            <section className="ap-agent-detail">
              <Spin spinning={assistantDetailLoading}>
                {!selectedAssistant ? (
                  <div className="ap-agent-empty">选择一个 Agent 查看能力。</div>
                ) : (
                  <>
                    <div className="ap-agent-detail__top">
                      <div>
                        <Space wrap size={8}>
                          {getStatusTag(selectedAssistant.status)}
                          {selectedAssistant.activeFlag ? <Tag color="processing">当前使用</Tag> : null}
                          <Tag>{getIndustryLabel(selectedAssistant.industryType)}</Tag>
                        </Space>
                        <h2>{selectedAssistant.assistantName}</h2>
                        <p>{selectedAssistant.description || '这个 Agent 暂无说明。'}</p>
                      </div>
                      <div className="ap-agent-detail__actions">
                        <Button icon={<EditOutlined />} onClick={openEditAssistantModal}>
                          编辑
                        </Button>
                        <Button
                          onClick={handleActivateAssistant}
                          loading={activatingAssistant}
                          disabled={!selectedAssistant}
                        >
                          设为当前
                        </Button>
                        <Button
                          type="primary"
                          icon={<RocketOutlined />}
                          onClick={handlePublishAssistant}
                          loading={publishingAssistant}
                          disabled={!selectedAssistant}
                        >
                          发布
                        </Button>
                      </div>
                    </div>

                    <div className="ap-agent-facts">
                      <div className="ap-agent-fact">
                        <CheckCircleOutlined />
                        <span>版本</span>
                        <strong>v{selectedAssistant.currentVersion}</strong>
                      </div>
                      <div className="ap-agent-fact">
                        <SafetyCertificateOutlined />
                        <span>角色</span>
                        <strong>{selectedAssistant.templateRole || '通用'}</strong>
                      </div>
                      <div className="ap-agent-fact">
                        <DatabaseOutlined />
                        <span>范围</span>
                        <strong>{(selectedAssistant.dataScopes?.rulesScope || [])[0] || '默认'}</strong>
                      </div>
                    </div>

                    <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
                      <Col xs={24} md={8}>
                        <div className="ap-agent-capability-card">
                          <BranchesOutlined />
                          <span>判断策略</span>
                          <strong>
                            {formatTechnicalLabel(selectedAssistant.defaultStrategies?.analyzeStrategy, '默认')}
                          </strong>
                        </div>
                      </Col>
                      <Col xs={24} md={8}>
                        <div className="ap-agent-capability-card">
                          <DatabaseOutlined />
                          <span>检索策略</span>
                          <strong>
                            {formatTechnicalLabel(selectedAssistant.defaultStrategies?.searchStrategy, '默认')}
                          </strong>
                        </div>
                      </Col>
                      <Col xs={24} md={8}>
                        <div className="ap-agent-capability-card">
                          <FileTextOutlined />
                          <span>写作策略</span>
                          <strong>
                            {formatTechnicalLabel(selectedAssistant.defaultStrategies?.scriptStrategy, '默认')}
                          </strong>
                        </div>
                      </Col>
                    </Row>

                    <div className="ap-agent-bindings">
                      <div className="ap-agent-bindings__title">Prompt 绑定</div>
                      <div className="ap-agent-binding-row">
                        <span>判断</span>
                        <strong>{selectedAssistant.defaultModuleBindings?.analyze || '未绑定'}</strong>
                      </div>
                      <div className="ap-agent-binding-row">
                        <span>检索</span>
                        <strong>{selectedAssistant.defaultModuleBindings?.search || '未绑定'}</strong>
                      </div>
                      <div className="ap-agent-binding-row">
                        <span>写作</span>
                        <strong>{selectedAssistant.defaultModuleBindings?.script || '未绑定'}</strong>
                      </div>
                    </div>

                    <div className="ap-agent-danger">
                      <Button
                        danger
                        type="text"
                        onClick={handleDeleteAssistant}
                        loading={deletingAssistant}
                        disabled={!selectedAssistant}
                      >
                        删除这个 Agent
                      </Button>
                    </div>
                  </>
                )}
              </Spin>
            </section>
          </Col>
        </Row>

        <section className="ap-prompt-panel">
          <div className="ap-prompt-panel__header">
            <div>
              <div className="ap-prompt-panel__title">Prompt 资产</div>
              <div className="ap-prompt-panel__meta">高级配置，日常使用时无需进入。</div>
            </div>
            <Button shape="round" icon={<PlusOutlined />} onClick={openCreatePromptModal}>
              新建 Prompt
            </Button>
          </div>
          <Row gutter={[18, 18]}>
            <Col xs={24} xl={10}>
              <List
                dataSource={prompts}
                split={false}
                locale={{ emptyText: '暂无 Prompt' }}
                renderItem={(item) => (
                  <List.Item className="ap-prompt-panel__item">
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
              <div className="ap-prompt-detail">
                <Spin spinning={promptDetailLoading}>
                  {!selectedPrompt ? (
                    <div className="ap-agent-empty">选择一个 Prompt。</div>
                  ) : (
                    <>
                      <div className="ap-prompt-detail__top">
                        <div>
                          <Space wrap>
                            {getModuleTag(selectedPrompt.module)}
                            {getStatusTag(selectedPrompt.status)}
                          </Space>
                          <h3>{selectedPrompt.name}</h3>
                          <p>{selectedPrompt.description || '暂无说明'}</p>
                        </div>
                        <Space wrap>
                          <Button onClick={openEditPromptModal} disabled={!selectedPrompt}>
                            编辑
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
                      </div>
                      <pre className="ap-prompt-code">
                        {selectedPrompt.content || selectedPrompt.contentPreview || '当前未配置 Prompt 内容。'}
                      </pre>
                      <div className="ap-prompt-used-by">
                        <ApiOutlined />
                        绑定 Agent：
                        {selectedPrompt.usageSummary?.usedBy?.length
                          ? selectedPrompt.usageSummary.usedBy.map((item) => item.assistantName).join('、')
                          : selectedPrompt.assistantCount || 0}
                        <ArrowRightOutlined />
                      </div>
                    </>
                  )}
                </Spin>
              </div>
            </Col>
          </Row>
        </section>
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
