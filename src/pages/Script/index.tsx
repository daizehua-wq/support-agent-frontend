import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Spin, Tag, message } from 'antd';

import AgentClientStatusBadge from '../../components/common/AgentClientStatusBadge';
import ClientAdapterPreviewCard from '../../components/common/ClientAdapterPreviewCard';
import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import ResolvedSummaryCard from '../../components/card/ResolvedSummaryCard';
import type { ExecutionContext } from '../../api/settings';

import {
  composeDocument,
  getSessionDetail,
  type AgentAdapterResponse,
  type AgentClientType,
  type GenerateScriptResponse,
  type RuntimeSnapshot,
  type SessionDetailRecord,
  type SessionEvidenceRecord,
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
  findEvidenceById,
  findLatestStepByType,
  findPreferredStep,
  getAnalyzeOutputRecord,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  mergeContinueContexts,
  mergeTaskSeeds,
  parseContinueContext,
  readString,
  readStringArray,
} from '../../utils/sessionResume';

const { TextArea } = Input;

const stageOptions = [
  { label: '启动评估', value: 'initial_contact' },
  { label: '需求沟通', value: 'requirement_discussion' },
  { label: '执行推进', value: 'sample_followup' },
  { label: '定稿确认', value: 'quotation' },
  { label: '其他', value: 'other' },
];

const goalOptions = [
  { label: '形成初版说明', value: '形成初版说明', scene: 'first_reply' },
  { label: '推进后续事项', value: '推进后续事项', scene: 'sample_followup' },
  { label: '输出专业说明', value: '输出专业说明', scene: 'technical_reply' },
  { label: '重新发起事项', value: '重新发起事项', scene: 'reactivate' },
];

const toneOptions = [
  { label: '正式', value: 'formal' },
  { label: '简洁', value: 'concise' },
  { label: '口语', value: 'spoken' },
];

const exampleValues = {
  audience: '老板汇报 / 跨部门沟通',
  taskPhase: 'requirement_discussion',
  goal: '输出专业说明',
  taskSubject: '合同风险说明',
  focusPoints: '责任边界、付款节点、汇报口径',
  taskInput: '请基于合同审阅结果，整理一版给老板汇报的风险说明初稿。',
  context: '重点说明高风险条款、建议修改方向和本周是否建议签署。',
  toneStyle: 'formal',
};

type ScriptResultData = NonNullable<GenerateScriptResponse['data']>;

type ScriptExecutionContext = ExecutionContext &
  Record<string, unknown> & {
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  databaseRelationSource?: unknown;
};

type ScriptNavigationState = ReturnType<typeof parseContinueContext>;

type MaterialContext = {
  evidenceId?: string;
  sourceDocId?: string;
  sourceDocName?: string;
  sourceDocType?: string;
  sourceApplicableScene?: string;
  sourceExternalAvailable?: boolean;
  referenceSummary?: string;
  sourceType?: string;
  sourceRef?: string;
};

function formatScriptDisplayText(value: unknown) {
  if (value === undefined || value === null || value === '') return '未返回';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
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
      'module.script.prompt': 'Script 模块 Prompt',
      'module.script.promptVersion': 'Script 模块 PromptVersion',
      'module.prompt': '模块 Prompt',
      'module.promptVersion': '模块 PromptVersion',
      'module.strategy': '模块策略',
      'module-strategy': '模块策略',
      'settings.strategy.scriptStrategy': 'Script 模块策略',
      'settings.default-model': '系统默认模型',
      'module-binding': '模块绑定',
      none: '未返回',
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

  return formatScriptDisplayText(value);
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
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
      .map(([key, entryValue]) => {
        const label = labelMap[key] || key;
        const displayValue = fallbackMap[String(entryValue)] || String(entryValue);
        return `${label}：${displayValue}`;
      });

    return entries.length ? entries.join('；') : '未触发';
  }

  return formatScriptDisplayText(value);
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

  return formatScriptDisplayText(value);
}

const buildMaterialContextFromEvidence = (
  evidence?: SessionEvidenceRecord | null,
): MaterialContext | null => {
  if (!evidence) {
    return null;
  }

  return {
    evidenceId: evidence.evidenceId,
    sourceDocId: evidence.sourceRef,
    sourceDocName: evidence.title,
    sourceDocType: evidence.docType,
    sourceApplicableScene: evidence.applicableScene,
    sourceExternalAvailable: evidence.outboundStatus === 'allowed',
    referenceSummary: evidence.summary ? `${evidence.title || ''}：${evidence.summary}` : evidence.title,
    sourceType: evidence.sourceType,
    sourceRef: evidence.sourceRef,
  };
};

const buildMaterialContextFromNavigationState = (
  state?: ScriptNavigationState | null,
): MaterialContext | null => {
  if (!state?.evidenceId) {
    return null;
  }

  return {
    evidenceId: state.evidenceId,
  };
};

const resolveGoalScene = (value?: string) => {
  if (value === 'first_reply' || value === '形成初版说明') return 'first_reply';
  if (value === 'sample_followup' || value === '推进后续事项') return 'sample_followup';
  if (value === 'technical_reply' || value === '输出专业说明') return 'technical_reply';
  if (value === 'reactivate' || value === '重新发起事项') return 'reactivate';
  return '';
};

const normalizeGoalValue = (value?: string) => {
  const scene = resolveGoalScene(value);
  if (scene === 'first_reply') return '形成初版说明';
  if (scene === 'sample_followup') return '推进后续事项';
  if (scene === 'technical_reply') return '输出专业说明';
  if (scene === 'reactivate') return '重新发起事项';
  return value || undefined;
};

const getGoalLabel = (value?: string) => {
  return normalizeGoalValue(value) || '未返回';
};

const getOutputTypeLabel = ({
  goal,
  fromModule,
}: {
  goal?: string;
  fromModule?: string;
}) => {
  const goalScene = resolveGoalScene(goal);
  if (goalScene === 'technical_reply') return '专业说明输出';
  if (goalScene === 'sample_followup') return '后续推进输出';
  if (goalScene === 'reactivate') return '重启事项输出';
  if (fromModule === 'search') return '资料承接输出';
  if (fromModule === 'session-detail') return '会话恢复输出';
  return '参考写作输出';
};

const buildOutputTitle = ({
  taskSubject,
  goal,
}: {
  taskSubject?: string;
  goal?: string;
}) => {
  const goalLabel = getGoalLabel(goal);
  if (taskSubject) {
    return `${taskSubject}｜${goalLabel}`;
  }
  return `参考写作结果｜${goalLabel}`;
};

const buildScriptGuide = ({
  goal,
  taskPhase,
  materialContext,
}: {
  goal?: string;
  taskPhase?: string;
  materialContext?: MaterialContext | null;
}) => {
  const goalScene = resolveGoalScene(goal);
  const baseGuide = {
    recommendedVersion: '正式版',
    usageAdvice: '建议先使用正式版对外发送，确保表达清晰、边界稳妥。',
    nextAction: '发送文稿后，继续确认对象反馈、关注点和下一步动作。',
    materialNote:
      materialContext?.sourceExternalAvailable === false
        ? '当前带入资料为内部参考，建议只提炼可说结论，不直接对外转发原资料。'
        : materialContext?.sourceExternalAvailable === true
          ? '当前带入资料可外发，可结合正式版文稿一起发送。'
          : '当前未返回资料外发状态，建议先按稳妥口径使用。',
  };

  if (goalScene === 'technical_reply') {
    return {
      ...baseGuide,
      recommendedVersion: '正式版',
      usageAdvice: '当前更适合先发正式版，结合资料结论做专业说明，再继续补充必要条件。',
      nextAction:
        taskPhase === 'requirement_discussion'
          ? '先发资料说明，再补充关键指标、约束条件和执行计划。'
          : '先回复专业说明，再确认是否需要进入进一步协同。',
    };
  }

  if (goalScene === 'sample_followup') {
    return {
      ...baseGuide,
      recommendedVersion: '简洁版',
      usageAdvice: '当前更适合先发简洁版，快速推动样品、测试安排和时间节点确认。',
      nextAction: '发出文稿后，继续确认时间节点、执行条件和协同安排。',
    };
  }

  if (goalScene === 'reactivate') {
    return {
      ...baseGuide,
      recommendedVersion: '口语版',
      usageAdvice: '当前更适合先用口语版重新建立沟通，再逐步带回正式资料和下一步动作。',
      nextAction: '先恢复沟通，再判断是否需要补资料、补背景或重新进入协同推进。',
    };
  }

  return baseGuide;
};

function ScriptPage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientType] = useRememberedAgentClientType();
  const [lastResponseClientType, setLastResponseClientType] = useState<AgentClientType>('web');
  const [adapterPreview, setAdapterPreview] = useState<AgentAdapterResponse | null>(null);
  const [scriptResult, setScriptResult] = useState<ScriptResultData | null>(null);
  const [scriptRuntime, setScriptRuntime] = useState<RuntimeSnapshot | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [carriedSource, setCarriedSource] = useState<ScriptNavigationState | null>(null);
  const [resumeDetail, setResumeDetail] = useState<SessionDetailRecord | null>(null);
  const [resolvedEvidence, setResolvedEvidence] = useState<SessionEvidenceRecord | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const currentGoal = Form.useWatch('goal', form);
  const currentTaskPhase = Form.useWatch('taskPhase', form);
  const sourceStep = useMemo(
    () =>
      findPreferredStep({
        detail: resumeDetail,
        stepId: carriedSource?.stepId,
        preferredTypes: ['script', 'search', 'analyze'],
      }),
    [carriedSource?.stepId, resumeDetail],
  );
  const sourceStepInputPayload = useMemo(
    () => getStepInputPayload(sourceStep),
    [sourceStep],
  );
  const analyzeSourceStep = useMemo(
    () =>
      sourceStep?.stepType === 'analyze'
        ? sourceStep
        : findLatestStepByType(resumeDetail, 'analyze'),
    [resumeDetail, sourceStep],
  );
  const analyzeSourceInputPayload = useMemo(
    () => getStepInputPayload(analyzeSourceStep),
    [analyzeSourceStep],
  );
  const analyzeSourceOutputRecord = useMemo(
    () => getAnalyzeOutputRecord(analyzeSourceStep),
    [analyzeSourceStep],
  );
  const sourceTaskSeed = useMemo(
    () =>
      mergeTaskSeeds(
        buildTaskSeedFromPayload(sourceStepInputPayload),
        buildTaskSeedFromPayload(analyzeSourceInputPayload),
        buildTaskSeedFromPayload(resumeDetail?.session || null),
      ),
    [analyzeSourceInputPayload, resumeDetail?.session, sourceStepInputPayload],
  );

  const effectiveSessionId = scriptRuntime?.sessionId || carriedSource?.sessionId || '';
  const effectiveAssistantId =
    scriptRuntime?.assistantId ||
    carriedSource?.assistantId ||
    getStepAssistantId(sourceStep) ||
    getStepAssistantId(analyzeSourceStep) ||
    resumeDetail?.session.assistantId ||
    '';
  const effectiveExecutionContext =
    (scriptRuntime?.executionContext ||
      scriptRuntime?.executionContextSummary ||
      carriedSource?.executionContext ||
      carriedSource?.executionContextSummary ||
      getStepExecutionContext(sourceStep) ||
      getStepExecutionContext(analyzeSourceStep) ||
      getSessionExecutionContext(resumeDetail) ||
      null) as
      | ScriptExecutionContext
      | null;
  const materialContext = useMemo<MaterialContext | null>(() => {
    const evidenceContext = buildMaterialContextFromEvidence(resolvedEvidence);

    if (evidenceContext) {
      return evidenceContext;
    }

    if (scriptResult?.sourceDocName || scriptResult?.referenceSummary || scriptResult?.evidenceId) {
      return {
        evidenceId: scriptResult?.evidenceId,
        sourceDocId: scriptResult?.sourceDocId,
        sourceDocName: scriptResult?.sourceDocName,
        sourceDocType: scriptResult?.sourceDocType,
        sourceApplicableScene: scriptResult?.sourceApplicableScene,
        sourceExternalAvailable: scriptResult?.sourceExternalAvailable,
        referenceSummary: scriptResult?.referenceSummary,
      };
    }

    return buildMaterialContextFromNavigationState(carriedSource);
  }, [carriedSource, resolvedEvidence, scriptResult]);
  const selectedEvidenceId =
    resolvedEvidence?.evidenceId ||
    materialContext?.evidenceId ||
    carriedSource?.evidenceId ||
    '';
  const hasCarriedMaterialContext = Boolean(
    materialContext?.sourceDocName ||
      materialContext?.sourceDocType ||
      materialContext?.referenceSummary ||
      materialContext?.sourceApplicableScene ||
      materialContext?.evidenceId,
  );
  const adapterPreviewMode = isAdapterPreviewMode(clientType);


  const executionContextRows = useMemo(
    () => [
      {
        label: '规则范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.rulesScope || '未返回'),
      },
      {
        label: '产品范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.productScope || '未返回'),
      },
      {
        label: '资料范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.docScope || '未返回'),
      },
      {
        label: '判断策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.analyzeStrategy || '未返回'),
      },
      {
        label: '检索策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.searchStrategy || '未返回'),
      },
      {
        label: '写作策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.scriptStrategy || '未返回'),
      },
    ],
    [effectiveExecutionContext],
  );

  const scriptResultRecord = (scriptResult as Record<string, unknown> | null) || null;
  const executionContextSummaryRecord = scriptRuntime?.executionContextSummary || undefined;
  const governanceSummaryRecord = scriptRuntime?.governanceSummary || undefined;

  const effectivePromptId = formatScriptDisplayText(
    effectiveExecutionContext?.promptId ||
      readStringValue(executionContextSummaryRecord?.promptId) ||
      readStringValue(governanceSummaryRecord?.promptId),
  );
  const effectivePromptVersion = formatScriptDisplayText(
    effectiveExecutionContext?.promptVersion ||
      readStringValue(executionContextSummaryRecord?.promptVersion) ||
      readStringValue(governanceSummaryRecord?.promptVersion),
  );
  const effectiveStrategyId = formatScriptDisplayText(
    effectiveExecutionContext?.strategyId ||
      readStringValue(executionContextSummaryRecord?.strategyId) ||
      readStringValue(governanceSummaryRecord?.strategyId) ||
      effectiveExecutionContext?.scriptStrategy ||
      scriptResult?.scriptStrategy,
  );
  const effectiveSourceSummary = formatSourceSummary(effectiveExecutionContext?.source);
  const effectiveFallbackSummary = formatFallbackSummary(effectiveExecutionContext?.fallbackReason);
  const databaseRelationSummaryLabel = formatDatabaseRelationSummary(
    scriptRuntime?.databaseRelationSummary ||
      (scriptResultRecord?.databaseRelationSummary as unknown) ||
      (scriptResultRecord?.databaseSummary as unknown) ||
      (scriptResultRecord?.databaseRelation as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSummary as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSource as unknown) ||
      (governanceSummaryRecord?.databaseRelationSummary as unknown) ||
      (governanceSummaryRecord?.databaseRelationSource as unknown) ||
      effectiveExecutionContext?.databaseRelationSource,
  );
  const shouldShowRuntimeSummary = Boolean(
    resultVisible || scriptRuntime || effectiveExecutionContext || sourceStep || analyzeSourceStep,
  );

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const fallbackMaterialContext = buildMaterialContextFromNavigationState(carriedSource);
      const payload = {
        audience: values.audience || '',
        sessionId: effectiveSessionId,
        fromModule: carriedSource?.fromModule || 'manual',
        assistantId: effectiveAssistantId,
        executionContext: effectiveExecutionContext || undefined,
        evidenceId: selectedEvidenceId || undefined,
        taskPhase: values.taskPhase || 'other',
        goal: values.goal || '形成初版说明',
        goalScene: resolveGoalScene(values.goal),
        taskSubject: values.taskSubject || '',
        focusPoints: values.focusPoints || '',
        taskInput: values.taskInput || '',
        context: values.context || '',
        toneStyle: values.toneStyle || 'formal',
        industryType: resumeDetail?.session.industryType || '',
        ...(!selectedEvidenceId
          ? {
              sourceDocId: fallbackMaterialContext?.sourceDocId || '',
              sourceDocName: fallbackMaterialContext?.sourceDocName || '',
              sourceDocType: fallbackMaterialContext?.sourceDocType || '',
              sourceApplicableScene: fallbackMaterialContext?.sourceApplicableScene || '',
              sourceExternalAvailable: fallbackMaterialContext?.sourceExternalAvailable,
            }
          : {}),
      };

      try {
        const response = await composeDocument(
          {
            ...payload,
            taskInput: values.taskInput || '',
            context: values.context || '',
            goal: values.goal || '形成初版说明',
            goalScene: resolveGoalScene(values.goal),
            deliverable: '参考邮件、说明文稿或沟通草稿',
            variables: {
              audience: values.audience || '',
              taskPhase: values.taskPhase || '',
              taskSubject: values.taskSubject || '',
              focusPoints: values.focusPoints || '',
              toneStyle: values.toneStyle || 'formal',
            },
          },
          adapterPreviewMode ? { clientType } : undefined,
        );

        if (isAgentAdapterResponse(response)) {
          setLastResponseClientType(clientType);
          setAdapterPreview(response);
          setScriptResult(null);
          setScriptRuntime(null);
          setShowDebugInfo(false);
          setResultVisible(true);
          message.success(`${getAgentClientTypeLabel(clientType)} 响应预览已生成`);
          return;
        }

        if (response.success && response.data) {
          setAdapterPreview(null);
          setLastResponseClientType('web');
          setScriptResult(response.data);
          setScriptRuntime(response.runtime || null);
          if (response.data.resolvedEvidence && typeof response.data.resolvedEvidence === 'object') {
            setResolvedEvidence(response.data.resolvedEvidence as SessionEvidenceRecord);
          }
          setResultVisible(true);
          setShowDebugInfo(false);
          message.success(response.message || '生成完成');
        } else {
          message.error(response.message || '生成失败');
        }
      } catch (error) {
        console.error('参考写作真实接口调用失败：', error);
        message.error('真实接口调用失败，请查看浏览器控制台');
        setLoading(false);
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage) {
        message.warning(errorMessage);
      } else {
        message.warning('请先补充必填信息');
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
    setScriptResult(null);
    setScriptRuntime(null);
    setShowDebugInfo(false);
    setCarriedSource(null);
    setResumeDetail(null);
    setResolvedEvidence(null);
  };

  const handleFillExample = () => {
    form.setFieldsValue(exampleValues);
  };

  useEffect(() => {
    const state = parseContinueContext(location.state) as ScriptNavigationState | null;

    setCarriedSource(state);
    setResultVisible(false);
    setAdapterPreview(null);
    setScriptResult(null);
    setScriptRuntime(null);
    setResumeDetail(null);
    setResolvedEvidence(null);
  }, [location.state]);

  useEffect(() => {
    const navigationSeed = buildTaskSeedFromPayload(location.state);

    if (!Object.keys(navigationSeed).length) {
      return;
    }

    form.setFieldsValue({
      audience: navigationSeed.audience || undefined,
      taskPhase: navigationSeed.taskPhase || undefined,
      goal:
        normalizeGoalValue(
          navigationSeed.goal,
        ) ||
        undefined,
      taskSubject: navigationSeed.taskSubject || undefined,
      focusPoints: navigationSeed.focusPoints || undefined,
      taskInput: navigationSeed.taskInput || undefined,
      context: navigationSeed.context || undefined,
      toneStyle: navigationSeed.toneStyle || undefined,
    });
  }, [form, location.state]);

  useEffect(() => {
    let cancelled = false;

    const loadResumeDetail = async () => {
      if (!carriedSource?.sessionId) {
        setResumeDetail(null);
        setResolvedEvidence(null);
        return;
      }

      const response = await getSessionDetail(carriedSource.sessionId);
      const detail = response.data || null;
      const fallbackEvidence =
        findEvidenceById(detail, carriedSource.evidenceId) ||
        detail?.evidences?.find((item) => item.isPrimaryEvidence) ||
        detail?.evidences?.[0] ||
        null;

      if (!cancelled) {
        setResumeDetail(detail);
        setResolvedEvidence(fallbackEvidence);
      }
    };

    loadResumeDetail().catch((error) => {
      console.error('Script 恢复上下文加载失败：', error);
      if (!cancelled) {
        setResumeDetail(null);
        setResolvedEvidence(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [carriedSource?.evidenceId, carriedSource?.sessionId]);

  useEffect(() => {
    if (!carriedSource?.sessionId && !sourceStep && !resolvedEvidence) {
      return;
    }

    const inferredGoal =
      normalizeGoalValue(sourceTaskSeed.goal) ||
      (resolvedEvidence?.docType === '规格书' || resolvedEvidence?.docType === '方案资料'
        ? '输出专业说明'
        : '形成初版说明');

    form.setFieldsValue({
      audience: sourceTaskSeed.audience || undefined,
      taskPhase: sourceTaskSeed.taskPhase || undefined,
      goal: inferredGoal,
      taskSubject:
        sourceTaskSeed.taskSubject ||
        resolvedEvidence?.productName ||
        resolvedEvidence?.title ||
        undefined,
      focusPoints: sourceTaskSeed.focusPoints || undefined,
      taskInput:
        sourceTaskSeed.taskInput ||
        (resolvedEvidence?.title ? `先给我你们的${resolvedEvidence.title}相关资料。` : undefined),
      context:
        sourceTaskSeed.context ||
        (resolvedEvidence?.summary
          ? `${resolvedEvidence.title || ''}：${resolvedEvidence.summary}`
          : resolvedEvidence?.title || readString(analyzeSourceOutputRecord?.summary) || undefined),
      toneStyle: sourceTaskSeed.toneStyle || undefined,
    });
  }, [
    analyzeSourceOutputRecord,
    carriedSource?.sessionId,
    form,
    resolvedEvidence,
    resumeDetail,
    sourceStep,
    sourceTaskSeed,
  ]);

  const scriptRouteLabel = scriptResult?.llmRoute || '未返回';
  const scriptStrategyLabel = scriptResult?.scriptStrategy || '未返回';
  const scriptExecutionStrategyLabel = scriptResult?.scriptExecutionStrategy || '未返回';

  const resolvedModelInfo =
    (scriptResult as
      | (ScriptResultData & {
          resolvedModel?: {
            id?: string;
            label?: string;
            provider?: string;
            modelName?: string;
            baseUrl?: string;
            module?: string;
            source?: string;
            resolvedModelId?: string;
            resolvedProvider?: string;
            resolvedModelName?: string;
            resolvedBaseUrl?: string;
            moduleName?: string;
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
      } / ${resolvedModelInfo.provider || resolvedModelInfo.resolvedProvider || 'unknown'} / ${
        resolvedModelInfo.modelName || resolvedModelInfo.resolvedModelName || '未返回模型名'
      }`
    : '未返回';

  const resolvedModelSourceLabel = resolvedModelInfo?.source || '未返回';
  const resolvedModelModuleLabel =
    resolvedModelInfo?.module || resolvedModelInfo?.moduleName || '未返回';
  const scriptFailureTypeLabel =
    ((scriptResult as (ScriptResultData & { failureType?: string }) | null)?.failureType as
      | string
      | undefined) || '未返回';
  const outboundAllowedLabel =
    scriptResult?.outboundAllowed === undefined
      ? '未返回'
      : scriptResult.outboundAllowed
        ? '允许'
        : '不允许';
  const outboundReasonLabel = scriptResult?.outboundReason || '未返回';
  const sanitizedTaskInputLabel =
    scriptResult?.sanitizedTaskInput ||
    scriptResult?.sanitizedCustomerText ||
    '当前未返回脱敏后的任务输入';
  const sanitizedReferenceSummaryLabel =
    scriptResult?.sanitizedReferenceSummary || '当前未返回脱敏后的资料摘要';

  const scriptGuide = buildScriptGuide({
    goal: currentGoal,
    taskPhase: currentTaskPhase,
    materialContext,
  });
  const goalLabel = getGoalLabel(currentGoal);

  const runtimeVersionLabel = resolvedModelLabel || '未返回';
  const currentScriptStepId =
    scriptRuntime?.stepId || scriptResult?.stepId || sourceStep?.id || analyzeSourceStep?.id || '';
  const scriptContinueContext = mergeContinueContexts(
    {
      sessionId: effectiveSessionId,
      stepId: currentScriptStepId || undefined,
      fromModule: 'output',
      assistantId: effectiveAssistantId || undefined,
      executionContext: effectiveExecutionContext || undefined,
    },
    scriptRuntime?.continuePayload || null,
    carriedSource,
  );
  const analyzeSummary = readString(analyzeSourceOutputRecord?.summary) || '未返回';
  const analyzeSceneJudgement = readString(analyzeSourceOutputRecord?.sceneJudgement) || '未返回';
  const analyzeRiskNotes = readStringArray(analyzeSourceOutputRecord?.riskNotes);
  const analyzeNextActions = readStringArray(analyzeSourceOutputRecord?.nextActions);
  const analyzeNextStepType = readString(analyzeSourceOutputRecord?.nextStepType) || '未返回';

  const outputTypeLabel = getOutputTypeLabel({
    goal: currentGoal,
    fromModule: carriedSource?.fromModule,
  });

  const outputTitle = buildOutputTitle({
    taskSubject:
      form.getFieldValue('taskSubject') ||
      sourceTaskSeed.taskSubject ||
      resolvedEvidence?.productName ||
      resolvedEvidence?.title,
    goal: currentGoal,
  });

  const oneLineConclusion =
    scriptResult?.conciseVersion ||
    materialContext?.referenceSummary ||
    '当前未形成一句话结论。';

  const analyzeEvidenceRows = [
    {
      label: 'Analyze 摘要',
      value: analyzeSummary,
    },
    {
      label: '场景判断',
      value: analyzeSceneJudgement,
    },
    {
      label: '适用对象',
      value: form.getFieldValue('audience') || resumeDetail?.session.audience || '未返回',
    },
    {
      label: '当前阶段',
      value: form.getFieldValue('taskPhase') || resumeDetail?.session.currentStage || '未返回',
    },
    {
      label: '任务主题',
      value:
        form.getFieldValue('taskSubject') ||
        sourceTaskSeed.taskSubject ||
        resolvedEvidence?.productName ||
        resolvedEvidence?.title ||
        '未返回',
    },
    {
      label: '任务输入',
      value:
        form.getFieldValue('taskInput') ||
        sourceTaskSeed.taskInput ||
        '未返回',
    },
  ];

  const searchEvidenceRows = [
    {
      label: '证据 ID',
      value: materialContext?.evidenceId || '未返回',
    },
    {
      label: '资料名称',
      value: materialContext?.sourceDocName || '未返回',
    },
    {
      label: '资料类型',
      value: materialContext?.sourceDocType || '未返回',
    },
    {
      label: '适用场景',
      value: materialContext?.sourceApplicableScene || '未返回',
    },
    {
      label: '资料摘要',
      value: form.getFieldValue('context') || materialContext?.referenceSummary || '未返回',
    },
    {
      label: '资料外发状态',
      value:
        materialContext?.sourceExternalAvailable === undefined
          ? '未返回'
          : materialContext.sourceExternalAvailable
            ? '可外发'
            : '仅内部参考',
    },
  ];

  const riskRows = [
    {
      label: '当前沟通风险',
      value: analyzeRiskNotes[0] || scriptResult?.cautionNotes?.[0] || '当前未返回明确沟通风险。',
    },
    {
      label: '当前不可承诺内容',
      value:
        outboundAllowedLabel === '不允许'
          ? outboundReasonLabel
          : '当前未返回明确不可承诺项。',
    },
    {
      label: '当前仍需确认信息',
      value: analyzeRiskNotes[1] || scriptGuide.nextAction,
    },
    {
      label: '外发限制',
      value: `${outboundAllowedLabel} / ${outboundReasonLabel}`,
    },
  ];

  const handleCopyText = async (text: string, successMessage: string) => {
    if (!text) {
      message.warning('当前没有可复制内容');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      message.success(successMessage);
    } catch {
      message.error('复制失败，请稍后重试');
    }
  };

  return (
    <div>
      <PageHeader
        title="参考写作"
        description="输入任务与资料背景，快速生成参考邮件、说明文稿或沟通草案，并承接本次真实生效摘要。"
        extra={<AgentClientStatusBadge clientType={clientType} />}
      />

      {!carriedSource?.sessionId && !scriptRuntime?.sessionId ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="当前未接到 sessionId"
          description="本次参考写作仍可执行，但 continue 链路和跨页面上下文连续性可能不完整。"
        />
      ) : null}

      {selectedEvidenceId ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={`当前已绑定 evidenceId：${selectedEvidenceId}`}
          description="写作链路会优先按 Session 中已持久化的一级证据回查资料上下文，而不是依赖页面临时带入的 doc/ref 字段。"
        />
      ) : null}

      {hasCarriedMaterialContext ? (
        <ResultCard title="已带入资料信息">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <Card size="small" title="来源模块">
              <p style={{ marginBottom: 0 }}>
                {carriedSource?.fromModule === 'search'
                  ? '资料检索'
                  : carriedSource?.fromModule === 'session-detail'
                    ? '会话详情继续生成'
                    : carriedSource?.fromModule || '未返回'}
              </p>
            </Card>
            <Card size="small" title="当前会话 ID">
              <p style={{ marginBottom: 0 }}>{effectiveSessionId || '未返回'}</p>
            </Card>
            <Card size="small" title="证据 ID">
              <p style={{ marginBottom: 0 }}>{materialContext?.evidenceId || '未返回'}</p>
            </Card>
            <Card size="small" title="资料名称">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceDocName || '未返回'}</p>
            </Card>
            <Card size="small" title="资料类型">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceDocType || '未返回'}</p>
            </Card>
            <Card size="small" title="适用场景">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceApplicableScene || '未返回'}</p>
            </Card>
            <Card size="small" title="资料外发状态">
              <p style={{ marginBottom: 0 }}>
                {materialContext?.sourceExternalAvailable === undefined
                  ? '未返回'
                  : materialContext?.sourceExternalAvailable
                    ? '可外发'
                    : '仅内部参考'}
              </p>
            </Card>
            <Card size="small" title="参考资料摘要">
              <p style={{ marginBottom: 0 }}>{materialContext?.referenceSummary || '未返回'}</p>
            </Card>
          </div>
        </ResultCard>
      ) : null}

      <Card style={{ borderRadius: 12 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            goal: '形成初版说明',
            toneStyle: 'formal',
            taskPhase: 'other',
            audience: '通用任务',
          }}
        >
          <Form.Item label="适用对象" name="audience">
            <Input placeholder="例如：老板汇报、客户邮件、法务说明" />
          </Form.Item>

          <Form.Item label="任务阶段" name="taskPhase">
            <Select placeholder="请选择任务阶段" options={stageOptions} />
          </Form.Item>

          <Form.Item
            label="写作目标"
            name="goal"
            rules={[{ required: true, message: '请选择写作目标' }]}
          >
            <Select placeholder="请选择写作目标" options={goalOptions} />
          </Form.Item>

          <Form.Item label="任务主题" name="taskSubject">
            <Input placeholder="例如：合同条款、方案说明、双氧水体系蚀刻液" />
          </Form.Item>

          <Form.Item label="重点关注" name="focusPoints">
            <TextArea placeholder="例如：风险、成本、稳定性、边界条件" rows={3} />
          </Form.Item>

          <Form.Item
            label="任务输入"
            name="taskInput"
            rules={[{ required: true, message: '请输入任务输入' }]}
          >
            <TextArea placeholder="请输入要转成文稿的原始描述、问题或待回复内容" rows={5} />
          </Form.Item>

          <Form.Item
            label="参考资料 / 背景摘要"
            name="context"
            extra={selectedEvidenceId ? '当前已绑定 evidenceId，提交时会优先以 Session 证据中的摘要为准。' : undefined}
          >
            <TextArea placeholder="可填写资料摘要、事实依据或背景说明" rows={4} />
          </Form.Item>

          <Form.Item
            label="表达风格"
            name="toneStyle"
            rules={[{ required: true, message: '请选择表达风格' }]}
          >
            <Select placeholder="请选择表达风格" options={toneOptions} />
          </Form.Item>

          <Space wrap>
            <Button type="primary" onClick={handleGenerate} loading={loading}>
              生成参考文稿
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
                        {scriptFailureTypeLabel}
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
            <ResultCard title="页面头部">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <Card size="small" title="页面标题">
                  <p style={{ marginBottom: 0 }}>参考写作结果</p>
                </Card>
                <Card size="small" title="sessionId">
                  <p style={{ marginBottom: 0 }}>{effectiveSessionId || '未返回'}</p>
                </Card>
                <Card size="small" title="assistantId">
                  <p style={{ marginBottom: 0 }}>{effectiveAssistantId || '未返回'}</p>
                </Card>
                <Card size="small" title="fromModule">
                  <p style={{ marginBottom: 0 }}>{carriedSource?.fromModule || 'manual'}</p>
                </Card>
                <Card size="small" title="outputType">
                  <p style={{ marginBottom: 0 }}>{outputTypeLabel}</p>
                </Card>
              </div>
            </ResultCard>

            <ResultCard title="输出结论区">
              <p style={{ marginBottom: 8 }}>
                <strong>当前输出标题：</strong>
                {outputTitle}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>一句话结论：</strong>
                {oneLineConclusion}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>当前输出目标：</strong>
                {goalLabel}
              </p>
              <Space wrap>
                <Tag color="blue">{outputTypeLabel}</Tag>
                <Tag color="purple">assistant：{effectiveAssistantId || '未返回'}</Tag>
                <Tag color="green">建议优先使用：{scriptGuide.recommendedVersion}</Tag>
              </Space>
            </ResultCard>

            <ResultCard title="关键依据区">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 16,
                }}
              >
                <Card size="small" title="判断依据">
                  {analyzeEvidenceRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                </Card>
                <Card size="small" title="检索依据">
                  {searchEvidenceRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                </Card>
                <Card size="small" title="上下文依据">
                  <p style={{ marginBottom: 8 }}>
                    <strong>sessionId：</strong>
                    {effectiveSessionId || '未返回'}
                  </p>
                  {executionContextRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                  <p style={{ marginBottom: 8 }}>
                    <strong>模型路线：</strong>
                    {scriptRouteLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>执行策略：</strong>
                    {scriptExecutionStrategyLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>resolvedModel：</strong>
                    {resolvedModelLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>来源：</strong>
                    {resolvedModelSourceLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>模块：</strong>
                    {resolvedModelModuleLabel}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>失败类型：</strong>
                    {scriptFailureTypeLabel}
                  </p>
                </Card>
              </div>
            </ResultCard>

            <ResultCard title="风险提醒区">
              {riskRows.map((item) => (
                <p key={item.label} style={{ marginBottom: 8 }}>
                  <strong>{item.label}：</strong>
                  {item.value}
                </p>
              ))}
              {scriptResult?.cautionNotes?.length ? (
                <ul style={{ marginTop: 12, paddingLeft: 20 }}>
                  {scriptResult.cautionNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </ResultCard>

            <ResultCard title="下一步动作区">
              <p style={{ marginBottom: 8 }}>
                <strong>推荐下一步动作：</strong>
                {analyzeNextActions[0] || scriptGuide.nextAction}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>建议进入链路：</strong>
                {resolveGoalScene(currentGoal) === 'technical_reply'
                  ? '优先继续检索 / 判断'
                  : resolveGoalScene(currentGoal) === 'sample_followup'
                    ? '优先继续写作 / 后续推进'
                    : '优先继续判断 / 写作'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>判断链下一步建议：</strong>
                {analyzeNextActions.length ? analyzeNextActions.join('；') : '未返回'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>判断链推荐类型：</strong>
                {analyzeNextStepType}
              </p>
              <Space wrap>
                <Button
                  onClick={() =>
                    navigate('/judge', {
                      state: buildContinueNavigationState({
                        continueContext: scriptContinueContext,
                      }),
                    })
                  }
                >
                  继续判断
                </Button>
                <Button
                  onClick={() =>
                    navigate('/retrieve', {
                      state: buildContinueNavigationState({
                        continueContext: scriptContinueContext,
                      }),
                    })
                  }
                >
                  继续检索
                </Button>
                <Button type="primary" onClick={handleGenerate}>
                  再生成一次
                </Button>
                <Button
                  onClick={() => {
                    if (!effectiveSessionId) {
                      message.warning('当前未接到 sessionId，无法返回 Session Detail');
                      return;
                    }

                    navigate(`/sessions/${effectiveSessionId}`);
                  }}
                >
                  返回会话详情
                </Button>
              </Space>
            </ResultCard>

            <ResultCard title="可复用输出区">
              <Card size="small" title="正式版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.formalVersion || '当前未返回正式版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.formalVersion || '', '正式版已复制')
                  }
                >
                  复制正式版
                </Button>
              </Card>
              <Card size="small" title="简洁版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.conciseVersion || '当前未返回简洁版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.conciseVersion || '', '简洁版已复制')
                  }
                >
                  复制简洁版
                </Button>
              </Card>
              <Card size="small" title="口语版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.spokenVersion || '当前未返回口语版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.spokenVersion || '', '口语版已复制')
                  }
                >
                  复制口语版
                </Button>
              </Card>

              <div style={{ marginTop: 12 }}>
                <Button type="default" size="small" onClick={() => setShowDebugInfo(!showDebugInfo)}>
                  {showDebugInfo ? '隐藏调试信息' : '查看调试信息'}
                </Button>
              </div>
            </ResultCard>

            {showDebugInfo ? (
              <>
                <ResultCard title="调试补充信息">
                  <p style={{ marginBottom: 8 }}>
                    <strong>模型路线：</strong>
                    {scriptRouteLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>模块策略：</strong>
                    {scriptStrategyLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>脱敏后的任务输入：</strong>
                    {sanitizedTaskInputLabel}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>脱敏后的资料摘要：</strong>
                    {sanitizedReferenceSummaryLabel}
                  </p>
                </ResultCard>

                <ResultCard title="调试数据">
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(scriptResult, null, 2)}
                  </pre>
                </ResultCard>
              </>
            ) : null}
              </>
            )}
          </Spin>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="参考写作结果">
            <EmptyBlock text="请填写信息并点击生成参考文稿。若从其他模块继续进入，本页会优先复用 sessionId、assistantId、executionContext 与资料上下文。" />
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default ScriptPage;
