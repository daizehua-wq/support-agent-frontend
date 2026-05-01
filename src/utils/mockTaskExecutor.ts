import type {
  TaskExecution,
  TaskExecutionStatus,
  TaskStepExecution,
  TaskOutputPreview,
} from '../types/taskPlan';

type StepResolver = (goal: string) => Pick<
  TaskStepExecution,
  'status' | 'summary' | 'details' | 'riskNotes' | 'degradedReason' | 'failureReason' | 'failureKind'
>;

const ANALYSIS_RESOLVER: StepResolver = (goal) => {
  if (goal.includes('分析失败')) {
    return {
      status: 'failed',
      failureReason: '模拟的分析步骤失败：客户输入语义分析未返回有效结果。',
      failureKind: 'analysis',
    };
  }

  return {
    status: 'done',
    summary: '识别为销售跟进场景，建议输出正式跟进方案。',
    details: ['客户行业：半导体材料', '场景类型：销售跟进', '推荐输出：正式交付版'],
  };
};

const EVIDENCE_RESOLVER: StepResolver = (goal) => {
  if (goal.includes('外部源失败')) {
    return {
      status: 'failed',
      failureReason: '模拟的外部资料源不可用：企查查连接中断。',
      failureKind: 'external_source',
    };
  }

  if (goal.includes('内部知识库失败')) {
    return {
      status: 'failed',
      failureReason: '模拟的内部知识库检索失败：本地索引不完整。',
      failureKind: 'internal_knowledge',
    };
  }

  if (goal.includes('降级')) {
    return {
      status: 'degraded',
      summary: '已从内部知识库和 Reference Pack 中整理 2 条可引用依据。',
      degradedReason: '外部资料源当前不可用，已降级为仅内部检索。',
      riskNotes: ['本次证据基于内部知识库生成，不含外部权威数据源验证。'],
    };
  }

  return {
    status: 'done',
    summary: '已从内部知识库和 Reference Pack 中整理 3 条可引用依据。',
    details: ['证据 1：行业通用涂布工艺标准', '证据 2：同类客户案例参考', '证据 3：产品技术参数对比'],
  };
};

const OUTPUT_RESOLVER: StepResolver = (goal) => {
  if (goal.includes('输出失败')) {
    return {
      status: 'failed',
      failureReason: '模拟的输出生成失败：模型调用返回空响应。',
      failureKind: 'output',
    };
  }

  return {
    status: 'done',
    summary: '已生成正式交付版、简洁沟通版、口语跟进版。',
    details: ['正式交付版：314 字', '简洁沟通版：128 字', '口语跟进版：196 字'],
  };
};

const SAVE_RESOLVER: StepResolver = () => ({
  status: 'done',
  summary: '已保存到历史任务。',
});

const STEP_MAP: Record<string, { title: string; type: TaskStepExecution['type']; duration: number; resolve: StepResolver }> = {
  analysis: { title: '分析客户场景', type: 'analysis', duration: 600, resolve: ANALYSIS_RESOLVER },
  evidence: { title: '检索资料与证据', type: 'evidence', duration: 700, resolve: EVIDENCE_RESOLVER },
  output: { title: '生成输出', type: 'output', duration: 800, resolve: OUTPUT_RESOLVER },
  save: { title: '保存历史任务', type: 'save', duration: 300, resolve: SAVE_RESOLVER },
};

const STEP_ORDER = ['analysis', 'evidence', 'output', 'save'] as const;

function buildMockOutputPreview(goal: string): TaskOutputPreview {
  const degraded = goal.includes('降级');
  const baseFormal = '尊敬的客户：根据我们的分析，贵司当前处于半导体材料应用的关键阶段。我们建议从涂布工艺参数优化入手，结合行业标准方案，制定分阶段技术对接计划。近期我们将整理一份详细的技术方案供您审阅。\n\n此方案将包含：工艺兼容性分析、同类客户案例参考、初步成本对比评估。如有需要调整的方向，请随时告知。';

  return {
    formalPreview: baseFormal,
    concisePreview: '基于当前分析，建议从涂布工艺参数优化入手，制定分阶段技术对接计划。',
    spokenPreview: '您好，根据我们对您这边情况的分析，建议咱们先从涂布工艺这块切入，我们会整理一份详细的技术方案给您看。',
    evidenceCount: degraded ? 2 : 3,
    riskCount: degraded ? 2 : 1,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMockExecution(
  goal: string,
  taskId: string,
  onStepUpdate: (step: TaskStepExecution, allSteps: TaskStepExecution[]) => void,
  signal?: AbortSignal,
): Promise<TaskExecution> {
  const steps: TaskStepExecution[] = STEP_ORDER.map((key) => {
    const cfg = STEP_MAP[key];
    return {
      stepId: `${taskId}-${key}`,
      type: cfg.type,
      title: cfg.title,
      status: 'pending',
    };
  });

  let overallStatus: TaskExecutionStatus = 'running';

  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) {
      overallStatus = 'cancelled';
      break;
    }

    const step = steps[i];
    const cfg = STEP_MAP[STEP_ORDER[i]];

    step.status = 'running';
    step.startedAt = new Date().toISOString();
    onStepUpdate(step, [...steps]);
    await delay(cfg.duration);

    if (signal?.aborted) {
      overallStatus = 'cancelled';
      break;
    }

    const resolved = cfg.resolve(goal);

    Object.assign(step, {
      ...resolved,
      completedAt: new Date().toISOString(),
      durationMs: cfg.duration,
    });

    onStepUpdate(step, [...steps]);

    if (resolved.status === 'failed') {
      overallStatus = 'failed';
      break;
    }

    if (resolved.status === 'degraded') {
      overallStatus = 'degraded';
    }
  }

  if (overallStatus === 'running') {
    overallStatus = 'done';
  }

  const outputPreview = overallStatus === 'done' || overallStatus === 'degraded'
    ? buildMockOutputPreview(goal)
    : undefined;

  return {
    taskId,
    status: overallStatus,
    currentStepId: steps.find((s) => s.status === 'running')?.stepId,
    steps,
    outputPreview,
  };
}

export function getNextPendingStep(steps: TaskStepExecution[]): TaskStepExecution | undefined {
  return steps.find((s) => s.status === 'pending');
}

export function getLastCompletedStep(steps: TaskStepExecution[]): TaskStepExecution | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === 'done' || steps[i].status === 'degraded') return steps[i];
  }
  return undefined;
}

export function hasFailedStepOfKind(steps: TaskStepExecution[], kind: string): boolean {
  return steps.some((s) => s.status === 'failed' && s.failureKind === kind);
}
