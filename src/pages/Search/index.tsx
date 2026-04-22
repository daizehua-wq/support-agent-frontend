import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Spin, Switch, Tag, message } from 'antd';

import AgentClientStatusBadge from '../../components/common/AgentClientStatusBadge';
import ClientAdapterPreviewCard from '../../components/common/ClientAdapterPreviewCard';
import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import ResolvedSummaryCard from '../../components/card/ResolvedSummaryCard';

import {
  getSessionDetail,
  retrieveMaterials,
  type AgentAdapterResponse,
  type AgentClientType,
  type RuntimeSnapshot,
  type SearchDocumentsResponse,
  type SessionDetailRecord,
  type SearchEvidenceItem,
} from '../../api/agent';
import {
  getAgentClientTypeLabel,
  isAdapterPreviewMode,
  isAgentAdapterResponse,
  useRememberedAgentClientType,
} from '../../utils/agentClientDebug';
import {
  buildContinueNavigationState,
  buildTaskSeedFromPayload,
  findPreferredStep,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  getStepOutputPayload,
  mergeContinueContexts,
  mergeTaskSeeds,
  parseContinueContext,
} from '../../utils/sessionResume';
import {
  mapSearchEvidenceList,
  splitEvidenceByLevel,
  type SearchEvidence,
} from './evidenceMapper';

const docTypeOptions = [
  { label: '规格书', value: 'spec' },
  { label: 'FAQ', value: 'faq' },
  { label: '案例资料', value: 'case' },
  { label: '项目资料', value: 'project' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SearchResultData = NonNullable<SearchDocumentsResponse['data']>;
type SearchResultMeta = NonNullable<SearchDocumentsResponse['meta']> | null;

type SearchResumeState = ReturnType<typeof parseContinueContext>;

type SearchExecutionContextSummary = Record<string, unknown> & {
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  source?: unknown;
  fallbackReason?: unknown;
  databaseRelationSource?: unknown;
};


const getSearchStrategyLabel = (value?: string) => {
  if (value === 'local-only') return '仅本地资料';
  if (value === 'external-enabled') return '本地优先，按需补充公开资料';
  return value || '未返回';
};

const getSearchExecutionStrategyLabel = (value?: string) => {
  if (value === 'local-only') return '仅本地资料检索';
  if (value === 'external-enabled') return '本地资料 + 按需补充公开资料';
  return value || '未返回';
};

const getSearchRouteLabel = (value?: string) => {
  if (value === 'local-rule-match') return '本地规则命中';
  if (value === 'local-browse') return '本地资料浏览';
  if (value === 'external-supplement-blocked') return '公开资料补充已被脱敏链路拦截';
  if (value === 'search-llm-local') return '本地检索后由本地模型整理';
  if (value === 'search-llm+external') return '本地检索并结合补充资料整理';
  if (value === 'search-fallback') return '模型整理失败，已回退为本地摘要';
  return value || '未返回';
};

const getSearchReasonLabel = (value?: string) => {
  if (value === 'local-rule-hit') return '已命中本地检索规则';
  if (value === 'local-rule-miss') return '未命中明确规则，已返回本地可参考资料';
  if (value === 'search-model-call-success') return '检索成功';
  if (value === 'external-provider-executed') return '已执行公开资料补充';
  if (value === 'external-supplement-executed') return '已补充公开资料';
  if (value === 'external-supplement-no-results') return '未找到可补充的公开资料';
  return value || '未返回';
};

const getEvidenceOutboundStatusLabel = (value?: string) => {
  if (value === 'allowed') return '可外发';
  if (value === 'internal-only') return '仅内部参考';
  return value || '未返回';
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[复杂对象，暂不展开]';
  }
}

function formatSearchDisplayText(value: unknown) {
  if (value === undefined || value === null || value === '') return '未返回';

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  return safeStringify(value);
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function formatSourceSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '未返回';

  if (typeof value === 'string') {
    const sourceMap: Record<string, string> = {
      mounted: '模块挂载来源',
      default: '默认来源',
      override: '显式覆盖',
      fallback: '回退生效',
      'module-binding': '模块绑定',
      'settings.default-model': '系统默认模型',
    };

    return sourceMap[value] || value;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const labelMap: Record<string, string> = {
      assistant: 'Assistant',
      assistantVersion: 'AssistantVersion',
      prompt: 'Prompt',
      promptVersion: 'PromptVersion',
      strategy: '策略',
    };

    const valueMap: Record<string, string> = {
      'runtime.executionContext.assistant': '运行上下文',
      'module.search.prompt': 'Search 模块 Prompt',
      'module.search.promptVersion': 'Search 模块 PromptVersion',
      'module.prompt': '模块 Prompt',
      'module.promptVersion': '模块 PromptVersion',
      'module.strategy': '模块策略',
      'module-strategy': '模块策略',
      'settings.strategy.searchStrategy': 'Search 模块策略',
      'settings.default-model': '系统默认模型',
      'module-binding': '模块绑定',
    };

    const entries = Object.entries(record)
      .filter(([key, entryValue]) => {
        if (entryValue === undefined || entryValue === null || entryValue === '') return false;
        if (key === 'assistantVersion' && String(entryValue) === 'none') return false;
        return true;
      })
      .map(([key, entryValue]) => {
        const label = labelMap[key] || key;
        const displayValue = valueMap[String(entryValue)] || String(entryValue);
        return `${label}：${displayValue}`;
      });

    return entries.length ? entries.join('；') : '未返回';
  }

  return formatSearchDisplayText(value);
}

function formatFallbackSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '未触发';

  if (typeof value === 'string') {
    const fallbackMap: Record<string, string> = {
      'assistant-version-missing': 'AssistantVersion 未返回，已触发回退',
      'module-prompt-applied': 'Prompt 命中模块 Prompt',
      'module-prompt-version-applied': 'PromptVersion 命中模块 PromptVersion',
      'module-strategy-applied': '策略命中模块策略',
    };

    return fallbackMap[value] || value;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const labelMap: Record<string, string> = {
      assistant: 'Assistant',
      assistantVersion: 'AssistantVersion',
      prompt: 'Prompt',
      promptVersion: 'PromptVersion',
      strategy: '策略',
    };

    const fallbackMap: Record<string, string> = {
      'assistant-version-missing': '未返回，已触发回退',
      'module-prompt-applied': '命中模块 Prompt',
      'module-prompt-version-applied': '命中模块 PromptVersion',
      'module-strategy-applied': '命中模块策略',
    };

    const entries = Object.entries(record)
      .filter(([key, entryValue]) => {
        if (entryValue === undefined || entryValue === null || entryValue === '') return false;
        if (key === 'assistant' && entryValue === null) return false;
        return true;
      })
      .map(([key, entryValue]) => {
        const label = labelMap[key] || key;
        const displayValue = fallbackMap[String(entryValue)] || String(entryValue);
        return `${label}：${displayValue}`;
      });

    return entries.length ? entries.join('；') : '未触发';
  }

  return formatSearchDisplayText(value);
}

function formatDatabaseRelationSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '当前未返回数据库关系摘要';

  if (typeof value === 'string') return value;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    const defaultDatabase =
      readStringValue(record.defaultAssociatedDatabase) ||
      readStringValue(record.defaultDatabase) ||
      readStringValue(record.databaseId) ||
      readStringValue(record.databaseName);

    const visibleDatabases = Array.isArray(record.visibleDatabases)
      ? record.visibleDatabases
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const itemRecord = item as Record<string, unknown>;
              return (
                readStringValue(itemRecord.databaseName) ||
                readStringValue(itemRecord.databaseId) ||
                undefined
              );
            }
            return undefined;
          })
          .filter((item): item is string => Boolean(item))
      : [];

    const relationSource =
      readStringValue(record.databaseRelationSource) ||
      readStringValue(record.relationSource) ||
      readStringValue(record.bindingSource) ||
      readStringValue(record.source);

    const parts = [
      defaultDatabase ? `默认关联：${defaultDatabase}` : undefined,
      visibleDatabases.length ? `可见数据库：${visibleDatabases.join('、')}` : undefined,
      relationSource ? `关系来源：${relationSource}` : undefined,
    ].filter((item): item is string => Boolean(item));

    return parts.length ? parts.join('；') : '当前未返回数据库关系摘要';
  }

  return formatSearchDisplayText(value);
}




function SearchPage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientType] = useRememberedAgentClientType();
  const [lastResponseClientType, setLastResponseClientType] = useState<AgentClientType>('web');
  const [adapterPreview, setAdapterPreview] = useState<AgentAdapterResponse | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResultData | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchResultMeta>(null);
  const [searchRuntime, setSearchRuntime] = useState<RuntimeSnapshot | null>(null);
  const [resumeDetail, setResumeDetail] = useState<SessionDetailRecord | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const resumeState = parseContinueContext(location.state) as SearchResumeState | null;
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const searchEvidenceItems = useMemo<SearchEvidenceItem[]>(
    () => searchResult?.evidenceItems || [],
    [searchResult],
  );
  const resumeStep = useMemo(
    () =>
      findPreferredStep({
        detail: resumeDetail,
        stepId: resumeState?.stepId,
        preferredTypes: ['search', 'analyze', 'script'],
      }),
    [resumeDetail, resumeState?.stepId],
  );

  const effectiveSessionId = searchRuntime?.sessionId || resumeState?.sessionId || '';
  const effectiveAssistantId =
    searchRuntime?.assistantId ||
    resumeState?.assistantId ||
    getStepAssistantId(resumeStep) ||
    resumeDetail?.session.assistantId ||
    '';
  const effectiveExecutionContext =
    (searchRuntime?.executionContext ||
      searchRuntime?.executionContextSummary ||
      resumeState?.executionContext ||
      resumeState?.executionContextSummary ||
      getStepExecutionContext(resumeStep) ||
      getSessionExecutionContext(resumeDetail) ||
      null) as SearchExecutionContextSummary | null;

  const executionContextRows = useMemo(
    () => [
      {
        label: '规则范围',
        value: formatSearchDisplayText(effectiveExecutionContext?.rulesScope),
      },
      {
        label: '产品范围',
        value: formatSearchDisplayText(effectiveExecutionContext?.productScope),
      },
      {
        label: '资料范围',
        value: formatSearchDisplayText(effectiveExecutionContext?.docScope),
      },
      {
        label: '判断策略',
        value: formatSearchDisplayText(effectiveExecutionContext?.analyzeStrategy),
      },
      {
        label: '检索策略',
        value: formatSearchDisplayText(effectiveExecutionContext?.searchStrategy),
      },
      {
        label: '写作策略',
        value: formatSearchDisplayText(effectiveExecutionContext?.scriptStrategy),
      },
    ],
    [effectiveExecutionContext],
  );

  const mappedEvidence = useMemo(
    () => mapSearchEvidenceList(searchEvidenceItems),
    [searchEvidenceItems],
  );

  const { coreEvidenceList, supportEvidenceList } = useMemo(
    () => splitEvidenceByLevel(mappedEvidence),
    [mappedEvidence],
  );

  const selectedEvidence =
    mappedEvidence.find((item) => item.id === selectedEvidenceId) || coreEvidenceList[0] || supportEvidenceList[0] || null;

  const searchMetaRecord = (searchMeta as Record<string, unknown> | null) || null;
  const executionContextSummaryRecord = searchRuntime?.executionContextSummary || undefined;
  const governanceSummaryRecord = searchRuntime?.governanceSummary || undefined;
  const effectivePromptId =
    formatSearchDisplayText(
      effectiveExecutionContext?.promptId ||
        readStringValue(executionContextSummaryRecord?.promptId) ||
        readStringValue(governanceSummaryRecord?.promptId),
    );
  const effectivePromptVersion = formatSearchDisplayText(
    effectiveExecutionContext?.promptVersion ||
      readStringValue(executionContextSummaryRecord?.promptVersion) ||
      readStringValue(governanceSummaryRecord?.promptVersion),
  );
  const effectiveStrategyId = formatSearchDisplayText(
    effectiveExecutionContext?.strategyId ||
      readStringValue(executionContextSummaryRecord?.strategyId) ||
      readStringValue(governanceSummaryRecord?.strategyId) ||
      effectiveExecutionContext?.searchStrategy,
  );
  const effectiveSource = formatSourceSummary(effectiveExecutionContext?.source);
  const effectiveFallbackReason = formatFallbackSummary(effectiveExecutionContext?.fallbackReason);
  const effectiveDatabaseRelationSource = formatDatabaseRelationSummary(
    searchRuntime?.databaseRelationSummary ||
      (searchMetaRecord?.databaseRelationSummary as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSummary as unknown) ||
      (governanceSummaryRecord?.databaseRelationSummary as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSource as unknown) ||
      (governanceSummaryRecord?.databaseRelationSource as unknown) ||
      effectiveExecutionContext?.databaseRelationSource ||
      (searchMetaRecord?.databaseSummary as unknown) ||
      (searchMetaRecord?.databaseRelation as unknown),
  );
  const shouldShowRuntimeSummary = Boolean(
    resultVisible || searchRuntime || resumeStep || resumeDetail?.session?.executionContextSummary,
  );
  const adapterPreviewMode = isAdapterPreviewMode(clientType);

  const handleSearch = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await wait(800);

      const payload = {
        sessionId: effectiveSessionId,
        ...values,
      };

      const response = await retrieveMaterials(
        {
          ...payload,
          taskInput: values.taskInput || '',
          context: '',
          goal: '整理相关资料并返回可复用依据',
          deliverable: '资料清单、证据摘要与检索结论',
          variables: {
            industryType: values.industryType || '',
            docType: values.docType || '',
            onlyExternalAvailable: values.onlyExternalAvailable === true,
            enableExternalSupplement: values.enableExternalSupplement === true,
          },
        },
        adapterPreviewMode ? { clientType } : undefined,
      );
      console.log('资料检索真实接口返回：', response);

      if (isAgentAdapterResponse(response)) {
        setLastResponseClientType(clientType);
        setAdapterPreview(response);
        setSearchResult(null);
        setSearchMeta(null);
        setSearchRuntime(null);
        setResultVisible(true);
        message.success(`${getAgentClientTypeLabel(clientType)} 响应预览已生成`);
        return;
      }

      if (response.success) {
        setAdapterPreview(null);
        setLastResponseClientType('web');
        setSearchResult(response.data || { evidenceItems: [] });
        setSearchMeta(response.meta || null);
        setSearchRuntime(response.runtime || null);
        setResultVisible(true);
        message.success(response.message || '检索完成');
      } else {
        message.error(response.message || '检索失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage) {
        message.warning(errorMessage);
      } else {
        message.warning('请先输入检索关键词');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResultVisible(false);
    setAdapterPreview(null);
    setLastResponseClientType('web');
    setSearchResult(null);
    setSearchMeta(null);
    setSearchRuntime(null);
  };

  useEffect(() => {
    const navigationSeed = buildTaskSeedFromPayload(location.state);

    if (!Object.keys(navigationSeed).length) {
      return;
    }

    form.setFieldsValue({
      taskInput: navigationSeed.taskInput || undefined,
      industryType: navigationSeed.industryType || undefined,
      docType: navigationSeed.docType || undefined,
      onlyExternalAvailable: navigationSeed.onlyExternalAvailable,
      enableExternalSupplement: navigationSeed.enableExternalSupplement,
    });
  }, [form, location.state]);

  useEffect(() => {
    let cancelled = false;

    const loadResumeDetail = async () => {
      if (!resumeState?.sessionId) {
        setResumeDetail(null);
        return;
      }

      const response = await getSessionDetail(resumeState.sessionId);

      if (!cancelled) {
        setResumeDetail(response.data || null);
      }
    };

    loadResumeDetail().catch((error) => {
      console.error('Search 恢复上下文加载失败：', error);
      if (!cancelled) {
        setResumeDetail(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resumeState?.sessionId]);

  useEffect(() => {
    if (!resumeState?.sessionId && !resumeStep) {
      return;
    }

    const stepInputPayload = getStepInputPayload(resumeStep);
    const stepOutputPayload = getStepOutputPayload(resumeStep);
    const resumeSeed = mergeTaskSeeds(
      buildTaskSeedFromPayload(stepInputPayload),
      buildTaskSeedFromPayload(resumeDetail?.session || null),
    );
    const matchedProducts = Array.isArray(stepOutputPayload.matchedProducts)
      ? stepOutputPayload.matchedProducts
      : [];
    const firstMatchedProduct =
      matchedProducts.find((item) => item && typeof item === 'object') as
        | Record<string, unknown>
        | undefined;

    form.setFieldsValue({
      taskInput:
        resumeSeed.taskInput ||
        (typeof firstMatchedProduct?.productName === 'string'
          ? firstMatchedProduct.productName
          : undefined),
      industryType: resumeSeed.industryType || undefined,
      docType: resumeSeed.docType || undefined,
      onlyExternalAvailable: resumeSeed.onlyExternalAvailable,
      enableExternalSupplement: resumeSeed.enableExternalSupplement,
    });
  }, [form, resumeDetail, resumeState?.sessionId, resumeStep]);

  useEffect(() => {
    if (!mappedEvidence.length) {
      setSelectedEvidenceId('');
      return;
    }

    setSelectedEvidenceId((current) => current || mappedEvidence[0].id);
  }, [mappedEvidence]);

  const searchStrategyLabel = getSearchStrategyLabel(searchMeta?.searchStrategy);
  const searchExecutionStrategyLabel = getSearchExecutionStrategyLabel(
    searchMeta?.searchExecutionStrategy,
  );
  const searchRouteLabel = getSearchRouteLabel(searchMeta?.searchRoute);
  const searchReasonLabel = getSearchReasonLabel(searchMeta?.searchReason);
  const searchSessionId = effectiveSessionId;
  const currentSearchStepId = searchRuntime?.stepId || searchMeta?.stepId || resumeStep?.id || '';
  const searchContinueContext = mergeContinueContexts(
    {
      sessionId: searchSessionId,
      stepId: currentSearchStepId || undefined,
      fromModule: 'search',
      assistantId: effectiveAssistantId || undefined,
      executionContext: effectiveExecutionContext || undefined,
    },
    searchRuntime?.continuePayload || null,
    resumeState,
  );

  const resolvedModelInfo =
    (searchMeta as
      | (NonNullable<SearchResultMeta> & {
          resolvedModel?: {
            id?: string;
            label?: string;
            provider?: string;
            modelName?: string;
            baseUrl?: string;
            module?: string;
            source?: string;
            moduleName?: string;
            resolvedModelId?: string;
            resolvedProvider?: string;
            resolvedModelName?: string;
            resolvedBaseUrl?: string;
          };
          failureType?: string;
        })
      | null)?.resolvedModel || null;

  const resolvedModelLabel = resolvedModelInfo
    ? `${
        resolvedModelInfo.label ||
        resolvedModelInfo.id ||
        resolvedModelInfo.resolvedModelId ||
        '未命名模型'
      } / ${
        resolvedModelInfo.provider || resolvedModelInfo.resolvedProvider || 'unknown'
      } / ${resolvedModelInfo.modelName || resolvedModelInfo.resolvedModelName || '未返回模型名'}`
    : '未返回';

  const resolvedModelSourceLabel = resolvedModelInfo?.source || '未返回';
  const resolvedModelModuleLabel =
    resolvedModelInfo?.module || resolvedModelInfo?.moduleName || '未返回';
  const searchFailureTypeLabel =
    ((searchMeta as (NonNullable<SearchResultMeta> & { failureType?: string }) | null)?.failureType as
      | string
      | undefined) || '未返回';
  const runtimeVersionLabel = resolvedModelLabel || '未返回';

  const handleCarryToOutput = (evidence: SearchEvidence) => {
    if (!searchSessionId) {
      message.warning('当前未接到 sessionId，无法仅凭 evidenceId 进入写作链路。');
      return;
    }

    navigate('/compose', {
      state: buildContinueNavigationState({
        continueContext: mergeContinueContexts(
          {
            ...searchContinueContext,
            evidenceId: evidence.evidenceId,
          },
          searchContinueContext,
        ),
      }),
    });
  };

  const handleCarryToSession = () => {
    if (!searchSessionId) {
      message.warning('当前未接到 sessionId，无法把证据沉淀到 Session。');
      return;
    }

    navigate(`/sessions/${searchSessionId}`);
  };

  return (
    <div>
      <PageHeader
        title="资料检索"
        description="按任务主题检索本地与公开资料，整理出可直接复用的依据与材料包。"
        extra={<AgentClientStatusBadge clientType={clientType} />}
      />
      {!resumeState?.sessionId && !searchRuntime?.sessionId ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="当前未接到 sessionId"
          description="本次检索仍可执行，但 continue 链路和跨页面上下文连续性可能不完整。"
        />
      ) : null}

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            onlyExternalAvailable: false,
            enableExternalSupplement: false,
          }}
        >
          <Form.Item
            label="任务主题 / 检索输入"
            name="taskInput"
            rules={[{ required: true, message: '请输入检索输入' }]}
          >
            <Input placeholder="例如：合同条款风险、预算审批依据、双氧水体系蚀刻液" />
          </Form.Item>

          <Form.Item label="资料类型" name="docType">
            <Select placeholder="请选择资料类型" options={docTypeOptions} />
          </Form.Item>

          <Form.Item label="任务域" name="industryType" extra="支持任意领域标识，例如 legal、healthcare、pcb。">
            <Input placeholder="例如：legal" />
          </Form.Item>

          <Form.Item label="只看可外发资料" name="onlyExternalAvailable" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            label="补充公开资料"
            name="enableExternalSupplement"
            valuePropName="checked"
            extra="默认关闭。仅在需要补充公开资料、官网信息或行业公开信息时开启。"
          >
            <Switch />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={handleSearch} loading={loading}>
              开始检索
            </Button>
            <Button onClick={handleReset}>清空</Button>
          </Space>
        </Form>
      </Card>

      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          {adapterPreview ? (
            <ClientAdapterPreviewCard
              clientType={lastResponseClientType}
              response={adapterPreview}
              note="这份预览用于联调渠道适配效果，便于直接确认飞书卡片结构是否符合预期。"
            />
          ) : (
            <>
          {shouldShowRuntimeSummary ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <ResolvedSummaryCard
                  title="本次真实生效摘要"
                  assistantId={effectiveAssistantId || '未返回'}
                  promptId={effectivePromptId}
                  promptVersion={effectivePromptVersion}
                  strategyId={effectiveStrategyId}
                  source={effectiveSource}
                  fallback={effectiveFallbackReason}
                  versionLabel={runtimeVersionLabel}
                  databaseRelationSource={effectiveDatabaseRelationSource}
                />
              </div>

              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={12}>
                  <Card title="模型运行摘要" style={{ borderRadius: 12 }}>
                    <p>
                      <strong>resolvedModel：</strong>
                      {resolvedModelLabel}
                    </p>
                    <p>
                      <strong>来源：</strong>
                      {resolvedModelSourceLabel}
                    </p>
                    <p>
                      <strong>模块：</strong>
                      {resolvedModelModuleLabel}
                    </p>
                    <p style={{ marginBottom: 0 }}>
                      <strong>失败类型：</strong>
                      {searchFailureTypeLabel}
                    </p>
                  </Card>
                </Col>

                <Col xs={24} md={12}>
                  <Card title="数据库关系摘要" style={{ borderRadius: 12 }}>
                    <p style={{ marginBottom: 0 }}>{effectiveDatabaseRelationSource}</p>
                  </Card>
                </Col>
              </Row>
            </>
          ) : null}
          <Spin spinning={loading}>
            <ResultCard title="检索条件区">
              <p style={{ marginBottom: 8 }}>
                <strong>当前检索输入：</strong>
                {form.getFieldValue('taskInput') || '未返回'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>所属行业：</strong>
                {form.getFieldValue('industryType') || '未返回'}
              </p>
              <p style={{ marginBottom: 0 }}>
                <strong>证据总览：</strong>
                {searchMeta?.searchSummary || '当前未返回检索整理摘要'}
              </p>
              {searchMeta?.sanitizedKeyword ? (
                <p style={{ marginTop: 8, marginBottom: 0 }}>
                  <strong>脱敏后补充关键词：</strong>
                  {searchMeta.sanitizedKeyword}
                </p>
              ) : null}
            </ResultCard>

            <ResultCard title="下游承接动作区（参考写作 / Session）">
              <p style={{ marginBottom: 8 }}>
                <strong>当前选中证据：</strong>
                {selectedEvidence?.docName || '未选择'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>可进入参考写作：</strong>
                {selectedEvidence?.outputEligible ? '是' : '否'}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>可进入 Session：</strong>
                {selectedEvidence?.sessionEligible ? '是' : '否'}
              </p>
              <Space wrap>
                <Button
                  type="primary"
                  disabled={!selectedEvidence || !selectedEvidence.outputEligible}
                  onClick={() => selectedEvidence && handleCarryToOutput(selectedEvidence)}
                >
                  进入参考写作
                </Button>
                <Button
                  disabled={!selectedEvidence || !selectedEvidence.sessionEligible}
                  onClick={() => selectedEvidence && handleCarryToSession()}
                >
                  沉淀到 Session
                </Button>
              </Space>
            </ResultCard>

            <ResultCard title="核心证据区">
              {!coreEvidenceList.length ? (
                <p style={{ margin: 0, color: '#8c8c8c' }}>当前未识别出核心证据。</p>
              ) : null}
              {coreEvidenceList.map((evidence) => (
                <ResultCard
                  key={evidence.id}
                  title={evidence.docName}
                  extra={
                    <Space>
                      <Tag color="blue">核心证据</Tag>
                      <Tag color={evidence.outputEligible ? 'green' : 'default'}>可进入写作</Tag>
                      <Tag color={evidence.sessionEligible ? 'purple' : 'default'}>可进入 Session</Tag>
                      <Button size="small" onClick={() => setSelectedEvidenceId(evidence.id)}>
                        设为当前证据
                      </Button>
                      <Button size="small" type="primary" onClick={() => handleCarryToOutput(evidence)}>
                        带入写作
                      </Button>
                    </Space>
                  }
                >
                  <p>
                    <strong>证据 ID：</strong>
                    {evidence.evidenceId}
                  </p>
                  <p>
                    <strong>资料类型：</strong>
                    {evidence.docType}
                  </p>
                  <p>
                    <strong>摘要：</strong>
                    {evidence.summaryText}
                  </p>
                  <p>
                    <strong>适用场景：</strong>
                    {evidence.applicableScene}
                  </p>
                  <p>
                    <strong>外发状态：</strong>
                    {getEvidenceOutboundStatusLabel(evidence.outboundStatus)}
                  </p>
                  <p>
                    <strong>来源类型：</strong>
                    {evidence.sourceType}
                  </p>
                  <p>
                    <strong>来源引用：</strong>
                    {evidence.sourceRef}
                  </p>
                  <p>
                    <strong>置信度：</strong>
                    {evidence.confidence}
                  </p>
                </ResultCard>
              ))}
            </ResultCard>

            <ResultCard title="辅助证据区">
              {!supportEvidenceList.length ? (
                <p style={{ margin: 0, color: '#8c8c8c' }}>当前未识别出辅助证据。</p>
              ) : null}
              {supportEvidenceList.map((evidence) => (
                <ResultCard
                  key={evidence.id}
                  title={evidence.docName}
                  extra={
                    <Space>
                      <Tag color="orange">辅助证据</Tag>
                      <Tag color={evidence.outputEligible ? 'green' : 'default'}>可进入 Output</Tag>
                      <Tag color={evidence.sessionEligible ? 'purple' : 'default'}>可进入 Session</Tag>
                      <Button size="small" onClick={() => setSelectedEvidenceId(evidence.id)}>
                        设为当前证据
                      </Button>
                      <Button size="small" onClick={() => handleCarryToSession()}>
                        沉淀到 Session
                      </Button>
                    </Space>
                  }
                >
                  <p>
                    <strong>证据 ID：</strong>
                    {evidence.evidenceId}
                  </p>
                  <p>
                    <strong>资料类型：</strong>
                    {evidence.docType}
                  </p>
                  <p>
                    <strong>摘要：</strong>
                    {evidence.summaryText}
                  </p>
                  <p>
                    <strong>适用场景：</strong>
                    {evidence.applicableScene}
                  </p>
                  <p>
                    <strong>外发状态：</strong>
                    {getEvidenceOutboundStatusLabel(evidence.outboundStatus)}
                  </p>
                  <p>
                    <strong>来源类型：</strong>
                    {evidence.sourceType}
                  </p>
                  <p>
                    <strong>来源引用：</strong>
                    {evidence.sourceRef}
                  </p>
                  <p>
                    <strong>置信度：</strong>
                    {evidence.confidence}
                  </p>
                </ResultCard>
              ))}
            </ResultCard>

            <ResultCard title="检索执行摘要（明细）">
              <p>
                <strong>Session ID：</strong>
                {effectiveSessionId || '未返回'}
              </p>
              <p>
                <strong>Assistant ID：</strong>
                {effectiveAssistantId || '未返回'}
              </p>
              {executionContextRows.map((item) => (
                <div key={item.label} style={{ marginBottom: 12 }}>
                  <strong>{item.label}：</strong>
                  <div
                    style={{
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: '#262626',
                    }}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <Card size="small" title="资料来源策略">
                  <p style={{ marginBottom: 0 }}>{searchStrategyLabel}</p>
                </Card>
                <Card size="small" title="检索策略">
                  <p style={{ marginBottom: 0 }}>{searchExecutionStrategyLabel}</p>
                </Card>
                <Card size="small" title="结果整理方式">
                  <p style={{ marginBottom: 0 }}>{searchRouteLabel}</p>
                </Card>
                <Card size="small" title="本次检索结果">
                  <p style={{ marginBottom: 0 }}>{searchReasonLabel}</p>
                </Card>
                <Card size="small" title="公开补充出站">
                  <p style={{ marginBottom: 0 }}>
                    {searchMeta?.searchOutboundAllowed === undefined
                      ? '未返回'
                      : searchMeta.searchOutboundAllowed
                        ? '允许'
                        : '不允许'}
                  </p>
                </Card>
                <Card size="small" title="出站原因">
                  <p style={{ marginBottom: 0 }}>{searchMeta?.searchOutboundReason || '未返回'}</p>
                </Card>
              </div>
            </ResultCard>


            {Array.isArray(searchMeta?.externalResults) && searchMeta.externalResults.length > 0 ? (
              <ResultCard title="公开资料补充（明细）">
                {searchMeta.externalResults.map((item, index) => (
                  <div key={String(item.url || item.title || index)} style={{ marginBottom: 12 }}>
                    <p>
                      <strong>标题：</strong>
                      {String(item.title || '未命名结果')}
                    </p>
                    <p>
                      <strong>摘要：</strong>
                      {String(item.summary || '无摘要')}
                    </p>
                    <p>
                      <strong>来源：</strong>
                      {String(item.source || item.url || '未标注')}
                    </p>
                  </div>
                ))}
              </ResultCard>
            ) : null}
          </Spin>
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="结构化证据页">
            <EmptyBlock text="请输入关键词并点击开始检索。若从其他模块继续进入，本页会优先通过 sessionId 和 stepId 回查上下文。" />
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default SearchPage;
