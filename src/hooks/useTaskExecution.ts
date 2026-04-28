import { useCallback, useRef, useState } from 'react';
import type { TaskExecution, TaskExecutionStatus } from '../types/taskPlan';
import { runMockExecution } from '../utils/mockTaskExecutor';

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
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (goal: string, taskId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setExecStatus('running');

    const result = await runMockExecution(goal, taskId, (_step, allSteps) => {
      setExecution({ ...result, steps: allSteps, status: 'running' });
    }, controller.signal);

    setExecution(result);
    setExecStatus(result.status);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setExecStatus('cancelled');
    setExecution((prev) => prev ? { ...prev, status: 'cancelled' } : null);
  }, []);

  const retryStep = useCallback((stepId: string) => {
    // Mock retry: mark failed step as done, re-run from there
    setExecution((prev) => {
      if (!prev) return null;
      const steps = prev.steps.map((s) =>
        s.stepId === stepId ? { ...s, status: 'done' as const, failureReason: undefined, failureKind: undefined, summary: '已通过重试恢复' } : s,
      );
      return { ...prev, steps, status: 'running' };
    });
    setExecStatus('running');

    // Simulate remaining steps completing
    let delay = 500;
    setExecution((prev) => {
      if (!prev) return null;
      const steps = prev.steps.map((s) => {
        if (s.stepId === stepId) return s;
        if (s.status === 'pending') {
          const d = delay; delay += 400;
          setTimeout(() => {
            setExecution((p) => {
              if (!p) return null;
              const ns = p.steps.map((ss) => ss.stepId === s.stepId ? { ...ss, status: 'done' as const, summary: '步骤已完成', durationMs: d } : ss);
              const allDone = ns.every((ss) => ss.status === 'done' || ss.status === 'degraded' || ss.status === 'skipped');
              return { ...p, steps: ns, status: allDone ? 'done' as const : 'running' };
            });
            if (s.type === 'save') {
              setTimeout(() => setExecStatus('done'), 100);
            }
          }, delay);
          return s;
        }
        return s;
      });
      return { ...prev, steps };
    });
  }, []);

  const skipEvidenceAndContinue = useCallback(() => {
    setExecution((prev) => {
      if (!prev) return null;
      const steps = prev.steps.map((s) =>
        s.type === 'evidence' ? { ...s, status: 'skipped' as const, summary: '已跳过外部源', failureReason: undefined, failureKind: undefined } : s,
      );
      return { ...prev, steps, status: 'running' };
    });
    setExecStatus('running');

    let delayCount = 500;
    setExecution((prev) => {
      if (!prev) return null;
      const steps = prev.steps.map((s) => {
        if (s.status === 'pending') {
          setTimeout(() => {
            const d = delayCount; delayCount += 400;
            setExecution((p) => {
              if (!p) return null;
              const ns = p.steps.map((ss) => ss.stepId === s.stepId ? { ...ss, status: 'done' as const, summary: s.type === 'output' ? '已生成三版输出' : '已保存到历史任务', durationMs: d } : ss);
              const allDone = ns.every((ss) => ss.status === 'done' || ss.status === 'degraded' || ss.status === 'skipped');
              return { ...p, steps: ns, status: allDone ? 'done' : 'running' };
            });
            if (s.type === 'save') {
              setTimeout(() => setExecStatus('done'), 100);
            }
          }, delayCount);
          return s;
        }
        return s;
      });
      return { ...prev, steps };
    });
  }, []);

  const reset = useCallback(() => {
    setExecution(null);
    setExecStatus('idle');
    abortRef.current = null;
  }, []);

  return { execution, execStatus, start, stop, retryStep, skipEvidenceAndContinue, reset };
}
