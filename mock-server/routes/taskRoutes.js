import { Router } from 'express';
import {
  createTask,
  getTaskPlan,
  confirmTask,
  getTaskExecution,
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

export default router;
