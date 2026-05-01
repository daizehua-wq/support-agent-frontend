export type OutputTabKey = 'formal' | 'concise' | 'spoken';

export type OutputVersionStatus =
  | 'success'
  | 'evidence_insufficient'
  | 'degraded'
  | 'generating'
  | 'failed';

export interface OutputVersion {
  versionId: string;
  label: string;
  status: OutputVersionStatus;
  isCurrent: boolean;
  reason: string;
  createdAt: string;
  formalVersion?: string;
  conciseVersion?: string;
  spokenVersion?: string;
  failureReason?: string;
}

export type EvidenceSourceType = 'internal_knowledge' | 'reference_pack' | 'external_source' | 'customer_data';

export type EvidenceStatus = 'healthy' | 'degraded' | 'unavailable' | 'not_used';

export interface OutputEvidence {
  id: string;
  title: string;
  sourceType: EvidenceSourceType;
  sourceName: string;
  status: EvidenceStatus;
  summary: string;
}

export interface OutputRisk {
  id: string;
  level: 'info' | 'warning' | 'danger' | 'degraded';
  title: string;
  description: string;
}

export interface ExecutionStep {
  title: string;
  status: 'done' | 'running' | 'failed' | 'degraded';
  summary?: string;
}

export interface OutputDetail {
  taskId: string;
  taskTitle: string;
  taskGoal: string;
  outputTarget?: string;
  tone?: string;
  status: OutputVersionStatus;
  currentVersionId: string;
  versions: OutputVersion[];
  evidences: OutputEvidence[];
  risks: OutputRisk[];
  executionSteps: ExecutionStep[];
}
