import { Router } from 'express';
import {
  createTask,
  getTaskPlan,
  confirmTask,
  getTaskExecution,
  getTaskOutput,
  getOutputVersions,
  regenerateOutput,
  setCurrentOutputVersion,
  exportOutputMarkdown,
} from '../services/taskService.js';

const router = Router();

// ---------------------------------------------------------------------------
// Shared response helpers (match existing route file patterns)
// ---------------------------------------------------------------------------

const sendSuccess = (res, payload) =>
  res.json({
    success: true,
    ...payload,
  });

const sendError = (res, statusCode, message, errorCode, details = {}) =>
  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: errorCode,
      message,
      details,
    },
  });

// ---------------------------------------------------------------------------
// 1. POST /api/tasks/plans
//    Input: { userGoal: string, appId?: string }
//    Output: { taskId, planId, planVersion, status, taskPlan }
// ---------------------------------------------------------------------------

router.post('/plans', (req, res) => {
  const { userGoal } = req.body || {};

  if (!userGoal || typeof userGoal !== 'string' || !userGoal.trim()) {
    return sendError(res, 400, '缺少必填参数：userGoal', 'MISSING_REQUIRED_INFO', {
      missingFields: ['userGoal'],
    });
  }

  const result = createTask(userGoal.trim());

  return sendSuccess(res, {
    message: 'TaskPlan 生成成功',
    data: result,
  });
});

// ---------------------------------------------------------------------------
// 2. GET /api/tasks/plans/:taskId
//    Get current TaskPlan snapshot
// ---------------------------------------------------------------------------

router.get('/plans/:taskId', (req, res) => {
  const { taskId } = req.params;
  const taskPlan = getTaskPlan(taskId);

  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  return sendSuccess(res, {
    message: '获取 TaskPlan 成功',
    data: taskPlan,
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/tasks/:taskId/confirm
//    Confirm plan and start execution
//    Input (optional): { missingInfoValues?: Record<string, string> }
//    Output: TaskExecution (status=running)
// ---------------------------------------------------------------------------

router.post('/:taskId/confirm', (req, res) => {
  const { taskId } = req.params;

  const taskPlan = getTaskPlan(taskId);

  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const taskExecution = confirmTask(taskId);

  if (!taskExecution) {
    // Task either doesn't exist, or is not in waiting_confirmation status
    const currentTaskStatus = getTaskPlan(taskId) ? 'plan_exists_but_not_confirmable' : 'not_found';
    return sendError(res, 409, '当前任务状态不允许确认操作', 'TASK_STATUS_CONFLICT', {
      taskId,
      currentStatus: currentTaskStatus,
      allowedStatus: 'waiting_confirmation',
    });
  }

  return sendSuccess(res, {
    message: '任务已确认，开始执行',
    data: taskExecution,
  });
});

// ---------------------------------------------------------------------------
// 4. GET /api/tasks/:taskId/execution
//    Poll execution status
//    P0 polling: frontend polls every 2s when status=running
// ---------------------------------------------------------------------------

router.get('/:taskId/execution', (req, res) => {
  const { taskId } = req.params;

  const taskExecution = getTaskExecution(taskId);

  if (!taskExecution) {
    // Check if the task exists at all
    const taskPlan = getTaskPlan(taskId);
    if (!taskPlan) {
      return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
    }
    // Task exists but not yet confirmed → idle
    return sendSuccess(res, {
      message: '任务尚未确认执行',
      data: {
        taskId,
        status: 'idle',
        currentStepId: undefined,
        steps: [],
        outputPreview: undefined,
        degradedMarkers: [],
        startedAt: undefined,
        completedAt: undefined,
        errorContext: undefined,
      },
    });
  }

  return sendSuccess(res, {
    message: `${taskExecution.status === 'running' ? '任务执行中' : '任务已完成'}`,
    data: taskExecution,
  });
});

// ---------------------------------------------------------------------------
// 5. GET /api/tasks/:taskId/output
//    Get current Output detail
// ---------------------------------------------------------------------------

router.get('/:taskId/output', (req, res) => {
  const { taskId } = req.params;

  const taskPlan = getTaskPlan(taskId);
  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const output = getTaskOutput(taskId);

  if (!output) {
    // Task exists but execution not done → not ready
    const taskExecution = getTaskExecution(taskId);
    if (taskExecution) {
      return sendError(res, 409, '任务尚未完成，无法获取 Output', 'TASK_NOT_READY', {
        taskId,
        executionStatus: taskExecution.status,
      });
    }
    return sendError(res, 409, 'Output 尚未生成', 'TASK_OUTPUT_NOT_READY', { taskId });
  }

  return sendSuccess(res, {
    message: '获取 Output 详情成功',
    data: output,
  });
});

// ---------------------------------------------------------------------------
// 6. GET /api/tasks/:taskId/output/versions
//    Get Output version list
// ---------------------------------------------------------------------------

router.get('/:taskId/output/versions', (req, res) => {
  const { taskId } = req.params;

  const taskPlan = getTaskPlan(taskId);
  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const versions = getOutputVersions(taskId);

  if (!versions) {
    return sendError(res, 409, 'Output 版本尚未生成', 'TASK_OUTPUT_NOT_READY', { taskId });
  }

  return sendSuccess(res, {
    message: '获取 Output 版本列表成功',
    data: versions,
  });
});

// ---------------------------------------------------------------------------
// 7. POST /api/tasks/:taskId/output/regenerate
//    Regenerate Output (creates a new version)
// ---------------------------------------------------------------------------

router.post('/:taskId/output/regenerate', (req, res) => {
  const { taskId } = req.params;
  const { mode = 'regenerate', tone = 'formal', note = '' } = req.body || {};

  const validModes = ['regenerate', 'adjust_tone', 'supplement_regenerate', 'retry_external_source'];
  if (!validModes.includes(mode)) {
    return sendError(res, 400, '无效的生成模式', 'VALIDATION_ERROR', {
      field: 'mode',
      allowed: validModes,
    });
  }

  const taskPlan = getTaskPlan(taskId);
  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const result = regenerateOutput(taskId, mode, tone, note);

  if (!result) {
    return sendError(res, 409, 'Output 尚未生成，无法重新生成', 'TASK_OUTPUT_NOT_READY', { taskId });
  }

  return sendSuccess(res, {
    message: 'Output 新版本已生成',
    data: result,
  });
});

// ---------------------------------------------------------------------------
// 8. PUT /api/tasks/:taskId/output/set-current
//    Set current Output version (pointer switch only)
// ---------------------------------------------------------------------------

router.put('/:taskId/output/set-current', (req, res) => {
  const { taskId } = req.params;
  const { versionId } = req.body || {};

  if (!versionId || typeof versionId !== 'string') {
    return sendError(res, 400, '缺少必填参数：versionId', 'MISSING_REQUIRED_INFO', {
      missingFields: ['versionId'],
    });
  }

  const taskPlan = getTaskPlan(taskId);
  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const result = setCurrentOutputVersion(taskId, versionId);

  if (!result.success) {
    if (result.error === 'OUTPUT_VERSION_NOT_FOUND') {
      return sendError(res, 404, '指定的 Output 版本不存在', 'OUTPUT_VERSION_NOT_FOUND', { taskId, versionId });
    }
    return sendError(res, 409, '无法设置当前版本', result.error, { taskId });
  }

  return sendSuccess(res, {
    message: '已设为当前版本',
    data: result.data,
  });
});

// ---------------------------------------------------------------------------
// 9. GET /api/tasks/:taskId/output/export/markdown
//    Export current Output version as Markdown (returns JSON with markdown string)
// ---------------------------------------------------------------------------

router.get('/:taskId/output/export/markdown', (req, res) => {
  const { taskId } = req.params;

  const taskPlan = getTaskPlan(taskId);
  if (!taskPlan) {
    return sendError(res, 404, '指定的任务不存在', 'TASK_NOT_FOUND', { taskId });
  }

  const exportData = exportOutputMarkdown(taskId);

  if (!exportData) {
    return sendError(res, 409, 'Output 尚未生成，无法导出', 'TASK_OUTPUT_NOT_READY', { taskId });
  }

  return sendSuccess(res, {
    message: 'Markdown 导出成功',
    data: exportData,
  });
});

export default router;
