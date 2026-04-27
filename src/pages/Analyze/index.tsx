import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Spin, message } from 'antd';

import AgentClientStatusBadge from '../../components/common/AgentClientStatusBadge';
import ClientAdapterPreviewCard from '../../components/common/ClientAdapterPreviewCard';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import ResolvedSummaryCard from '../../components/card/ResolvedSummaryCard';
import {
  analyzeContext,
  judgeTask,
  getSessionDetail,
  type AgentAdapterResponse,
  type AgentClientType,
  type AnalyzeCustomerResponse,
  type RuntimeSnapshot,
  type SessionDetailRecord,
} from '../../api/agent';
import {
  getAgentClientTypeLabel,
  isAdapterPreviewMode,
  isAgentAdapterResponse,
  useRememberedAgentClientType,
} from '../../utils/agentClientDebug';
import {
  buildContinueContext,
  buildContinueNavigationState,
  buildTaskSeedFromPayload,
  findStepById,
  findPreferredStep,
  hasPersistedSession,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  mergeContinueContexts,
  mergeTaskSeeds,
  parseContinueContext,
  readExecutionContextAssistantId,
  readExecutionContextPromptId,
  readExecutionContextPromptVersion,
  readExecutionContextStrategyId,
} from '../../utils/sessionResume';
import {
  buildAnalyzeTemplateExample,
  loadActiveAssistantTemplateDefaults,
  shouldApplyAssistantDefault,
  type ActiveAssistantTemplateDefaults,
} from '../../utils/assistantTemplateDefaults';
import { formatTechnicalLabel, formatTechnicalValue } from '../../utils/displayLabel';

const { TextArea } = Input;

const stageOptions = [
  { label: '启动评估', value: 'initial_contact' },
  { label: '需求沟通', value: 'requirement_discussion' },
  { label: '执行推进', value: 'sample_followup' },
  { label: '定稿确认', value: 'quotation' },
  { label: '其他', value: 'other' },
];

const staleAnalyzeDefaults = {
  taskObject: ['法务评审任务'],
  industryType: ['legal'],
  taskSubject: ['合同条款风险'],
  taskInput: ['请帮我判断这份合同的违约责任和付款节点风险，并给出是否建议本周签署的判断。'],
  context: ['老板需要一页汇报要点；重点关注风险等级、需要修改的条款和下一步建议。'],
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


type AnalyzeResultData = NonNullable<AnalyzeCustomerResponse['data']>;

type AnalyzeExecutionContext = Record<string, unknown> & {
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  source?: unknown;
  fallbackReason?: unknown;
  databaseRelationSource?: unknown;
};



function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[复杂对象，暂不展开]';
  }
}

function formatExecutionValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '未返回';

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return safeStringify(value);
  }

  if (typeof value === 'object') {
    return safeStringify(value);
  }

  return String(value);
}

function formatDisplayText(value: unknown) {
  return formatTechnicalValue(value);
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function formatResumeStepLabel(stepType?: string) {
  if (stepType === 'analyze') return '最近的判断步骤';
  if (stepType === 'search') return '最近的检索步骤';
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
      'module.analyze.prompt': 'Analyze 模块 Prompt',
      'module.analyze.promptVersion': 'Analyze 模块 PromptVersion',
      'module.prompt': '模块 Prompt',
      'module.promptVersion': '模块 PromptVersion',
      'module.strategy': '模块策略',
      'module-strategy': '模块策略',
      'settings.strategy.analyzeStrategy': 'Analyze 模块策略',
      'settings.strategy.searchStrategy': 'Search 模块策略',
      'settings.strategy.scriptStrategy': 'Script 模块策略',
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

  return formatDisplayText(value);
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

  return formatDisplayText(value);
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

  return formatDisplayText(value);
}

function normalizeListValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => formatDisplayText(item));
}

type AnalyzeResumeState = ReturnType<typeof buildContinueContext>;

function AnalyzePage() {
  const [form] = Form.useForm();
  const location = useLocation();
  const resumeState = parseContinueContext(location.state) as AnalyzeResumeState | null;
  const [resumeDetail, setResumeDetail] = useState<SessionDetailRecord | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientType] = useRememberedAgentClientType();
  const [lastResponseClientType, setLastResponseClientType] = useState<AgentClientType>('web');
  const [adapterPreview, setAdapterPreview] = useState<AgentAdapterResponse | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResultData | null>(null);
  const [analyzeRuntime, setAnalyzeRuntime] = useState<RuntimeSnapshot | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeLoadIssue, setResumeLoadIssue] = useState('');
  const [assistantDefaults, setAssistantDefaults] =
    useState<ActiveAssistantTemplateDefaults | null>(null);
  const navigate = useNavigate();
  const hasResumeSession = hasPersistedSession(resumeState);
  const hasNavigationTaskSeed = useMemo(
    () => Object.keys(buildTaskSeedFromPayload(location.state)).length > 0,
    [location.state],
  );
  const resumeStep = useMemo(
    () =>
      findPreferredStep({
        detail: resumeDetail,
        stepId: resumeState?.stepId,
        preferredTypes: ['analyze', 'script', 'search'],
      }),
    [resumeDetail, resumeState?.stepId],
  );

  const effectiveSessionId = analyzeRuntime?.sessionId || resumeDetail?.session.id || '';
  const effectiveAssistantId =
    analyzeRuntime?.assistantId ||
    resumeState?.assistantId ||
    readExecutionContextAssistantId(analyzeRuntime?.executionContext) ||
    getStepAssistantId(resumeStep) ||
    resumeDetail?.session.assistantId ||
    '';
  const effectiveExecutionContext =
    (analyzeRuntime?.executionContext ||
      analyzeRuntime?.executionContextSummary ||
      resumeState?.executionContext ||
      resumeState?.executionContextSummary ||
      getStepExecutionContext(resumeStep) ||
      getSessionExecutionContext(resumeDetail) ||
      null) as
      | AnalyzeExecutionContext
      | null;
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

  const analyzeResultRecord = (analyzeResult as Record<string, unknown> | null) || null;
  const executionContextSummaryRecord = analyzeRuntime?.executionContextSummary || undefined;
  const governanceSummaryRecord = analyzeRuntime?.governanceSummary || undefined;
  const effectivePromptId =
    readExecutionContextPromptId(effectiveExecutionContext) ||
    readStringValue(executionContextSummaryRecord?.promptId) ||
    readStringValue(governanceSummaryRecord?.promptId) ||
    '未返回';
  const effectivePromptVersion =
    readExecutionContextPromptVersion(effectiveExecutionContext) ||
    readStringValue(executionContextSummaryRecord?.promptVersion) ||
    readStringValue(governanceSummaryRecord?.promptVersion) ||
    '未返回';
  const effectiveStrategyId =
    readExecutionContextStrategyId(effectiveExecutionContext) ||
    readStringValue(executionContextSummaryRecord?.strategyId) ||
    readStringValue(governanceSummaryRecord?.strategyId) ||
    formatDisplayText(analyzeResult?.analyzeStrategy || analyzeResult?.analyzeExecutionStrategy) ||
    '未返回';
  const effectiveFallbackReason = effectiveExecutionContext?.fallbackReason || '';
  const effectiveSourceSummary = formatSourceSummary(effectiveExecutionContext?.source);
  const effectiveFallbackSummary = formatFallbackSummary(effectiveFallbackReason);

  const executionContextRows = useMemo(
    () => [
      {
        label: '规则范围',
        value: formatExecutionValue(effectiveExecutionContext?.rulesScope),
      },
      {
        label: '产品范围',
        value: formatExecutionValue(effectiveExecutionContext?.productScope),
      },
      {
        label: '资料范围',
        value: formatExecutionValue(effectiveExecutionContext?.docScope),
      },
      {
        label: '判断策略',
        value: formatExecutionValue(effectiveExecutionContext?.analyzeStrategy),
      },
      {
        label: '检索策略',
        value: formatExecutionValue(effectiveExecutionContext?.searchStrategy),
      },
      {
        label: '写作策略',
        value: formatExecutionValue(effectiveExecutionContext?.scriptStrategy),
      },
    ],
    [effectiveExecutionContext],
  );

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
        'taskObject',
        'industryType',
        'taskPhase',
        'taskSubject',
        'taskInput',
        'context',
      ]) as Record<string, unknown>;
      const nextValues: Record<string, string> = {};

      if (shouldApplyAssistantDefault(currentValues.taskObject, staleAnalyzeDefaults.taskObject)) {
        nextValues.taskObject = defaults.taskObject;
      }

      if (shouldApplyAssistantDefault(currentValues.industryType, staleAnalyzeDefaults.industryType)) {
        nextValues.industryType = defaults.industryType;
      }

      if (shouldApplyAssistantDefault(currentValues.taskPhase)) {
        nextValues.taskPhase = defaults.taskPhase;
      }

      if (shouldApplyAssistantDefault(currentValues.taskSubject, staleAnalyzeDefaults.taskSubject)) {
        nextValues.taskSubject = defaults.taskSubject;
      }

      if (shouldApplyAssistantDefault(currentValues.taskInput, staleAnalyzeDefaults.taskInput)) {
        nextValues.taskInput = defaults.analyzeTaskInput;
      }

      if (shouldApplyAssistantDefault(currentValues.context, staleAnalyzeDefaults.context)) {
        nextValues.context = defaults.analyzeContext;
      }

      if (Object.keys(nextValues).length) {
        form.setFieldsValue(nextValues);
      }
    };

    applyActiveAssistantDefaults().catch((error) => {
      console.warn('判断页当前 Assistant 默认值读取失败：', error);
    });

    return () => {
      cancelled = true;
    };
  }, [form, hasNavigationTaskSeed, hasResumeSession]);

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
      console.error('Analyze 恢复上下文加载失败：', error);
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
    const navigationSeed = buildTaskSeedFromPayload(location.state);

    if (!Object.keys(navigationSeed).length) {
      return;
    }

    form.setFieldsValue({
      taskObject: navigationSeed.taskObject || undefined,
      industryType: navigationSeed.industryType || undefined,
      taskPhase: navigationSeed.taskPhase || undefined,
      taskSubject: navigationSeed.taskSubject || undefined,
      taskInput: navigationSeed.taskInput || undefined,
      context: navigationSeed.context || undefined,
    });
  }, [form, location.state]);

  useEffect(() => {
    if (!resumeStep && !resumeDetail) {
      return;
    }

    const resumeSeed = mergeTaskSeeds(
      buildTaskSeedFromPayload(getStepInputPayload(resumeStep)),
      buildTaskSeedFromPayload(resumeDetail?.session || null),
    );

    if (!Object.keys(resumeSeed).length) {
      return;
    }

    form.setFieldsValue({
      taskObject: resumeSeed.taskObject || undefined,
      industryType: resumeSeed.industryType || undefined,
      taskPhase: resumeSeed.taskPhase || undefined,
      taskSubject: resumeSeed.taskSubject || undefined,
      taskInput: resumeSeed.taskInput || undefined,
      context: resumeSeed.context || undefined,
    });
  }, [form, resumeDetail, resumeStep]);

  const handleSubmit = async () => {
    try {
      if (hasResumeSession && resumeLoading && !resumeDetail?.session.id) {
        message.warning('session 正在恢复，请稍后再提交。');
        return;
      }

      const values = await form.validateFields();

      setLoading(true);
      await wait(800);

      const payload = {
        sessionId: effectiveSessionId,
        ...values,
      };

      const response = await (effectiveSessionId ? judgeTask : analyzeContext)(
        {
          ...payload,
          taskInput: values.taskInput || '',
          context: values.context || '',
          goal: '完成任务判断并给出建议',
          deliverable: '判断摘要、风险提示与下一步建议',
          variables: {
            taskObject: values.taskObject || '',
            industryType: values.industryType || '',
            taskPhase: values.taskPhase || '',
            taskSubject: values.taskSubject || '',
          },
        },
        adapterPreviewMode ? { clientType } : undefined,
      );

      if (isAgentAdapterResponse(response)) {
        setLastResponseClientType(clientType);
        setAdapterPreview(response);
        setAnalyzeResult(null);
        setAnalyzeRuntime(null);
        setResultVisible(true);
        message.success(`${getAgentClientTypeLabel(clientType)} 响应预览已生成`);
        return;
      }

      if (response.success && response.data) {
        setAdapterPreview(null);
        setLastResponseClientType('web');
        setAnalyzeResult(response.data);
        setAnalyzeRuntime(response.runtime || null);
        setResultVisible(true);
        message.success(response.message || '判断完成');
      } else {
        message.error(response.message || '判断失败');
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'errorFields' in error &&
        Array.isArray((error as { errorFields?: unknown[] }).errorFields)
      ) {
        message.warning('请先补充必填信息');
      } else {
        const errorMessage = error instanceof Error ? error.message : '判断失败，请稍后重试。';
        message.error(errorMessage);
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
    setAnalyzeResult(null);
    setAnalyzeRuntime(null);
  };

  const handleFillExample = () => {
    form.setFieldsValue(buildAnalyzeTemplateExample(assistantDefaults));
  };

  const analysisRouteLabel = formatDisplayText(analyzeResult?.analysisRoute);
  const analyzeStrategyLabel = formatDisplayText(analyzeResult?.analyzeStrategy);
  const analyzeExecutionStrategyLabel = formatDisplayText(analyzeResult?.analyzeExecutionStrategy);

  const resolvedModelInfo =
    (analyzeResult as
      | (AnalyzeResultData & {
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
  const analyzeFailureTypeLabel =
    ((analyzeResult as (AnalyzeResultData & { failureType?: string }) | null)?.failureType as
      | string
      | undefined) || '未返回';
  const databaseRelationSummaryLabel = formatDatabaseRelationSummary(
    (analyzeResultRecord?.databaseRelationSummary as unknown) ||
      (analyzeResultRecord?.databaseSummary as unknown) ||
      (analyzeResultRecord?.databaseRelation as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSummary as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSource as unknown) ||
      (governanceSummaryRecord?.databaseRelationSummary as unknown) ||
      (governanceSummaryRecord?.databaseRelationSource as unknown) ||
      effectiveExecutionContext?.databaseRelationSource,
  );
  const shouldShowRuntimeSummary = Boolean(
    resultVisible || analyzeRuntime || resumeStep || resumeDetail?.session?.executionContextSummary,
  );
  const runtimeVersionLabel = resolvedModelLabel || '未返回';
  const currentAnalyzeStepId = analyzeResult?.stepId || resumeStep?.id || '';
  const analyzeContinueContext = mergeContinueContexts(
    {
      sessionId: effectiveSessionId,
      stepId: currentAnalyzeStepId || undefined,
      fromModule: 'analyze',
      assistantId: effectiveAssistantId || undefined,
      executionContext: effectiveExecutionContext || undefined,
    },
    analyzeRuntime?.continuePayload || null,
    resumeState,
  );

  const outboundAllowedLabel =
    analyzeResult?.outboundAllowed === undefined
      ? '未返回'
      : analyzeResult.outboundAllowed
        ? '允许'
        : '不允许';
  const outboundReasonLabel = formatDisplayText(analyzeResult?.outboundReason);
  const sanitizedAnalyzeTextLabel = formatDisplayText(
    analyzeResult?.sanitizedAnalyzeText || '当前未返回脱敏后的任务表述',
  );
  const summaryLabel = formatDisplayText(analyzeResult?.summary || '当前未返回需求摘要。');
  const sceneJudgementLabel = formatDisplayText(
    analyzeResult?.sceneJudgement || '当前未返回场景判断。',
  );

  const recommendedProductsList = normalizeListValues(analyzeResult?.recommendedProducts);
  const followupQuestionsList = normalizeListValues(analyzeResult?.followupQuestions);
  const riskNotesList = normalizeListValues(analyzeResult?.riskNotes);
  const nextActionsList = normalizeListValues(analyzeResult?.nextActions);
  const adapterPreviewMode = isAdapterPreviewMode(clientType);

  return (
    <div>
      <PageHeader
        title="任务判断"
        description="输入任务与背景，快速形成判断摘要、风险提示和下一步建议。"
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
          description="本次判断仍可执行，但 continue 链路和跨页面上下文连续性可能不完整。"
        />
      ) : null}

      {shouldShowRuntimeSummary ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <ResolvedSummaryCard
              title="本次真实生效摘要"
              assistantId={effectiveAssistantId || '未返回'}
              promptId={effectivePromptId}
              promptVersion={effectivePromptVersion}
              strategyId={effectiveStrategyId}
              source={effectiveSourceSummary}
              fallback={effectiveFallbackSummary}
              versionLabel={runtimeVersionLabel}
              databaseRelationSource={databaseRelationSummaryLabel}
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
                  {analyzeFailureTypeLabel}
                </p>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card title="数据库关系摘要" style={{ borderRadius: 12 }}>
                <p style={{ marginBottom: 0 }}>{databaseRelationSummaryLabel}</p>
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      <Card style={{ borderRadius: 12 }}>
        <Form form={form} layout="vertical">
          <Form.Item label="任务对象" name="taskObject">
            <Input
              placeholder={`例如：${assistantDefaults?.taskObject || '客户需求澄清 / 方案推进 / 样品跟进'}`}
            />
          </Form.Item>

          <Form.Item
            label="任务域"
            name="industryType"
            extra={`当前模板：${assistantDefaults?.assistantName || '读取中'}；支持任意领域标识，例如 pcb、legal、healthcare。`}
          >
            <Input placeholder={`例如：${assistantDefaults?.industryType || 'pcb'}`} />
          </Form.Item>

          <Form.Item label="任务阶段" name="taskPhase">
            <Select placeholder="请选择任务阶段" options={stageOptions} />
          </Form.Item>

          <Form.Item label="任务主题" name="taskSubject">
            <Input
              placeholder={`例如：${assistantDefaults?.taskSubject || assistantDefaults?.subjectHint || '湿制程材料方案'}`}
            />
          </Form.Item>

          <Form.Item
            label="任务输入"
            name="taskInput"
            rules={[{ required: true, message: '请输入任务输入' }]}
          >
            <TextArea
              placeholder={assistantDefaults?.analyzeTaskInput || '请输入你想让平台判断的问题、原始描述或待处理事项'}
              rows={6}
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item label="补充上下文" name="context">
            <TextArea
              placeholder={assistantDefaults?.analyzeContext || '可填写背景、约束条件、已有事实或内部备注'}
              rows={4}
            />
          </Form.Item>

          <Space wrap>
            <Button type="primary" onClick={handleSubmit} loading={loading}>
              开始判断
            </Button>
            <Button onClick={handleReset}>清空</Button>
            <Button onClick={handleFillExample}>载入示例</Button>
          </Space>
        </Form>
      </Card>

      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          <Spin spinning={loading}>
          {adapterPreview ? (
            <ClientAdapterPreviewCard
              clientType={lastResponseClientType}
              response={adapterPreview}
              note="这份预览用于联调渠道适配效果，便于直接确认飞书卡片结构是否符合预期。"
            />
          ) : (
            <>
          <ResultCard title="脱敏后的任务输入">
            <p>{sanitizedAnalyzeTextLabel}</p>
          </ResultCard>

          <ResultCard title="需求摘要">
            <p>{summaryLabel}</p>
          </ResultCard>

          <ResultCard title="场景判断">
            <p>{sceneJudgementLabel}</p>
          </ResultCard>

          <ResultCard title="建议主题 / 可延展方向">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {recommendedProductsList.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            {!recommendedProductsList.length ? (
              <p style={{ marginTop: 12, marginBottom: 0, color: '#8c8c8c' }}>
                当前未返回建议主题。
              </p>
            ) : null}
          </ResultCard>

          <ResultCard title="待确认问题">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {followupQuestionsList.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            {!followupQuestionsList.length ? (
              <p style={{ marginTop: 12, marginBottom: 0, color: '#8c8c8c' }}>
                当前未返回追问问题。
              </p>
            ) : null}
          </ResultCard>

          <ResultCard title="风险提示">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {riskNotesList.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            {!riskNotesList.length ? (
              <p style={{ marginTop: 12, marginBottom: 0, color: '#8c8c8c' }}>
                当前未返回风险提示。
              </p>
            ) : null}
          </ResultCard>

          <ResultCard title="下一步建议">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {nextActionsList.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
            {!nextActionsList.length ? (
              <p style={{ marginTop: 12, marginBottom: 0, color: '#8c8c8c' }}>
                当前未返回下一步建议。
              </p>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <Space>
                <Button
                  size="small"
                  onClick={() =>
                    navigate('/retrieve', {
                      state: buildContinueNavigationState({
                        continueContext: analyzeContinueContext,
                        carryPayload: {
                          taskObject: form.getFieldValue('taskObject'),
                          industryType: form.getFieldValue('industryType'),
                          taskPhase: form.getFieldValue('taskPhase'),
                          taskSubject: form.getFieldValue('taskSubject'),
                          taskInput: form.getFieldValue('taskInput'),
                          context: form.getFieldValue('context'),
                        },
                      }),
                    })
                  }
                >
                  带入资料检索
                </Button>

                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    navigate('/compose', {
                      state: buildContinueNavigationState({
                        continueContext: analyzeContinueContext,
                        carryPayload: {
                          industryType: form.getFieldValue('industryType'),
                          taskPhase: form.getFieldValue('taskPhase'),
                          goal: '输出专业说明',
                          taskSubject: form.getFieldValue('taskSubject'),
                          taskInput: form.getFieldValue('taskInput'),
                          context:
                            analyzeResult?.summary ||
                            form.getFieldValue('context'),
                          focusPoints: (analyzeResult?.riskNotes || []).join('；'),
                        },
                      }),
                    })
                  }
                >
                  带入参考写作
                </Button>
              </Space>
            </div>
          </ResultCard>

          <ResultCard title="解释区 / 留痕区">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                这里集中展示本次判断链路的执行上下文、执行信息与模型口径，供联调 / QA / 追溯查看；主视图优先看顶部“本次真实生效摘要”和上面的业务结果区。
              </div>

              <Card size="small" title="执行上下文" style={{ borderRadius: 12 }}>
                <p>
                  <strong>sessionId：</strong>
                  {effectiveSessionId || '未返回'}
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
              </Card>

              <Card size="small" title="执行信息" style={{ borderRadius: 12 }}>
                <p>
                  <strong>判断路线：</strong>
                  {analysisRouteLabel}
                </p>
                <p>
                  <strong>模块策略：</strong>
                  {analyzeStrategyLabel}
                </p>
                <p>
                  <strong>执行策略：</strong>
                  {analyzeExecutionStrategyLabel}
                </p>
                <p>
                  <strong>是否允许出网：</strong>
                  {outboundAllowedLabel}
                </p>
                <p>
                  <strong>出网判定原因：</strong>
                  {outboundReasonLabel}
                </p>
              </Card>

              <Card size="small" title="模型口径" style={{ borderRadius: 12 }}>
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
                <p>
                  <strong>失败类型：</strong>
                  {analyzeFailureTypeLabel}
                </p>
              </Card>
            </Space>
          </ResultCard>
            </>
          )}
          </Spin>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="判断结果">
            <p style={{ margin: 0, color: '#8c8c8c' }}>
              请填写信息并点击开始判断。若从其他模块继续进入，本页会优先通过 `sessionId + stepId` 回查上下文。
            </p>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default AnalyzePage;
