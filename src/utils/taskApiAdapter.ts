import type { TaskPlan, TaskExecution } from '../types/taskPlan';
import type { OutputDetail, OutputVersion } from '../types/output';
import type { TaskArchiveItem } from '../types/taskArchive';
import { generateTaskPlan as generateMockPlan } from './mockTaskPlanner';
import { runMockExecution } from './mockTaskExecutor';
import { generateMockOutput } from './mockOutput';
import { buildOutputMarkdown } from './markdownExport';
import { MOCK_TASKS } from './mockTasks';
import { normalizeTaskPlanResponse, normalizeTaskExecutionResponse, normalizeOutputResponse, normalizeOutputVersionsResponse, normalizeTaskArchiveListResponse, normalizeTaskArchiveDetailResponse, normalizeContinueTaskResponse } from './taskNormalizer';
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

export async function confirmTask(taskId: string, goal: string, missingInfoValues?: Record<string, string>): Promise<TaskExecution> {
  if (FORCE_MOCK) {
    return runMockExecution(goal, taskId, () => {});
  }

  try {
    const raw = await tasksApi.confirmTask(taskId, missingInfoValues);
    return normalizeTaskExecutionResponse(raw as any);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线执行模式', 3);
      return runMockExecution(goal, taskId, () => {});
    }
    throw error;
  }
}

export async function getExecution(taskId: string, goal: string): Promise<TaskExecution> {
  if (FORCE_MOCK) {
    return runMockExecution(goal, taskId, () => {});
  }

  try {
    const raw = await tasksApi.getTaskExecution(taskId);
    return normalizeTaskExecutionResponse(raw as any);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线执行模式', 3);
      return runMockExecution(goal, taskId, () => {});
    }
    throw error;
  }
}

export async function stopExecution(taskId: string): Promise<TaskExecution> {
  if (FORCE_MOCK) return { taskId, status: 'cancelled', steps: [] };
  try {
    const raw = await tasksApi.stopTask(taskId);
    return normalizeTaskExecutionResponse(raw as any);
  } catch (error: unknown) {
    if (isNetworkOrServerError(error)) return { taskId, status: 'cancelled', steps: [] };
    throw error;
  }
}

// ===== Output API adapters =====

export async function getOutputDetail(taskId: string): Promise<OutputDetail> {
  if (FORCE_MOCK) {
    return generateMockOutput(taskId);
  }

  try {
    const raw = await tasksApi.getTaskOutput(taskId);
    return normalizeOutputResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) {
      throw error;
    }

    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线 Output 模式', 3);
      return generateMockOutput(taskId);
    }

    throw error;
  }
}

export async function getOutputVersions(taskId: string): Promise<{ taskId: string; currentVersionId: string; versions: OutputVersion[] }> {
  if (FORCE_MOCK) {
    const mock = generateMockOutput(taskId);
    return { taskId: mock.taskId, currentVersionId: mock.currentVersionId, versions: mock.versions };
  }

  try {
    const raw = await tasksApi.getTaskOutputVersions(taskId);
    return normalizeOutputVersionsResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) {
      throw error;
    }

    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线版本模式', 3);
      const mock = generateMockOutput(taskId);
      return { taskId: mock.taskId, currentVersionId: mock.currentVersionId, versions: mock.versions };
    }

    throw error;
  }
}

export async function regenerateOutput(
  taskId: string,
  payload: { mode: string; tone?: string; note?: string },
): Promise<any> {
  if (FORCE_MOCK) {
    const mock = generateMockOutput(taskId);
    const label = `v${mock.versions.length + 1}`;
    const versionId = `${taskId}-v${mock.versions.length + 1}`;
    return {
      taskId,
      versionId,
      label,
      status: 'success',
      currentVersionId: versionId,
      output: {
        versionId,
        label,
        status: 'success',
        isCurrent: true,
        reason: payload.note || '重新生成',
        createdAt: new Date().toISOString(),
        formalVersion: mock.versions[0]?.formalVersion || '',
        conciseVersion: mock.versions[0]?.conciseVersion || '',
        spokenVersion: mock.versions[0]?.spokenVersion || '',
      },
    };
  }

  try {
    const raw = await tasksApi.regenerateTaskOutput(taskId, payload);
    // Handle wrapping - regenerate returns { success, data: { taskId, versionId, ... } }
    const data = raw?.data?.data || raw?.data || raw || {};
    return data;
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    throw error;
  }
}

export async function setCurrentOutputVersion(
  taskId: string,
  versionId: string,
): Promise<{ taskId: string; currentVersionId: string; versions: OutputVersion[] }> {
  if (FORCE_MOCK) {
    const mock = generateMockOutput(taskId);
    const updated = mock.versions.map((v) => ({ ...v, isCurrent: v.versionId === versionId }));
    return { taskId: mock.taskId, currentVersionId: versionId, versions: updated };
  }

  try {
    const raw = await tasksApi.setCurrentOutputVersion(taskId, versionId);
    return normalizeOutputVersionsResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线版本管理模式', 3);
      const mock = generateMockOutput(taskId);
      const updated = mock.versions.map((v) => ({ ...v, isCurrent: v.versionId === versionId }));
      return { taskId: mock.taskId, currentVersionId: versionId, versions: updated };
    }
    throw error;
  }
}

export async function exportOutputMarkdown(
  taskId: string,
  fallbackData?: {
    taskTitle: string;
    taskGoal: string;
    currentVersion: OutputVersion;
    evidences: Array<{ title: string; summary: string }>;
    risks: Array<{ title: string; description: string }>;
    executionSteps: Array<{ title: string; status: string; summary?: string }>;
  },
): Promise<{ filename: string; markdown: string } | null> {
  if (FORCE_MOCK) {
    if (fallbackData) {
      const md = buildOutputMarkdown(fallbackData.taskTitle, fallbackData.taskGoal, fallbackData.currentVersion, fallbackData.executionSteps, fallbackData.evidences, fallbackData.risks);
      const filename = `output-${fallbackData.currentVersion.label}-${Date.now()}.md`;
      return { filename, markdown: md };
    }
    return null;
  }

  try {
    const raw = await tasksApi.exportTaskOutputMarkdown(taskId);
    const data = raw?.data?.data || raw?.data || raw || {};
    return data.filename ? data : null;
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error) && fallbackData) {
      message.warning('已切换至本地 Markdown 导出', 3);
      const md = buildOutputMarkdown(fallbackData.taskTitle, fallbackData.taskGoal, fallbackData.currentVersion, fallbackData.executionSteps, fallbackData.evidences, fallbackData.risks);
      const filename = `output-${fallbackData.currentVersion.label}-${Date.now()}.md`;
      return { filename, markdown: md };
    }
    throw error;
  }
}

// ===== Task Archive API adapters =====

export async function getTaskArchiveList(params?: { taskTitle?: string; taskType?: string; status?: string }): Promise<TaskArchiveItem[]> {
  if (FORCE_MOCK) {
    return filterMockTasks(params);
  }

  try {
    const raw = await tasksApi.getTasks(params);
    return normalizeTaskArchiveListResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线历史任务模式', 3);
      return filterMockTasks(params);
    }
    throw error;
  }
}

export async function getTaskArchiveDetail(taskId: string): Promise<any> {
  if (FORCE_MOCK) {
    const mock = MOCK_TASKS.find((t) => t.taskId === taskId);
    if (!mock) throw new Error('TASK_NOT_FOUND');
    return { ...mock, taskPlan: null, execution: null, currentPlanVersionId: null, currentEvidencePackVersionId: null, currentOutputVersionId: null, source: 'legacy_session', createdAt: mock.updatedAt, updatedAt: mock.updatedAt };
  }

  try {
    const raw = await tasksApi.getTaskDetail(taskId);
    return normalizeTaskArchiveDetailResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线任务详情模式', 3);
      const mock = MOCK_TASKS.find((t) => t.taskId === taskId);
      if (!mock) throw new Error('TASK_NOT_FOUND');
      return { ...mock, taskPlan: null, execution: null, currentPlanVersionId: null, currentEvidencePackVersionId: null, currentOutputVersionId: null, source: 'legacy_session', createdAt: mock.updatedAt, updatedAt: mock.updatedAt };
    }
    throw error;
  }
}

export async function getRecentTaskArchive(): Promise<Array<{ taskId: string; taskTitle: string; status: string; recentStep?: string; updatedAt: string }>> {
  if (FORCE_MOCK) {
    return MOCK_TASKS.slice(0, 3).map((t) => ({
      taskId: t.taskId,
      taskTitle: t.taskTitle,
      status: t.status,
      recentStep: t.recentStep,
      updatedAt: t.updatedAt,
    }));
  }

  try {
    const raw = await tasksApi.getRecentTasks();
    const data = raw?.data?.data || raw?.data || raw || [];
    return Array.isArray(data) ? data : [];
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线最近任务模式', 3);
      return MOCK_TASKS.slice(0, 3).map((t) => ({
        taskId: t.taskId,
        taskTitle: t.taskTitle,
        status: t.status,
        recentStep: t.recentStep,
        updatedAt: t.updatedAt,
      }));
    }
    throw error;
  }
}

export async function continueTaskArchive(taskId: string, mode: string): Promise<{ resumeContext: any; nextRoute: string }> {
  if (FORCE_MOCK) {
    return { resumeContext: { taskId, mode }, nextRoute: '/workbench' };
  }

  try {
    const raw = await tasksApi.continueTask(taskId, mode);
    return normalizeContinueTaskResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线继续模式', 3);
      return { resumeContext: { taskId, mode }, nextRoute: '/workbench' };
    }
    throw error;
  }
}

export async function setCurrentTaskArchiveVersion(taskId: string, versionType: string, versionId: string): Promise<any> {
  if (FORCE_MOCK) {
    return getTaskArchiveDetail(taskId);
  }

  try {
    const raw = await tasksApi.setCurrentTaskVersion(taskId, versionType, versionId);
    return normalizeTaskArchiveDetailResponse(raw);
  } catch (error: unknown) {
    if (isClientError(error)) throw error;
    if (isNetworkOrServerError(error)) {
      message.warning('已切换至离线版本管理模式', 3);
      return getTaskArchiveDetail(taskId);
    }
    throw error;
  }
}

function filterMockTasks(params?: { taskTitle?: string; taskType?: string; status?: string }): TaskArchiveItem[] {
  let tasks = [...MOCK_TASKS];
  if (params?.taskTitle) {
    tasks = tasks.filter((t) => t.taskTitle.toLowerCase().includes(params.taskTitle!.toLowerCase()));
  }
  if (params?.taskType && params.taskType !== 'all') {
    tasks = tasks.filter((t) => t.taskType === params.taskType);
  }
  if (params?.status && params.status !== 'all') {
    tasks = tasks.filter((t) => t.status === params.status);
  }
  return tasks;
}
