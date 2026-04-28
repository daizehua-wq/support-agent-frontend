import request from './request';
import type { TaskPlan } from '../types/taskPlan';

export async function createTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> {
  const payload: Record<string, string> = { userGoal };
  if (appId) payload.appId = appId;

  const res = await request.post<TaskPlan, TaskPlan>('/api/tasks/plans', payload);
  return res;
}
