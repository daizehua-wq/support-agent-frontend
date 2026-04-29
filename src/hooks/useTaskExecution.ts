import { useCallback, useRef, useState } from 'react';
import type { TaskExecution, TaskExecutionStatus, StepFailureKind, TaskOutputPreview } from '../types/taskPlan';
import { confirmTask, getExecution } from '../utils/taskApiAdapter';

type UseTaskExecutionResult = {
  execution: TaskExecution | null;
  execStatus: TaskExecutionStatus;
  error: string | null;
  failureKind: StepFailureKind | null;
  failedStep: string | null;
  outputPreview: TaskOutputPreview | null;
  start: (goal: string, taskId: string) => void;
  stop: () => void;
  retryStep: (stepId: string) => void;
  skipEvidenceAndContinue: () => void;
  reset: () => void;
};

const TERMINAL_STATUSES: TaskExecutionStatus[] = ['done', 'failed', 'degraded', 'cancelled'];

export function useTaskExecution(): UseTaskExecutionResult {
  const [execution, setExecution] = useState<TaskExecution | null>(null);
  const [execStatus, setExecStatus] = useState<TaskExecutionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failureKind, setFailureKind] = useState<StepFailureKind | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [outputPreview, setOutputPreview] = useState<TaskOutputPreview | null>(null);
  const execStatusRef = useRef<TaskExecutionStatus>('idle');
  const executionRef = useRef<TaskExecution | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const goalRef = useRef('');
  const taskIdRef = useRef('');
  const terminalRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPoll = useCallback((taskId: string, goal: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
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
    }, 2000);
  }, [clearPoll]);

  const start = useCallback(async (goal: string, taskId: string) => {
    goalRef.current = goal;
    taskIdRef.current = taskId;
    terminalRef.current = false;

    setError(null);
    setFailureKind(null);
    setFailedStep(null);
    setOutputPreview(null);
    setExecution(null);
    executionRef.current = null;
    setExecStatus('running');
    execStatusRef.current = 'running';

    try {
      const result = await confirmTask(taskId, goal);
      setExecution(result);
      executionRef.current = result;

      if (result.status === 'running') {
        startPoll(taskId, goal);
      } else {
        setExecStatus(result.status);
        execStatusRef.current = result.status;
        if (result.status === 'done') {
          terminalRef.current = true;
          setOutputPreview(result.outputPreview ?? null);
        }
        if (result.status === 'failed') {
          const failed = result.steps.find((s) => s.status === 'failed');
          if (failed) {
            setFailureKind(failed.failureKind ?? null);
            setFailedStep(failed.stepId);
            setError(failed.failureReason ?? '任务执行失败');
          }
        }
      }
    } catch (e) {
      if (execStatusRef.current === 'done' || executionRef.current?.status === 'done') {
        return;
      }
      setExecStatus('failed');
      execStatusRef.current = 'failed';
      setError((e as Error)?.message || '任务确认失败');
    }
  }, [startPoll]);

  const stop = useCallback(() => {
    clearPoll();
    setExecStatus('cancelled');
    execStatusRef.current = 'cancelled';
    setExecution((prev) => prev ? { ...prev, status: 'cancelled' as const } : null);
    executionRef.current = executionRef.current ? { ...executionRef.current, status: 'cancelled' as const } : null;
  }, [clearPoll]);

  const retryStep = useCallback((stepId: string) => {
    if (stepId) { /* step-based retry not yet implemented; restart full execution */ }
    clearPoll();
    start(goalRef.current, taskIdRef.current);
  }, [clearPoll, start]);

  const skipEvidenceAndContinue = useCallback(() => {
    clearPoll();
    start(goalRef.current, taskIdRef.current);
  }, [clearPoll, start]);

  const reset = useCallback(() => {
    clearPoll();
    terminalRef.current = false;
    setExecution(null);
    executionRef.current = null;
    setExecStatus('idle');
    execStatusRef.current = 'idle';
    setError(null);
    setFailureKind(null);
    setFailedStep(null);
    setOutputPreview(null);
  }, [clearPoll]);

  return { execution, execStatus, error, failureKind, failedStep, outputPreview, start, stop, retryStep, skipEvidenceAndContinue, reset };
}
