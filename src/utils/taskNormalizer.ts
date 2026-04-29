import type { TaskPlan, TaskExecution, TaskStep, TaskStepExecution, MissingInfoItem, ExecutionContextSummary, TaskOutputPreview } from '../types/taskPlan';
import type { OutputDetail, OutputVersion, OutputEvidence, OutputRisk, EvidenceSourceType, EvidenceStatus } from '../types/output';
import type { TaskArchiveItem, TaskArchiveStatus, TaskVersionRecord } from '../types/taskArchive';

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

// ===== Task Archive normalizers =====

const VALID_ARCHIVE_STATUSES = new Set(['continuable', 'failed', 'running', 'needs_info', 'completed', 'draft']);

function normalizeArchiveStatus(status: string): TaskArchiveStatus {
  if (VALID_ARCHIVE_STATUSES.has(status)) return status as TaskArchiveStatus;
  if (status === 'done') return 'completed';
  if (status === 'waiting_confirmation') return 'draft';
  return 'completed';
}

function normalizeTaskVersionRecord(raw: any): TaskVersionRecord {
  return {
    versionId: raw.versionId || raw.version_id || '',
    label: raw.label || 'v1',
    kind: (['task_plan', 'evidence_pack', 'output'].includes(raw.kind) ? raw.kind : 'output'),
    reason: raw.reason || '',
    createdAt: raw.createdAt || raw.created_at || '',
    status: (['active', 'archived', 'failed'].includes(raw.status) ? raw.status : 'archived'),
    failureReason: raw.failureReason || raw.failure_reason,
    summary: raw.summary,
  };
}

export function normalizeTaskArchiveListResponse(raw: any): TaskArchiveItem[] {
  const data = raw?.data?.data || raw?.data || raw || {};
  const items: any[] = data.items || data || [];
  if (!Array.isArray(items)) return [];
  return items.map(normalizeTaskArchiveItem);
}

export function normalizeTaskArchiveItem(raw: any): TaskArchiveItem {
  return {
    taskId: raw.taskId || raw.task_id || '',
    taskTitle: raw.taskTitle || raw.task_title || '未命名任务',
    taskType: raw.taskType || raw.task_type || 'full_workflow',
    status: normalizeArchiveStatus(raw.status),
    recentStep: raw.recentStep || raw.recent_step,
    assistantName: raw.assistantName || raw.assistant_name || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    taskGoal: raw.taskGoal || raw.task_goal || '',
    planVersions: (raw.planVersions || raw.plan_versions || []).map(normalizeTaskVersionRecord),
    evidencePackVersions: (raw.evidencePackVersions || raw.evidence_pack_versions || []).map(normalizeTaskVersionRecord),
    outputVersions: (raw.outputVersions || raw.output_versions || []).map(normalizeTaskVersionRecord),
    analysisSummary: raw.analysisSummary || raw.analysis_summary,
    evidenceSummary: raw.evidenceSummary || raw.evidence_summary,
    risks: (raw.risks || []).map((r: any) => ({
      level: r.level || 'info',
      title: r.title || '',
      description: r.description || '',
    })),
    executionContext: {
      assistantName: raw.executionContext?.assistantName || raw.execution_context?.assistant_name || raw.executionContext?.assistant_name || '',
      modelName: raw.executionContext?.modelName || raw.execution_context?.model_name || raw.executionContext?.model_name || '',
      dataSources: (raw.executionContext?.dataSources || raw.execution_context?.data_sources || []).map((ds: any) => ({
        name: ds.name || '',
        status: ds.status || 'unknown',
      })),
      taskPlanner: {
        status: raw.executionContext?.taskPlanner?.status || raw.execution_context?.task_planner?.status || 'unknown',
        source: raw.executionContext?.taskPlanner?.source || raw.execution_context?.task_planner?.source || 'embedded_model',
      },
    },
    failedStep: raw.failedStep || raw.failed_step,
    failureKind: raw.failureKind || raw.failure_kind,
    failureReason: raw.failureReason || raw.failure_reason,
    completedSteps: raw.completedSteps || raw.completed_steps,
    pendingSteps: raw.pendingSteps || raw.pending_steps,
    hasOutput: Boolean(raw.hasOutput ?? raw.has_output ?? false),
    source: (raw.source === 'task' || raw.source === 'legacy_session') ? raw.source : undefined,
  };
}

export function normalizeTaskArchiveDetailResponse(raw: any): any {
  const data = raw?.data?.data || raw?.data || raw || {};
  // Archive detail extends TaskArchiveItem with more fields
  return {
    ...normalizeTaskArchiveItem(data),
    taskPlan: data.taskPlan || data.task_plan || null,
    execution: data.execution || null,
    currentPlanVersionId: data.currentPlanVersionId || data.current_plan_version_id || null,
    currentEvidencePackVersionId: data.currentEvidencePackVersionId || data.current_evidence_pack_version_id || null,
    currentOutputVersionId: data.currentOutputVersionId || data.current_output_version_id || null,
    outputSummary: data.outputSummary || data.output_summary || '',
    riskSummary: data.riskSummary || data.risk_summary || '',
    source: data.source || 'task',
    createdAt: data.createdAt || data.created_at || '',
    withUpdatedAt: data.updatedAt || data.updated_at || '',
  };
}

export function normalizeContinueTaskResponse(raw: any): { resumeContext: any; nextRoute: string } {
  const data = raw?.data?.data || raw?.data || raw || {};
  return {
    resumeContext: data.resumeContext || data.resume_context || {},
    nextRoute: data.nextRoute || data.next_route || '/workbench',
  };
}
