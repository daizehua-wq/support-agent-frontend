import { useCallback, useRef, useState } from 'react';
import { message } from 'antd';
import type { TaskExecution, TaskExecutionStatus, StepFailureKind, TaskOutputPreview } from '../types/taskPlan';
import { confirmTask, getExecution } from '../utils/taskApiAdapter';

type StartParams = { taskId: string; userGoal: string };

type UseTaskExecutionResult = {
  execution: TaskExecution | null;
  execStatus: TaskExecutionStatus;
  error: string | null;
  failureKind: StepFailureKind | null;
  failedStep: string | null;
  outputPreview: TaskOutputPreview | null;
  isStarting: boolean;
  start: (params: StartParams) => void;
  stop: () => void;
  retryStep: (stepId: string) => void;
  skipEvidenceAndContinue: () => void;
  reset: () => void;
};

const TERMINAL_STATUSES: TaskExecutionStatus[] = ['done', 'failed', 'degraded', 'cancelled'];

const POLL_INTERVAL_MS = 2000;
const WATCHDOG_MS = 120_000;

export function useTaskExecution(): UseTaskExecutionResult {
  const [execution, setExecution] = useState<TaskExecution | null>(null);
  const [execStatus, setExecStatus] = useState<TaskExecutionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failureKind, setFailureKind] = useState<StepFailureKind | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [outputPreview, setOutputPreview] = useState<TaskOutputPreview | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const execStatusRef = useRef<TaskExecutionStatus>('idle');
  const executionRef = useRef<TaskExecution | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);
  const goalRef = useRef('');
  const taskIdRef = useRef('');
  const terminalRef = useRef(false);
  const pollStartMsRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPoll = useCallback((taskId: string, goal: string) => {
    if (!taskId || !String(taskId).trim()) {
      return;
    }
    clearPoll();
    pollStartMsRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartMsRef.current;
      if (elapsed >= WATCHDOG_MS) {
        clearPoll();
        setExecStatus('cancelled');
        execStatusRef.current = 'cancelled';
        message.warning('任务执行超过 120s 未完成，已自动停止轮询。请检查后端服务状态后重试。', 5);
        return;
      }

      try {
        const result = await getExecution(taskId, goal);

        if (execStatusRef.current === 'done' || executionRef.current?.status === 'done') {
          clearPoll();
          return;
        }

        setExecution(result);
        executionRef.current = result;

        if (result.status === 'done') {
          setExecStatus('done');
          execStatusRef.current = 'done';
          setOutputPreview(result.outputPreview ?? null);
          terminalRef.current = true;
          clearPoll();
          return;
        }

        if (TERMINAL_STATUSES.includes(result.status)) {
          clearPoll();
          const nextStatus = result.status === 'degraded' ? 'degraded' : result.status;
          setExecStatus(nextStatus);
          execStatusRef.current = nextStatus;
          terminalRef.current = true;
          if (nextStatus === 'failed') {
            const failed = result.steps.find((s) => s.status === 'failed');
            if (failed) {
              setFailureKind(failed.failureKind ?? null);
              setFailedStep(failed.stepId);
              setError(failed.failureReason ?? '任务执行失败');
            }
          }
        }
      } catch {
        if (execStatusRef.current === 'done' || executionRef.current?.status === 'done') {
          clearPoll();
          return;
        }
      }
    }, POLL_INTERVAL_MS);
  }, [clearPoll]);

  const start = useCallback(async (params: StartParams) => {
    const { taskId, userGoal } = params;

    console.debug('[task-execution-start]', { taskId, userGoal });

    const tid = String(taskId ?? '').trim();
    const goal = String(userGoal ?? '').trim();

    if (!tid) {
      const errMsg = '任务计划缺少 taskId，无法启动执行，请重新生成任务计划';
      console.error('[task-execution-start]', errMsg);
      message.error(errMsg);
      return;
    }

    if (!goal) {
      const errMsg = '任务目标缺失，请重新输入并生成任务计划';
      console.error('[task-execution-start]', errMsg);
      message.error(errMsg);
      return;
    }

    if (isStarting || startingRef.current) {
      return;
    }

    startingRef.current = true;
    setIsStarting(true);

    goalRef.current = goal;
    taskIdRef.current = tid;
    terminalRef.current = false;
    pollStartMsRef.current = 0;

    setError(null);
    setFailureKind(null);
    setFailedStep(null);
    setOutputPreview(null);
    setExecution(null);
    executionRef.current = null;
    setExecStatus('running');
    execStatusRef.current = 'running';

    try {
      const result = await confirmTask(tid, goal);
      startingRef.current = false;
      setIsStarting(false);

      setExecution(result);
      executionRef.current = result;

      if (result.status === 'running') {
        startPoll(tid, goal);
      } else {
        setExecStatus(result.status);
        execStatusRef.current = result.status;
        if (result.status === 'done') {
          terminalRef.current = true;
          setOutputPreview(result.outputPreview ?? null);
        }
        if (result.status === 'failed') {
          terminalRef.current = true;
          const failed = result.steps.find((s) => s.status === 'failed');
          if (failed) {
            setFailureKind(failed.failureKind ?? null);
            setFailedStep(failed.stepId);
            setError(failed.failureReason ?? '任务执行失败');
          }
        }
      }
    } catch (e: unknown) {
      startingRef.current = false;
      setIsStarting(false);
      const apiErr = e as { response?: { status?: number; data?: { error?: { code?: string } } } };
      const code = apiErr?.response?.data?.error?.code || '';
      if (code === 'TASK_STATUS_CONFLICT') {
        message.warning('任务状态已变更，正在重新获取执行状态…', 3);
        startPoll(tid, goal);
        return;
      }
      if (execStatusRef.current === 'done' || executionRef.current?.status === 'done') {
        return;
      }
      setExecStatus('failed');
      execStatusRef.current = 'failed';
      terminalRef.current = true;
      setError((e as Error)?.message || '任务确认失败');
    }
  }, [isStarting, startPoll]);

  const stop = useCallback(() => {
    clearPoll();
    startingRef.current = false;
    setExecStatus('cancelled');
    execStatusRef.current = 'cancelled';
    terminalRef.current = true;
    setIsStarting(false);
    setExecution((prev) => prev ? { ...prev, status: 'cancelled' as const } : null);
    executionRef.current = executionRef.current ? { ...executionRef.current, status: 'cancelled' as const } : null;
  }, [clearPoll]);

  const retryStep = useCallback((stepId: string) => {
    if (!stepId) return;
    clearPoll();
    setExecStatus('cancelled');
    execStatusRef.current = 'cancelled';
    message.info('步骤级重试暂未完整实现，当前将保留进度并返回计划页。后续 Phase 2 将支持断点续传。', 4);
  }, [clearPoll]);

  const skipEvidenceAndContinue = useCallback(() => {
    clearPoll();
    setExecStatus('cancelled');
    execStatusRef.current = 'cancelled';
    message.info('跳过外部资料源并继续执行暂未完整实现，当前将保留进度并返回计划页。后续 Phase 2 将支持降级执行。', 4);
  }, [clearPoll]);

  const reset = useCallback(() => {
    clearPoll();
    startingRef.current = false;
    setIsStarting(false);
    terminalRef.current = false;
    pollStartMsRef.current = 0;
    setExecution(null);
    executionRef.current = null;
    setExecStatus('idle');
    execStatusRef.current = 'idle';
    setError(null);
    setFailureKind(null);
    setFailedStep(null);
    setOutputPreview(null);
  }, [clearPoll]);

  return { execution, execStatus, error, failureKind, failedStep, outputPreview, isStarting, start, stop, retryStep, skipEvidenceAndContinue, reset };
}
