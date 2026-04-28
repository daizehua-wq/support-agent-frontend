import type { TaskPlan, TaskStep, MissingInfoItem, ExecutionContextSummary } from '../types/taskPlan';

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
