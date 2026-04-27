import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, List, Space, Spin, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import {
  getSessionDetail,
  type SessionDetailRecord,
  type SessionStepRecord,
} from '../../api/agent';
import {
  buildContinueContext,
  buildContinueNavigationState,
  buildTaskSeedFromPayload,
  findPreferredEvidence,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  mergeTaskSeeds,
  readExecutionContextAssistantId,
  readExecutionContextPromptId,
  readExecutionContextPromptVersion,
  readExecutionContextStrategyId,
} from '../../utils/sessionResume';
import { formatDateTimeToLocalTime } from '../../utils/dateTime';

type SessionStep = SessionStepRecord;

type SessionExecutionContext = {
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  rulesScope?: string;
  productScope?: string;
  docScope?: string;
  analyzeStrategy?: string;
  searchStrategy?: string;
  scriptStrategy?: string;
};

type SessionDetailResponse = SessionDetailRecord;

const getExecutionContextFromPayload = (
  payload: Record<string, unknown> | null | undefined,
): SessionExecutionContext | undefined => {
  const value = payload?.executionContext || payload?.executionContextSummary;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (!payload) {
      return undefined;
    }

    return {
      assistantId: getExecutionContextFieldValue(payload.assistantId),
      promptId: getExecutionContextFieldValue(payload.promptId),
      promptVersion: getExecutionContextFieldValue(payload.promptVersion),
      strategyId: getExecutionContextFieldValue(payload.strategy),
    };
  }

  const context = value as Record<string, unknown>;

  return {
    assistantId:
      getExecutionContextFieldValue(payload?.assistantId) ||
      readExecutionContextAssistantId(context),
    promptId:
      getExecutionContextFieldValue(payload?.promptId) ||
      readExecutionContextPromptId(context),
    promptVersion:
      getExecutionContextFieldValue(payload?.promptVersion) ||
      readExecutionContextPromptVersion(context),
    strategyId:
      getExecutionContextFieldValue(payload?.strategy) ||
      readExecutionContextStrategyId(context),
    rulesScope: getExecutionContextFieldValue(context.rulesScope),
    productScope: getExecutionContextFieldValue(context.productScope),
    docScope: getExecutionContextFieldValue(context.docScope),
    analyzeStrategy: getExecutionContextFieldValue(context.analyzeStrategy),
    searchStrategy: getExecutionContextFieldValue(context.searchStrategy),
    scriptStrategy: getExecutionContextFieldValue(context.scriptStrategy),
  };
};

const getMergedExecutionContext = (
  step?: SessionStep | null,
  sessionExecutionContext?: Record<string, unknown> | null,
): SessionExecutionContext | undefined => {
  const sessionContext = getExecutionContextFromPayload(
    sessionExecutionContext ? { executionContext: sessionExecutionContext } : undefined,
  );

  return mergeExecutionContexts(
    getExecutionContextFromPayload(step?.inputPayload),
    getExecutionContextFromPayload(step?.outputPayload),
    sessionContext,
  );
};

const formatStepTypeLabel = (value?: string) => {
  if (value === 'analyze') return '任务判断';
  if (value === 'search') return '资料检索';
  if (value === 'script') return '参考写作';
  if (value === 'settings') return '系统设置';
  return value || '未返回';
};

const getStringFromPayload = (payload: Record<string, unknown> | null | undefined, key: string) => {
  const value = payload?.[key];
  return typeof value === 'string' ? value : '';
};

const getExecutionContextFieldValue = (
  value: unknown,
): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is string => typeof item === 'string' && Boolean(item));
    return normalized.length ? normalized.join(' / ') : undefined;
  }

  return undefined;
};

const mergeExecutionContexts = (
  ...contexts: Array<SessionExecutionContext | undefined>
): SessionExecutionContext | undefined => {
  const merged: SessionExecutionContext = {};

  contexts.forEach((context) => {
    if (!context) return;

    if (context.assistantId) merged.assistantId = context.assistantId;
    if (context.promptId) merged.promptId = context.promptId;
    if (context.promptVersion) merged.promptVersion = context.promptVersion;
    if (context.strategyId) merged.strategyId = context.strategyId;
    if (context.rulesScope) merged.rulesScope = context.rulesScope;
    if (context.productScope) merged.productScope = context.productScope;
    if (context.docScope) merged.docScope = context.docScope;
    if (context.analyzeStrategy) merged.analyzeStrategy = context.analyzeStrategy;
    if (context.searchStrategy) merged.searchStrategy = context.searchStrategy;
    if (context.scriptStrategy) merged.scriptStrategy = context.scriptStrategy;
  });

  return Object.keys(merged).length ? merged : undefined;
};

const formatBooleanLabel = (value?: boolean) => {
  if (value === true) return '允许';
  if (value === false) return '不允许';
  return '未返回';
};

type SessionResumeContext = {
  continueContext?: ReturnType<typeof buildContinueContext>;
  carryPayload?: Record<string, unknown>;
};

const hasCarryPayloadValue = (value: unknown) => {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }

  return value !== undefined && value !== null;
};

const buildEvidenceReferenceSummary = (title = '', summary = '') => {
  const normalizedTitle = title.trim();
  const normalizedSummary = summary.trim();

  if (normalizedTitle && normalizedSummary) {
    return `${normalizedTitle}：${normalizedSummary}`;
  }

  return normalizedTitle || normalizedSummary;
};

function DatailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loadIssue, setLoadIssue] = useState('');
  const latestStep = detail?.latestStep || detail?.steps?.[detail.steps.length - 1] || null;

  const loadDetail = useCallback(async () => {
    if (!id) {
      setDetail(null);
      setLoadIssue('未找到会话 ID，无法恢复会话详情。');
      return;
    }

    try {
      setLoading(true);
      const result = await getSessionDetail(id);

      if (result?.data) {
        setDetail(result.data);
        setLoadIssue('');
      } else {
        setDetail(null);
        setLoadIssue(result?.message ? `${result.message}（sessionId：${id}）` : `sessionId ${id} 未找到`);
      }
    } catch (error) {
      console.error('会话详情加载失败：', error);
      setDetail(null);
      setLoadIssue(`会话详情加载失败（sessionId：${id}），请稍后重试。`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const latestExecutionContext = useMemo(
    () => getMergedExecutionContext(latestStep, detail?.session.executionContextSummary),
    [detail?.session.executionContextSummary, latestStep],
  );

  const latestOutputStep = useMemo(
    () => detail?.steps?.slice().reverse().find((step) => step.stepType === 'script') || null,
    [detail?.steps],
  );
  const latestAnalyzeStep = useMemo(
    () => detail?.steps?.slice().reverse().find((step) => step.stepType === 'analyze') || null,
    [detail?.steps],
  );
  const latestSearchStep = useMemo(
    () => detail?.steps?.slice().reverse().find((step) => step.stepType === 'search') || null,
    [detail?.steps],
  );

  const hasAnalyzeCompleted = Boolean(detail?.steps?.some((step) => step.stepType === 'analyze'));
  const hasSearchCompleted = Boolean(detail?.steps?.some((step) => step.stepType === 'search'));
  const hasOutputCompleted = Boolean(latestOutputStep);

  const currentProgressSummary = hasOutputCompleted
    ? '当前会话已形成可复用 Output，可继续沿原 session 主线推进。'
    : hasSearchCompleted
      ? '当前会话已具备资料依据，建议继续生成 Output 或补充确认信息。'
      : hasAnalyzeCompleted
        ? '当前会话已完成初步判断，建议补充资料依据后再推进输出。'
        : '当前会话仍处于早期推进阶段，建议先完成判断。';

  const currentEvidenceStatus = hasSearchCompleted ? '当前已有关键依据' : '当前仍缺关键依据';
  const currentConfirmStatus =
    latestStep?.outboundAllowed === false
      ? '当前仍缺工艺/验证确认信息'
      : '当前无明确缺失确认项';

  const recommendedNextAction = hasOutputCompleted
    ? '优先查看当前写作结果，并决定继续判断 / 检索还是继续生成。'
    : hasSearchCompleted
      ? '优先继续写作，形成可复用输出。'
      : hasAnalyzeCompleted
        ? '优先继续检索，补齐支撑性资料与证据。'
        : '优先继续判断，形成当前判断与推进方向。';

  const recommendedNextChain = hasOutputCompleted
    ? '优先继续写作'
    : hasSearchCompleted
      ? '优先继续写作'
      : hasAnalyzeCompleted
        ? '优先继续检索'
        : '优先继续判断';

  const latestOutputTitle = latestOutputStep
    ? `${getStringFromPayload(latestOutputStep.inputPayload, 'taskSubject') || '当前输出'}｜${
        getStringFromPayload(latestOutputStep.inputPayload, 'goal') || '未返回'
      }`
    : '当前未形成 Output';

  const latestOutputConclusion = latestOutputStep
    ? getStringFromPayload(latestOutputStep.outputPayload, 'conciseVersion') ||
      getStringFromPayload(latestOutputStep.outputPayload, 'formalVersion') ||
      '当前未返回可复用输出摘要'
    : '当前未形成可复用 Output';

  const executionContextRows = useMemo(
    () => [
      {
        label: 'assistantId',
        value: latestExecutionContext?.assistantId || detail?.session.assistantId || '未返回',
      },
      {
        label: 'rulesScope',
        value: latestExecutionContext?.rulesScope || '未返回',
      },
      {
        label: 'productScope',
        value: latestExecutionContext?.productScope || '未返回',
      },
      {
        label: 'docScope',
        value: latestExecutionContext?.docScope || '未返回',
      },
      {
        label: 'analyzeStrategy',
        value: latestExecutionContext?.analyzeStrategy || '未返回',
      },
      {
        label: 'searchStrategy',
        value: latestExecutionContext?.searchStrategy || '未返回',
      },
      {
        label: 'scriptStrategy',
        value: latestExecutionContext?.scriptStrategy || '未返回',
      },
    ],
    [detail?.session.assistantId, latestExecutionContext],
  );

  const buildResumeContext = (
    target: 'analyze' | 'search' | 'script',
  ): SessionResumeContext => {
    const targetStep =
      target === 'analyze'
        ? latestAnalyzeStep || latestStep || null
        : target === 'search'
          ? latestSearchStep || latestAnalyzeStep || latestStep || null
          : latestOutputStep || latestSearchStep || latestAnalyzeStep || latestStep || null;
    const targetEvidence =
      target === 'script'
        ? findPreferredEvidence({
            detail,
            step: targetStep,
          })
        : null;
    const mergedSeed = mergeTaskSeeds(
      buildTaskSeedFromPayload(getStepInputPayload(targetStep)),
      buildTaskSeedFromPayload(detail?.session || null),
    );
    const evidenceReferenceSummary = buildEvidenceReferenceSummary(
      targetEvidence?.title || '',
      targetEvidence?.summary || '',
    );
    const carryPayload = Object.fromEntries(
      Object.entries({
        taskObject: mergedSeed.taskObject,
        audience: mergedSeed.audience,
        industryType: mergedSeed.industryType,
        taskPhase: mergedSeed.taskPhase,
        taskSubject: mergedSeed.taskSubject,
        taskInput: mergedSeed.taskInput,
        context: mergedSeed.context || (target === 'script' ? evidenceReferenceSummary : undefined),
        goal: mergedSeed.goal,
        focusPoints: mergedSeed.focusPoints,
        toneStyle: mergedSeed.toneStyle,
        docType: mergedSeed.docType,
        onlyExternalAvailable: mergedSeed.onlyExternalAvailable,
        enableExternalSupplement: mergedSeed.enableExternalSupplement,
        referenceSummary: target === 'script' ? evidenceReferenceSummary || undefined : undefined,
        sourceDocName: target === 'script' ? targetEvidence?.title || undefined : undefined,
        sourceDocType: target === 'script' ? targetEvidence?.docType || undefined : undefined,
        sourceApplicableScene:
          target === 'script' ? targetEvidence?.applicableScene || undefined : undefined,
        sourceRef: target === 'script' ? targetEvidence?.sourceRef || undefined : undefined,
        sourceType: target === 'script' ? targetEvidence?.sourceType || undefined : undefined,
        evidenceId: target === 'script' ? targetEvidence?.evidenceId || undefined : undefined,
      }).filter(([, value]) => hasCarryPayloadValue(value)),
    );

    return {
      continueContext: buildContinueContext({
        sessionId: detail?.session.id || id,
        fromModule: 'session-detail',
        stepId: targetStep?.id || undefined,
        evidenceId: target === 'script' ? targetEvidence?.evidenceId || undefined : undefined,
        assistantId:
          getStepAssistantId(
            targetStep,
          ) ||
          getStepAssistantId(latestStep) ||
          detail?.session.assistantId ||
          undefined,
        executionContext:
          getStepExecutionContext(
            targetStep,
          ) ||
          getStepExecutionContext(latestStep) ||
          getSessionExecutionContext(detail) ||
          undefined,
      }),
      carryPayload: Object.keys(carryPayload).length ? carryPayload : undefined,
    };
  };

  const handleContinueAnalyze = () => {
    navigate('/judge', {
      state: buildContinueNavigationState(buildResumeContext('analyze')),
    });
  };

  const handleContinueSearch = () => {
    navigate('/retrieve', {
      state: buildContinueNavigationState(buildResumeContext('search')),
    });
  };

  const handleContinueScript = () => {
    navigate('/compose', {
      state: buildContinueNavigationState(buildResumeContext('script')),
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <Empty description={loadIssue || (id ? `sessionId ${id} 未找到` : '当前未找到会话详情')}>
        <Space>
          <Button onClick={() => navigate('/sessions')}>返回会话列表</Button>
          <Button type="primary" onClick={() => navigate('/home')}>
            返回首页
          </Button>
        </Space>
      </Empty>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/home')}>返回首页</Button>
      </Space>
      <PageHeader
        title="会话详情"
        description="查看当前会话的基本信息、执行步骤和已挂载资料。"
      />
      {!detail.session.id ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="当前未接到 sessionId"
          description="会话详情页仍可展示历史信息，但继续分析 / 检索 / 生成的上下文连续性可能不完整。"
        />
      ) : null}

      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={handleContinueAnalyze}>
            继续判断
          </Button>
          <Button onClick={handleContinueSearch}>继续检索</Button>
          <Button onClick={handleContinueScript}>继续写作</Button>
          <Button
            onClick={() =>
              navigate('/compose', {
                state: buildContinueNavigationState(buildResumeContext('script')),
              })
            }
          >
            查看 Output
          </Button>
        </Space>
      </Card>

      <ResultCard title="会话阶段概览">
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="当前阶段">
            {detail.session.currentStage || '未返回'}
          </Descriptions.Item>
          <Descriptions.Item label="当前目标">
            {detail.session.currentGoal || '未返回'}
          </Descriptions.Item>
          <Descriptions.Item label="当前 assistant">
            {latestExecutionContext?.assistantId || detail.session.assistantId || '未返回'}
          </Descriptions.Item>
          <Descriptions.Item label="最近更新时间">
            {formatDateTimeToLocalTime(detail.session.updatedAt, { includeMilliseconds: true }) || '未返回'}
          </Descriptions.Item>
          <Descriptions.Item label="sessionId">
            {detail.session.id || '未返回'}
          </Descriptions.Item>
          <Descriptions.Item label="最近一步类型">
            {latestStep ? formatStepTypeLabel(latestStep.stepType) : '未返回'}
          </Descriptions.Item>
        </Descriptions>
      </ResultCard>

      <ResultCard title="当前进度摘要">
        <p style={{ marginBottom: 8 }}>
          <strong>当前判断一句话摘要：</strong>
          {currentProgressSummary}
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>当前是否已有可用 Output：</strong>
          {hasOutputCompleted ? '已有' : '暂未形成'}
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>当前是否缺关键依据：</strong>
          {currentEvidenceStatus}
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>当前是否缺确认项：</strong>
          {currentConfirmStatus}
        </p>
      </ResultCard>

      <ResultCard title="已完成步骤摘要">
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="判断是否完成">
            {hasAnalyzeCompleted ? '已完成' : '未完成'}
          </Descriptions.Item>
          <Descriptions.Item label="检索是否完成">
            {hasSearchCompleted ? '已完成' : '未完成'}
          </Descriptions.Item>
          <Descriptions.Item label="写作是否完成">
            {hasOutputCompleted ? '已完成' : '未完成'}
          </Descriptions.Item>
          <Descriptions.Item label="最近一步是什么">
            {latestStep ? formatStepTypeLabel(latestStep.stepType) : '未返回'}
          </Descriptions.Item>
        </Descriptions>
      </ResultCard>

      <ResultCard title="下一步动作区">
        <p style={{ marginBottom: 8 }}>
          <strong>推荐下一步动作：</strong>
          {recommendedNextAction}
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>推荐链路：</strong>
          {recommendedNextChain}
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>是否建议返回补证据：</strong>
          {hasSearchCompleted ? '当前已有资料依据，可继续推进输出。' : '建议优先返回补资料依据。'}
        </p>
        <Space wrap>
          <Button type="primary" onClick={handleContinueAnalyze}>
            继续判断
          </Button>
          <Button onClick={handleContinueSearch}>继续检索</Button>
          <Button onClick={handleContinueScript}>继续写作</Button>
          <Button
            onClick={() =>
              navigate('/compose', {
                state: buildContinueNavigationState(buildResumeContext('script')),
              })
            }
          >
            查看 Output
          </Button>
        </Space>
      </ResultCard>

      <ResultCard title="Output 承接展示">
        <p style={{ marginBottom: 8 }}>
          <strong>当前最新 Output 标题：</strong>
          {latestOutputTitle}
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>一句话结论：</strong>
          {latestOutputConclusion}
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>当前 Output 对应 step：</strong>
          {latestOutputStep?.id || '未返回'}
        </p>
        <Button
          onClick={() =>
            navigate('/compose', {
              state: buildContinueNavigationState(buildResumeContext('script')),
            })
          }
        >
          进入 Output 工作台
        </Button>
      </ResultCard>

      <ResultCard title="上下文依据（明细）">
        {executionContextRows.some((item) => item.value !== '未返回') ? (
          <Descriptions bordered column={2} size="small">
            {executionContextRows.map((item) => (
              <Descriptions.Item key={item.label} label={item.label}>
                {item.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : (
          <Empty description="当前未返回 executionContext" />
        )}
      </ResultCard>

      <ResultCard title="当前进度明细（兼容展示）">
        {latestStep ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="最新步骤类型">
              {formatStepTypeLabel(latestStep.stepType)}
            </Descriptions.Item>
            <Descriptions.Item label="最近执行时间">
              {formatDateTimeToLocalTime(latestStep.createdAt, { includeMilliseconds: true }) || '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="最新 route">{latestStep.route || '未返回'}</Descriptions.Item>
            <Descriptions.Item label="最新 strategy">{latestStep.strategy || '未返回'}</Descriptions.Item>
            <Descriptions.Item label="当前 Prompt ID">
              {getStringFromPayload(latestStep.inputPayload, 'promptId') ||
                getStringFromPayload(latestStep.outputPayload, 'promptId') ||
                latestExecutionContext?.promptId ||
                '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="Prompt 版本">
              {getStringFromPayload(latestStep.inputPayload, 'promptVersion') ||
                getStringFromPayload(latestStep.outputPayload, 'promptVersion') ||
                latestExecutionContext?.promptVersion ||
                '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="Assistant ID">
              {getStringFromPayload(latestStep.inputPayload, 'assistantId') ||
                getStringFromPayload(latestStep.outputPayload, 'assistantId') ||
                latestExecutionContext?.assistantId ||
                detail.session.assistantId ||
                '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="策略 ID">
              {latestExecutionContext?.strategyId ||
                latestExecutionContext?.scriptStrategy ||
                latestExecutionContext?.searchStrategy ||
                latestExecutionContext?.analyzeStrategy ||
                latestStep.strategy ||
                '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="rulesScope">
              {latestExecutionContext?.rulesScope || '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="productScope">
              {latestExecutionContext?.productScope || '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="docScope">
              {latestExecutionContext?.docScope || '未返回'}
            </Descriptions.Item>
            <Descriptions.Item label="出网结论">
              {formatBooleanLabel(latestStep.outboundAllowed)} / {latestStep.outboundReason || '未返回'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="当前未找到最新执行信息" />
        )}
      </ResultCard>

      <ResultCard title="执行步骤明细">
        <List
          dataSource={detail.steps}
          locale={{ emptyText: '当前会话还没有执行步骤' }}
          renderItem={(step) => (
            <List.Item>
              <Card style={{ width: '100%' }}>
                {(() => {
                  const stepExecutionContext = getMergedExecutionContext(
                    step,
                    getSessionExecutionContext(detail),
                  );

                  return (
                    <>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag color="blue">{formatStepTypeLabel(step.stepType)}</Tag>
                  <Tag color="purple">route：{step.route || '未返回'}</Tag>
                  <Tag color="gold">strategy：{step.strategy || '未返回'}</Tag>
                  <Tag color="green">execution：{step.executionStrategy || '未返回'}</Tag>
                  <Tag>{formatDateTimeToLocalTime(step.createdAt, { includeMilliseconds: true }) || '未返回'}</Tag>
                </Space>
                <p style={{ marginBottom: 8 }}>
                  <strong>摘要：</strong>
                  {step.summary || '当前未返回摘要'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>Assistant：</strong>
                  {getStringFromPayload(step.inputPayload, 'assistantId') ||
                    getStringFromPayload(step.outputPayload, 'assistantId') ||
                    stepExecutionContext?.assistantId ||
                    detail.session.assistantId ||
                    '未返回'}
                  {' / '}
                  <strong>Prompt：</strong>
                  {getStringFromPayload(step.inputPayload, 'promptId') ||
                    getStringFromPayload(step.outputPayload, 'promptId') ||
                    stepExecutionContext?.promptId ||
                    '未返回'}
                  {' / '}
                  <strong>版本：</strong>
                  {getStringFromPayload(step.inputPayload, 'promptVersion') ||
                    getStringFromPayload(step.outputPayload, 'promptVersion') ||
                    stepExecutionContext?.promptVersion ||
                    '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>executionContext：</strong>
                  {stepExecutionContext
                    ? [
                        stepExecutionContext.strategyId,
                        stepExecutionContext.rulesScope,
                        stepExecutionContext.productScope,
                        stepExecutionContext.docScope,
                        stepExecutionContext.analyzeStrategy,
                        stepExecutionContext.searchStrategy,
                        stepExecutionContext.scriptStrategy,
                      ]
                        .filter(Boolean)
                        .join(' / ') || '已返回但为空'
                    : '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>出网结论：</strong>
                  {step.outboundAllowed ? '允许' : '不允许'} / {step.outboundReason || '未返回'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>模型：</strong>
                  {step.modelName || '未返回'}
                </p>
                    </>
                  );
                })()}
              </Card>
            </List.Item>
          )}
        />
      </ResultCard>

      <ResultCard title="一级证据明细">
        <List
          dataSource={detail.evidences}
          locale={{ emptyText: '当前会话还没有一级证据' }}
          renderItem={(evidence) => (
            <List.Item>
              <Card style={{ width: '100%' }}>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag color="blue">{evidence.sourceModule || '未返回来源'}</Tag>
                  <Tag color={evidence.level === 'core' ? 'geekblue' : 'orange'}>
                    {evidence.level === 'core' ? '核心证据' : '辅助证据'}
                  </Tag>
                  <Tag color={evidence.outboundStatus === 'allowed' ? 'green' : 'orange'}>
                    {evidence.outboundStatus === 'allowed' ? '可外发' : '仅内部参考'}
                  </Tag>
                  {evidence.isPrimaryEvidence ? <Tag color="purple">主证据</Tag> : null}
                </Space>
                <p style={{ marginBottom: 8 }}>
                  <strong>证据 ID：</strong>
                  {evidence.evidenceId || '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>证据标题：</strong>
                  {evidence.title || '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>来源类型：</strong>
                  {evidence.sourceType || '未返回'}
                  {' / '}
                  <strong>来源引用：</strong>
                  {evidence.sourceRef || '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>适用场景：</strong>
                  {evidence.applicableScene || '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>摘要：</strong>
                  {evidence.summary || '未返回'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>置信度：</strong>
                  {evidence.confidence ?? '未返回'}
                </p>
              </Card>
            </List.Item>
          )}
        />
      </ResultCard>

      <ResultCard title="兼容附件明细">
        <List
          dataSource={detail.assets}
          locale={{ emptyText: '当前会话还没有挂载资料' }}
          renderItem={(asset) => (
            <List.Item>
              <Card style={{ width: '100%' }}>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag color="blue">{asset.sourceModule || '未返回来源'}</Tag>
                  <Tag color="purple">{asset.docType || '未返回类型'}</Tag>
                  <Tag color={asset.externalAvailable ? 'green' : 'orange'}>
                    {asset.externalAvailable ? '可外发' : '仅内部参考'}
                  </Tag>
                </Space>
                <p style={{ marginBottom: 8 }}>
                  <strong>资料名称：</strong>
                  {asset.docName || '未返回'}
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>适用场景：</strong>
                  {asset.applicableScene || '未返回'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>挂载时间：</strong>
                  {asset.attachedAt || '未返回'}
                </p>
              </Card>
            </List.Item>
          )}
        />
      </ResultCard>
    </div>
  );
}

export default DatailPage;
