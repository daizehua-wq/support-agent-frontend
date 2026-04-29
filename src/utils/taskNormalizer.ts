import type {
  AssistantSource,
  DataSourceStatus,
  MissingInfoItem,
  MissingInfoLevel,
  PlannerSource,
  PlannerStatus,
  StepFailureKind,
  TaskExecution,
  TaskExecutionStatus,
  TaskOutputPreview,
  TaskPlan,
  TaskPlanStatus,
  TaskStep,
  TaskStepExecution,
  TaskStepExecutionStatus,
  TaskStepType,
  TaskType,
} from '../types/taskPlan';
import type {
  EvidenceSourceType,
  EvidenceStatus,
  ExecutionStep,
  OutputDetail,
  OutputEvidence,
  OutputRisk,
  OutputVersion,
  OutputVersionStatus,
} from '../types/output';
import type {
  TaskArchiveItem,
  TaskArchiveStatus,
  TaskVersionKind,
  TaskVersionRecord,
} from '../types/taskArchive';
import {
  asArray,
  asUnknownRecord,
  firstArray,
  firstPresent,
  firstRecord,
  firstString,
  readBoolean,
  readNumber,
  readRecord,
  readString,
} from './unknownRecord';

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function stringArray(value: unknown): string[] {
  return asArray(value).map((item) => String(item));
}

const TASK_STEP_TYPES: readonly TaskStepType[] = ['analysis', 'evidence', 'output', 'save'];
const MISSING_INFO_LEVELS: readonly MissingInfoLevel[] = ['required', 'recommended', 'optional'];
const TASK_TYPES: readonly TaskType[] = [
  'full_workflow',
  'customer_analysis',
  'evidence_search',
  'output_generation',
];
const TASK_PLAN_STATUSES: readonly TaskPlanStatus[] = ['draft', 'planning', 'waiting_confirmation'];
const ASSISTANT_SOURCES: readonly AssistantSource[] = [
  'manual',
  'app_default',
  'user_default',
  'global_default',
  'fallback',
];
const DATA_SOURCE_STATUSES: readonly DataSourceStatus[] = [
  'healthy',
  'degraded',
  'unavailable',
  'disabled',
  'unknown',
];
const PLANNER_STATUSES: readonly PlannerStatus[] = ['ready', 'degraded', 'unavailable', 'unknown'];
const PLANNER_SOURCES: readonly PlannerSource[] = ['embedded_model', 'rule_engine', 'fallback'];
const TASK_EXECUTION_STATUSES: readonly TaskExecutionStatus[] = [
  'idle',
  'running',
  'failed',
  'degraded',
  'done',
  'cancelled',
];
const STEP_EXECUTION_STATUSES: readonly TaskStepExecutionStatus[] = [
  'pending',
  'running',
  'done',
  'failed',
  'degraded',
  'skipped',
];
const STEP_FAILURE_KINDS: readonly StepFailureKind[] = [
  'external_source',
  'external_dependency_high_risk',
  'internal_knowledge',
  'analysis',
  'output',
  'save',
];
const VALID_OUTPUT_STATUSES: readonly OutputVersionStatus[] = [
  'success',
  'evidence_insufficient',
  'degraded',
  'generating',
  'failed',
];
const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  'internal_knowledge',
  'reference_pack',
  'external_source',
  'customer_data',
];
const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  'healthy',
  'degraded',
  'unavailable',
  'not_used',
];
const RISK_LEVELS: readonly OutputRisk['level'][] = ['info', 'warning', 'danger', 'degraded'];
const EXECUTION_STEP_STATUSES: readonly ExecutionStep['status'][] = [
  'done',
  'running',
  'failed',
  'degraded',
];
const VALID_ARCHIVE_STATUSES: readonly TaskArchiveStatus[] = [
  'continuable',
  'failed',
  'running',
  'needs_info',
  'completed',
  'draft',
];
const VERSION_KINDS: readonly TaskVersionKind[] = ['task_plan', 'evidence_pack', 'output'];
const VERSION_STATUSES: readonly TaskVersionRecord['status'][] = ['active', 'archived', 'failed'];

function normalizeTaskStep(raw: unknown): TaskStep {
  const step = asUnknownRecord(raw);
  return {
    stepId: firstString(step, ['stepId', 'step_id']),
    order: readNumber(step, 'order'),
    type: enumValue(readString(step, 'type'), TASK_STEP_TYPES, 'analysis'),
    title: readString(step, 'title'),
    required: readBoolean(step, 'required', true),
    status: 'pending',
  };
}

function normalizeMissingInfo(raw: unknown): MissingInfoItem {
  const info = asUnknownRecord(raw);
  return {
    field: readString(info, 'field'),
    label: readString(info, 'label'),
    level: enumValue(readString(info, 'level'), MISSING_INFO_LEVELS, 'optional'),
    reason: readString(info, 'reason') || undefined,
  };
}

function normalizeExecutionContext(raw: unknown): TaskPlan['executionContext'] {
  const context = asUnknownRecord(raw);
  const taskPlanner = firstRecord(context, ['taskPlanner', 'task_planner']);

  return {
    assistantName: firstString(context, ['assistantName', 'assistant_name']),
    assistantSource: enumValue(
      firstString(context, ['assistantSource', 'assistant_source']),
      ASSISTANT_SOURCES,
      'global_default',
    ),
    modelName: firstString(context, ['modelName', 'model_name']),
    dataSources: firstArray(context, ['dataSources', 'data_sources']).map((item) => {
      const source = asUnknownRecord(item);
      return {
        name: readString(source, 'name'),
        status: enumValue(readString(source, 'status'), DATA_SOURCE_STATUSES, 'unknown'),
      };
    }),
    taskPlanner: {
      status: enumValue(readString(taskPlanner, 'status'), PLANNER_STATUSES, 'unknown'),
      source: enumValue(readString(taskPlanner, 'source'), PLANNER_SOURCES, 'embedded_model'),
    },
  };
}

export function normalizeTaskPlanResponse(raw: unknown): TaskPlan {
  const root = asUnknownRecord(raw);
  const data = asUnknownRecord(root.data);
  const plan = asUnknownRecord(root.taskPlan || data.taskPlan || raw);

  return {
    taskId: firstString(plan, ['taskId', 'task_id']),
    taskTitle: firstString(plan, ['taskTitle', 'task_title'], '新任务'),
    taskType: enumValue(firstString(plan, ['taskType', 'task_type']), TASK_TYPES, 'full_workflow'),
    userGoal: firstString(plan, ['userGoal', 'user_goal']),
    understanding: readString(plan, 'understanding'),
    status: enumValue(readString(plan, 'status'), TASK_PLAN_STATUSES, 'draft'),
    steps: readArrayLike(plan, ['steps']).map(normalizeTaskStep),
    missingInfo: firstArray(plan, ['missingInfo', 'missing_info']).map(normalizeMissingInfo),
    executionContext: normalizeExecutionContext(firstPresent(plan, ['executionContext', 'execution_context'])),
    riskHints: stringArray(firstPresent(plan, ['riskHints', 'risk_hints'])),
  };
}

function normalizeTaskStepExecution(raw: unknown): TaskStepExecution {
  const step = asUnknownRecord(raw);
  const failureKind = enumValue(readString(step, 'failureKind'), STEP_FAILURE_KINDS, 'analysis');
  const rawFailureKind = firstString(step, ['failureKind', 'failure_kind']);

  return {
    stepId: firstString(step, ['stepId', 'step_id']),
    type: enumValue(readString(step, 'type'), TASK_STEP_TYPES, 'analysis'),
    title: readString(step, 'title'),
    status: enumValue(readString(step, 'status'), STEP_EXECUTION_STATUSES, 'pending'),
    startedAt: firstString(step, ['startedAt', 'started_at']) || undefined,
    completedAt: firstString(step, ['completedAt', 'completed_at']) || undefined,
    durationMs: firstPresent(step, ['durationMs', 'duration_ms']) === undefined
      ? undefined
      : readNumber(step, firstPresent(step, ['durationMs']) === undefined ? 'duration_ms' : 'durationMs'),
    summary: readString(step, 'summary') || undefined,
    details: stringArray(readStringArraySource(step, ['details'])),
    riskNotes: stringArray(firstPresent(step, ['riskNotes', 'risk_notes'])),
    degradedReason: firstString(step, ['degradedReason', 'degraded_reason']) || undefined,
    failureReason: firstString(step, ['failureReason', 'failure_reason']) || undefined,
    failureKind: rawFailureKind ? failureKind : undefined,
  };
}

export function normalizeTaskExecutionResponse(raw: unknown): TaskExecution {
  const root = asUnknownRecord(raw);
  const data = asUnknownRecord(root.data);
  const exec = asUnknownRecord(root.taskExecution || data.taskExecution || raw);
  const outputPreviewSource = firstRecord(exec, ['outputPreview', 'output_preview']);

  let outputPreview: TaskOutputPreview | undefined;
  if (Object.keys(outputPreviewSource).length) {
    outputPreview = {
      formalPreview: firstString(outputPreviewSource, ['formalPreview', 'formal_preview']),
      concisePreview: firstString(outputPreviewSource, ['concisePreview', 'concise_preview']),
      spokenPreview: firstString(outputPreviewSource, ['spokenPreview', 'spoken_preview']),
      evidenceCount: readNumber(
        outputPreviewSource,
        firstPresent(outputPreviewSource, ['evidenceCount']) === undefined ? 'evidence_count' : 'evidenceCount',
      ),
      riskCount: readNumber(
        outputPreviewSource,
        firstPresent(outputPreviewSource, ['riskCount']) === undefined ? 'risk_count' : 'riskCount',
      ),
    };
  }

  return {
    taskId: firstString(exec, ['taskId', 'task_id']),
    status: enumValue(readString(exec, 'status'), TASK_EXECUTION_STATUSES, 'idle'),
    currentStepId: firstString(exec, ['currentStepId', 'current_step_id']) || undefined,
    steps: readArrayLike(exec, ['steps']).map(normalizeTaskStepExecution),
    outputPreview,
  };
}

function normalizeOutputVersion(raw: unknown, fallbackVersionId?: string): OutputVersion {
  const version = asUnknownRecord(raw);
  const statusText = readString(version, 'status');
  const status = statusText === 'done'
    ? 'success'
    : enumValue(
      statusText || (firstPresent(version, ['formalVersion', 'formal_version', 'contents']) ? 'success' : 'failed'),
      VALID_OUTPUT_STATUSES,
      'failed',
    );
  const contents = readRecord(version, 'contents');

  return {
    versionId: firstString(version, ['versionId', 'version_id'], fallbackVersionId || ''),
    label: readString(version, 'label', 'v1'),
    status,
    isCurrent: readBoolean(version, 'isCurrent', readBoolean(version, 'is_current')),
    reason: readString(version, 'reason'),
    createdAt: firstString(version, ['createdAt', 'created_at']),
    formalVersion: firstString(version, ['formalVersion', 'formal_version']) || readString(contents, 'formal'),
    conciseVersion: firstString(version, ['conciseVersion', 'concise_version']) || readString(contents, 'concise'),
    spokenVersion: firstString(version, ['spokenVersion', 'spoken_version']) || readString(contents, 'spoken'),
    failureReason: firstString(version, ['failureReason', 'failure_reason']) || undefined,
  };
}

function normalizeEvidence(raw: unknown): OutputEvidence {
  const evidence = asUnknownRecord(raw);
  const sourceType = firstString(evidence, ['sourceType', 'source_type']);

  return {
    id: readString(evidence, 'id') || `ev-${Math.random().toString(36).slice(2, 8)}`,
    title: readString(evidence, 'title'),
    sourceType: enumValue(sourceType, EVIDENCE_SOURCE_TYPES, 'internal_knowledge'),
    sourceName: firstString(evidence, ['sourceName', 'source_name']),
    status: enumValue(readString(evidence, 'status'), EVIDENCE_STATUSES, 'healthy'),
    summary: readString(evidence, 'summary'),
  };
}

function normalizeRisk(raw: unknown): OutputRisk {
  const risk = asUnknownRecord(raw);
  return {
    id: readString(risk, 'id') || `r-${Math.random().toString(36).slice(2, 8)}`,
    level: enumValue(readString(risk, 'level'), RISK_LEVELS, 'info'),
    title: readString(risk, 'title'),
    description: readString(risk, 'description'),
  };
}

function normalizeExecutionStep(raw: unknown): ExecutionStep {
  const step = asUnknownRecord(raw);
  return {
    title: readString(step, 'title'),
    status: enumValue(readString(step, 'status'), EXECUTION_STEP_STATUSES, 'done'),
    summary: readString(step, 'summary') || undefined,
  };
}

export function normalizeOutputResponse(raw: unknown): OutputDetail {
  const data = unwrapData(raw);
  const rawVersions = readArrayLike(data, ['versions']);
  const versions: OutputVersion[] = rawVersions.map((version, index) =>
    normalizeOutputVersion(version, `${firstString(data, ['taskId', 'task_id'])}-v${index + 1}`),
  );

  const currentVersionId =
    firstString(data, ['currentVersionId', 'current_version_id']) ||
    (versions.length > 0 ? versions[versions.length - 1].versionId : '');
  const normalizedVersions = versions.map((version) => ({
    ...version,
    isCurrent: version.versionId === currentVersionId,
  }));

  return {
    taskId: firstString(data, ['taskId', 'task_id']) || currentVersionId.split('-v')[0] || '',
    taskTitle: firstString(data, ['taskTitle', 'task_title'], '未命名任务'),
    taskGoal: firstString(data, ['taskGoal', 'task_goal']),
    outputTarget: firstString(data, ['outputTarget', 'output_target']),
    tone: readString(data, 'tone'),
    status: enumValue(readString(data, 'status'), VALID_OUTPUT_STATUSES, 'success'),
    currentVersionId,
    versions: normalizedVersions,
    evidences: readArrayLike(data, ['evidences']).map(normalizeEvidence),
    risks: readArrayLike(data, ['risks']).map(normalizeRisk),
    executionSteps: firstArray(data, ['executionSteps', 'execution_steps']).map(normalizeExecutionStep),
  };
}

export function normalizeOutputVersionsResponse(raw: unknown): {
  taskId: string;
  currentVersionId: string;
  versions: OutputVersion[];
} {
  const data = unwrapData(raw);
  const versions = readArrayLike(data, ['versions']).map((version) => normalizeOutputVersion(version));
  const currentVersionId =
    firstString(data, ['currentVersionId', 'current_version_id']) ||
    (versions.length > 0 ? versions[versions.length - 1].versionId : '');

  return {
    taskId: firstString(data, ['taskId', 'task_id']),
    currentVersionId,
    versions: versions.map((version) => ({
      ...version,
      isCurrent: version.versionId === currentVersionId,
    })),
  };
}

function normalizeArchiveStatus(status: unknown): TaskArchiveStatus {
  if (status === 'done') return 'completed';
  if (status === 'waiting_confirmation') return 'draft';
  return enumValue(status, VALID_ARCHIVE_STATUSES, 'completed');
}

function normalizeTaskVersionRecord(raw: unknown): TaskVersionRecord {
  const version = asUnknownRecord(raw);
  return {
    versionId: firstString(version, ['versionId', 'version_id']),
    label: readString(version, 'label', 'v1'),
    kind: enumValue(readString(version, 'kind'), VERSION_KINDS, 'output'),
    reason: readString(version, 'reason'),
    createdAt: firstString(version, ['createdAt', 'created_at']),
    status: enumValue(readString(version, 'status'), VERSION_STATUSES, 'archived'),
    failureReason: firstString(version, ['failureReason', 'failure_reason']) || undefined,
    summary: readString(version, 'summary') || undefined,
  };
}

export function normalizeTaskArchiveListResponse(raw: unknown): TaskArchiveItem[] {
  const data = unwrapData(raw);
  const items = Array.isArray(data.items) ? data.items : asArray(raw);
  return items.map(normalizeTaskArchiveItem);
}

function normalizeTaskArchiveItem(raw: unknown): TaskArchiveItem {
  const item = asUnknownRecord(raw);
  const executionContext = firstRecord(item, ['executionContext', 'execution_context']);
  const taskPlanner = firstRecord(executionContext, ['taskPlanner', 'task_planner']);
  const source = readString(item, 'source');
  const failureKind = firstString(item, ['failureKind', 'failure_kind']);

  return {
    taskId: firstString(item, ['taskId', 'task_id']),
    taskTitle: firstString(item, ['taskTitle', 'task_title'], '未命名任务'),
    taskType: enumValue(firstString(item, ['taskType', 'task_type']), TASK_TYPES, 'full_workflow'),
    status: normalizeArchiveStatus(readString(item, 'status')),
    recentStep: firstString(item, ['recentStep', 'recent_step']) || undefined,
    assistantName: firstString(item, ['assistantName', 'assistant_name']),
    updatedAt: firstString(item, ['updatedAt', 'updated_at']),
    taskGoal: firstString(item, ['taskGoal', 'task_goal']),
    planVersions: firstArray(item, ['planVersions', 'plan_versions']).map(normalizeTaskVersionRecord),
    evidencePackVersions: firstArray(item, ['evidencePackVersions', 'evidence_pack_versions']).map(
      normalizeTaskVersionRecord,
    ),
    outputVersions: firstArray(item, ['outputVersions', 'output_versions']).map(normalizeTaskVersionRecord),
    analysisSummary: firstString(item, ['analysisSummary', 'analysis_summary']) || undefined,
    evidenceSummary: firstString(item, ['evidenceSummary', 'evidence_summary']) || undefined,
    risks: readArrayLike(item, ['risks']).map((risk) => {
      const normalized = asUnknownRecord(risk);
      return {
        level: readString(normalized, 'level', 'info'),
        title: readString(normalized, 'title'),
        description: readString(normalized, 'description'),
      };
    }),
    executionContext: {
      assistantName: firstString(executionContext, ['assistantName', 'assistant_name']),
      modelName: firstString(executionContext, ['modelName', 'model_name']),
      dataSources: firstArray(executionContext, ['dataSources', 'data_sources']).map((source) => {
        const dataSource = asUnknownRecord(source);
        return {
          name: readString(dataSource, 'name'),
          status: enumValue(readString(dataSource, 'status'), DATA_SOURCE_STATUSES, 'unknown'),
        };
      }),
      taskPlanner: {
        status: readString(taskPlanner, 'status', 'unknown'),
        source: readString(taskPlanner, 'source', 'embedded_model'),
      },
    },
    failedStep: firstString(item, ['failedStep', 'failed_step']) || undefined,
    failureKind: failureKind ? enumValue(failureKind, STEP_FAILURE_KINDS, 'analysis') : undefined,
    failureReason: firstString(item, ['failureReason', 'failure_reason']) || undefined,
    completedSteps: stringArray(firstPresent(item, ['completedSteps', 'completed_steps'])),
    pendingSteps: stringArray(firstPresent(item, ['pendingSteps', 'pending_steps'])),
    hasOutput: readBoolean(item, 'hasOutput', readBoolean(item, 'has_output')),
    source: source === 'task' || source === 'legacy_session' ? source : undefined,
  };
}

export function normalizeTaskArchiveDetailResponse(raw: unknown): TaskArchiveItem & {
  taskPlan: unknown;
  execution: unknown;
  currentPlanVersionId: string | null;
  currentEvidencePackVersionId: string | null;
  currentOutputVersionId: string | null;
  outputSummary: string;
  riskSummary: string;
  source: 'task' | 'legacy_session';
  createdAt: string;
  withUpdatedAt: string;
} {
  const data = unwrapData(raw);
  const source = enumValue(readString(data, 'source'), ['task', 'legacy_session'] as const, 'task');

  return {
    ...normalizeTaskArchiveItem(data),
    taskPlan: firstPresent(data, ['taskPlan', 'task_plan']) || null,
    execution: readString(data, 'execution') || firstPresent(data, ['execution']) || null,
    currentPlanVersionId: firstString(data, ['currentPlanVersionId', 'current_plan_version_id']) || null,
    currentEvidencePackVersionId:
      firstString(data, ['currentEvidencePackVersionId', 'current_evidence_pack_version_id']) || null,
    currentOutputVersionId: firstString(data, ['currentOutputVersionId', 'current_output_version_id']) || null,
    outputSummary: firstString(data, ['outputSummary', 'output_summary']),
    riskSummary: firstString(data, ['riskSummary', 'risk_summary']),
    source,
    createdAt: firstString(data, ['createdAt', 'created_at']),
    withUpdatedAt: firstString(data, ['updatedAt', 'updated_at']),
  };
}

export function normalizeContinueTaskResponse(raw: unknown): {
  resumeContext: unknown;
  nextRoute: string;
} {
  const data = unwrapData(raw);
  return {
    resumeContext: firstPresent(data, ['resumeContext', 'resume_context']) || {},
    nextRoute: firstString(data, ['nextRoute', 'next_route'], '/workbench'),
  };
}

function unwrapData(raw: unknown): Record<string, unknown> {
  const root = asUnknownRecord(raw);
  const data = asUnknownRecord(root.data);
  const nested = asUnknownRecord(data.data);
  if (Object.keys(nested).length) return nested;
  if (Object.keys(data).length) return data;
  return root;
}

function readArrayLike(value: unknown, keys: string[]): unknown[] {
  const candidate = firstPresent(value, keys);
  return Array.isArray(candidate) ? candidate : [];
}

function readStringArraySource(value: unknown, keys: string[]): unknown {
  return firstPresent(value, keys) || [];
}
