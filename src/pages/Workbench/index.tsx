import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, message, Space, Spin, Tag, Typography } from 'antd';
import {
  ExperimentOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ConfirmExecutionBar from '../../components/workbench/ConfirmExecutionBar';
import EditTaskPlanModal from '../../components/workbench/EditTaskPlanModal';
import ExecutionContextCard from '../../components/workbench/ExecutionContextCard';
import MissingInfoDrawer from '../../components/workbench/MissingInfoDrawer';
import MissingInfoPanel from '../../components/workbench/MissingInfoPanel';
import OutputPreviewCard from '../../components/workbench/OutputPreviewCard';
import StepFailureModal from '../../components/workbench/StepFailureModal';
import StepResultCard from '../../components/workbench/StepResultCard';
import StopTaskModal from '../../components/workbench/StopTaskModal';
import ExternalSourceDegradedModal from '../../components/output/ExternalSourceDegradedModal';
import TaskInputBox from '../../components/workbench/TaskInputBox';
import TaskPlanCard from '../../components/workbench/TaskPlanCard';
import TaskStepTimeline from '../../components/workbench/TaskStepTimeline';
import { useTaskExecution } from '../../hooks/useTaskExecution';
import { generateTaskPlan } from '../../utils/taskApiAdapter';
import type { TaskPlan } from '../../types/taskPlan';

type WorkbenchState = 'empty' | 'planning' | 'plan_confirm' | 'needs_info' | 'running' | 'failed' | 'degraded' | 'done' | 'cancelled';

type WbUIState = {
  wbState: WorkbenchState;
  planning: boolean;
  stopping: boolean;
  showStopModal: boolean;
  showFailureModal: boolean;
  showEditPlanModal: boolean;
  showMissingDrawer: boolean;
  showDegradedModal: boolean;
};

type WbUIAction =
  | { type: 'SET_WB_STATE'; value: WorkbenchState }
  | { type: 'BEGIN_PLANNING' }
  | { type: 'PLAN_DONE' }
  | { type: 'PLAN_FAILED' }
  | { type: 'BEGIN_STOPPING' }
  | { type: 'STOP_DONE' }
  | { type: 'OPEN_MODAL'; modal: keyof Pick<WbUIState, 'showStopModal' | 'showFailureModal' | 'showEditPlanModal' | 'showMissingDrawer' | 'showDegradedModal'> }
  | { type: 'CLOSE_MODAL'; modal: keyof Pick<WbUIState, 'showStopModal' | 'showFailureModal' | 'showEditPlanModal' | 'showMissingDrawer' | 'showDegradedModal'> }
  | { type: 'BACK_TO_PLAN_CONFIRM' }
  | { type: 'RESET_EMPTY' };

function wbUIReducer(state: WbUIState, action: WbUIAction): WbUIState {
  switch (action.type) {
    case 'SET_WB_STATE':
      return { ...state, wbState: action.value };
    case 'BEGIN_PLANNING':
      return { ...state, planning: true, wbState: 'planning' };
    case 'PLAN_DONE':
      return { ...state, planning: false };
    case 'PLAN_FAILED':
      return { ...state, planning: false, wbState: 'empty' };
    case 'BEGIN_STOPPING':
      return { ...state, stopping: true };
    case 'STOP_DONE':
      return { ...state, stopping: false, showStopModal: false };
    case 'OPEN_MODAL':
      return { ...state, [action.modal]: true };
    case 'CLOSE_MODAL':
      return { ...state, [action.modal]: false };
    case 'BACK_TO_PLAN_CONFIRM':
      return { ...state, wbState: 'plan_confirm' };
    case 'RESET_EMPTY':
      return { wbState: 'empty', planning: false, stopping: false, showStopModal: false, showFailureModal: false, showEditPlanModal: false, showMissingDrawer: false, showDegradedModal: false };
    default:
      return state;
  }
}

function WorkbenchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = (location.state as { draft?: string } | null)?.draft || '';

  const [taskInput, setTaskInput] = useState(draft || '');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [missingInfoValues, setMissingInfoValues] = useState<Record<string, string>>({});
  const [ui, dispatch] = useReducer(wbUIReducer, {
    wbState: 'empty',
    planning: false,
    stopping: false,
    showStopModal: false,
    showFailureModal: false,
    showEditPlanModal: false,
    showMissingDrawer: false,
    showDegradedModal: false,
  });

  const { execution, execStatus, outputPreview, isStarting, start, stop, retryStep, skipEvidenceAndContinue, reset } = useTaskExecution();

  const executionWbState: WorkbenchState | null = useMemo(() => {
    if (execution?.status) {
      if (execution.status === 'degraded') return 'degraded';
      if (execution.status === 'running') return 'running';
      if (execution.status === 'done') return execution.steps.some((s) => s.status === 'degraded') ? 'degraded' : 'done';
      if (execution.status === 'failed') return 'failed';
      if (execution.status === 'cancelled') return 'cancelled';
    }
    if (execStatus === 'degraded') return 'degraded';
    if (execStatus === 'running') return 'running';
    if (execStatus === 'done') return execution?.steps.some((s) => s.status === 'degraded') ? 'degraded' : 'done';
    if (execStatus === 'failed') return 'failed';
    if (execStatus === 'cancelled') return 'cancelled';
    return null;
  }, [execution, execStatus]);

  const effectiveWbState: WorkbenchState = executionWbState ?? ui.wbState;

  useEffect(() => {
    console.debug('[workbench-state]', {
      execStatus,
      executionStatus: execution?.status,
      effectiveWbState,
      localWbState: ui.wbState,
      taskId: execution?.taskId ?? plan?.taskId,
    });
  }, [execStatus, execution?.status, effectiveWbState, ui.wbState, execution?.taskId, plan?.taskId]);

  const handleGeneratePlan = useCallback(async () => {
    if (!taskInput.trim()) return;
    dispatch({ type: 'BEGIN_PLANNING' });
    try {
      const generatedPlan = await generateTaskPlan(taskInput);
      if (!generatedPlan?.taskId) {
        message.error('任务计划生成失败：缺少 taskId，请重试');
        dispatch({ type: 'PLAN_FAILED' });
        return;
      }
      setPlan(generatedPlan);
      dispatch({ type: 'PLAN_DONE' });
      const hasRequiredMissing = generatedPlan.missingInfo.some((i) => i.level === 'required');
      dispatch({ type: 'SET_WB_STATE', value: hasRequiredMissing ? 'needs_info' : 'plan_confirm' });
    } catch {
      dispatch({ type: 'PLAN_FAILED' });
      message.error('任务计划生成失败，请检查网络连接后重试');
    }
  }, [taskInput]);

  const handleMissingInfoChange = useCallback((field: string, value: string) => {
    setMissingInfoValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const hasRequiredMissing = plan?.missingInfo.some(
    (item) => item.level === 'required' && !missingInfoValues[item.field]?.trim(),
  ) ?? false;

  const planValid = !!(plan?.taskId && plan?.steps?.length && plan?.userGoal);

  const handleConfirmExecution = () => {
    const taskId = plan?.taskId;
    const userGoal = plan?.userGoal || draft || taskInput;

    console.debug('[workbench-confirm-click]', {
      plan,
      taskId,
      userGoal,
      planHasTaskId: !!plan?.taskId,
    });

    if (!plan) {
      message.error('任务计划尚未生成，请先输入目标并生成任务计划');
      return;
    }
    if (!taskId || !String(taskId).trim()) {
      message.error('任务计划缺少 taskId，请重新生成任务计划');
      return;
    }
    if (!userGoal || !String(userGoal).trim()) {
      message.error('任务目标缺失，请重新输入并生成任务计划');
      return;
    }

    start({ taskId: taskId.trim(), userGoal: userGoal.trim() });
  };

  const confirming = isStarting || (execStatus === 'running' && effectiveWbState === 'running');

  const handleStop = () => {
    dispatch({ type: 'OPEN_MODAL', modal: 'showStopModal' });
  };

  const handleStopConfirm = () => {
    dispatch({ type: 'BEGIN_STOPPING' });
    setTimeout(() => {
      stop();
      dispatch({ type: 'STOP_DONE' });
    }, 300);
  };

  const handleStopCancel = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showStopModal' });
  };

  const failedStep = useMemo(
    () => execution?.steps.find((s) => s.status === 'failed') || null,
    [execution],
  );

  const handleRetry = () => {
    if (!failedStep) return;
    dispatch({ type: 'CLOSE_MODAL', modal: 'showFailureModal' });
    retryStep(failedStep.stepId);
  };

  const handleSkipExternal = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showFailureModal' });
    skipEvidenceAndContinue();
  };

  const handleBackToPlan = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showFailureModal' });
    reset();
    dispatch({ type: 'BACK_TO_PLAN_CONFIRM' });
  };

  const handleKeepProgress = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showFailureModal' });
    stop();
  };

  const handleContinueLimited = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showFailureModal' });
    skipEvidenceAndContinue();
  };

  const handleEditPlanSave = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showEditPlanModal' });
    message.info('任务计划已更新。');
  };

  const handleMissingInfoSave = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showMissingDrawer' });
    message.info('补充信息已保存，可继续确认执行。');
  };

  const handleMissingInfoContinue = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showMissingDrawer' });
    handleConfirmExecution();
  };

  const handleContinueDegraded = () => {
    dispatch({ type: 'CLOSE_MODAL', modal: 'showDegradedModal' });
  };

  const handleContinueFromCancelled = () => {
    if (!plan) return;
    const taskId = String(plan.taskId ?? '').trim();
    const userGoal = String(plan.userGoal ?? '').trim();
    if (!taskId) {
      message.error('任务计划缺少 taskId，无法继续执行');
      return;
    }
    reset();
    start({ taskId, userGoal });
  };

  const handleBackToPlanFromCancelled = () => {
    reset();
    dispatch({ type: 'BACK_TO_PLAN_CONFIRM' });
  };

  const autoShowFailure = execStatus === 'failed' && !!failedStep;

  const renderEmpty = () => (
    <div className="ap-hero">
      <h1 className="ap-hero__headline">创建新任务</h1>
      <p className="ap-hero__subline">输入任务目标，系统会自动规划分析步骤、检索资料并生成专业交付</p>
      <div style={{ marginTop: 34, width: '100%', maxWidth: 760 }}>
        <TaskInputBox value={taskInput} onChange={setTaskInput} onGeneratePlan={handleGeneratePlan} disabled={ui.planning} loading={ui.planning} />
      </div>
    </div>
  );

  const renderPlanning = () => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <Spin size="large" tip="正在生成任务计划…"><div style={{ padding: 50 }} /></Spin>
    </div>
  );

  const renderPlanArea = () => {
    if (!plan) return null;
    return (
      <div className="ap-workbench-plan">
        <TaskInputBox value={taskInput} onChange={setTaskInput} onGeneratePlan={handleGeneratePlan} disabled={ui.planning} loading={ui.planning} />
        <TaskPlanCard plan={plan} />
        {plan.missingInfo.length > 0 && <MissingInfoPanel items={plan.missingInfo} values={missingInfoValues} onChangeValue={handleMissingInfoChange} />}
        <ExecutionContextCard context={plan.executionContext} />
        <ConfirmExecutionBar hasRequiredMissing={hasRequiredMissing} planValid={planValid} onConfirm={handleConfirmExecution} loading={confirming} />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <ExperimentOutlined style={{ marginRight: 4 }} />
            当前只是任务计划，不是执行结果。确认前不会调用模型、外部资料源或生成输出。
          </Typography.Text>
        </div>
      </div>
    );
  };

  const renderRunning = () => {
    const isDegraded = effectiveWbState === 'degraded' || execution?.steps.some((s) => s.status === 'degraded');
    return (
      <div className="ap-workbench-plan">
        <div className="ap-workbench-exec-header">
          <Typography.Title level={3} style={{ margin: 0 }}>执行中</Typography.Title>
          <Button icon={<PauseCircleOutlined />} danger onClick={handleStop}>停止并保存进度</Button>
        </div>
        {isDegraded && (
          <Alert type="warning" showIcon message="降级执行中" description="外部资料源当前降级，系统将使用内部知识库、Reference Pack 和已有上下文继续执行。" style={{ marginTop: 14, borderRadius: 20 }} />
        )}
        {execution && <TaskStepTimeline steps={execution.steps} />}
        {execution && execution.steps.filter((s) => s.status === 'done' || s.status === 'running' || s.status === 'degraded').map((step) => (
          <StepResultCard key={step.stepId} step={step} />
        ))}
      </div>
    );
  };

  const renderDone = () => (
    <div className="ap-workbench-plan">
      <div className="ap-workbench-exec-header">
        <Typography.Title level={3} style={{ margin: 0 }}>任务完成</Typography.Title>
        <Tag color="green">已保存到历史任务</Tag>
      </div>
      {execution && <TaskStepTimeline steps={execution.steps} />}
      {execution?.steps.filter((s) => s.status === 'done' || s.status === 'degraded').map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
      {(outputPreview || execution?.outputPreview) && plan && (
        <OutputPreviewCard taskId={plan.taskId} preview={outputPreview ?? execution!.outputPreview!} degraded={effectiveWbState === 'degraded'} />
      )}
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">已生成三版输出，并保存到历史任务。</Typography.Text>
          <Button type="primary" onClick={() => navigate(`/tasks/${plan?.taskId || execution?.taskId}/output`)}>查看 Output</Button>
        </Space>
      </div>
    </div>
  );

  const renderFailed = () => (
    <div className="ap-workbench-plan">
      <div className="ap-workbench-exec-header">
        <Typography.Title level={3} style={{ margin: 0 }}>任务中断</Typography.Title>
        <Tag color="red">执行失败</Tag>
      </div>
      {execution && <TaskStepTimeline steps={execution.steps} />}
      {failedStep && <StepResultCard step={failedStep} />}
      {execution?.steps.filter((s) => s.status === 'done').map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Space>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => dispatch({ type: 'OPEN_MODAL', modal: 'showFailureModal' })}>重试处理</Button>
          <Button onClick={handleKeepProgress}>保留进度</Button>
        </Space>
      </div>
    </div>
  );

  const renderCancelled = () => (
    <div className="ap-workbench-plan ap-cancelled-summary">
      <div className="ap-workbench-exec-header">
        <Typography.Title level={3} style={{ margin: 0 }}>任务已停止，当前进度已保存</Typography.Title>
        <Tag color="processing">可继续</Tag>
      </div>
      {execution && <TaskStepTimeline steps={execution.steps} />}
      {execution?.steps.filter((s) => s.status === 'done' || s.status === 'degraded').map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
      {plan && <TaskPlanCard plan={plan} />}
      {plan && <ExecutionContextCard context={plan.executionContext} />}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button type="primary" block size="large" icon={<ReloadOutlined />} onClick={handleContinueFromCancelled}>继续执行</Button>
        <Button block onClick={handleBackToPlanFromCancelled}>修改任务计划</Button>
        <Button block onClick={() => { if (plan) navigate(`/tasks/${plan.taskId}`); }}>查看历史任务</Button>
        <Button block onClick={() => message.info('新建类似任务将在后续阶段开放。', 3)}>新建类似任务</Button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 4px 48px' }}>
      {['empty', 'planning', 'plan_confirm', 'needs_info'].includes(effectiveWbState) && effectiveWbState !== 'planning' && effectiveWbState !== 'empty' && renderPlanArea()}
      {effectiveWbState === 'empty' && renderEmpty()}
      {effectiveWbState === 'planning' && renderPlanning()}
      {['running', 'degraded'].includes(effectiveWbState) && renderRunning()}
      {effectiveWbState === 'done' && renderDone()}
      {effectiveWbState === 'failed' && renderFailed()}
      {effectiveWbState === 'cancelled' && renderCancelled()}

      <StopTaskModal open={ui.showStopModal} mode="workbench" onConfirm={handleStopConfirm} onCancel={handleStopCancel} loading={ui.stopping} />
      <StepFailureModal
        open={ui.showFailureModal || autoShowFailure}
        failedStep={failedStep}
        onRetry={handleRetry}
        onSkipExternal={handleSkipExternal}
        onContinueLimited={handleContinueLimited}
        onBackToPlan={handleBackToPlan}
        onKeepProgress={handleKeepProgress}
      />

      <EditTaskPlanModal
        open={ui.showEditPlanModal}
        taskTitle={plan?.taskTitle || ''}
        outputTarget=""
        tone="formal"
        contextNote=""
        source="workbench"
        onSave={() => handleEditPlanSave()}
        onCancel={() => dispatch({ type: 'CLOSE_MODAL', modal: 'showEditPlanModal' })}
      />

      <MissingInfoDrawer
        open={ui.showMissingDrawer}
        fields={(plan?.missingInfo || []).map((item) => ({ key: item.field, label: item.label, level: item.level, value: '' }))}
        onSave={handleMissingInfoSave}
        onContinueLimited={handleMissingInfoContinue}
        onClose={() => dispatch({ type: 'CLOSE_MODAL', modal: 'showMissingDrawer' })}
      />

      <ExternalSourceDegradedModal
        open={ui.showDegradedModal}
        role="user"
        degradedSources={[{ name: '企查查', status: 'degraded', reason: '外部资料源当前不可用。' }]}
        onContinue={handleContinueDegraded}
        onClose={() => dispatch({ type: 'CLOSE_MODAL', modal: 'showDegradedModal' })}
      />
    </div>
  );
}

export default WorkbenchPage;
