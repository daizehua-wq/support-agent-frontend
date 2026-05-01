import type { TaskPlan, MissingInfoItem } from '../types/taskPlan';

const COMPANY_REQUIRED_KEYWORDS = [
  '企查查',
  '工商背景',
  '企业画像',
  '经营风险',
  '公开企业资料',
  '企业信息',
  '公司信息',
];

const hasCompanyRequiredIntent = (text: string): boolean =>
  COMPANY_REQUIRED_KEYWORDS.some((kw) => text.includes(kw));

const buildTaskId = (): string =>
  `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const buildTaskTitle = (goal: string): string => {
  const trimmed = goal.trim();
  if (trimmed.length <= 28) return trimmed;
  return trimmed.slice(0, 28) + '…';
};

const buildUnderstanding = (goal: string): string => {
  if (!goal.trim()) return '尚未收到具体的任务目标。';
  const intent = hasCompanyRequiredIntent(goal) ? '并可能涉及企业背景与经营风险评估' : '';
  const base = `根据你的描述，需要围绕「${goal.slice(0, 40)}」执行一次完整的工作流：分析场景、检索资料、生成输出。${intent}`;
  return base.trim();
};

export function generateTaskPlan(userGoal: string): TaskPlan {
  const goal = userGoal.trim();
  const taskId = buildTaskId();
  const needsCompanyRequired = hasCompanyRequiredIntent(goal);

  const missingInfo: MissingInfoItem[] = [];

  if (!goal) {
    missingInfo.push({
      field: 'taskGoal',
      label: '任务目标',
      level: 'required',
      reason: '无法生成任务计划，请先输入你的任务目标或需求描述。',
    });
  }

  if (needsCompanyRequired) {
    missingInfo.push({
      field: 'companyName',
      label: '客户公司全称',
      level: 'required',
      reason: '你的任务目标涉及企业背景或经营风险评估，需要提供客户公司全称以确保检索和分析的准确性。',
    });
  } else if (goal) {
    missingInfo.push({
      field: 'companyName',
      label: '客户公司全称',
      level: 'recommended',
      reason: '提供公司名称可以提升检索精确度。',
    });
  }

  if (goal) {
    missingInfo.push({
      field: 'outputTarget',
      label: '期望输出对象',
      level: 'recommended',
      reason: '明确输出对象（如 销售经理 / 风控负责人）可以帮助系统选择更适合的文稿风格。',
    });
    missingInfo.push({
      field: 'recentCommunication',
      label: '最近沟通记录',
      level: 'recommended',
      reason: '上次沟通的简要内容可以用于调整输出侧重点。',
    });
    missingInfo.push({
      field: 'toneStyle',
      label: '语气偏好',
      level: 'optional',
      reason: '你可以选择正式、亲切或精简语气，不填默认为正式。',
    });
  }

  const hasRequiredMissing = missingInfo.some((item) => item.level === 'required');

  return {
    taskId,
    taskTitle: goal ? buildTaskTitle(goal) : '新任务',
    taskType: 'full_workflow',
    userGoal: goal,
    understanding: buildUnderstanding(goal),
    status: hasRequiredMissing ? 'draft' : 'waiting_confirmation',
    steps: [
      { stepId: `${taskId}-analysis`, order: 1, type: 'analysis', title: '分析客户场景', required: true, status: 'pending' },
      { stepId: `${taskId}-evidence`, order: 2, type: 'evidence', title: '检索相关证据与资料', required: true, status: 'pending' },
      { stepId: `${taskId}-output`, order: 3, type: 'output', title: '生成正式 / 精简 / 口播 Output', required: true, status: 'pending' },
      { stepId: `${taskId}-save`, order: 4, type: 'save', title: '保存为历史任务', required: true, status: 'pending' },
    ],
    missingInfo,
    executionContext: {
      assistantName: '默认销售支持助手',
      assistantSource: 'global_default',
      modelName: 'gpt-4o-mini',
      dataSources: [
        { name: '本地知识库', status: 'healthy' },
        { name: '企业内部数据库', status: 'healthy' },
        { name: '企查查', status: 'degraded' },
      ],
      taskPlanner: {
        status: 'ready',
        source: 'embedded_model',
      },
    },
    riskHints: [
      '当前为 mock 规划，不连接真实后端。',
      '确认执行后系统将按步骤分析客户场景、检索资料并生成输出。',
    ],
  };
}
