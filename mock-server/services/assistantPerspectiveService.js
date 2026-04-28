const TECHNICAL_RISK_KEYWORDS = [
  '工艺',
  '材料体系',
  '清洗',
  '蚀刻',
  '刻蚀',
  '样品',
  '测试指标',
  '验证条件',
  '性能',
  '产品',
  '参数',
  '线宽',
  '残留',
];

const ASSISTANT_PERSPECTIVES = {
  operations: {
    key: 'operations',
    assistantIds: ['operations-workbench-template'],
    industryTypes: ['operations'],
    templateRoles: ['operations'],
    keywords: ['运营', '活动', 'SOP', 'sop', '复盘', '执行', '协同', '排期', '转化', '指标', '值班', '异常', '审批', '资源'],
    summary: '当前事项更接近运营执行、SOP 梳理或问题复盘场景，重点应放在目标口径、责任分工、时间节点和复盘依据的对齐。',
    sceneJudgement: '该需求可初步判断为运营协同推进场景，当前需要先明确执行边界和复盘口径。',
    recommendedProducts: ['执行清单', 'SOP 对齐表', '复盘提纲'],
    followupQuestions: [
      '本次运营事项的目标指标和验收口径是什么？',
      '负责人、协同方、关键节点和审批链路是否已经明确？',
      '是否已有执行数据、异常记录或历史复盘可作为依据？',
    ],
    riskNotes: [
      '目标、负责人、时间节点或验收口径未对齐，可能导致执行偏差、重复沟通或复盘结论失真。',
      '在数据口径、资源投入和审批边界未确认前，不建议承诺上线时间、转化结果或最终复盘结论。',
    ],
    nextActions: ['先确认目标与验收口径', '对齐责任人和关键时间点', '整理执行清单与异常升级机制'],
    cautionNotes: [
      '未确认目标、负责人、截止时间和验收口径前，不直接承诺完成时间或结果。',
      '复盘结论需基于实际数据和责任边界，避免先定性后补证据。',
    ],
    suppressTechnicalNotes: true,
  },
  legal: {
    key: 'legal',
    assistantIds: ['legal-workbench-template'],
    industryTypes: ['legal'],
    templateRoles: ['legal'],
    keywords: ['法务', '合同', '合规', '条款', '违约', '签署', '争议', '赔偿', '保密', '律师函'],
    summary: '当前事项更接近合同评审、合规判断或法务函件场景，重点应放在文本依据、责任边界、授权范围和证据链完整性。',
    sceneJudgement: '该需求可初步判断为法务风险评审场景，当前需要先确认文本版本、事实依据和审批授权。',
    recommendedProducts: ['条款风险清单', '修改建议', '法务沟通稿'],
    followupQuestions: [
      '当前使用的是哪一版合同或函件文本？',
      '交易主体、金额、期限、关键义务和违约责任是否已确认？',
      '是否已有审批记录、沟通证据或争议背景？',
    ],
    riskNotes: [
      '合同版本、主体资质、责任边界、付款条件或违约责任未核定时，容易形成签署、履约或争议处理风险。',
      '未完成文本和证据复核前，不建议输出最终法律结论或签署建议。',
    ],
    nextActions: ['锁定文本版本', '标出高风险条款', '形成修改建议与审批意见'],
    cautionNotes: [
      '未完成文本和证据复核前，不输出最终法律结论或签署建议。',
      '对外表达应区分事实、风险判断和谈判立场，避免把内部评估说成确定承诺。',
    ],
    suppressTechnicalNotes: true,
  },
  finance: {
    key: 'finance',
    assistantIds: ['finance-workbench-template'],
    industryTypes: ['finance'],
    templateRoles: ['finance'],
    keywords: ['财务', '预算', '回款', '付款', '费用', '现金流', '开票', '成本', '结算', '审批'],
    summary: '当前事项更接近预算、付款、回款或经营说明场景，重点应放在金额口径、凭证依据、现金流影响和审批链路。',
    sceneJudgement: '该需求可初步判断为财务复核与经营判断场景，当前需要先统一数据口径和审批边界。',
    recommendedProducts: ['金额口径表', '审批依据', '经营说明稿'],
    followupQuestions: [
      '金额、税率、发票和合同/订单口径是否一致？',
      '预算科目、付款条件和审批人是否明确？',
      '异常差异、现金流影响或回款风险是否已有解释？',
    ],
    riskNotes: [
      '金额口径、预算归属、发票税务、现金流影响或审批链路未确认时，容易造成误判、超支或付款合规风险。',
      '未核对凭证、合同和审批链路前，不建议承诺付款、费用归属或经营预测结论。',
    ],
    nextActions: ['核对金额与凭证', '确认预算和审批链路', '形成财务复核意见'],
    cautionNotes: [
      '未核对凭证、合同和审批链路前，不直接承诺付款或费用归属。',
      '涉及经营预测时需标明口径、假设和数据来源。',
    ],
    suppressTechnicalNotes: true,
  },
  hr: {
    key: 'hr',
    assistantIds: ['hr-workbench-template'],
    industryTypes: ['hr'],
    templateRoles: ['hr'],
    keywords: ['人事', 'HR', '招聘', '面试', '绩效', '员工关系', '调薪', '录用', '离职', '制度'],
    summary: '当前事项更接近招聘评估、绩效沟通、员工关系或制度通知场景，重点应放在制度依据、公平性、沟通对象和留痕。',
    sceneJudgement: '该需求可初步判断为人事流程与员工沟通场景，当前需要先确认制度口径、评价依据和沟通边界。',
    recommendedProducts: ['流程清单', '沟通提纲', '留痕模板'],
    followupQuestions: [
      '当前适用的制度条款和审批链路是什么？',
      '评价依据、事实记录和沟通对象是否明确？',
      '是否涉及敏感个人信息、薪酬或员工关系风险？',
    ],
    riskNotes: [
      '制度依据、评价标准、沟通对象或证据记录未明确时，容易引发公平性、员工关系或流程合规风险。',
      '未完成审批前，不建议提前释放录用、调薪、处罚或绩效结论。',
    ],
    nextActions: ['确认制度依据', '补齐事实记录', '统一沟通口径和留痕方式'],
    cautionNotes: [
      '涉及个人评价和员工关系时，应保留证据依据和沟通记录。',
      '未完成审批前，不提前释放录用、调薪、处罚或绩效结论。',
    ],
    suppressTechnicalNotes: true,
  },
  product: {
    key: 'product',
    assistantIds: ['product-workbench-template'],
    industryTypes: ['product'],
    templateRoles: ['product'],
    keywords: ['产品', '需求', 'PRD', '路线图', '发布', '上线', '优先级', '用户价值', '范围', '研发'],
    summary: '当前事项更接近需求判断、PRD 梳理或发布说明场景，重点应放在用户价值、范围边界、优先级、依赖和验收标准。',
    sceneJudgement: '该需求可初步判断为产品需求评审与方案输出场景，当前需要先确认需求边界和上线风险。',
    recommendedProducts: ['需求说明', '范围清单', '发布风险清单'],
    followupQuestions: [
      '目标用户、核心场景和用户价值是否清楚？',
      '本次需求的非目标范围和优先级是否明确？',
      '研发依赖、验收指标和上线风险是否已评估？',
    ],
    riskNotes: [
      '用户价值、范围边界、优先级、依赖资源或验收指标未对齐时，容易产生范围蔓延、延期或上线质量风险。',
      '未完成需求评审前，不建议承诺完整范围、研发排期或上线效果。',
    ],
    nextActions: ['明确需求边界', '确认优先级和依赖', '补齐验收指标与发布风险'],
    cautionNotes: [
      '未完成需求评审前，不承诺完整范围和上线时间。',
      '需要明确非目标范围、依赖关系和验收口径，避免后续范围蔓延。',
    ],
    suppressTechnicalNotes: true,
  },
  'sales-support': {
    key: 'sales-support',
    assistantIds: ['semiconductor-sales-support', 'pcb-sales-support'],
    industryTypes: ['semiconductor', 'pcb'],
    templateRoles: ['sales-support'],
    keywords: ['销售', '客户', 'FAE', '工艺', '样品', '测试', '验证', '清洗', '蚀刻', '方案'],
    cautionNotes: [
      '在未明确应用条件和评价标准前，不建议承诺最终效果。',
      '涉及成本、性能或导入结论时，应先确认验证边界。',
    ],
    suppressTechnicalNotes: false,
  },
  generic: {
    key: 'generic',
    assistantIds: [],
    industryTypes: ['other', 'general'],
    templateRoles: ['generic'],
    keywords: [],
    summary: '当前事项仍需进一步确认目标、对象、依据和边界条件。',
    sceneJudgement: '当前场景仍需进一步确认，建议先补齐关键事实后再继续推进。',
    recommendedProducts: ['基础资料包', '需求澄清问题清单'],
    followupQuestions: ['本次目标是什么？', '主要对象和约束是什么？', '下一步由谁负责推进？'],
    riskNotes: ['当前信息不足，不建议直接承诺未经确认的结果、时间或资源。'],
    nextActions: ['补齐基础信息', '明确责任人', '确认下一步动作'],
    cautionNotes: ['当前阶段不建议直接承诺未经验证或未经确认的结果。'],
    suppressTechnicalNotes: false,
  },
};

const normalizeToken = (value = '') => String(value || '').trim().toLowerCase();

const includesAnyKeyword = (text = '', keywords = []) =>
  keywords.some((keyword) => String(text || '').includes(keyword));

export const resolveAssistantPerspective = ({
  assistantId = '',
  assistantProfile = null,
  industryType = '',
  templateRole = '',
  text = '',
} = {}) => {
  const profile = assistantProfile || {};
  const normalizedAssistantId = normalizeToken(assistantId || profile.assistantId || profile.id);
  const normalizedIndustryType = normalizeToken(industryType || profile.industryType);
  const normalizedTemplateRole = normalizeToken(templateRole || profile.templateRole);
  const configs = Object.values(ASSISTANT_PERSPECTIVES).filter((item) => item.key !== 'generic');

  return (
    configs.find((config) =>
      config.assistantIds.some((item) => normalizeToken(item) === normalizedAssistantId),
    ) ||
    configs.find((config) =>
      config.industryTypes.some((item) => normalizeToken(item) === normalizedIndustryType),
    ) ||
    configs.find((config) =>
      config.templateRoles.some((item) => normalizeToken(item) === normalizedTemplateRole),
    ) ||
    configs.find((config) => includesAnyKeyword(text, config.keywords)) ||
    ASSISTANT_PERSPECTIVES.generic
  );
};

export const buildPerspectiveAnalyzeResult = ({
  perspective = ASSISTANT_PERSPECTIVES.generic,
  baseResult = {},
  taskPhase = '',
} = {}) => {
  if (perspective.key === 'sales-support') {
    return baseResult;
  }

  const nextActions =
    perspective.key === 'operations' && taskPhase === '复盘中'
      ? ['先统一数据口径', '补齐异常记录和责任边界', '形成复盘结论与改进清单']
      : perspective.nextActions;

  return {
    ...baseResult,
    summary:
      baseResult.summary && baseResult.summary !== '暂未命中明确规则，建议继续确认客户核心关注点。'
        ? baseResult.summary
        : perspective.summary,
    sceneJudgement:
      baseResult.sceneJudgement && baseResult.sceneJudgement !== '当前场景仍需进一步确认。'
        ? baseResult.sceneJudgement
        : perspective.sceneJudgement,
    recommendedProducts:
      Array.isArray(baseResult.recommendedProducts) && baseResult.recommendedProducts.length > 0
        ? baseResult.recommendedProducts
        : perspective.recommendedProducts,
    followupQuestions:
      Array.isArray(baseResult.followupQuestions) && baseResult.followupQuestions.length > 0
        ? baseResult.followupQuestions
        : perspective.followupQuestions,
    riskNotes: perspective.riskNotes,
    nextActions,
  };
};

export const buildPerspectiveCautionNotes = ({
  perspective = ASSISTANT_PERSPECTIVES.generic,
  cautionNotes = [],
} = {}) => {
  const filteredNotes = (Array.isArray(cautionNotes) ? cautionNotes : []).filter((item) => {
    if (!perspective.suppressTechnicalNotes) {
      return true;
    }

    return !includesAnyKeyword(item, TECHNICAL_RISK_KEYWORDS);
  });

  return Array.from(new Set([...filteredNotes, ...(perspective.cautionNotes || [])]));
};

export const isDomainPerspective = (perspective = null) =>
  Boolean(perspective && !['generic', 'sales-support'].includes(perspective.key));
