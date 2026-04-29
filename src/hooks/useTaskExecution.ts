import { useCallback, useRef, useState } from 'react';
import type { TaskExecution, TaskExecutionStatus } from '../types/taskPlan';
import { confirmTask, getExecution } from '../utils/taskApiAdapter';

type UseTaskExecutionResult = {
  execution: TaskExecution | null;
  execStatus: TaskExecutionStatus;
  start: (goal: string, taskId: string) => void;
  stop: () => void;
  retryStep: (stepId: string) => void;
  skipEvidenceAndContinue: () => void;
  reset: () => void;
};

export function useTaskExecution(): UseTaskExecutionResult {
  const [execution, setExecution] = useState<TaskExecution | null>(null);
  const [execStatus, setExecStatus] = useState<TaskExecutionStatus>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const goalRef = useRef('');
  const taskIdRef = useRef('');

  const clearPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPoll = useCallback((taskId: string, goal: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const result = await getExecution(taskId, goal);
        setExecution(result);
        if (['done', 'failed', 'degraded', 'cancelled'].includes(result.status)) {
          clearPoll();
          setExecStatus(result.status === 'degraded' ? 'degraded' : result.status);
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000);
  }, [clearPoll]);

  const start = useCallback(async (goal: string, taskId: string) => {
    goalRef.current = goal;
    taskIdRef.current = taskId;
    setExecStatus('running');

    try {
      const result = await confirmTask(taskId, goal);
      setExecution(result);
      if (result.status === 'running') {
        startPoll(taskId, goal);
      } else {
        setExecStatus(result.status);
      }
    } catch {
      setExecStatus('failed');
    }
  }, [startPoll]);

  const stop = useCallback(() => {
    clearPoll();
    setExecStatus('cancelled');
    setExecution((prev) => prev ? { ...prev, status: 'cancelled' as const } : null);
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
    setExecution(null);
    setExecStatus('idle');
  }, [clearPoll]);

  return { execution, execStatus, start, stop, retryStep, skipEvidenceAndContinue, reset };
}
