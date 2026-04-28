import { randomUUID } from 'crypto';

// ============================================================================
// In-memory Task Store (P0 — no DB migration, no old session adapter)
// ============================================================================

const tasks = new Map();

const normalizeText = (value = '') => String(value || '').trim();

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

const buildExecutionContext = () => ({
  assistantName: '默认销售助手',
  assistantSource: 'global_default',
  modelName: 'qwen3-8b',
  dataSources: [
    { name: '内部知识库', status: 'healthy' },
    { name: '企查查', status: 'unknown' },
    { name: '参考资料库', status: 'healthy' },
  ],
  taskPlanner: {
    status: 'ready',
    source: 'rule_engine',
  },
});

// ---------------------------------------------------------------------------
// TaskPlan: understanding generation (rule-based, no LLM)
// ---------------------------------------------------------------------------

const buildUnderstanding = (userGoal) => {
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

export const createTask = (userGoal) => {
  const taskId = randomUUID();
  const planId = randomUUID();
  const planVersion = 'v1';
  const now = new Date().toISOString();

  const taskPlan = {
    taskId,
    taskTitle: truncateText(userGoal),
    taskType: inferTaskType(userGoal),
    userGoal: normalizeText(userGoal),
    understanding: buildUnderstanding(userGoal),
    status: 'waiting_confirmation',
    steps: buildTaskSteps(taskId),
    missingInfo: buildMissingInfo(userGoal),
    executionContext: buildExecutionContext(),
    riskHints: buildRiskHints(userGoal),
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

  // --------------------------------------------------------
  // Async step simulation (P0 mock — progresses automatically)
  // --------------------------------------------------------
  runExecutionSimulation(taskId);

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
// Internal: run step simulation with setTimeout
// ---------------------------------------------------------------------------

const SIMULATION_CONFIG = [
  { stepIndex: 0, delayMs: 2000,  summary: '已完成客户场景分析与需求识别',        details: ['客户画像：基于输入信息构建', '需求识别：识别出关键业务诉求', '风险评估：无显著风险项'] },
  { stepIndex: 1, delayMs: 4000,  summary: '已检索内部知识库与参考资料',            details: ['内部知识库：检索到 3 条相关记录', '参考资料：匹配到 2 篇相关文档', '外部源：企查查查询未启用'] },
  { stepIndex: 2, delayMs: 6000,  summary: '已生成三版交付文稿',                    details: ['正式版：已完成完整文稿', '简洁版：已完成沟通要点', '口语版：已完成跟进话术'] },
  { stepIndex: 3, delayMs: 7000,  summary: '已保存任务结果与交付记录',              details: ['执行记录已归档', '交付文稿已保存'] },
];

const runExecutionSimulation = (taskId) => {
  const advanceStep = (configIndex) => {
    if (configIndex >= SIMULATION_CONFIG.length) {
      // All steps done → mark execution as done
      const task = tasks.get(taskId);
      if (!task || !task.taskExecution) return;

      const now = new Date().toISOString();
      task.taskExecution.status = 'done';
      task.taskExecution.currentStepId = undefined;
      task.taskExecution.completedAt = now;
      task.taskExecution.outputPreview = {
        formalPreview: `针对「${task.taskPlan.userGoal}」的正式交付文稿已生成。包含完整分析、证据引用和行动建议。`,
        concisePreview: `核心结论：基于分析，建议重点关注客户需求匹配度和风险敞口。`,
        spokenPreview: `您好，根据分析结果，我准备了跟进要点：第一……第二……方便时我们沟通。`,
        evidenceCount: 3,
        riskCount: 0,
      };
      task.status = 'done';
      task.updatedAt = now;
      return;
    }

    const { stepIndex, delayMs, summary, details } = SIMULATION_CONFIG[configIndex];

    setTimeout(() => {
      const task = tasks.get(taskId);
      if (!task || !task.taskExecution) return;
      if (task.taskExecution.status !== 'running') return;

      const now = new Date().toISOString();

      // Mark previous step as done
      if (stepIndex > 0) {
        const prevStep = task.taskExecution.steps[stepIndex - 1];
        prevStep.status = 'done';
        prevStep.completedAt = now;
        prevStep.durationMs = (stepIndex === 1 ? 2000 : 2000);
      }

      // Start current step
      const step = task.taskExecution.steps[stepIndex];
      step.status = 'running';
      step.startedAt = now;
      task.taskExecution.currentStepId = step.stepId;
      task.updatedAt = now;

      // Complete current step
      setTimeout(() => {
        const task2 = tasks.get(taskId);
        if (!task2 || !task2.taskExecution) return;
        if (task2.taskExecution.status !== 'running') return;

        const completeTime = new Date().toISOString();
        step.status = 'done';
        step.completedAt = completeTime;
        step.durationMs = Date.now() - new Date(now).getTime();
        step.summary = summary;
        step.details = details;
        task2.updatedAt = completeTime;

        // Advance to next step
        advanceStep(configIndex + 1);
      }, 1500);
    }, delayMs);
  };

  // Start immediately: mark step 0 as running
  const task = tasks.get(taskId);
  if (!task || !task.taskExecution) return;

  const now = new Date().toISOString();
  task.taskExecution.steps[0].status = 'running';
  task.taskExecution.steps[0].startedAt = now;
  task.updatedAt = now;

  advanceStep(0);
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
