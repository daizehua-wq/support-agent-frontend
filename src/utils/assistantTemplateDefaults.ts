import {
  getAssistantCenterAssistantDetail,
  type AssistantCenterDetail,
} from '../api/assistantCenter';
import { getSettings, type SettingsResponseData } from '../api/settings';

export type ActiveAssistantTemplateDefaults = {
  assistantId: string;
  assistantName: string;
  assistantVersion: string;
  industryType: string;
  templateRole: string;
  taskObject: string;
  taskPhase: string;
  taskSubject: string;
  subjectHint: string;
  audience: string;
  focusPoints: string;
  deliverable: string;
  toneStyle: string;
  analyzeTaskInput: string;
  analyzeContext: string;
  searchTaskInput: string;
  searchDocType: string;
  scriptGoal: string;
  scriptTaskInput: string;
  scriptContext: string;
};

const readString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = readString(value);
    if (text) return text;
  }

  return '';
};

const normalizeTaskPhase = (value?: string) => {
  const phase = readString(value);
  const phaseMap: Record<string, string> = {
    启动评估: 'initial_contact',
    初步接触: 'initial_contact',
    需求沟通: 'requirement_discussion',
    需求澄清: 'requirement_discussion',
    执行推进: 'sample_followup',
    样品跟进: 'sample_followup',
    测试推进: 'sample_followup',
    定稿确认: 'quotation',
    报价确认: 'quotation',
    其他: 'other',
  };

  return phaseMap[phase] || phase || 'requirement_discussion';
};

const normalizeToneStyle = (value?: string) => {
  const toneStyle = readString(value);
  if (toneStyle === '正式') return 'formal';
  if (toneStyle === '简洁') return 'concise';
  if (toneStyle === '口语') return 'spoken';
  return toneStyle || 'formal';
};

const resolveScriptGoal = (deliverable: string, subjectHint: string) => {
  const text = `${deliverable} ${subjectHint}`;
  if (text.includes('推进') || text.includes('跟进')) return '推进后续事项';
  if (text.includes('资料') || text.includes('专业') || text.includes('方案')) return '输出专业说明';
  if (text.includes('重启') || text.includes('重新')) return '重新发起事项';
  return '形成初版说明';
};

const resolveActiveAssistantId = (settings: SettingsResponseData) => {
  const activationSummary = settings.statusSummary?.assistantActivationSummary as
    | Record<string, unknown>
    | undefined;
  const activeOption = settings.governanceSummary?.assistantOptions?.find(
    (item) => item.activeFlag === true,
  );

  return pickFirstString(
    settings.governanceSummary?.activeAssistantSummary?.assistantId,
    settings.governanceSummary?.activeAssistantId,
    settings.configSummary?.assistant?.activeAssistantId,
    settings.assistant?.activeAssistantId,
    activationSummary?.activeAssistantId,
    activeOption?.assistantId,
  );
};

const buildFallbackDefaults = (
  settings: SettingsResponseData,
  detail?: AssistantCenterDetail,
): ActiveAssistantTemplateDefaults => {
  const activeSummary = settings.governanceSummary?.activeAssistantSummary;
  const assistantId = pickFirstString(detail?.assistantId, activeSummary?.assistantId, resolveActiveAssistantId(settings));
  const assistantName = pickFirstString(detail?.assistantName, activeSummary?.assistantName, assistantId, '当前 Assistant');
  const assistantVersion = pickFirstString(detail?.currentVersion, activeSummary?.currentVersion);
  const variables = detail?.defaultVariables || {};
  const industryType = pickFirstString(detail?.industryType, activeSummary?.industryType, 'pcb');
  const templateRole = pickFirstString(detail?.templateRole, industryType);
  const subjectHint = pickFirstString(
    detail?.defaultSubjectHint,
    detail?.defaultProductDirection,
    variables.taskSubject,
    '当前任务主题',
  );
  const taskSubject = pickFirstString(variables.taskSubject, detail?.defaultProductDirection, subjectHint);
  const taskObject = pickFirstString(
    detail?.defaultTaskContext,
    detail?.defaultCustomerType,
    '客户需求澄清与方案推进',
  );
  const audience = pickFirstString(variables.audience, detail?.defaultCustomerType, taskObject);
  const taskPhase = normalizeTaskPhase(variables.taskPhase);
  const focusPoints = pickFirstString(variables.focusPoints, '风险、成本、稳定性、边界条件');
  const deliverable = pickFirstString(
    variables.deliverable,
    '判断摘要、资料依据与下一步建议',
  );
  const toneStyle = normalizeToneStyle(variables.toneStyle);
  const scriptGoal = resolveScriptGoal(deliverable, subjectHint);

  return {
    assistantId,
    assistantName,
    assistantVersion,
    industryType,
    templateRole,
    taskObject,
    taskPhase,
    taskSubject,
    subjectHint,
    audience,
    focusPoints,
    deliverable,
    toneStyle,
    analyzeTaskInput: `请判断当前客户关于${taskSubject}的需求阶段、关键风险和下一步推进建议，重点关注${focusPoints}。`,
    analyzeContext: `当前任务对象：${taskObject}；期望产出：${deliverable}。`,
    searchTaskInput: taskSubject,
    searchDocType: 'spec',
    scriptGoal,
    scriptTaskInput: `请基于${taskSubject}的需求判断和资料依据，整理一版面向${audience}的客户沟通草稿。`,
    scriptContext: `围绕${focusPoints}展开，输出${deliverable}。`,
  };
};

export const shouldApplyAssistantDefault = (value: unknown, staleValues: string[] = []) => {
  const currentValue = readString(value);
  if (!currentValue) return true;
  return staleValues.some((staleValue) => readString(staleValue) === currentValue);
};

export async function loadActiveAssistantTemplateDefaults(): Promise<ActiveAssistantTemplateDefaults> {
  const settings = await getSettings();
  const activeAssistantId = resolveActiveAssistantId(settings);
  let detail: AssistantCenterDetail | undefined;

  if (activeAssistantId) {
    try {
      const response = await getAssistantCenterAssistantDetail(activeAssistantId);
      detail = response.data?.detail;
    } catch (error) {
      console.warn('当前 Assistant 详情读取失败，已退回 settings 摘要：', error);
    }
  }

  return buildFallbackDefaults(settings, detail);
}

export const buildAnalyzeTemplateExample = (
  defaults?: ActiveAssistantTemplateDefaults | null,
) => {
  const activeDefaults = defaults || buildFallbackDefaults({} as SettingsResponseData);

  return {
    taskObject: activeDefaults.taskObject,
    industryType: activeDefaults.industryType,
    taskPhase: activeDefaults.taskPhase,
    taskSubject: activeDefaults.taskSubject,
    taskInput: activeDefaults.analyzeTaskInput,
    context: activeDefaults.analyzeContext,
  };
};

export const buildScriptTemplateExample = (
  defaults?: ActiveAssistantTemplateDefaults | null,
) => {
  const activeDefaults = defaults || buildFallbackDefaults({} as SettingsResponseData);

  return {
    audience: activeDefaults.audience,
    taskPhase: activeDefaults.taskPhase,
    goal: activeDefaults.scriptGoal,
    taskSubject: activeDefaults.taskSubject,
    focusPoints: activeDefaults.focusPoints,
    taskInput: activeDefaults.scriptTaskInput,
    context: activeDefaults.scriptContext,
    toneStyle: activeDefaults.toneStyle,
  };
};
