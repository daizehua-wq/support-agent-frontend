import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

function WorkbenchPage() {
  const location = useLocation();
  const draft = (location.state as { draft?: string } | null)?.draft || '';

  const [taskInput, setTaskInput] = useState('');
  const [wbState, setWbState] = useState<WorkbenchState>('empty');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [missingInfoValues, setMissingInfoValues] = useState<Record<string, string>>({});
  const [planning, setPlanning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [showMissingDrawer, setShowMissingDrawer] = useState(false);
  const [showDegradedModal, setShowDegradedModal] = useState(false);

  const { execution, execStatus, start, stop, retryStep, skipEvidenceAndContinue, reset } = useTaskExecution();

  useEffect(() => {
    if (draft) {
      setTaskInput(draft);
      setWbState('empty');
    }
  }, [draft]);

  useEffect(() => {
    if (execStatus === 'running' && wbState !== 'running') setWbState('running');
    if (execStatus === 'done') setWbState(execution?.steps.some((s) => s.status === 'degraded') ? 'degraded' : 'done');
    if (execStatus === 'failed') setWbState('failed');
    if (execStatus === 'cancelled') setWbState('cancelled');
  }, [execStatus, wbState, execution]);

  const handleGeneratePlan = useCallback(async () => {
    if (!taskInput.trim()) return;
    setPlanning(true);
    setWbState('planning');
    try {
      const generatedPlan = await generateTaskPlan(taskInput);
      setPlan(generatedPlan);
      setPlanning(false);
      const hasRequiredMissing = generatedPlan.missingInfo.some((i) => i.level === 'required');
      setWbState(hasRequiredMissing ? 'needs_info' : 'plan_confirm');
    } catch (_err) {
      setPlanning(false);
      setWbState('empty');
    }
  }, [taskInput]);

  const handleMissingInfoChange = useCallback((field: string, value: string) => {
    setMissingInfoValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const hasRequiredMissing = plan?.missingInfo.some(
    (item) => item.level === 'required' && !missingInfoValues[item.field]?.trim(),
  ) ?? false;

  const handleConfirmExecution = () => {
    if (!plan) return;
    start(plan.userGoal, plan.taskId);
  };

  const handleStop = () => {
    setShowStopModal(true);
  };

  const handleStopConfirm = () => {
    setStopping(true);
    setTimeout(() => {
      stop();
      setStopping(false);
      setShowStopModal(false);
    }, 300);
  };

  const handleStopCancel = () => {
    setShowStopModal(false);
  };

  const failedStep = useMemo(
    () => execution?.steps.find((s) => s.status === 'failed') || null,
    [execution],
  );

  const handleRetry = () => {
    if (!failedStep) return;
    setShowFailureModal(false);
    retryStep(failedStep.stepId);
  };

  const handleSkipExternal = () => {
    setShowFailureModal(false);
    skipEvidenceAndContinue();
  };

  const handleBackToPlan = () => {
    setShowFailureModal(false);
    reset();
    setWbState('plan_confirm');
  };

  const handleKeepProgress = () => {
    setShowFailureModal(false);
    stop();
  };

  const handleContinueLimited = () => {
    setShowFailureModal(false);
    skipEvidenceAndContinue();
  };

  const handleEditPlanSave = (_values: Record<string, string>) => {
    setShowEditPlanModal(false);
    message.info('任务计划已更新。');
  };

  const handleMissingInfoSave = (_values: Record<string, string>) => {
    setShowMissingDrawer(false);
    message.info('补充信息已保存，可继续确认执行。');
  };

  const handleMissingInfoContinue = () => {
    setShowMissingDrawer(false);
    handleConfirmExecution();
  };

  const handleContinueDegraded = () => {
    setShowDegradedModal(false);
  };

  const handleContinueFromCancelled = () => {
    if (!plan) return;
    reset();
    start(plan.userGoal, plan.taskId);
  };

  const handleBackToPlanFromCancelled = () => {
    reset();
    setWbState('plan_confirm');
  };

  useEffect(() => {
    if (execStatus === 'failed' && failedStep) {
      setShowFailureModal(true);
    }
  }, [execStatus, failedStep]);

  const renderEmpty = () => (
    <div className="ap-hero">
      <h1 className="ap-hero__headline">创建新任务</h1>
      <p className="ap-hero__subline">输入任务目标，系统会自动规划分析步骤、检索资料并生成专业交付</p>
      <div style={{ marginTop: 34, width: '100%', maxWidth: 760 }}>
        <TaskInputBox value={taskInput} onChange={setTaskInput} onGeneratePlan={handleGeneratePlan} disabled={planning} loading={planning} />
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
        <TaskInputBox value={taskInput} onChange={setTaskInput} onGeneratePlan={handleGeneratePlan} disabled={planning} loading={planning} />
        <TaskPlanCard plan={plan} />
        {plan.missingInfo.length > 0 && <MissingInfoPanel items={plan.missingInfo} values={missingInfoValues} onChangeValue={handleMissingInfoChange} />}
        <ExecutionContextCard context={plan.executionContext} />
        <ConfirmExecutionBar hasRequiredMissing={hasRequiredMissing} onConfirm={handleConfirmExecution} loading={false} />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <ExperimentOutlined style={{ marginRight: 4 }} />
            当前只是任务计划，不是执行结果。确认前不会调用模型、外部资料源或生成输出。
          </Typography.Text>
        </div>
      </div>
    );
  };

  const renderRunning = () => (
    <div className="ap-workbench-plan">
      <div className="ap-workbench-exec-header">
        <Typography.Title level={3} style={{ margin: 0 }}>执行中</Typography.Title>
        <Button icon={<PauseCircleOutlined />} danger onClick={handleStop}>停止并保存进度</Button>
      </div>
      {wbState === 'degraded' && (
        <Alert type="warning" showIcon message="降级执行中" description="外部资料源当前降级，系统将使用内部知识库、Reference Pack 和已有上下文继续执行。" style={{ marginTop: 14, borderRadius: 20 }} />
      )}
      {execution && <TaskStepTimeline steps={execution.steps} />}
      {execution && execution.steps.filter((s) => s.status === 'done' || s.status === 'running' || s.status === 'degraded').map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
    </div>
  );

  const renderDone = () => (
    <div className="ap-workbench-plan">
      <div className="ap-workbench-exec-header">
        <Typography.Title level={3} style={{ margin: 0 }}>任务完成</Typography.Title>
        <Tag color="green">已保存到历史任务</Tag>
      </div>
      {wbState === 'degraded' && (
        <Alert type="warning" showIcon message="降级执行中" description="外部资料源当前降级，系统将使用内部知识库、Reference Pack 和已有上下文继续执行。" style={{ marginTop: 14, borderRadius: 20 }} />
      )}
      {execution && <TaskStepTimeline steps={execution.steps} />}
      {execution?.steps.filter((s) => s.status === 'done' || s.status === 'degraded').map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
      {execution?.outputPreview && plan && (
        <OutputPreviewCard taskId={plan.taskId} preview={execution.outputPreview} degraded={wbState === 'degraded'} />
      )}
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Typography.Text type="secondary">已生成三版输出，并保存到历史任务。</Typography.Text>
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
      {execution?.steps.filter((s) => s.status === 'done')?.map((step) => (
        <StepResultCard key={step.stepId} step={step} />
      ))}
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Space>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => setShowFailureModal(true)}>重试处理</Button>
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
        <Button block onClick={() => { if (plan) window.location.href = `/tasks/${plan.taskId}`; }}>查看历史任务</Button>
        <Button block onClick={() => message.info('新建类似任务将在后续阶段开放。', 3)}>新建类似任务</Button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 4px 48px' }}>
      {['empty', 'planning', 'plan_confirm', 'needs_info'].includes(wbState) && wbState !== 'planning' && wbState !== 'empty' && renderPlanArea()}
      {wbState === 'empty' && renderEmpty()}
      {wbState === 'planning' && renderPlanning()}
      {['running', 'degraded'].includes(wbState) && renderRunning()}
      {(wbState === 'done' || (wbState === 'degraded' && execStatus === 'done')) && renderDone()}
      {wbState === 'failed' && renderFailed()}
      {wbState === 'cancelled' && renderCancelled()}

      <StopTaskModal open={showStopModal} mode="workbench" onConfirm={handleStopConfirm} onCancel={handleStopCancel} loading={stopping} />
      <StepFailureModal
        open={showFailureModal}
        failedStep={failedStep}
        onRetry={handleRetry}
        onSkipExternal={handleSkipExternal}
        onContinueLimited={handleContinueLimited}
        onBackToPlan={handleBackToPlan}
        onKeepProgress={handleKeepProgress}
      />

      <EditTaskPlanModal
        open={showEditPlanModal}
        taskTitle={plan?.taskTitle || ''}
        outputTarget=""
        tone="formal"
        contextNote=""
        source="workbench"
        onSave={(values) => handleEditPlanSave(values)}
        onCancel={() => setShowEditPlanModal(false)}
      />

      <MissingInfoDrawer
        open={showMissingDrawer}
        fields={(plan?.missingInfo || []).map((item) => ({ key: item.field, label: item.label, level: item.level, value: '' }))}
        onSave={handleMissingInfoSave}
        onContinueLimited={handleMissingInfoContinue}
        onClose={() => setShowMissingDrawer(false)}
      />

      <ExternalSourceDegradedModal
        open={showDegradedModal}
        role="user"
        degradedSources={[{ name: '企查查', status: 'degraded', reason: '外部资料源当前不可用。' }]}
        onContinue={handleContinueDegraded}
        onClose={() => setShowDegradedModal(false)}
      />
    </div>
  );
}

export default WorkbenchPage;
