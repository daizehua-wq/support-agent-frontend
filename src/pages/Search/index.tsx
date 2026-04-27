import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert, Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Spin, Switch, Tag, message } from 'antd';

import AgentClientStatusBadge from '../../components/common/AgentClientStatusBadge';
import ClientAdapterPreviewCard from '../../components/common/ClientAdapterPreviewCard';
import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import ResolvedSummaryCard from '../../components/card/ResolvedSummaryCard';

import {
  getSessionDetail,
  listRetrieveMaterialCategories,
  searchReferences,
  type AgentAdapterResponse,
  type AgentClientType,
  type RetrieveMaterialCategoryOption,
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
  findStepById,
  findPreferredStep,
  hasPersistedSession,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  getStepOutputPayload,
  mergeContinueContexts,
  mergeTaskSeeds,
  parseContinueContext,
  readExecutionContextAssistantId,
  readExecutionContextPromptId,
  readExecutionContextPromptVersion,
  readExecutionContextStrategyId,
} from '../../utils/sessionResume';
import {
  loadActiveAssistantTemplateDefaults,
  shouldApplyAssistantDefault,
  type ActiveAssistantTemplateDefaults,
} from '../../utils/assistantTemplateDefaults';
import { formatTechnicalLabel, formatTechnicalValue } from '../../utils/displayLabel';
import {
  mapSearchEvidenceList,
  splitEvidenceByLevel,
  type SearchEvidence,
} from './evidenceMapper';

type DocTypeOption = RetrieveMaterialCategoryOption & {
  label: string;
  value: string;
};

const fallbackDocTypeOptions: DocTypeOption[] = [
  { label: '制度规范', value: 'spec' },
  { label: '流程 SOP', value: 'faq' },
  { label: '复盘纪要', value: 'case' },
  { label: '项目文档', value: 'project' },
];

const searchScopeOptions = [
  { label: '内部资料', value: 'internal' },
  { label: '权威数据库', value: 'paid_api' },
  { label: '互联网资料', value: 'web' },
];

const defaultSourceScopes = searchScopeOptions.map((item) => item.value);

const staleSearchDefaults = {
  taskInput: ['合同条款风险', '预算审批依据'],
  industryType: ['legal'],
};

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
  return formatTechnicalLabel(value);
};

const getSearchExecutionStrategyLabel = (value?: string) => {
  if (value === 'local-only') return '仅本地资料检索';
  if (value === 'external-enabled') return '本地资料 + 按需补充公开资料';
  return formatTechnicalLabel(value);
};

const getSearchRouteLabel = (value?: string) => {
  if (value === 'local-rule-match') return '本地规则命中';
  if (value === 'local-browse') return '本地资料浏览';
  if (value === 'external-supplement-blocked') return '公开资料补充已被脱敏链路拦截';
  if (value === 'search-llm-local') return '本地检索后由本地模型整理';
  if (value === 'search-llm+external') return '本地检索并结合补充资料整理';
  if (value === 'search-fallback') return '模型整理失败，已回退为本地摘要';
  return formatTechnicalLabel(value);
};

const getSearchReasonLabel = (value?: string) => {
  if (value === 'local-rule-hit') return '已命中本地检索规则';
  if (value === 'local-rule-miss') return '未命中明确规则，已返回本地可参考资料';
  if (value === 'search-model-call-success') return '检索成功';
  if (value === 'external-provider-executed') return '已执行公开资料补充';
  if (value === 'external-supplement-executed') return '已补充公开资料';
  if (value === 'external-supplement-no-results') return '未找到可补充的公开资料';
  return formatTechnicalLabel(value);
};

const getEvidenceOutboundStatusLabel = (value?: string) => {
  if (value === 'allowed') return '可外发';
  if (value === 'internal-only') return '仅内部参考';
  return value || '未返回';
};

const getTrustLevelLabel = (value?: string) => {
  if (value === 'high') return '高可信';
  if (value === 'medium') return '中可信';
  if (value === 'low') return '低可信';
  return value || '未返回';
};

const getGovernedCategoryLabel = (value?: string) => {
  const labels: Record<string, string> = {
    internal_data: '内部资料',
    paid_authoritative_data: '权威数据库资料',
    official_web: '官方网页资料',
    media_web: '媒体网页资料',
    general_web: '普通互联网资料',
    social_or_forum: '社交/论坛资料',
    unknown: '未知来源',
  };

  return labels[String(value || '')] || value || '未返回';
};

const getRecommendationLabel = (item: SearchEvidenceItem) => {
  if (item.useType === 'fact' || item.canUseAsFact) return '推荐用于写作事实';
  if (item.useType === 'background' || item.canUseAsBackground) return '仅作背景';
  if (item.useType === 'conflict') return '冲突待确认';
  return '不建议使用';
};

const getDocumentCategoryLabel = (value?: string) => {
  const rawValue = String(value || '').trim();
  const normalizedValue = rawValue.toLowerCase();

  if (['spec', '规格书', '规范依据', '制度规范'].some((item) => normalizedValue === item.toLowerCase())) {
    return '制度规范';
  }

  if (['faq', 'FAQ', '流程 SOP', '流程SOP'].some((item) => normalizedValue === item.toLowerCase())) {
    return '流程 SOP';
  }

  if (['case', '案例资料', '复盘材料', '复盘纪要'].some((item) => normalizedValue === item.toLowerCase())) {
    return '复盘纪要';
  }

  if (['project', '项目资料', '项目文档', '数据库记录'].some((item) => normalizedValue === item.toLowerCase())) {
    return '项目文档';
  }

  return rawValue || '未返回';
};

function formatSearchDisplayText(value: unknown) {
  return formatTechnicalValue(value);
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveSourceScopes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : defaultSourceScopes;
}

function formatResumeStepLabel(stepType?: string) {
  if (stepType === 'search') return '最近的检索步骤';
  if (stepType === 'analyze') return '最近的判断步骤';
  if (stepType === 'script') return '最近的写作步骤';
  return 'session 级上下文';
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

    return sourceMap[value] || formatTechnicalLabel(value);
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
        const displayValue = valueMap[String(entryValue)] || formatTechnicalLabel(entryValue);
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

    return fallbackMap[value] || formatTechnicalLabel(value);
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
        const displayValue = fallbackMap[String(entryValue)] || formatTechnicalLabel(entryValue);
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
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeLoadIssue, setResumeLoadIssue] = useState('');
  const [clientType] = useRememberedAgentClientType();
  const [lastResponseClientType, setLastResponseClientType] = useState<AgentClientType>('web');
  const [adapterPreview, setAdapterPreview] = useState<AgentAdapterResponse | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResultData | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchResultMeta>(null);
  const [searchRuntime, setSearchRuntime] = useState<RuntimeSnapshot | null>(null);
  const [resumeDetail, setResumeDetail] = useState<SessionDetailRecord | null>(null);
  const [assistantDefaults, setAssistantDefaults] =
    useState<ActiveAssistantTemplateDefaults | null>(null);
  const [docTypeOptions, setDocTypeOptions] = useState<DocTypeOption[]>(fallbackDocTypeOptions);
  const [docTypeOptionsLoading, setDocTypeOptionsLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const resumeState = parseContinueContext(location.state) as SearchResumeState | null;
  const hasResumeSession = hasPersistedSession(resumeState);
  const hasNavigationTaskSeed = useMemo(
    () => Object.keys(buildTaskSeedFromPayload(location.state)).length > 0,
    [location.state],
  );
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

  const effectiveSessionId = searchRuntime?.sessionId || resumeDetail?.session.id || '';
  const effectiveAssistantId =
    searchRuntime?.assistantId ||
    resumeState?.assistantId ||
    readExecutionContextAssistantId(searchRuntime?.executionContext) ||
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
  const resumeFallbackNotice = useMemo(() => {
    if (!resumeDetail || !resumeState?.stepId) {
      return '';
    }

    if (findStepById(resumeDetail, resumeState.stepId)) {
      return '';
    }

    return resumeStep
      ? `stepId ${resumeState.stepId} 未找到，已自动回退到${formatResumeStepLabel(resumeStep.stepType)}继续恢复。`
      : `stepId ${resumeState.stepId} 未找到，已自动退回 session 级数据恢复。`;
  }, [resumeDetail, resumeState?.stepId, resumeStep]);

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
  const referencePack = useMemo(
    () => searchResult?.referencePack || searchMeta?.referencePack || null,
    [searchMeta?.referencePack, searchResult?.referencePack],
  );
  const referencePackId =
    searchResult?.referencePackId || searchMeta?.referencePackId || referencePack?.referencePackId || '';
  const isReferencePackEmpty = Boolean(
    referencePack &&
      ((referencePack.status === 'empty') ||
        Number(referencePack.sourceCount || 0) === 0 ||
        (Array.isArray(referencePack.evidenceIds) && referencePack.evidenceIds.length === 0)),
  );
  const externalProviderStates =
    searchResult?.externalProviderStates || searchMeta?.externalProviderStates || [];
  const governedEvidenceItems = useMemo<SearchEvidenceItem[]>(
    () => searchResult?.governedEvidenceItems || searchMeta?.governedEvidenceItems || [],
    [searchMeta?.governedEvidenceItems, searchResult?.governedEvidenceItems],
  );
  const governedEvidenceSections = useMemo(
    () => [
      {
        key: 'internal',
        title: '内部资料',
        items: governedEvidenceItems.filter((item) => item.category === 'internal_data'),
      },
      {
        key: 'paid',
        title: '权威数据库资料',
        items: governedEvidenceItems.filter((item) => item.category === 'paid_authoritative_data'),
      },
      {
        key: 'official',
        title: '官方网页资料',
        items: governedEvidenceItems.filter((item) => item.category === 'official_web'),
      },
      {
        key: 'internet',
        title: '互联网资料',
        items: governedEvidenceItems.filter((item) =>
          ['media_web', 'general_web'].includes(String(item.category || '')) &&
          item.useType !== 'doNotUse' &&
          item.useType !== 'conflict',
        ),
      },
      {
        key: 'low',
        title: '低可信辅助资料',
        items: governedEvidenceItems.filter((item) => item.trustLevel === 'low' || item.useType === 'doNotUse'),
      },
      {
        key: 'conflict',
        title: '冲突资料',
        items: governedEvidenceItems.filter((item) => item.useType === 'conflict'),
      },
    ],
    [governedEvidenceItems],
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
      readExecutionContextPromptId(effectiveExecutionContext) ||
      readStringValue(executionContextSummaryRecord?.promptId) ||
      readStringValue(governanceSummaryRecord?.promptId),
    );
  const effectivePromptVersion = formatSearchDisplayText(
    readExecutionContextPromptVersion(effectiveExecutionContext) ||
      readStringValue(executionContextSummaryRecord?.promptVersion) ||
      readStringValue(governanceSummaryRecord?.promptVersion),
  );
  const effectiveStrategyId = formatSearchDisplayText(
    readExecutionContextStrategyId(effectiveExecutionContext) ||
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

  useEffect(() => {
    let cancelled = false;

    const loadDocTypeOptions = async () => {
      setDocTypeOptionsLoading(true);

      try {
        const categories = await listRetrieveMaterialCategories();
        const nextOptions = categories
          .map((item) => ({
            label: String(item.label || item.value || '').trim(),
            value: String(item.value || item.label || '').trim(),
            count: item.count,
            sourceValues: item.sourceValues,
          }))
          .filter((item) => item.label && item.value);

        if (!cancelled && nextOptions.length > 0) {
          setDocTypeOptions(nextOptions);
        }
      } catch (error) {
        console.warn('资料分类读取失败，已使用默认分类：', error);
      } finally {
        if (!cancelled) {
          setDocTypeOptionsLoading(false);
        }
      }
    };

    loadDocTypeOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyActiveAssistantDefaults = async () => {
      const defaults = await loadActiveAssistantTemplateDefaults();

      if (cancelled) {
        return;
      }

      setAssistantDefaults(defaults);

      if (hasResumeSession || hasNavigationTaskSeed) {
        return;
      }

      const currentValues = form.getFieldsValue([
        'taskInput',
        'industryType',
        'docType',
      ]) as Record<string, unknown>;
      const nextValues: Record<string, string> = {};

      if (shouldApplyAssistantDefault(currentValues.taskInput, staleSearchDefaults.taskInput)) {
        nextValues.taskInput = defaults.searchTaskInput;
      }

      if (shouldApplyAssistantDefault(currentValues.industryType, staleSearchDefaults.industryType)) {
        nextValues.industryType = defaults.industryType;
      }

      if (shouldApplyAssistantDefault(currentValues.docType)) {
        nextValues.docType = defaults.searchDocType;
      }

      if (Object.keys(nextValues).length) {
        form.setFieldsValue(nextValues);
      }
    };

    applyActiveAssistantDefaults().catch((error) => {
      console.warn('检索页当前 Assistant 默认值读取失败：', error);
    });

    return () => {
      cancelled = true;
    };
  }, [form, hasNavigationTaskSeed, hasResumeSession]);

  const handleSearch = async () => {
    try {
      if (hasResumeSession && resumeLoading && !resumeDetail?.session.id) {
        message.warning('session 正在恢复，请稍后再提交。');
        return;
      }

      const values = await form.validateFields();
      const selectedSourceScopes = resolveSourceScopes(values.sourceScopes);
      setLoading(true);
      await wait(800);

      const payload = {
        sessionId: effectiveSessionId,
        ...values,
        sourceScopes: selectedSourceScopes,
      };

      const response = await searchReferences(
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
            sourceScopes: selectedSourceScopes,
          },
          sourceScopes: selectedSourceScopes,
          includePaidApiSources: selectedSourceScopes.includes('paid_api'),
          includeWebSources: selectedSourceScopes.includes('web'),
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
        const nextReferencePack = response.data?.referencePack || response.meta?.referencePack;
        if (
          nextReferencePack &&
          (nextReferencePack.status === 'empty' || Number(nextReferencePack.sourceCount || 0) === 0)
        ) {
          message.info('本次未检索到可用资料，已记录本次检索。');
        } else {
          message.success(response.message || '检索完成');
        }
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
      sourceScopes: Array.isArray(navigationSeed.sourceScopes)
        ? navigationSeed.sourceScopes
        : defaultSourceScopes,
    });
  }, [form, location.state]);

  useEffect(() => {
    let cancelled = false;

    const loadResumeDetail = async () => {
      if (!hasResumeSession || !resumeState?.sessionId) {
        setResumeDetail(null);
        setResumeLoadIssue('');
        setResumeLoading(false);
        return;
      }

      setResumeLoading(true);
      const response = await getSessionDetail(resumeState.sessionId);
      const detail = response.data || null;

      if (!cancelled) {
        setResumeDetail(detail);
        setResumeLoadIssue(
          detail
            ? ''
            : response.message
              ? `${response.message}（sessionId：${resumeState.sessionId}）`
              : `sessionId ${resumeState.sessionId} 未找到，已退回页面入参恢复。`,
        );
        setResumeLoading(false);
      }
    };

    loadResumeDetail().catch((error) => {
      console.error('Search 恢复上下文加载失败：', error);
      if (!cancelled) {
        setResumeDetail(null);
        setResumeLoadIssue(
          resumeState?.sessionId
            ? `sessionId ${resumeState.sessionId} 加载失败，当前仅保留已带入页面的字段。`
            : '恢复上下文加载失败，当前仅保留已带入页面的字段。',
        );
        setResumeLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasResumeSession, resumeState?.sessionId]);

  useEffect(() => {
    if (!resumeStep && !resumeDetail) {
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

    if (!Object.keys(resumeSeed).length && typeof firstMatchedProduct?.productName !== 'string') {
      return;
    }

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
      sourceScopes: Array.isArray(resumeSeed.sourceScopes)
        ? resumeSeed.sourceScopes
        : defaultSourceScopes,
    });
  }, [form, resumeDetail, resumeStep]);

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

    const referenceSummary = evidence.summaryText
      ? `${evidence.docName || ''}：${evidence.summaryText}`
      : evidence.docName;

    navigate('/compose', {
      state: buildContinueNavigationState({
        continueContext: mergeContinueContexts(
          {
            ...searchContinueContext,
            evidenceId: evidence.evidenceId,
          },
          searchContinueContext,
        ),
        carryPayload: {
          taskInput: form.getFieldValue('taskInput'),
          taskSubject: form.getFieldValue('taskInput'),
          industryType: form.getFieldValue('industryType'),
          docType: form.getFieldValue('docType'),
          context: referenceSummary,
          referenceSummary,
          sourceDocName: evidence.docName,
          sourceDocType: evidence.docType,
          sourceApplicableScene: evidence.applicableScene,
          sourceType: evidence.sourceType,
          sourceRef: evidence.sourceRef,
          evidenceId: evidence.evidenceId,
        },
      }),
    });
  };

  const handleConfirmReferencePackSaved = () => {
    if (!referencePackId) {
      message.warning('当前还没有生成 referencePackId，请先完成检索。');
      return;
    }

    message.success(`参考资料包已保存：${referencePackId}`);
  };

  const handleCarryReferencePackToOutput = () => {
    if (!referencePackId) {
      message.warning('当前还没有生成 referencePackId，请先保存参考资料包。');
      return;
    }

    navigate('/compose', {
      state: buildContinueNavigationState({
        continueContext: mergeContinueContexts(
          {
            ...searchContinueContext,
            fromModule: 'search',
          },
          searchContinueContext,
        ),
        carryPayload: {
          referencePackId,
          taskInput: form.getFieldValue('taskInput'),
          taskSubject: form.getFieldValue('taskInput'),
          industryType: form.getFieldValue('industryType'),
          docType: form.getFieldValue('docType'),
          context: referencePack?.summary || searchMeta?.referenceSummary || '',
          referenceSummary: referencePack?.summary || searchMeta?.referenceSummary || '',
          sourceDocId: referencePackId,
          sourceDocName: referencePack?.title || '参考资料包',
          sourceDocType: 'reference_pack',
          sourceApplicableScene: 'governed_reference_pack',
          sourceExternalAvailable: false,
        },
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
      {resumeLoadIssue ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="session 恢复失败"
          description={resumeLoadIssue}
        />
      ) : null}

      {resumeFallbackNotice ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="session 恢复已自动降级"
          description={resumeFallbackNotice}
        />
      ) : null}

      {!resumeLoadIssue && !resumeLoading && !effectiveSessionId ? (
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
            sourceScopes: defaultSourceScopes,
          }}
        >
          <Form.Item
            label="任务主题 / 检索输入"
            name="taskInput"
            rules={[{ required: true, message: '请输入检索输入' }]}
          >
            <Input
              placeholder={`例如：${assistantDefaults?.subjectHint || assistantDefaults?.searchTaskInput || '湿制程材料方案'}`}
            />
          </Form.Item>

          <Form.Item label="资料分类" name="docType">
            <Select
              showSearch
              optionFilterProp="label"
              loading={docTypeOptionsLoading}
              placeholder="按资料场景筛选（可选）"
              options={docTypeOptions}
            />
          </Form.Item>

          <Form.Item
            label="资料来源开关"
            name="sourceScopes"
            extra="资料来源默认全部参与检索，可按需关闭。未配置真实 provider 时会自动降级，不影响其他来源。"
          >
            <Checkbox.Group
              options={searchScopeOptions}
            />
          </Form.Item>

          <Form.Item
            label="任务域"
            name="industryType"
            extra={`当前模板：${assistantDefaults?.assistantName || '读取中'}；支持任意领域标识，例如 pcb、legal、healthcare。`}
          >
            <Input placeholder={`例如：${assistantDefaults?.industryType || 'pcb'}`} />
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
              <p style={{ marginBottom: 8 }}>
                <strong>referencePackId：</strong>
                {referencePackId || '未生成'}
              </p>
              {referencePack ? (
                <p style={{ marginBottom: 12 }}>
                  <strong>资料包统计：</strong>
                  {referencePack.sourceCount || 0} 条资料 / 高可信 {referencePack.highTrustCount || 0} 条 / 风险 {referencePack.riskCount || 0} 条
                </p>
              ) : null}
              {isReferencePackEmpty ? (
                <Alert
                  style={{ marginBottom: 12 }}
                  type="info"
                  showIcon
                  message="本次未检索到可用资料，已记录本次检索。"
                  description={referencePack?.emptyReason || '空 referencePack 会保留 referencePackId、JSON / Markdown 和 SQLite 索引，用于后续追溯。'}
                />
              ) : null}
              {externalProviderStates.length ? (
                <div style={{ marginBottom: 12 }}>
                  <strong>外部 provider 状态：</strong>
                  <Space wrap style={{ marginLeft: 8 }}>
                    {externalProviderStates.map((item, index) => (
                      <Tag
                        key={`${item.provider || 'provider'}-${index}`}
                        color={item.status === 'success' ? 'green' : item.status === 'mock_fallback' ? 'gold' : 'default'}
                      >
                        {item.provider || 'provider'}：{item.status || 'unknown'}
                        {typeof item.resultCount === 'number' ? ` / ${item.resultCount} 条` : ''}
                      </Tag>
                    ))}
                  </Space>
                </div>
              ) : null}
              <Space wrap>
                <Button disabled={!referencePackId} onClick={handleConfirmReferencePackSaved}>
                  保存为参考资料包
                </Button>
                <Button type="primary" disabled={!referencePackId} onClick={handleCarryReferencePackToOutput}>
                  带这些资料去写作
                </Button>
                <Button
                  disabled={!selectedEvidence || !selectedEvidence.outputEligible}
                  onClick={() => selectedEvidence && handleCarryToOutput(selectedEvidence)}
                >
                  带当前证据写作
                </Button>
                <Button
                  disabled={!selectedEvidence || !selectedEvidence.sessionEligible}
                  onClick={() => selectedEvidence && handleCarryToSession()}
                >
                  沉淀到 Session
                </Button>
              </Space>
            </ResultCard>

            <ResultCard title="资料治理分区">
              {!governedEvidenceItems.length ? (
                <p style={{ margin: 0, color: '#8c8c8c' }}>
                  本次未检索到可用资料，已记录本次检索。
                </p>
              ) : null}
              {governedEvidenceSections.map((section) =>
                section.items.length ? (
                  <div key={section.key} style={{ marginBottom: 18 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>{section.title}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {section.items.map((item) => (
                        <div
                          key={item.evidenceId}
                          style={{
                            border: '1px solid #edf0f5',
                            borderRadius: 8,
                            padding: 14,
                            background: '#fff',
                          }}
                        >
                          <Space wrap style={{ marginBottom: 8 }}>
                            <Tag color={item.trustLevel === 'high' ? 'green' : item.trustLevel === 'low' ? 'red' : 'gold'}>
                              {getTrustLevelLabel(item.trustLevel)}
                            </Tag>
                            <Tag color="blue">{item.priority || '未分级'}</Tag>
                            <Tag>{getGovernedCategoryLabel(item.category)}</Tag>
                            {item.isDuplicate ? <Tag color="default">重复合并</Tag> : null}
                            {item.useType === 'conflict' ? <Tag color="red">冲突</Tag> : null}
                          </Space>
                          <p style={{ marginBottom: 8 }}>
                            <strong>{item.title || item.evidenceId}</strong>
                          </p>
                          <p style={{ marginBottom: 8 }}>{item.summary || '无摘要'}</p>
                          <Row gutter={[12, 8]}>
                            <Col xs={24} md={8}>
                              来源类型：{item.sourceType || '未返回'}
                            </Col>
                            <Col xs={24} md={8}>
                              来源名称：{item.sourceName || item.provider || '未返回'}
                            </Col>
                            <Col xs={24} md={8}>
                              更新时间：{item.updatedAt || item.publishedAt || '未返回'}
                            </Col>
                            <Col xs={24} md={8}>
                              检索时间：{item.retrievedAt || '未返回'}
                            </Col>
                            <Col xs={24} md={8}>
                              缓存命中：{item.isDuplicate ? `合并至 ${item.duplicateOf}` : '否'}
                            </Col>
                            <Col xs={24} md={8}>
                              是否可外发：{item.canUseInExternalOutput ? '是' : '否'}
                            </Col>
                            <Col xs={24} md={8}>
                              写作建议：{getRecommendationLabel(item)}
                            </Col>
                            <Col xs={24} md={8}>
                              finalScore：{item.finalScore ?? '未返回'}
                            </Col>
                          </Row>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
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
                    <strong>资料分类：</strong>
                    {getDocumentCategoryLabel(evidence.docType)}
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
                    <strong>资料分类：</strong>
                    {getDocumentCategoryLabel(evidence.docType)}
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
