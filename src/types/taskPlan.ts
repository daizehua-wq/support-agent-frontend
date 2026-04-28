export type TaskType = 'full_workflow' | 'customer_analysis' | 'evidence_search' | 'output_generation';

export type TaskPlanStatus = 'draft' | 'planning' | 'waiting_confirmation';

export type TaskStepType = 'analysis' | 'evidence' | 'output' | 'save';

export type MissingInfoLevel = 'required' | 'recommended' | 'optional';

export type DataSourceStatus = 'healthy' | 'degraded' | 'unavailable' | 'disabled' | 'unknown';

export type PlannerStatus = 'ready' | 'degraded' | 'unavailable' | 'unknown';

export type PlannerSource = 'embedded_model' | 'rule_engine' | 'fallback';

export type AssistantSource = 'manual' | 'app_default' | 'user_default' | 'global_default' | 'fallback';

export interface TaskStep {
  stepId: string;
  order: number;
  type: TaskStepType;
  title: string;
  required: boolean;
  status: 'pending';
}

export interface MissingInfoItem {
  field: string;
  label: string;
  level: MissingInfoLevel;
  reason?: string;
}

export interface ExecutionContextSummary {
  assistantName: string;
  assistantSource: AssistantSource;
  modelName: string;
  dataSources: Array<{
    name: string;
    status: DataSourceStatus;
  }>;
  taskPlanner: {
    status: PlannerStatus;
    source: PlannerSource;
  };
}

export interface TaskPlan {
  taskId: string;
  taskTitle: string;
  taskType: TaskType;
  userGoal: string;
  understanding: string;
  status: TaskPlanStatus;
  steps: TaskStep[];
  missingInfo: MissingInfoItem[];
  executionContext: ExecutionContextSummary;
  riskHints: string[];
}

export interface CapabilityStatus {
  assistant: { name: string; status: 'active' | 'inactive' };
  model: { name: string; status: 'connected' | 'degraded' | 'disconnected' };
  dataSources: Array<{ name: string; status: DataSourceStatus }>;
  taskPlanner: { status: PlannerStatus; source: PlannerSource };
}

export interface RecentTask {
  taskId: string;
  title: string;
  status: 'completed' | 'continuable';
  lastStep?: string;
  updatedAt: string;
}

// ===== FE-3: Execution Types =====

export type TaskExecutionStatus = 'idle' | 'running' | 'failed' | 'degraded' | 'done' | 'cancelled';

export type TaskStepExecutionStatus = 'pending' | 'running' | 'done' | 'failed' | 'degraded' | 'skipped';

export type StepFailureKind = 'external_source' | 'internal_knowledge' | 'analysis' | 'output' | 'save';

export interface TaskStepExecution {
  stepId: string;
  type: 'analysis' | 'evidence' | 'output' | 'save';
  title: string;
  status: TaskStepExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  details?: string[];
  riskNotes?: string[];
  degradedReason?: string;
  failureReason?: string;
  failureKind?: StepFailureKind;
}

export interface TaskOutputPreview {
  formalPreview: string;
  concisePreview: string;
  spokenPreview: string;
  evidenceCount: number;
  riskCount: number;
}

export interface TaskExecution {
  taskId: string;
  status: TaskExecutionStatus;
  currentStepId?: string;
  steps: TaskStepExecution[];
  outputPreview?: TaskOutputPreview;
}
