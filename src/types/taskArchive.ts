import type { DataSourceStatus, StepFailureKind } from './taskPlan';

export type TaskArchiveType = 'full_workflow' | 'customer_analysis' | 'evidence_search' | 'output_generation';

export type TaskArchiveStatus = 'continuable' | 'failed' | 'running' | 'needs_info' | 'completed' | 'draft';

export type TaskVersionKind = 'task_plan' | 'evidence_pack' | 'output';

export interface TaskVersionRecord {
  versionId: string;
  label: string;
  kind: TaskVersionKind;
  reason: string;
  createdAt: string;
  status: 'active' | 'archived' | 'failed';
  failureReason?: string;
  summary?: string;
}

export interface TaskArchiveOutputSummary {
  currentVersionLabel: string;
  outputVersionCount: number;
  formalPreview: string;
}

export interface TaskArchiveItem {
  taskId: string;
  taskTitle: string;
  taskType: TaskArchiveType;
  status: TaskArchiveStatus;
  recentStep?: string;
  assistantName: string;
  updatedAt: string;
  taskGoal: string;
  planVersions: TaskVersionRecord[];
  evidencePackVersions: TaskVersionRecord[];
  outputVersions: TaskVersionRecord[];
  analysisSummary?: string;
  evidenceSummary?: string;
  risks: Array<{ level: string; title: string; description: string }>;
  executionContext: {
    assistantName: string;
    modelName: string;
    dataSources: Array<{ name: string; status: DataSourceStatus }>;
    taskPlanner: { status: string; source: string };
  };
  failedStep?: string;
  failureKind?: StepFailureKind;
  failureReason?: string;
  completedSteps?: string[];
  pendingSteps?: string[];
  hasOutput: boolean;
  source?: 'task' | 'legacy_session';
}

export type TaskTypeFilter = 'all' | TaskArchiveType;
export type TaskStatusFilter = 'all' | TaskArchiveStatus;

export type ContinueTaskMode =
  | 'continue-output'
  | 'supplement-regenerate'
  | 'edit-goal'
  | 'clone-task-structure';
