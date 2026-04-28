import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { message, Spin, Typography } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import TaskInputBox from '../../components/workbench/TaskInputBox';
import TaskPlanCard from '../../components/workbench/TaskPlanCard';
import MissingInfoPanel from '../../components/workbench/MissingInfoPanel';
import ConfirmExecutionBar from '../../components/workbench/ConfirmExecutionBar';
import ExecutionContextCard from '../../components/workbench/ExecutionContextCard';
import { generateTaskPlan } from '../../utils/mockTaskPlanner';
import type { TaskPlan } from '../../types/taskPlan';

type WorkbenchState = 'empty' | 'planning' | 'plan_confirm' | 'needs_info';

function WorkbenchPage() {
  const location = useLocation();
  const draft = (location.state as { draft?: string } | null)?.draft || '';

  const [taskInput, setTaskInput] = useState('');
  const [wbState, setWbState] = useState<WorkbenchState>('empty');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [missingInfoValues, setMissingInfoValues] = useState<Record<string, string>>({});
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    if (draft) {
      setTaskInput(draft);
      setWbState('empty');
    }
  }, [draft]);

  const handleGeneratePlan = useCallback(() => {
    if (!taskInput.trim()) return;
    setPlanning(true);
    setWbState('planning');

    setTimeout(() => {
      const generatedPlan = generateTaskPlan(taskInput);
      setPlan(generatedPlan);
      setPlanning(false);

      const hasRequiredMissing = generatedPlan.missingInfo.some((i) => i.level === 'required');
      if (hasRequiredMissing) {
        setWbState('needs_info');
      } else {
        setWbState('plan_confirm');
      }
    }, 1200);
  }, [taskInput]);

  const handleMissingInfoChange = useCallback((field: string, value: string) => {
    setMissingInfoValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const hasRequiredMissing =
    plan?.missingInfo.some(
      (item) => item.level === 'required' && !missingInfoValues[item.field]?.trim(),
    ) ?? false;

  const handleConfirmExecution = () => {
    message.info('FE-2 仅实现规划态，执行态将在 FE-3 接入。任务计划已确认，后续步骤即将开放。', 5);
  };

  const renderEmpty = () => (
    <div className="ap-hero">
      <h1 className="ap-hero__headline">创建新任务</h1>
      <p className="ap-hero__subline">输入任务目标，系统会自动规划分析步骤、检索资料并生成专业交付</p>
      <div style={{ marginTop: 34, width: '100%', maxWidth: 760 }}>
        <TaskInputBox
          value={taskInput}
          onChange={setTaskInput}
          onGeneratePlan={handleGeneratePlan}
          disabled={planning}
          loading={planning}
        />
      </div>
    </div>
  );

  const renderPlanning = () => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <Spin size="large" tip="正在生成任务计划…">
        <div style={{ padding: 50 }} />
      </Spin>
    </div>
  );

  const renderPlanArea = () => {
    if (!plan) return null;

    return (
      <div className="ap-workbench-plan">
        <TaskInputBox
          value={taskInput}
          onChange={setTaskInput}
          onGeneratePlan={handleGeneratePlan}
          disabled={planning}
          loading={planning}
        />

        <TaskPlanCard plan={plan} />

        {plan.missingInfo.length > 0 && (
          <MissingInfoPanel
            items={plan.missingInfo}
            values={missingInfoValues}
            onChangeValue={handleMissingInfoChange}
          />
        )}

        <ExecutionContextCard context={plan.executionContext} />

        <ConfirmExecutionBar
          hasRequiredMissing={hasRequiredMissing}
          onConfirm={handleConfirmExecution}
          loading={false}
        />

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <ExperimentOutlined style={{ marginRight: 4 }} />
            当前只是任务计划，不是执行结果。确认前不会调用模型、外部资料源或生成输出。
          </Typography.Text>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 4px 48px' }}>
      {wbState === 'empty' && renderEmpty()}
      {wbState === 'planning' && renderPlanning()}
      {(wbState === 'plan_confirm' || wbState === 'needs_info') && renderPlanArea()}
    </div>
  );
}

export default WorkbenchPage;
