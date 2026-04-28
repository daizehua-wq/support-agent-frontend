import type { TaskPlan, TaskExecution, TaskStep, TaskStepExecution, MissingInfoItem, ExecutionContextSummary, TaskOutputPreview } from '../types/taskPlan';
import type { OutputDetail, OutputVersion, OutputEvidence, OutputRisk, EvidenceSourceType, EvidenceStatus } from '../types/output';

function normalizeTaskStep(raw: any): TaskStep {
  return {
    stepId: raw.stepId || raw.step_id || '',
    order: Number(raw.order) || 0,
    type: raw.type || 'analysis',
    title: raw.title || '',
    required: raw.required !== false,
    status: 'pending',
  };
}

function normalizeMissingInfo(raw: any): MissingInfoItem {
  return {
    field: raw.field || '',
    label: raw.label || '',
    level: raw.level || 'optional',
    reason: raw.reason,
  };
}

function normalizeExecutionContext(raw: any): ExecutionContextSummary {
  return {
    assistantName: raw.assistantName || raw.assistant_name || '',
    assistantSource: raw.assistantSource || raw.assistant_source || 'global_default',
    modelName: raw.modelName || raw.model_name || '',
    dataSources: (raw.dataSources || raw.data_sources || []).map((ds: any) => ({
      name: ds.name || '',
      status: ds.status || 'unknown',
    })),
    taskPlanner: {
      status: raw.taskPlanner?.status || raw.task_planner?.status || 'unknown',
      source: raw.taskPlanner?.source || raw.task_planner?.source || 'embedded-planner',
    },
  };
}

export function normalizeTaskPlanResponse(raw: any): TaskPlan {
  // BE may wrap: { success, data: { taskPlan: { ... } } }
  // or unwrapped by request.ts to: { taskPlan: { ... } }
  // or direct TaskPlan object
  const plan = raw?.taskPlan || raw?.data?.taskPlan || raw;

  return {
    taskId: plan.taskId || plan.task_id || '',
    taskTitle: plan.taskTitle || plan.task_title || '新任务',
    taskType: plan.taskType || plan.task_type || 'full_workflow',
    userGoal: plan.userGoal || plan.user_goal || '',
    understanding: plan.understanding || '',
    status: plan.status || 'draft',
    steps: (plan.steps || []).map(normalizeTaskStep),
    missingInfo: (plan.missingInfo || plan.missing_info || []).map(normalizeMissingInfo),
    executionContext: normalizeExecutionContext(plan.executionContext || plan.execution_context || {}),
    riskHints: plan.riskHints || plan.risk_hints || [],
  };
}

function normalizeTaskStepExecution(raw: any): TaskStepExecution {
  return {
    stepId: raw.stepId || raw.step_id || '',
    type: raw.type || 'analysis',
    title: raw.title || '',
    status: raw.status || 'pending',
    startedAt: raw.startedAt || raw.started_at,
    completedAt: raw.completedAt || raw.completed_at,
    durationMs: raw.durationMs || raw.duration_ms,
    summary: raw.summary,
    details: raw.details,
    riskNotes: raw.riskNotes || raw.risk_notes,
    degradedReason: raw.degradedReason || raw.degraded_reason,
    failureReason: raw.failureReason || raw.failure_reason,
    failureKind: raw.failureKind || raw.failure_kind,
  };
}

export function normalizeTaskExecutionResponse(raw: any): TaskExecution {
  const exec = raw?.taskExecution || raw?.data?.taskExecution || raw;

  let outputPreview: TaskOutputPreview | undefined;
  if (exec.outputPreview || exec.output_preview) {
    const op = exec.outputPreview || exec.output_preview;
    outputPreview = {
      formalPreview: op.formalPreview || op.formal_preview || '',
      concisePreview: op.concisePreview || op.concise_preview || '',
      spokenPreview: op.spokenPreview || op.spoken_preview || '',
      evidenceCount: Number(op.evidenceCount || op.evidence_count) || 0,
      riskCount: Number(op.riskCount || op.risk_count) || 0,
    };
  }

  return {
    taskId: exec.taskId || exec.task_id || '',
    status: exec.status || 'idle',
    currentStepId: exec.currentStepId || exec.current_step_id,
    steps: (exec.steps || []).map(normalizeTaskStepExecution),
    outputPreview,
  };
}

// ===== Output normalizers =====

const VALID_OUTPUT_STATUSES = new Set(['success', 'evidence_insufficient', 'degraded', 'generating', 'failed']);

function normalizeOutputVersion(raw: any, fallbackVersionId?: string): OutputVersion {
  const status = VALID_OUTPUT_STATUSES.has(raw.status) ? raw.status : (raw.status === 'done' ? 'success' : (raw.formalVersion || raw.contents ? 'success' : 'failed'));
  return {
    versionId: raw.versionId || raw.version_id || fallbackVersionId || '',
    label: raw.label || 'v1',
    status,
    isCurrent: Boolean(raw.isCurrent ?? raw.is_current ?? false),
    reason: raw.reason || '',
    createdAt: raw.createdAt || raw.created_at || '',
    formalVersion: raw.formalVersion || raw.formal_version || raw.contents?.formal || '',
    conciseVersion: raw.conciseVersion || raw.concise_version || raw.contents?.concise || '',
    spokenVersion: raw.spokenVersion || raw.spoken_version || raw.contents?.spoken || '',
    failureReason: raw.failureReason || raw.failure_reason,
  };
}

function normalizeEvidence(raw: any): OutputEvidence {
  return {
    id: raw.id || `ev-${Math.random().toString(36).slice(2, 8)}`,
    title: raw.title || '',
    sourceType: (['internal_knowledge', 'reference_pack', 'external_source', 'customer_data'].includes(raw.sourceType || raw.source_type) ? (raw.sourceType || raw.source_type) : 'internal_knowledge') as EvidenceSourceType,
    sourceName: raw.sourceName || raw.source_name || '',
    status: (['healthy', 'degraded', 'unavailable', 'not_used'].includes(raw.status) ? raw.status : 'healthy') as EvidenceStatus,
    summary: raw.summary || '',
  };
}

function normalizeRisk(raw: any): OutputRisk {
  const validLevels = ['info', 'warning', 'danger', 'degraded'];
  return {
    id: raw.id || `r-${Math.random().toString(36).slice(2, 8)}`,
    level: validLevels.includes(raw.level) ? raw.level : 'info',
    title: raw.title || '',
    description: raw.description || '',
  };
}

function normalizeExecutionStep(raw: any): { title: string; status: string; summary?: string } {
  const validStatuses = ['done', 'running', 'failed', 'degraded'];
  return {
    title: raw.title || '',
    status: validStatuses.includes(raw.status) ? raw.status : 'done',
    summary: raw.summary,
  };
}

export function normalizeOutputResponse(raw: any): OutputDetail {
  // Handle multiple wrapping levels
  const data = raw?.data?.data || raw?.data || raw || {};

  const versions: OutputVersion[] = (data.versions || []).map((v: any, i: number) =>
    normalizeOutputVersion(v, `${data.taskId || raw?.taskId || ''}-v${i + 1}`),
  );

  const currentVersionId = data.currentVersionId || data.current_version_id || (versions.length > 0 ? versions[versions.length - 1].versionId : '');

  // Ensure isCurrent is consistent
  const normalizedVersions = versions.map((v) => ({
    ...v,
    isCurrent: v.versionId === currentVersionId,
  }));

  return {
    taskId: data.taskId || data.task_id || currentVersionId?.split('-v')[0] || '',
    taskTitle: data.taskTitle || data.task_title || '未命名任务',
    taskGoal: data.taskGoal || data.task_goal || '',
    outputTarget: data.outputTarget || data.output_target || '',
    tone: data.tone || '',
    status: VALID_OUTPUT_STATUSES.has(data.status) ? data.status : 'success',
    currentVersionId,
    versions: normalizedVersions,
    evidences: (data.evidences || []).map(normalizeEvidence),
    risks: (data.risks || []).map(normalizeRisk),
    executionSteps: (data.executionSteps || data.execution_steps || []).map(normalizeExecutionStep),
  };
}

export function normalizeOutputVersionsResponse(raw: any): { taskId: string; currentVersionId: string; versions: OutputVersion[] } {
  const data = raw?.data?.data || raw?.data || raw || {};

  const versions: OutputVersion[] = (data.versions || []).map(normalizeOutputVersion);
  const currentVersionId = data.currentVersionId || data.current_version_id || (versions.length > 0 ? versions[versions.length - 1].versionId : '');

  const normalizedVersions = versions.map((v) => ({
    ...v,
    isCurrent: v.versionId === currentVersionId,
  }));

  return {
    taskId: data.taskId || data.task_id || '',
    currentVersionId,
    versions: normalizedVersions,
  };
}
