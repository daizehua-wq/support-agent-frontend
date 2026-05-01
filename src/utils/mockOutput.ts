import type { OutputDetail, OutputVersionStatus } from '../types/output';

const FORMAL = '尊敬的客户：根据我们的分析，贵司当前处于半导体材料应用的关键阶段。我们建议从涂布工艺参数优化入手，结合行业标准方案，制定分阶段技术对接计划。近期我们将整理一份详细的技术方案供您审阅。\n\n此方案将包含：工艺兼容性分析、同类客户案例参考、初步成本对比评估。如有需要调整的方向，请随时告知。';

const CONCISE = '基于当前分析，建议从涂布工艺参数优化入手，制定分阶段技术对接计划。我们将整理技术方案供您审阅。';

const SPOKEN = '您好，根据我们对您这边情况的分析，建议咱们先从涂布工艺这块切入，我们会整理一份详细的技术方案给您看。您看什么时候方便我们详细沟通一下？';

const NORMAL_STEPS = [
  { title: '分析客户场景', status: 'done' as const, summary: '识别为销售跟进场景，建议输出正式跟进方案。' },
  { title: '检索资料与证据', status: 'done' as const, summary: '已从内部知识库和 Reference Pack 中整理 3 条可引用依据。' },
  { title: '生成输出', status: 'done' as const, summary: '已生成正式交付版、简洁沟通版、口语跟进版。' },
  { title: '保存历史任务', status: 'done' as const, summary: '已保存到历史任务。' },
];

const NORMAL_EVIDENCES = [
  { id: 'ev-1', title: '半导体涂布工艺标准', sourceType: 'internal_knowledge' as const, sourceName: '内部知识库', status: 'healthy' as const, summary: '行业标准涂布工艺参数表，包括干燥温度、涂布速度和材料兼容性指南。' },
  { id: 'ev-2', title: '同类客户案例：XX 材料公司', sourceType: 'reference_pack' as const, sourceName: 'Reference Pack', status: 'healthy' as const, summary: '半导体涂布材料领域的客户合作案例，展示从评估到上线的完整流程。' },
  { id: 'ev-3', title: '企业背景与风险数据', sourceType: 'external_source' as const, sourceName: '外部资料源', status: 'healthy' as const, summary: '公司注册信息、经营状态和公开的信用记录。' },
];

const NORMAL_RISKS = [
  { id: 'r-1', level: 'warning' as const, title: '缺少客户公司全称', description: '未提供客户公司全称，分析结果基于关键词匹配，精确度可能受限。' },
  { id: 'r-2', level: 'info' as const, title: '输出对象未指定', description: '未指定输出对象，默认使用通用销售沟通风格。' },
];

function buildBaseOutput(taskId: string): OutputDetail {
  return {
    taskId,
    taskTitle: '半导体材料客户销售支持',
    taskGoal: '分析这家半导体材料客户的背景，检索行业涂布工艺案例，生成一份销售跟进方案。',
    outputTarget: '销售经理',
    tone: '正式',
    status: 'success',
    currentVersionId: `${taskId}-v3`,
    versions: [
      {
        versionId: `${taskId}-v1`,
        label: 'v1',
        status: 'success',
        isCurrent: false,
        reason: '首次生成 · 证据不足',
        createdAt: '2026-04-28 10:15',
        formalVersion: FORMAL,
        conciseVersion: CONCISE,
        spokenVersion: SPOKEN,
      },
      {
        versionId: `${taskId}-v2`,
        label: 'v2',
        status: 'success',
        isCurrent: false,
        reason: '补充客户公司全称后重新生成',
        createdAt: '2026-04-28 11:30',
        formalVersion: FORMAL,
        conciseVersion: CONCISE,
        spokenVersion: SPOKEN,
      },
      {
        versionId: `${taskId}-v3`,
        label: 'v3',
        status: 'success',
        isCurrent: true,
        reason: '调整为简洁语气后重新生成',
        createdAt: '2026-04-28 14:00',
        formalVersion: FORMAL,
        conciseVersion: CONCISE,
        spokenVersion: SPOKEN,
      },
    ],
    evidences: NORMAL_EVIDENCES,
    risks: NORMAL_RISKS,
    executionSteps: NORMAL_STEPS,
  };
}

export function generateMockOutput(taskId: string): OutputDetail {
  const base = buildBaseOutput(taskId);

  if (taskId.includes('generating')) {
    base.status = 'generating';
    base.versions = [{ versionId: `${taskId}-v1`, label: 'v1', status: 'generating', isCurrent: true, reason: '初次生成', createdAt: new Date().toISOString() }];
    return base;
  }

  if (taskId.includes('insufficient')) {
    base.status = 'evidence_insufficient';
    base.risks = [
      ...base.risks,
      { id: 'r-e1', level: 'warning' as const, title: '证据不足', description: '缺少客户公司全称和最近沟通记录，影响分析精确度。建议补充资料后重新生成。' },
    ];
    return base;
  }

  if (taskId.includes('degraded')) {
    base.status = 'degraded';
    base.evidences = base.evidences.map((ev) =>
      ev.sourceType === 'external_source' ? { ...ev, status: 'degraded' as const, summary: '本次未使用外部资料源，输出基于内部知识库和 Reference Pack 生成。' } : ev,
    );
    base.risks = [
      ...base.risks,
      { id: 'r-d1', level: 'degraded' as const, title: '外部源降级', description: '外部资料源当前不可用，本次输出未包含外部权威数据验证。' },
    ];
    base.executionSteps[1].status = 'degraded';
    base.executionSteps[1].summary = '外部资料源不可用，已降级为内部检索。';
    return base;
  }

  if (taskId.includes('failed')) {
    base.status = 'failed';
    base.versions = base.versions.slice(0, 1).map((v) => ({ ...v, status: 'failed' as const, failureReason: '输出生成失败：模型调用返回空响应。' }));
    base.currentVersionId = `${taskId}-v1`;
    base.risks = [
      { id: 'r-f1', level: 'danger' as const, title: '输出生成失败', description: '已完成的分析结果和证据资料不会丢失。你可以重试生成或返回工作台修改计划。' },
    ];
    return base;
  }

  if (taskId.includes('regenerating')) {
    base.status = 'generating';
    return base;
  }

  if (taskId.includes('multi')) {
    return base;
  }

  return base;
}

export function resolveOutputStatus(taskId: string): OutputVersionStatus {
  if (taskId.includes('generating') || taskId.includes('regenerating')) return 'generating';
  if (taskId.includes('insufficient')) return 'evidence_insufficient';
  if (taskId.includes('degraded')) return 'degraded';
  if (taskId.includes('failed')) return 'failed';
  return 'success';
}
