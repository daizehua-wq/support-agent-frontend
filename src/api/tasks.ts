import request from './request';
import type { TaskPlan, TaskExecution } from '../types/taskPlan';

export async function createTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> {
  const payload: Record<string, string> = { userGoal };
  if (appId) payload.appId = appId;

  const res = await request.post<TaskPlan, TaskPlan>('/api/tasks/plans', payload);
  return res;
}

export async function confirmTask(taskId: string, missingInfoValues?: Record<string, string>): Promise<TaskExecution> {
  const res = await request.post<TaskExecution, TaskExecution>(`/api/tasks/${taskId}/confirm`, missingInfoValues ? { missingInfoValues } : {});
  return res;
}

export async function getTaskExecution(taskId: string): Promise<TaskExecution> {
  const res = await request.get<TaskExecution, TaskExecution>(`/api/tasks/${taskId}/execution`);
  return res;
}

export async function stopTask(taskId: string): Promise<TaskExecution> {
  const res = await request.post<TaskExecution, TaskExecution>(`/api/tasks/${taskId}/stop`);
  return res;
}

export async function retryStep(taskId: string, stepId: string): Promise<TaskExecution> {
  const res = await request.post<TaskExecution, TaskExecution>(`/api/tasks/${taskId}/retry`, { stepId });
  return res;
}

// ===== Output API =====

export async function getTaskOutput(taskId: string): Promise<any> {
  const res = await request.get<any, any>(`/api/tasks/${taskId}/output`);
  return res;
}

export async function getTaskOutputVersions(taskId: string): Promise<any> {
  const res = await request.get<any, any>(`/api/tasks/${taskId}/output/versions`);
  return res;
}

export async function regenerateTaskOutput(taskId: string, payload: { mode: string; tone?: string; note?: string }): Promise<any> {
  const res = await request.post<any, any>(`/api/tasks/${taskId}/output/regenerate`, payload);
  return res;
}

export async function setCurrentOutputVersion(taskId: string, versionId: string): Promise<any> {
  const res = await request.put<any, any>(`/api/tasks/${taskId}/output/set-current`, { versionId });
  return res;
}

export async function exportTaskOutputMarkdown(taskId: string): Promise<any> {
  const res = await request.get<any, any>(`/api/tasks/${taskId}/output/export/markdown`);
  return res;
}

// ===== Task Archive API =====

export async function getTasks(params?: { taskTitle?: string; taskType?: string; status?: string }): Promise<any> {
  const res = await request.get<any, any>('/api/tasks', { params });
  return res;
}

export async function getTaskDetail(taskId: string): Promise<any> {
  const res = await request.get<any, any>(`/api/tasks/${taskId}`);
  return res;
}

export async function getRecentTasks(): Promise<any> {
  const res = await request.get<any, any>('/api/tasks/recent');
  return res;
}

export async function continueTask(taskId: string, mode: string): Promise<any> {
  const res = await request.post<any, any>(`/api/tasks/${taskId}/continue`, { mode });
  return res;
}

export async function setCurrentTaskVersion(taskId: string, versionType: string, versionId: string): Promise<any> {
  const res = await request.put<any, any>(`/api/tasks/${taskId}/set-current-version`, { versionType, versionId });
  return res;
}
