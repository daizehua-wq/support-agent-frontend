import type { TaskPlan } from '../types/taskPlan';
import { generateTaskPlan as generateMockPlan } from './mockTaskPlanner';
import { normalizeTaskPlanResponse } from './taskNormalizer';
import * as tasksApi from '../api/tasks';
import { message } from 'antd';

const FORCE_MOCK = import.meta.env.VITE_USE_TASK_MOCK === 'true';

type ApiError = {
  response?: { status?: number; data?: { error?: { code?: string } } };
  code?: string;
  message?: string;
};

function isClientError(error: unknown): boolean {
  const e = error as ApiError;
  const status = e?.response?.status;
  if (status && status >= 400 && status < 500 && status !== 429) return true;
  const code = e?.response?.data?.error?.code || '';
  return ['MISSING_REQUIRED_INFO', 'VALIDATION_ERROR'].includes(code);
}

function isNetworkOrServerError(error: unknown): boolean {
  const e = error as ApiError;
  if (!e?.response) return true;
  const status = e.response?.status;
  return status ? status >= 500 : false;
}

export async function generateTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> {
  const goal = String(userGoal || '').trim();

  if (!goal) {
    throw new Error('请输入任务目标');
  }

  if (FORCE_MOCK) {
    return generateMockPlan(goal);
  }

  try {
    const raw = await tasksApi.createTaskPlan(goal, appId);
    return normalizeTaskPlanResponse(raw as any);
  } catch (error: unknown) {
    if (isClientError(error)) {
      throw error;
    }

    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线规划模式', 3);
      return generateMockPlan(goal);
    }

    throw error;
  }
}
