import { randomUUID } from 'crypto';
import { listLegacySessionTasks, getLegacySessionTaskDetail, isLegacySession } from './sessionTaskAdapter.js';
import { getEmbeddedModelStatus, runEmbeddedModelJson } from '../plugins/model-adapters/embeddedModelAdapter.js';
import { EMBEDDED_MODEL_TASKS } from '../plugins/model-adapters/embeddedModelSchemas.js';
import { runAnalyzeRuleEngine } from '../plugins/rule-engine/index.js';
import { runSearchRuleEngine } from '../plugins/search-rule-engine/index.js';
import { runAnalyzeCustomerFlow } from '../flows/analyzeFlow.js';
import { runSearchDocumentsFlow } from '../flows/searchFlow.js';
import { runGenerateScriptFlow } from '../flows/scriptFlow.js';

const FLOW_STEP_DELAYS = { analysis: 800, evidence: 1200, output: 1000, save: 400 };

// ============================================================================
// In-memory Task Store (P0 — no DB migration, no old session adapter)
// ============================================================================

const tasks = new Map();

const normalizeText = (value = '') => String(value || '').trim();

/** Fix-4 regression only: strip magic prefixes and return flags (never sent by real clients). */
const FIX4_TEST_PREFIX_FORCE_ANALYSIS_SKIP_FLOW = '__FIX4_AF__';
const FIX4_TEST_PREFIX_FORCE_OUTPUT_TEMPLATE = '__FIX4_OT__';

function parseFix4TestUserGoal(rawUserGoal) {
  let t = normalizeText(rawUserGoal);
  const flags = { forceAnalysisSkipFlow: false, forceOutputTemplate: false };
  if (t.startsWith(FIX4_TEST_PREFIX_FORCE_ANALYSIS_SKIP_FLOW)) {
    flags.forceAnalysisSkipFlow = true;
    t = normalizeText(t.slice(FIX4_TEST_PREFIX_FORCE_ANALYSIS_SKIP_FLOW.length));
  }
  if (t.startsWith(FIX4_TEST_PREFIX_FORCE_OUTPUT_TEMPLATE)) {
    flags.forceOutputTemplate = true;
    t = normalizeText(t.slice(FIX4_TEST_PREFIX_FORCE_OUTPUT_TEMPLATE.length));
  }
  return { goal: t, flags };
}

const truncateText = (value = '', maxLength = 28) => {
  const s = normalizeText(value);
  return s.length <= maxLength ? s : `${s.slice(0, maxLength)}...`;
};

// ---------------------------------------------------------------------------
// TaskPlan: MissingInfo rules (per v1 §1.3)
// ---------------------------------------------------------------------------

const COMPANY_NAME_KEYWORDS = /企查查|工商背景|企业画像|经营风险|公开企业资料/i;

const buildMissingInfo = (userGoal) => {
  const items = [];

  const needsCompany = COMPANY_NAME_KEYWORDS.test(userGoal);

  items.push({
    field: 'companyName',
    label: '目标企业名称',
    level: needsCompany ? 'required' : 'recommended',
    reason: needsCompany
      ? '任务目标涉及企业工商/经营信息，需要指定具体企业名称'
      : '提供企业名称可获得更精准的分析结果',
  });

  items.push({
    field: 'outputTarget',
    label: '输出对象',
    level: 'recommended',
    reason: '明确输出对象（如销售总监、客户成功经理）可调整语气和侧重',
  });

  items.push({
    field: 'recentCommunication',
    label: '近期沟通摘要',
    level: 'recommended',
    reason: '补充近期沟通记录可提升分析准确度',
  });

  items.push({
    field: 'toneStyle',
    label: '语气风格',
    level: 'optional',
    reason: '指定正式/简洁/口语风格以适配不同交付场景',
  });

  return items;
};

// ---------------------------------------------------------------------------
// TaskPlan: Step blueprint (4-step fixed per v1 §1.2)
// ---------------------------------------------------------------------------

const buildTaskSteps = (taskId) => [
  {
    stepId: `${taskId}-analysis`,
    order: 1,
    type: 'analysis',
    title: '分析客户场景',
    required: true,
    status: 'pending',
  },
  {
    stepId: `${taskId}-evidence`,
    order: 2,
    type: 'evidence',
    title: '检索资料与证据',
    required: true,
    status: 'pending',
  },
  {
    stepId: `${taskId}-output`,
    order: 3,
    type: 'output',
    title: '生成输出',
    required: true,
    status: 'pending',
  },
  {
    stepId: `${taskId}-save`,
    order: 4,
    type: 'save',
    title: '保存历史任务',
    required: true,
    status: 'pending',
  },
];

// ---------------------------------------------------------------------------
// TaskPlan: ExecutionContext
// ---------------------------------------------------------------------------

const buildExecutionContext = (plannerInfo = {}) => {
  const {
    source = 'rule_engine',
    modelName = 'Qwen3-0.6B-Q5_K_M',
    fallbackReason = null,
    latencyMs = undefined,
    routeDecision = null,
  } = plannerInfo;

  return {
    assistantName: '默认销售助手',
    assistantSource: 'global_default',
    modelName: 'qwen3-8b',
    plannerModel: modelName,
    executionModel: 'qwen3-8b',
    routeSource: source,
    fallbackApplied: source !== 'embedded_model',
    fallbackReason: fallbackReason || undefined,
    dataSources: [
      { name: '内部知识库', status: 'healthy' },
      { name: '企查查', status: 'unknown' },
      { name: '参考资料库', status: 'healthy' },
    ],
    taskPlanner: {
      status: fallbackReason ? 'fallback' : 'ready',
      source,
      modelName,
      fallbackReason: fallbackReason || undefined,
      latencyMs,
      routeDecision: routeDecision || undefined,
    },
  };
};

// ---------------------------------------------------------------------------
// TaskPlan: understanding generation (rule-based, no LLM)
// ---------------------------------------------------------------------------

const buildUnderstanding = (userGoal, embeddedUnderstanding = '') => {
  if (embeddedUnderstanding) return embeddedUnderstanding;
  const goal = normalizeText(userGoal);
  if (goal.includes('客户') || goal.includes('销售')) {
    return `系统理解您希望对客户进行销售支持分析：${goal}。将按分析→资料检索→文稿生成的完整流程执行。`;
  }
  if (goal.includes('资料') || goal.includes('证据') || goal.includes('检索')) {
    return `系统理解您需要进行资料收集与整理：${goal}。将重点进行资料检索并生成交付文稿。`;
  }
  return `系统理解您的任务目标：${goal}。将按标准流程执行分析、检索、生成、归档。`;
};

// ---------------------------------------------------------------------------
// Task type inference
// ---------------------------------------------------------------------------

const inferTaskType = (userGoal) => {
  const goal = normalizeText(userGoal);
  // Output generation keywords first (more specific, may coexist with customer keywords)
  if (/生成|输出|文稿|撰写|起草|文案|报告|邮件|纪要/.test(goal)) return 'output_generation';
  if (/资料|证据|检索|搜索|查阅|整理/.test(goal)) return 'evidence_search';
  if (/客户|分析|判断|评估|建议/.test(goal)) return 'customer_analysis';
  return 'full_workflow';
};

const buildRuleRouteDecision = (userGoal, taskType = inferTaskType(userGoal)) => {
  const shouldUseExternalSources = COMPANY_NAME_KEYWORDS.test(normalizeText(userGoal));

  return {
    taskType,
    confidence: shouldUseExternalSources ? 0.95 : 0.72,
    requiredModules: ['analysis', 'evidence', 'output', 'save'],
    recommendedFlow: ['analysis', 'evidence', 'output', 'save'],
    shouldUseExternalSources,
    shouldGenerateOutput: true,
    missingInfoPolicy: shouldUseExternalSources ? 'strict' : 'lenient',
  };
};

// ---------------------------------------------------------------------------
// Risk hints
// ---------------------------------------------------------------------------

const buildRiskHints = (userGoal) => {
  const hints = [];
  const goal = normalizeText(userGoal);
  if (COMPANY_NAME_KEYWORDS.test(goal)) {
    hints.push('任务依赖外部企业资料源（如企查查），若外部源不可用将降级为内部知识库检索');
  }
  return hints;
};

// ---------------------------------------------------------------------------
// Public: createTask(userGoal) → returns { taskId, planId, planVersion, status, taskPlan }
// ---------------------------------------------------------------------------

const PLANNER_TIMEOUT_MS = 3000;

const tryEmbeddedPlanner = async (userGoal) => {
  const status = getEmbeddedModelStatus();
  if (!status.ready) {
    return {
      success: false,
      source: 'rule_engine_fallback',
      fallbackReason: 'embedded_model_not_ready',
      modelStatus: status,
    };
  }

  try {
    const startedAt = Date.now();
    const result = await runEmbeddedModelJson(
      { text: userGoal, goal: userGoal },
      {
        task: EMBEDDED_MODEL_TASKS.TASK_PLANNER,
        timeoutMs: PLANNER_TIMEOUT_MS,
        maxTokens: 256,
        temperature: 0,
      },
    );
    const latencyMs = result.durationMs;

    const plannerOutput = result.data;
    if (!plannerOutput || !plannerOutput.taskType || !plannerOutput.understanding) {
      return {
        success: false,
        source: 'rule_engine_fallback',
        fallbackReason: 'invalid_planner_json',
        latencyMs,
      };
    }

    return {
      success: true,
      source: 'embedded_model',
      modelName: status.modelName,
      taskType: plannerOutput.taskType,
      taskTitle: plannerOutput.taskTitle,
      understanding: plannerOutput.understanding,
      confidence: plannerOutput.confidence,
      needsExternalSources: plannerOutput.needsExternalSources === true,
      shouldGenerateOutput: plannerOutput.shouldGenerateOutput !== false,
      missingInfoPolicy: plannerOutput.missingInfoPolicy || 'lenient',
      latencyMs,
      routeDecision: {
        taskType: plannerOutput.taskType,
        confidence: plannerOutput.confidence || 0,
        requiredModules: ['analysis', 'evidence', 'output', 'save'],
        recommendedFlow: ['analysis', 'evidence', 'output', 'save'],
        shouldUseExternalSources: plannerOutput.needsExternalSources === true,
        shouldGenerateOutput: plannerOutput.shouldGenerateOutput !== false,
        missingInfoPolicy: plannerOutput.missingInfoPolicy || 'lenient',
      },
    };
  } catch (err) {
    const code = (err && err.code) || 'planner_inference_failed';
    const isTimeout = code === 'MODEL_TIMEOUT';
    return {
      success: false,
      source: 'rule_engine_fallback',
      fallbackReason: isTimeout ? 'embedded_model_timeout' : `embedded_model_error:${code}`,
    };
  }
};

export const createTask = async (userGoal) => {
  const taskId = randomUUID();
  const planId = randomUUID();
  const planVersion = 'v1';
  const now = new Date().toISOString();
  const { goal, flags: fix4TestFlags } = parseFix4TestUserGoal(userGoal);

  let plannerResult = null;

  try {
    plannerResult = await tryEmbeddedPlanner(goal);
  } catch {
    plannerResult = null;
  }

  if (plannerResult && plannerResult.success && plannerResult.taskType) {
    const taskType = plannerResult.taskType;
    const taskTitle = plannerResult.taskTitle ? truncateText(plannerResult.taskTitle) : truncateText(goal);
    const understanding = buildUnderstanding(goal, plannerResult.understanding);
    const taskPlan = {
      taskId,
      taskTitle,
      taskType,
      userGoal: goal,
      understanding,
      status: 'waiting_confirmation',
      steps: buildTaskSteps(taskId),
      missingInfo: buildMissingInfo(goal),
      executionContext: buildExecutionContext({
        source: 'embedded_model',
        modelName: plannerResult.modelName || 'Qwen3-0.6B-Q5_K_M',
        fallbackReason: null,
        latencyMs: plannerResult.latencyMs,
        routeDecision: plannerResult.routeDecision || null,
      }),
      riskHints: buildRiskHints(goal),
      planVersionId: planId,
      createdAt: now,
      updatedAt: now,
    };

    const task = {
      taskId,
      taskPlan,
      taskExecution: null,
      status: 'waiting_confirmation',
      planVersion,
      createdAt: now,
      updatedAt: now,
      fix4TestFlags,
    };

    tasks.set(taskId, task);

    return {
      taskId,
      planId,
      planVersion,
      status: task.status,
      taskPlan,
    };
  }

  const fallbackReason = plannerResult?.fallbackReason || 'embedded_model_unavailable';

  const taskPlan = {
    taskId,
    taskTitle: truncateText(goal),
    taskType: inferTaskType(goal),
    userGoal: goal,
    understanding: buildUnderstanding(goal),
    status: 'waiting_confirmation',
    steps: buildTaskSteps(taskId),
    missingInfo: buildMissingInfo(goal),
    executionContext: buildExecutionContext({
      source: 'rule_engine_fallback',
      modelName: 'Qwen3-0.6B-Q5_K_M',
      fallbackReason,
      latencyMs: plannerResult?.latencyMs,
      routeDecision: buildRuleRouteDecision(goal, inferTaskType(goal)),
    }),
    riskHints: buildRiskHints(goal),
    planVersionId: planId,
    createdAt: now,
    updatedAt: now,
  };

  const task = {
    taskId,
    taskPlan,
    taskExecution: null,
    status: 'waiting_confirmation',
    planVersion,
    createdAt: now,
    updatedAt: now,
    fix4TestFlags,
  };

  tasks.set(taskId, task);

  return {
    taskId,
    planId,
    planVersion,
    status: task.status,
    taskPlan,
  };
};

// ---------------------------------------------------------------------------
// Public: getTaskPlan(taskId) → TaskPlan | null
// ---------------------------------------------------------------------------

export const getTaskPlan = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;
  return task.taskPlan;
};

// ---------------------------------------------------------------------------
// Public: confirmTask(taskId) → TaskExecution | null
// ---------------------------------------------------------------------------

export const confirmTask = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;
  if (task.status !== 'waiting_confirmation') return null;

  const now = new Date().toISOString();

  const steps = [
    {
      stepId: `${taskId}-analysis`,
      type: 'analysis',
      title: '分析客户场景',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      summary: undefined,
      details: [],
      riskNotes: [],
      source: undefined,
    },
    {
      stepId: `${taskId}-evidence`,
      type: 'evidence',
      title: '检索资料与证据',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      summary: undefined,
      details: [],
      riskNotes: [],
      source: undefined,
    },
    {
      stepId: `${taskId}-output`,
      type: 'output',
      title: '生成输出',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      summary: undefined,
      details: [],
      riskNotes: [],
      source: undefined,
    },
    {
      stepId: `${taskId}-save`,
      type: 'save',
      title: '保存历史任务',
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      summary: undefined,
      details: [],
      riskNotes: [],
      source: undefined,
    },
  ];

  const taskExecution = {
    taskId,
    planVersionId: task.taskPlan.planVersionId || null,
    status: 'running',
    currentStepId: `${taskId}-analysis`,
    steps,
    outputPreview: undefined,
    degradedMarkers: [],
    startedAt: now,
    completedAt: undefined,
    errorContext: undefined,
  };

  task.taskExecution = taskExecution;
  task.status = 'running';
  task.updatedAt = now;

  runTaskExecution(taskId).catch((error) => {
    const currentTask = tasks.get(taskId);
    if (!currentTask?.taskExecution) return;
    const exec = currentTask.taskExecution;
    const now = new Date().toISOString();
    exec.status = 'failed';
    exec.errorContext = {
      code: 'TASK_EXECUTION_FLOW_ERROR',
      message: error?.message || 'Task execution flow failed',
    };
    exec.completedAt = now;
    currentTask.status = 'failed';
    currentTask.updatedAt = now;
  });

  return taskExecution;
};

// ---------------------------------------------------------------------------
// Public: getTaskExecution(taskId) → TaskExecution | null
// ---------------------------------------------------------------------------

export const getTaskExecution = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;
  return task.taskExecution || null;
};

// ---------------------------------------------------------------------------
// Internal: run step with flow calls
// ---------------------------------------------------------------------------

const FALLBACK_ANALYSIS_DETAILS = [
  '客户画像：基于输入信息构建',
  '需求识别：识别出关键业务诉求',
  '风险评估：无显著风险项',
];

const FALLBACK_EVIDENCE_DETAILS = [
  '内部知识库：检索到 3 条相关记录',
  '参考资料：匹配到 2 篇相关文档',
  '外部源：企查查查询未启用',
];

const FALLBACK_OUTPUT_DETAILS = [
  '正式版：已完成完整文稿',
  '简洁版：已完成沟通要点',
  '口语版：已完成跟进话术',
];

const FALLBACK_SAVE_DETAILS = ['执行记录已归档', '交付文稿已保存'];

const runAnalysisStep = async (task) => {
  const exec = task.taskExecution;
  if (!exec) return;
  const step = exec.steps[0];
  const goal = task.taskPlan.userGoal;
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  task.updatedAt = step.startedAt;

  const fix4Flags = task.fix4TestFlags || {};
  let flowResult = null;
  if (!fix4Flags.forceAnalysisSkipFlow) {
    try {
      flowResult = await runAnalyzeCustomerFlow({
        taskInput: goal,
        taskSubject: goal,
        goal,
        industryType: 'other',
        taskPhase: 'other',
      });
    } catch {
      flowResult = null;
    }
  }

  if (flowResult?.finalAnalyzeData) {
    const d = flowResult.finalAnalyzeData;
    step.summary = d.summary || '已完成客户场景分析与需求识别';
    step.details = [d.sceneJudgement || '', ...(d.recommendedProducts || []).map((p) => `推荐产品: ${p}`), ...(d.followupQuestions || []).map((q) => `后续: ${q}`)].filter(Boolean);
    step.riskNotes = d.riskNotes || [];
    step.source = flowResult.analysisRoute || 'analyze-flow';
    task.taskStore = task.taskStore || {};
    task.taskStore.analysisResult = { summary: d.summary, products: d.recommendedProducts, riskNotes: d.riskNotes, nextActions: d.nextActions };
  } else {
    try {
      const ruleResult = await runAnalyzeRuleEngine({
        capability: 'analyze-context',
        rawInput: { taskInput: goal, taskSubject: goal },
        normalizedInput: { taskInput: goal, taskSubject: goal, industryType: 'other', taskPhase: 'other', text: goal },
        executionContext: task.taskPlan.executionContext || {},
        taskInput: goal,
        taskSubject: goal,
        taskPhase: 'other',
        industryType: 'other',
        text: goal,
      });
      const analysis = ruleResult.analysis || {};
      step.summary = analysis.summary || ruleResult.matchedRule?.summaryTemplate || '已完成客户场景分析与需求识别';
      step.details = [analysis.sceneJudgement || '', ...(analysis.recommendedProducts || []).map((p) => `推荐产品: ${p}`), ...(analysis.followupQuestions || []).map((q) => `后续: ${q}`)].filter(Boolean);
      step.riskNotes = analysis.riskNotes || [];
      step.source = 'rule-engine';
    } catch {
      step.summary = '已完成客户场景分析与需求识别';
      step.details = FALLBACK_ANALYSIS_DETAILS;
      step.riskNotes = [];
      step.source = 'fallback';
    }
  }

  step.status = 'done';
  step.completedAt = new Date().toISOString();
  step.durationMs = step.completedAt && step.startedAt
    ? new Date(step.completedAt) - new Date(step.startedAt)
    : FLOW_STEP_DELAYS.analysis;
  exec.currentStepId = exec.steps[1]?.stepId || undefined;
  task.updatedAt = step.completedAt;
};

const runEvidenceStep = async (task) => {
  const exec = task.taskExecution;
  if (!exec) return;
  const step = exec.steps[1];
  const goal = task.taskPlan.userGoal;
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  exec.currentStepId = step.stepId;
  task.updatedAt = step.startedAt;

  let flowResult = null;
  try {
    flowResult = await runSearchDocumentsFlow({
      keyword: goal,
      taskInput: goal,
      taskSubject: goal,
      goal,
      industryType: 'other',
    });
  } catch {
    flowResult = null;
  }

  if (flowResult?.evidenceItems && flowResult.evidenceItems.length > 0) {
    const items = flowResult.evidenceItems;
    step.summary = flowResult.searchSummary || `已检索 ${items.length} 条资料`;
    step.details = items.map((e) => `${e.title || e.docName}: ${e.summary || ''}`).filter(Boolean);
    step.riskNotes = [];
    step.source = flowResult.searchRoute || 'search-flow';
    task.taskStore = task.taskStore || {};
    task.taskStore.evidenceResult = { items: items.map((e) => ({ title: e.title, summary: e.summary, sourceType: e.sourceType })), searchSummary: flowResult.searchSummary, evidenceCount: items.length };
  } else {
    try {
      const ruleResult = await runSearchRuleEngine({
        capability: 'search-documents',
        rawInput: { keyword: goal },
        normalizedInput: { keyword: goal, industryType: 'other' },
        keyword: goal,
        industryType: 'other',
        executionContext: task.taskPlan.executionContext || {},
      });
      const documents = Array.isArray(ruleResult.documents) ? ruleResult.documents : [];
      step.summary = ruleResult.matchedRule?.summaryTemplate || `已检索内部知识库与参考资料 (匹配 ${documents.length} 篇文档)`;
      step.details = documents.length > 0
        ? documents.map((d) => `${d.title || d.docName}: ${d.summary || ''}`).filter(Boolean)
        : FALLBACK_EVIDENCE_DETAILS;
      step.riskNotes = [];
      step.source = 'rule-engine';
    } catch {
      step.summary = '已检索内部知识库与参考资料';
      step.details = FALLBACK_EVIDENCE_DETAILS;
      step.riskNotes = [];
      step.source = 'fallback';
    }
  }

  step.status = 'done';
  step.completedAt = new Date().toISOString();
  step.durationMs = step.completedAt && step.startedAt
    ? new Date(step.completedAt) - new Date(step.startedAt)
    : FLOW_STEP_DELAYS.evidence;
  exec.currentStepId = exec.steps[2]?.stepId || undefined;
  task.updatedAt = step.completedAt;
};

const runOutputStep = async (task) => {
  const exec = task.taskExecution;
  if (!exec) return;
  const step = exec.steps[2];
  const goal = task.taskPlan.userGoal;
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  exec.currentStepId = step.stepId;
  task.updatedAt = step.startedAt;

  const fix4Flags = task.fix4TestFlags || {};
  let flowResult = null;
  if (!fix4Flags.forceOutputTemplate) {
    try {
      flowResult = await runGenerateScriptFlow({
        taskInput: goal,
        taskSubject: goal,
        goal,
        goalScene: 'first_reply',
        toneStyle: 'formal',
        outputStyle: 'standard',
        industryType: 'other',
        taskPhase: 'other',
      });
    } catch {
      flowResult = null;
    }
  }

  if (flowResult?.finalResult) {
    const r = flowResult.finalResult;
    const formal = r.formalVersion || '';
    const concise = r.conciseVersion || r.llmVersion || '';
    const spoken = r.spokenVersion || '';
    step.summary = '已生成三版交付文稿（正式/简洁/口语）';
    step.details = [
      `正式版: ${formal.slice(0, 80)}${formal.length > 80 ? '…' : ''}`,
      `简洁版: ${concise.slice(0, 80)}${concise.length > 80 ? '…' : ''}`,
      `口语版: ${spoken.slice(0, 80)}${spoken.length > 80 ? '…' : ''}`,
    ].filter(Boolean);
    step.riskNotes = (r.cautionNotes || []).map((c) => String(c)).filter(Boolean);
    step.source = r.generationRoute || 'script-flow';

    task.taskStore = task.taskStore || {};
    task.taskStore.outputResult = {
      formalVersion: formal,
      conciseVersion: concise,
      spokenVersion: spoken,
      generationRoute: r.generationRoute,
      scriptStrategy: r.scriptStrategy,
    };
  } else {
    step.summary = '已生成三版交付文稿（正式/简洁/口语）';
    step.details = FALLBACK_OUTPUT_DETAILS;
    step.riskNotes = [];
    step.source = 'template';
  }

  step.status = 'done';
  step.completedAt = new Date().toISOString();
  step.durationMs = step.completedAt && step.startedAt
    ? new Date(step.completedAt) - new Date(step.startedAt)
    : FLOW_STEP_DELAYS.output;
  exec.currentStepId = exec.steps[3]?.stepId || undefined;
  task.updatedAt = step.completedAt;
};

const runSaveStep = (task) => {
  const exec = task.taskExecution;
  if (!exec) return;
  const goal = task.taskPlan.userGoal;
  const step = exec.steps[3];
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  exec.currentStepId = step.stepId;
  task.updatedAt = step.startedAt;

  const now = new Date().toISOString();
  step.status = 'done';
  step.completedAt = now;
  step.durationMs = FLOW_STEP_DELAYS.save;
  step.summary = '已保存任务结果与交付记录';
  step.details = FALLBACK_SAVE_DETAILS;
  step.source = 'task_store';

  exec.status = 'done';
  exec.currentStepId = undefined;
  exec.completedAt = now;
  exec.outputPreview = {
    formalPreview: `针对「${goal}」的正式交付文稿已生成。包含完整分析、证据引用和行动建议。`,
    concisePreview: '核心结论：基于分析，建议重点关注客户需求匹配度和风险敞口。',
    spokenPreview: '您好，根据分析结果，我准备了跟进要点：第一……第二……方便时我们沟通。',
    evidenceCount: 3,
    riskCount: 0,
  };
  task.status = 'done';
  task.updatedAt = now;
};

const runTaskExecution = async (taskId) => {
  const task = tasks.get(taskId);
  if (!task || !task.taskExecution) return;
  if (task.taskExecution.status !== 'running') return;

  const now = new Date().toISOString();
  task.taskExecution.steps[0].status = 'running';
  task.taskExecution.steps[0].startedAt = now;
  task.updatedAt = now;

  await runAnalysisStep(task);
  await new Promise((r) => setTimeout(r, 800));
  await runEvidenceStep(task);
  await new Promise((r) => setTimeout(r, 1200));
  await runOutputStep(task);
  await new Promise((r) => setTimeout(r, 1000));
  await runSaveStep(task);
};

// ============================================================================
// Output generation (P0)
// ============================================================================

const FORMAL_CONTENT = '尊敬的客户：\n\n根据我们的分析，贵司当前处于半导体材料应用的关键阶段。我们建议从涂布工艺参数优化入手，结合行业标准方案，制定分阶段技术对接计划。近期我们将整理一份详细的技术方案供您审阅。\n\n此方案将包含：\n1. 工艺兼容性分析\n2. 同类客户案例参考\n3. 初步成本对比评估\n\n如有需要调整的方向，请随时告知。';

const CONCISE_CONTENT = '基于当前分析，建议从涂布工艺参数优化入手，制定分阶段技术对接计划。我们将整理技术方案供您审阅。';

const SPOKEN_CONTENT = '您好，根据我们对您这边情况的分析，建议咱们先从涂布工艺这块切入，我们会整理一份详细的技术方案给您看。您看什么时候方便我们详细沟通一下？';

const buildExecutionSteps = (taskId) => [
  { title: '分析客户场景', status: 'done', summary: '识别为销售跟进场景，建议输出正式跟进方案。' },
  { title: '检索资料与证据', status: 'done', summary: '已从内部知识库和 Reference Pack 中整理 3 条可引用依据。' },
  { title: '生成输出', status: 'done', summary: '已生成正式交付版、简洁沟通版、口语跟进版。' },
  { title: '保存历史任务', status: 'done', summary: '已保存到历史任务。' },
];

const buildEvidences = () => [
  { id: 'ev-1', title: '半导体涂布工艺标准', sourceType: 'internal_knowledge', sourceName: '内部知识库', status: 'healthy', summary: '行业标准涂布工艺参数表，包括干燥温度、涂布速度和材料兼容性指南。' },
  { id: 'ev-2', title: '同类客户案例：XX 材料公司', sourceType: 'reference_pack', sourceName: 'Reference Pack', status: 'healthy', summary: '半导体涂布材料领域的客户合作案例，展示从评估到上线的完整流程。' },
  { id: 'ev-3', title: '企业背景与风险数据', sourceType: 'external_source', sourceName: '外部资料源', status: 'healthy', summary: '公司注册信息、经营状态和公开的信用记录。' },
];

const buildRisks = () => [
  { id: 'r-1', level: 'warning', title: '缺少客户公司全称', description: '未提供客户公司全称，分析结果基于关键词匹配，精确度可能受限。' },
  { id: 'r-2', level: 'info', title: '输出对象未指定', description: '未指定输出对象，默认使用通用销售沟通风格。' },
];

function detectOutputStatus(userGoal) {
  const goal = normalizeText(userGoal);
  if (goal.includes('输出失败')) return 'failed';
  if (goal.includes('证据不足')) return 'evidence_insufficient';
  if (goal.includes('降级')) return 'degraded';
  return 'success';
}

function generateOutputVersion(taskId, label, reason) {
  const now = new Date().toISOString();
  return {
    versionId: `${taskId}-v${label.replace('v', '')}-${Date.now()}`,
    label,
    status: 'success',
    isCurrent: false,
    reason,
    createdAt: now,
    formalVersion: FORMAL_CONTENT,
    conciseVersion: CONCISE_CONTENT,
    spokenVersion: SPOKEN_CONTENT,
  };
}

function lazyGenerateOutputIfNeeded(task) {
  if (task.status !== 'done') return;
  if (task.outputVersions && task.outputVersions.length > 0) return;

  const now = new Date().toISOString();
  const v1Id = `${task.taskId}-v1`;

  const storedOutput = task.taskStore?.outputResult;
  const formalVersion = storedOutput?.formalVersion || FORMAL_CONTENT;
  const conciseVersion = storedOutput?.conciseVersion || CONCISE_CONTENT;
  const spokenVersion = storedOutput?.spokenVersion || SPOKEN_CONTENT;
  const generationRoute = storedOutput?.generationRoute || 'template';

  const userGoal = task.taskPlan?.userGoal || '';
  const status = detectOutputStatus(userGoal);

  const v1 = {
    versionId: v1Id,
    label: 'v1',
    status,
    isCurrent: true,
    reason: generationRoute === 'script-flow' ? '任务执行生成' : '初始生成',
    createdAt: now,
    formalVersion: status === 'failed' ? '' : formalVersion,
    conciseVersion: status === 'failed' ? '' : conciseVersion,
    spokenVersion: status === 'failed' ? '' : spokenVersion,
    failureReason: status === 'failed' ? '输出生成失败：模型调用返回空响应。' : undefined,
  };

  task.outputVersions = [v1];
  task.currentOutputVersionId = v1Id;

  const storedEvidence = task.taskStore?.evidenceResult;
  if (storedEvidence?.items) {
    task.evidences = storedEvidence.items.map((e, i) => ({
      id: `ev-${i + 1}`,
      title: e.title || '资料条目',
      sourceType: e.sourceType || 'internal_knowledge',
      sourceName: e.sourceType === 'internal_knowledge' ? '内部知识库' : '参考资料',
      status: 'healthy',
      summary: e.summary || '',
    }));
  } else {
    task.evidences = buildEvidences();
  }
  task.risks = buildRisks();
  task.executionSteps = buildExecutionSteps(task.taskId);

  const evCount = storedEvidence?.items?.length || 3;
  const evV1 = {
    versionId: `${task.taskId}-evidence-v1`,
    label: 'v1',
    status: 'success',
    isCurrent: true,
    reason: '初始证据包',
    source: 'execution',
    createdAt: now,
    evidenceCount: evCount,
    sources: [
      { sourceId: 'internal-kb', sourceName: '内部知识库', sourceType: 'internal_knowledge', status: 'healthy', hitCount: 2, summary: '命中内部知识库 2 条相关资料' },
      { sourceId: 'reference-pack', sourceName: 'Reference Pack', sourceType: 'reference_pack', status: 'healthy', hitCount: 1, summary: '命中参考资料库 1 条相关案例' },
      { sourceId: 'external-source', sourceName: '外部资料源', sourceType: 'external_source', status: 'healthy', hitCount: 0, summary: '外部资料源正常但本次未命中' },
    ],
    riskNotes: [],
    formattedEvidence: task.evidences,
  };

  task.evidencePackVersions = [evV1];
  task.currentEvidencePackVersionId = evV1.versionId;

  // Adjust evidences/risks for special statuses
  if (status === 'degraded') {
    task.evidences = task.evidences.map((ev) =>
      ev.sourceType === 'external_source'
        ? { ...ev, status: 'degraded', summary: '本次未使用外部资料源，输出基于内部知识库和 Reference Pack 生成。' }
        : ev,
    );
    task.risks = [
      ...task.risks,
      { id: 'r-d1', level: 'degraded', title: '外部源降级', description: '外部资料源当前不可用，本次输出未包含外部权威数据验证。' },
    ];
    task.executionSteps[1].status = 'degraded';
    task.executionSteps[1].summary = '外部资料源不可用，已降级为内部检索。';
  }

  if (status === 'evidence_insufficient') {
    task.risks = [
      ...task.risks,
      { id: 'r-e1', level: 'warning', title: '证据不足', description: '缺少部分关键信息，影响分析精确度。建议补充资料后重新生成。' },
    ];
  }

  if (status === 'failed') {
    task.risks = [{ id: 'r-f1', level: 'danger', title: '输出生成失败', description: '已完成的分析结果和证据资料不会丢失。你可以重试生成或返回工作台修改计划。' }];
  }

  task.updatedAt = now;
}

// ---------------------------------------------------------------------------
// Public: getTaskOutput(taskId) → OutputDetail | null
// ---------------------------------------------------------------------------

export const getTaskOutput = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;

  lazyGenerateOutputIfNeeded(task);

  if (!task.outputVersions || task.outputVersions.length === 0) return null;

  const currentVersion = task.outputVersions.find((v) => v.versionId === task.currentOutputVersionId);

  return {
    taskId: task.taskId,
    taskTitle: task.taskPlan?.taskTitle || '',
    taskGoal: task.taskPlan?.userGoal || '',
    outputTarget: task.taskPlan?.outputTarget || '',
    tone: task.taskPlan?.tone || '',
    status: currentVersion?.status || 'success',
    currentVersionId: task.currentOutputVersionId,
    versions: task.outputVersions || [],
    evidences: task.evidences || [],
    risks: task.risks || [],
    executionSteps: task.executionSteps || [],
  };
};

// ---------------------------------------------------------------------------
// Public: getOutputVersions(taskId) → version list | null
// ---------------------------------------------------------------------------

export const getOutputVersions = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;

  lazyGenerateOutputIfNeeded(task);

  if (!task.outputVersions || task.outputVersions.length === 0) return null;

  return {
    taskId: task.taskId,
    currentVersionId: task.currentOutputVersionId,
    versions: task.outputVersions,
  };
};

// ---------------------------------------------------------------------------
// Public: regenerateOutput(taskId, mode, tone, note) → new version
// ---------------------------------------------------------------------------

export const regenerateOutput = (taskId, mode = 'regenerate', tone = 'formal', note = '') => {
  const task = tasks.get(taskId);
  if (!task) return null;

  lazyGenerateOutputIfNeeded(task);

  if (!task.outputVersions || task.outputVersions.length === 0) return null;

  const now = new Date().toISOString();
  const label = `v${task.outputVersions.length + 1}`;
  const versionId = `${taskId}-v${task.outputVersions.length + 1}-${Date.now()}`;

  const reasonMap = {
    regenerate: '重新生成',
    adjust_tone: '调整语气后重新生成',
    supplement_regenerate: '补充资料后重新生成',
    retry_external_source: '重试外部资料源后重新生成',
  };
  const reason = reasonMap[mode] || '重新生成';

  // If supplement-regenerate: create new Evidence Pack version first
  let evidenceVersionId;
  if (mode === 'supplement_regenerate') {
    if (!task.evidencePackVersions) task.evidencePackVersions = [];
    const evCount = task.evidencePackVersions.length + 1;
    evidenceVersionId = `${taskId}-evidence-v${evCount}`;
    const newEvidencePack = {
      versionId: evidenceVersionId,
      label: `v${evCount}`,
      status: 'success',
      isCurrent: true,
      reason: '补充资料后重新生成',
      source: 'supplement-regenerate',
      createdAt: now,
      evidenceCount: 4,
      sources: [
        { sourceId: 'internal-kb', sourceName: '内部知识库', sourceType: 'internal_knowledge', status: 'healthy', hitCount: 2, summary: '命中内部知识库 2 条相关资料' },
        { sourceId: 'reference-pack', sourceName: 'Reference Pack', sourceType: 'reference_pack', status: 'healthy', hitCount: 1, summary: '命中参考资料库 1 条相关案例' },
        { sourceId: 'supplemented', sourceName: '用户补充资料', sourceType: 'customer_data', status: 'healthy', hitCount: 1, summary: '用户补充的客户信息' },
      ],
      riskNotes: [],
      formattedEvidence: task.evidences || [],
    };
    task.evidencePackVersions = task.evidencePackVersions.map((ev) => ({ ...ev, isCurrent: false }));
    task.evidencePackVersions.push(newEvidencePack);
    task.currentEvidencePackVersionId = evidenceVersionId;
  }

  const userGoal = task.taskPlan?.userGoal || '';
  const status = detectOutputStatus(userGoal);

  const newVersion = {
    versionId,
    label,
    status,
    isCurrent: true,
    reason,
    createdAt: now,
    formalVersion: status === 'failed' ? '' : FORMAL_CONTENT,
    conciseVersion: status === 'failed' ? '' : CONCISE_CONTENT,
    spokenVersion: status === 'failed' ? '' : SPOKEN_CONTENT,
    failureReason: status === 'failed' ? '输出生成失败：模型调用返回空响应。' : undefined,
    evidenceVersionId,
  };

  // Mark all existing versions as not current
  task.outputVersions = task.outputVersions.map((v) => ({ ...v, isCurrent: false }));
  task.outputVersions.push(newVersion);
  task.currentOutputVersionId = versionId;
  task.updatedAt = now;

  return {
    taskId: task.taskId,
    versionId,
    label,
    status,
    currentVersionId: task.currentOutputVersionId,
    output: newVersion,
  };
};

// ---------------------------------------------------------------------------
// Public: setCurrentOutputVersion(taskId, versionId) → boolean
// ---------------------------------------------------------------------------

export const setCurrentOutputVersion = (taskId, versionId) => {
  const task = tasks.get(taskId);
  if (!task) return { success: false, error: 'TASK_NOT_FOUND' };

  lazyGenerateOutputIfNeeded(task);

  if (!task.outputVersions || task.outputVersions.length === 0) {
    return { success: false, error: 'TASK_OUTPUT_NOT_READY' };
  }

  const targetVersion = task.outputVersions.find((v) => v.versionId === versionId);
  if (!targetVersion) {
    return { success: false, error: 'OUTPUT_VERSION_NOT_FOUND' };
  }

  const now = new Date().toISOString();

  task.outputVersions = task.outputVersions.map((v) => ({
    ...v,
    isCurrent: v.versionId === versionId,
  }));
  task.currentOutputVersionId = versionId;
  task.updatedAt = now;

  return {
    success: true,
    data: {
      taskId: task.taskId,
      currentVersionId: task.currentOutputVersionId,
      versions: task.outputVersions,
    },
  };
};

// ---------------------------------------------------------------------------
// Public: exportOutputMarkdown(taskId) → { filename, markdown } | null
// ---------------------------------------------------------------------------

export const exportOutputMarkdown = (taskId) => {
  const task = tasks.get(taskId);
  if (!task) return null;

  lazyGenerateOutputIfNeeded(task);

  if (!task.outputVersions || task.outputVersions.length === 0) return null;

  const currentVersion = task.outputVersions.find((v) => v.versionId === task.currentOutputVersionId);
  if (!currentVersion) return null;

  const lines = [];
  const title = task.taskPlan?.taskTitle || 'Output Report';

  lines.push(`# ${title}`);
  lines.push('');
  lines.push('## 任务目标');
  lines.push(task.taskPlan?.userGoal || '');
  lines.push('');

  lines.push('## 正式交付版');
  lines.push(currentVersion.formalVersion || '（未生成）');
  lines.push('');

  lines.push('## 简洁沟通版');
  lines.push(currentVersion.conciseVersion || '（未生成）');
  lines.push('');

  lines.push('## 口语跟进版');
  lines.push(currentVersion.spokenVersion || '（未生成）');
  lines.push('');

  lines.push('## 关键依据');
  for (const ev of task.evidences || []) {
    lines.push(`- **${ev.title}**：${ev.summary}`);
  }
  lines.push('');

  lines.push('## 风险与限制');
  for (const r of task.risks || []) {
    lines.push(`- **${r.title}**：${r.description}`);
  }
  lines.push('');

  lines.push('## 执行过程');
  for (const step of task.executionSteps || []) {
    const icon = step.status === 'done' ? '✅' : step.status === 'degraded' ? '⚠️' : step.status === 'failed' ? '❌' : '⏳';
    lines.push(`- ${icon} ${step.title}${step.summary ? `：${step.summary}` : ''}`);
  }

  const markdown = lines.join('\n');
  const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-_]/g, '_');
  const filename = `output-${currentVersion.label}-${safeTitle}.md`;

  return { filename, markdown };
};

// ---------------------------------------------------------------------------
// Public: listAllTasks() → array (for debugging / future Archive)
// ---------------------------------------------------------------------------

export const listAllTasks = () => {
  return Array.from(tasks.values()).map((t) => ({
    taskId: t.taskId,
    taskTitle: t.taskPlan?.taskTitle,
    status: t.status,
    updatedAt: t.updatedAt,
  }));
};

// ============================================================================
// Task Archive (P0-Full-4)
// ============================================================================

function mapTaskStatus(task) {
  if (task.status === 'done') return 'completed';
  if (task.status === 'running') return 'running';
  if (task.status === 'waiting_confirmation') return 'draft';
  if (task.status === 'failed') return 'failed';
  return 'draft';
}

function buildPlanVersions(task) {
  if (!task.taskPlan) return [];
  const versionId = task.taskPlan.planVersionId || `${task.taskId}-plan-v1`;
  return [{
    versionId,
    label: 'v1',
    kind: 'task_plan',
    reason: '初始计划',
    createdAt: task.taskPlan.createdAt || task.createdAt,
    status: 'archived',
    summary: task.taskPlan.understanding || '任务计划',
  }];
}

function buildEvidenceVersions(task) {
  if (!task.evidencePackVersions || task.evidencePackVersions.length === 0) return [];
  return task.evidencePackVersions.map((ev) => ({
    versionId: ev.versionId,
    label: ev.label,
    kind: 'evidence_pack',
    reason: ev.reason,
    createdAt: ev.createdAt,
    status: ev.isCurrent ? 'active' : 'archived',
    summary: `证据包 ${ev.label}：${ev.sources?.length || 0} 个证据源，命中 ${ev.evidenceCount || 0} 条`,
  }));
}

function mapOutputVersionToRecord(v) {
  return {
    versionId: v.versionId,
    label: v.label,
    kind: 'output',
    reason: v.reason,
    createdAt: v.createdAt,
    status: v.status === 'failed' ? 'failed' : (v.isCurrent ? 'active' : 'archived'),
    failureReason: v.failureReason,
    summary: v.formalVersion ? v.formalVersion.slice(0, 80) + '...' : '',
  };
}

function mapTaskToArchiveItem(task) {
  const now = new Date().toISOString();

  return {
    taskId: task.taskId,
    taskTitle: task.taskPlan?.taskTitle || '',
    taskType: task.taskPlan?.taskType || 'full_workflow',
    status: mapTaskStatus(task),
    recentStep: task.status === 'done' ? 'Output 生成完成' : task.status === 'running' ? '执行中' : '未开始',
    assistantName: task.taskPlan?.executionContext?.assistantName || '默认销售支持助手',
    updatedAt: task.updatedAt || now,
    taskGoal: task.taskPlan?.userGoal || '',
    planVersions: buildPlanVersions(task),
    evidencePackVersions: buildEvidenceVersions(task),
    outputVersions: (task.outputVersions || []).map(mapOutputVersionToRecord),
    analysisSummary: task.status === 'done' ? '分析完成：识别为销售跟进场景。' : '',
    evidenceSummary: task.status === 'done' ? '已整理 2 条依据：内部知识库和参考案例。' : '',
    risks: (task.risks || []).map((r) => ({ level: r.level, title: r.title, description: r.description })),
    executionContext: task.taskPlan?.executionContext || {
      assistantName: '默认销售支持助手',
      modelName: 'qwen3-8b',
      dataSources: [],
      taskPlanner: { status: 'ready', source: 'rule_engine' },
    },
    failedStep: task.taskExecution?.steps?.find((s) => s.status === 'failed')?.title,
    failureKind: task.taskExecution?.steps?.find((s) => s.status === 'failed')?.failureKind,
    failureReason: task.taskExecution?.steps?.find((s) => s.status === 'failed')?.failureReason,
    completedSteps: task.taskExecution?.steps?.filter((s) => s.status === 'done').map((s) => s.title),
    pendingSteps: task.taskExecution?.steps?.filter((s) => s.status !== 'done').map((s) => s.title),
    hasOutput: !!(task.outputVersions && task.outputVersions.length > 0),
  };
}

// ---------------------------------------------------------------------------
// Public: listTasks(query?) → TaskArchiveItem[]
// ---------------------------------------------------------------------------

export const listTasks = (query = {}) => {
  // Merge new tasks + legacy sessions, deduplicate by taskId
  const taskItems = Array.from(tasks.values()).map(mapTaskToArchiveItem);
  const legacyItems = listLegacySessionTasks();
  const seen = new Set();
  const merged = [];

  for (const item of [...taskItems, ...legacyItems]) {
    if (seen.has(item.taskId)) continue;
    seen.add(item.taskId);
    merged.push(item);
  }

  merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (query.taskTitle) {
    const keyword = String(query.taskTitle).toLowerCase();
    return merged.filter((t) => t.taskTitle.toLowerCase().includes(keyword));
  }

  if (query.taskType && query.taskType !== 'all') {
    return merged.filter((t) => t.taskType === query.taskType);
  }

  if (query.status && query.status !== 'all') {
    return merged.filter((t) => t.status === query.status);
  }

  return merged;
};

// ---------------------------------------------------------------------------
// Public: getTaskArchiveDetail(taskId) → TaskArchiveDetail | null
// ---------------------------------------------------------------------------

export const getTaskArchiveDetail = (taskId) => {
  const task = tasks.get(taskId);
  if (task) {
    const item = mapTaskToArchiveItem(task);

    // Ensure output is lazily generated for consistent hasOutput/currentVersion
    lazyGenerateOutputIfNeeded(task);

    return {
      ...item,
      taskPlan: task.taskPlan || null,
      execution: task.taskExecution || null,
      currentPlanVersionId: task.taskPlan?.planVersionId || null,
      currentEvidencePackVersionId: task.currentEvidencePackVersionId || null,
      currentOutputVersionId: task.currentOutputVersionId || null,
      analysisSummary: item.analysisSummary || (task.taskPlan?.understanding || ''),
      evidenceSummary: item.evidenceSummary || '',
      outputSummary: task.currentOutputVersionId
        ? (task.outputVersions?.find((v) => v.versionId === task.currentOutputVersionId)?.formalVersion?.slice(0, 120) || '') + '...'
        : '',
      riskSummary: (task.risks || []).map((r) => r.title).join('；'),
      source: 'task',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  // Fall back to legacy session
  const legacy = getLegacySessionTaskDetail(taskId);
  if (legacy) return legacy;

  return null;
};

// ---------------------------------------------------------------------------
// Public: listRecentTasks() → array of 3-5 recent tasks
// ---------------------------------------------------------------------------

export const listRecentTasks = () => {
  const allTasks = Array.from(tasks.values())
    .map(mapTaskToArchiveItem)
    .sort((a, b) => {
      // Prioritize continuable tasks, then by updatedAt
      if (a.status === 'continuable' && b.status !== 'continuable') return -1;
      if (b.status === 'continuable' && a.status !== 'continuable') return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return allTasks.slice(0, 5).map((t) => ({
    taskId: t.taskId,
    taskTitle: t.taskTitle,
    status: t.status,
    recentStep: t.recentStep,
    updatedAt: t.updatedAt,
    continuable: t.status === 'continuable' || t.status === 'running',
    hasOutput: t.hasOutput,
  }));
};

// ---------------------------------------------------------------------------
// Public: continueTask(taskId, mode) → resumeContext || null
// ---------------------------------------------------------------------------

export const continueTask = (taskId, mode) => {
  const task = tasks.get(taskId);
  const isLegacy = !task && isLegacySession(taskId);

  if (!task && !isLegacy) return null;

  const now = new Date().toISOString();
  const legacyDetail = isLegacy ? getLegacySessionTaskDetail(taskId) : null;

  const taskTitle = task?.taskPlan?.taskTitle || legacyDetail?.taskTitle || '';
  const taskGoal = task?.taskPlan?.userGoal || legacyDetail?.taskGoal || '';
  const taskType = task?.taskPlan?.taskType || legacyDetail?.taskType || 'full_workflow';

  const resumeContext = {
    taskId,
    taskTitle,
    taskGoal,
    taskType,
    source: isLegacy ? 'legacy_session' : 'task',
    existingPlanVersionId: task?.taskPlan?.planVersionId || null,
    hasOutput: isLegacy ? !!(legacyDetail?.hasOutput) : !!(task?.outputVersions && task.outputVersions.length > 0),
    outputVersionCount: isLegacy ? 0 : (task?.outputVersions?.length || 0),
    existingOutputVersionIds: isLegacy ? [] : (task?.outputVersions || []).map((v) => v.versionId),
  };

  switch (mode) {
    case 'continue-output':
      return {
        resumeContext,
        nextRoute: '/workbench',
        message: '返回 Workbench 基于当前结果继续输出',
      };

    case 'supplement-regenerate': {
      // Generate new Evidence Pack version
      const evCount = (task.evidencePackVersions?.length || 0) + 1;
      const evVersionId = `${taskId}-evidence-v${evCount}`;
      const newEvidencePack = {
        versionId: evVersionId,
        label: `v${evCount}`,
        status: 'success',
        isCurrent: true,
        reason: '补充资料后重新生成',
        source: 'supplement-regenerate',
        createdAt: now,
        evidenceCount: 4,
        sources: [
          { sourceId: 'internal-kb', sourceName: '内部知识库', sourceType: 'internal_knowledge', status: 'healthy', hitCount: 2, summary: '命中内部知识库 2 条相关资料' },
          { sourceId: 'reference-pack', sourceName: 'Reference Pack', sourceType: 'reference_pack', status: 'healthy', hitCount: 1, summary: '命中参考资料库 1 条相关案例' },
          { sourceId: 'supplemented', sourceName: '用户补充资料', sourceType: 'customer_data', status: 'healthy', hitCount: 1, summary: '用户补充的客户信息' },
        ],
        riskNotes: [],
        formattedEvidence: task.evidences || [],
      };

      if (!task.evidencePackVersions) task.evidencePackVersions = [];
      task.evidencePackVersions = task.evidencePackVersions.map((ev) => ({ ...ev, isCurrent: false }));
      task.evidencePackVersions.push(newEvidencePack);
      task.currentEvidencePackVersionId = evVersionId;
      task.updatedAt = now;

      return {
        resumeContext: {
          ...resumeContext,
          newEvidencePackVersionId: evVersionId,
        },
        nextRoute: '/workbench',
        message: '返回 Workbench 补充资料后重新生成',
      };
    }

    case 'edit-goal':
      return {
        resumeContext,
        nextRoute: '/workbench',
        message: '返回 Workbench 编辑任务目标',
      };

    case 'clone-task-structure': {
      const cloneTaskId = randomUUID();
      const clonePlanId = randomUUID();

      const baseTaskPlan = isLegacy
        ? {
            taskTitle: (legacyDetail?.taskTitle || taskTitle) + ' (副本)',
            taskType,
            userGoal: taskGoal,
            understanding: legacyDetail?.analysisSummary || '',
            executionContext: legacyDetail?.executionContext || buildExecutionContext(),
            riskHints: [],
          }
        : (task?.taskPlan || {});

      const cloneTaskPlan = {
        ...baseTaskPlan,
        taskId: cloneTaskId,
        planVersionId: clonePlanId,
        taskTitle: (baseTaskPlan.taskTitle || '') + (baseTaskPlan.taskTitle?.includes('(副本)') ? '' : ' (副本)'),
        planVersion: 'v1',
        createdAt: now,
        updatedAt: now,
        steps: buildTaskSteps(cloneTaskId),
        riskHints: baseTaskPlan.riskHints || [],
      };

      const cloneTask = {
        taskId: cloneTaskId,
        taskPlan: cloneTaskPlan,
        taskExecution: null,
        outputVersions: [],
        currentOutputVersionId: undefined,
        evidences: [],
        risks: [],
        executionSteps: [],
        status: 'waiting_confirmation',
        planVersion: 'v1',
        createdAt: now,
        updatedAt: now,
      };

      tasks.set(cloneTaskId, cloneTask);

      return {
        resumeContext: {
          ...resumeContext,
          taskId: cloneTaskId,
          cloneFrom: taskId,
          hasOutput: false,
          outputVersionCount: 0,
          existingOutputVersionIds: [],
        },
        nextRoute: '/workbench',
        message: '已创建任务副本（不含历史版本/证据/Output）',
      };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Public: setCurrentTaskVersion(taskId, versionType, versionId) → TaskArchiveDetail | null
// ---------------------------------------------------------------------------

export const setCurrentTaskVersion = (taskId, versionType, versionId) => {
  // Legacy session: readonly
  if (isLegacySession(taskId)) {
    return { success: false, error: 'LEGACY_SESSION_READONLY' };
  }

  const task = tasks.get(taskId);
  if (!task) return { success: false, error: 'TASK_NOT_FOUND' };

  const now = new Date().toISOString();

  if (versionType === 'output') {
    if (!task.outputVersions || task.outputVersions.length === 0) {
      return { success: false, error: 'OUTPUT_VERSION_NOT_FOUND' };
    }

    const target = task.outputVersions.find((v) => v.versionId === versionId);
    if (!target) {
      return { success: false, error: 'OUTPUT_VERSION_NOT_FOUND' };
    }

    task.outputVersions = task.outputVersions.map((v) => ({
      ...v,
      isCurrent: v.versionId === versionId,
    }));
    task.currentOutputVersionId = versionId;
    task.updatedAt = now;
  } else if (versionType === 'task_plan') {
    // P0: only one plan version, verify it exists
    if (task.taskPlan?.planVersionId !== versionId) {
      return { success: false, error: 'PLAN_VERSION_NOT_FOUND' };
    }
  } else if (versionType === 'evidence_pack') {
    if (!task.evidencePackVersions || task.evidencePackVersions.length === 0) {
      return { success: false, error: 'EVIDENCE_VERSION_NOT_FOUND' };
    }

    const target = task.evidencePackVersions.find((v) => v.versionId === versionId);
    if (!target) {
      return { success: false, error: 'EVIDENCE_VERSION_NOT_FOUND' };
    }

    task.evidencePackVersions = task.evidencePackVersions.map((v) => ({
      ...v,
      isCurrent: v.versionId === versionId,
    }));
    task.currentEvidencePackVersionId = versionId;
    task.updatedAt = now;
  } else {
    return { success: false, error: 'INVALID_VERSION_TYPE' };
  }

  return { success: true, data: getTaskArchiveDetail(taskId) };
};
