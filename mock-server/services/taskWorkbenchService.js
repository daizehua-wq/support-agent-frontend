import { resolveAssistantProfile } from './assistantContextService.js';
import { getDefaultAssistantProfile, getPromptForModule } from './promptService.js';
import { getResolvedExecutionContextForModule, readSettings } from './settingsService.js';

const normalizeString = (value = '') => String(value || '').trim();

const uniqueStrings = (values = []) => [...new Set(values.map((item) => normalizeString(item)).filter(Boolean))];

const truncateText = (value = '', maxLength = 180) => {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue || normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength)}...`;
};

const splitTextSegments = (value = '') =>
  normalizeString(value)
    .split(/[\n，,。！？!?；;]+/)
    .map((item) => normalizeString(item))
    .filter(Boolean);

const containsAnyKeyword = (value = '', keywords = []) => {
  const normalizedValue = normalizeString(value);
  return keywords.some((keyword) => normalizedValue.includes(keyword));
};

const OUTCOME_TO_INTENT = Object.freeze({
  auto: 'auto',
  decision_support: 'decision_support',
  material_preparation: 'material_preparation',
  reference_document: 'reference_document',
});

const MODULE_LABELS = Object.freeze({
  analyze: '判断分析',
  search: '资料整理',
  script: '参考写作',
});

const INTENT_LABELS = Object.freeze({
  decision_support: '判断支持',
  material_preparation: '资料准备',
  reference_document: '参考文稿',
  general_assistant: '通用协作',
});

const ROLE_HINT_DEFINITIONS = Object.freeze([
  { key: 'legal', label: '法务', keywords: ['合同', '法务', '合规', '条款', '诉讼', '函件'] },
  { key: 'finance', label: '财务', keywords: ['预算', '报销', '发票', '成本', '利润', '财务'] },
  { key: 'hr', label: '人事', keywords: ['招聘', '绩效', '面试', '候选人', '员工', '人事'] },
  { key: 'operations', label: '运营', keywords: ['运营', '活动', '转化', '用户增长', '复盘', '排期'] },
  { key: 'product', label: '产品', keywords: ['需求文档', 'PRD', '原型', '版本', '功能', '产品'] },
  { key: 'sales', label: '销售', keywords: ['客户', '报价', '商机', '销售', '跟进', '样品'] },
  { key: 'general', label: '通用', keywords: [] },
]);

const INTENT_KEYWORDS = Object.freeze({
  decision_support: ['判断', '评估', '建议', '是否', '怎么做', '优先级', '风险', '决策', '可行', '能不能'],
  material_preparation: ['资料', '整理', '收集', '研究', '调研', '清单', '背景', '依据', '检索', '归档'],
  reference_document: ['写', '起草', '邮件', '纪要', '方案', '报告', '总结', '通知', '制度', '文案', '模板', '正文'],
});

const countKeywordHits = (value = '', keywords = []) =>
  keywords.reduce((count, keyword) => count + (normalizeString(value).includes(keyword) ? 1 : 0), 0);

const inferIntent = ({ taskInput = '', contextNote = '', expectedOutcome = 'auto', expectedDeliverable = '' }) => {
  const normalizedOutcome = normalizeString(expectedOutcome);

  if (normalizedOutcome && normalizedOutcome !== 'auto' && OUTCOME_TO_INTENT[normalizedOutcome]) {
    return {
      intent: OUTCOME_TO_INTENT[normalizedOutcome],
      confidence: 0.96,
      reason: 'user-selected-outcome',
    };
  }

  const mergedText = `${taskInput} ${contextNote} ${expectedDeliverable}`;
  const decisionScore = countKeywordHits(mergedText, INTENT_KEYWORDS.decision_support);
  const materialScore = countKeywordHits(mergedText, INTENT_KEYWORDS.material_preparation);
  const documentScore = countKeywordHits(mergedText, INTENT_KEYWORDS.reference_document);

  if (documentScore >= 2 || (documentScore >= 1 && materialScore === 0 && decisionScore === 0)) {
    return {
      intent: 'reference_document',
      confidence: 0.9,
      reason: 'document-keywords',
    };
  }

  if (decisionScore > 0 && decisionScore >= materialScore) {
    return {
      intent: 'decision_support',
      confidence: 0.9,
      reason: 'decision-keywords',
    };
  }

  if (materialScore > 0) {
    return {
      intent: 'material_preparation',
      confidence: 0.87,
      reason: 'material-keywords',
    };
  }

  return {
    intent: 'general_assistant',
    confidence: 0.72,
    reason: 'default-general-assistant',
  };
};

const mapIntentToModule = (intent = 'general_assistant') => {
  if (intent === 'material_preparation') return 'search';
  if (intent === 'reference_document') return 'script';
  return 'analyze';
};

const inferRoleHints = (mergedText = '', assistantIndustryType = '') => {
  const matchedHints = ROLE_HINT_DEFINITIONS.filter(
    (item) => item.key !== 'general' && containsAnyKeyword(mergedText, item.keywords),
  );

  if (matchedHints.length > 0) {
    return matchedHints;
  }

  const normalizedIndustryType = normalizeString(assistantIndustryType).toLowerCase();
  const fallbackHint =
    ROLE_HINT_DEFINITIONS.find((item) => item.key === normalizedIndustryType) ||
    ROLE_HINT_DEFINITIONS.find((item) => item.key === 'general');

  return fallbackHint ? [fallbackHint] : [];
};

const buildKeyFacts = ({ taskInput = '', contextNote = '', expectedDeliverable = '' }) => {
  const segments = splitTextSegments(`${taskInput}\n${contextNote}\n${expectedDeliverable}`);
  return uniqueStrings(segments).slice(0, 6);
};

const buildMissingInformation = ({
  intent = 'general_assistant',
  taskInput = '',
  contextNote = '',
  expectedDeliverable = '',
}) => {
  const missingInformation = [];
  const mergedText = `${taskInput} ${contextNote} ${expectedDeliverable}`;

  if (!containsAnyKeyword(mergedText, ['时间', '截止', '今天', '本周', '本月', 'ddl', 'deadline'])) {
    missingInformation.push('缺少时间要求或交付时限。');
  }

  if (!containsAnyKeyword(mergedText, ['谁', '对象', '面向', '给谁', '收件人', '部门', '客户'])) {
    missingInformation.push('缺少目标对象或使用人群。');
  }

  if (intent === 'decision_support') {
    missingInformation.push('请补充判断标准、约束条件或不可接受结果。');
  }

  if (intent === 'material_preparation') {
    missingInformation.push('请补充资料范围、来源边界或必须覆盖的主题。');
  }

  if (intent === 'reference_document') {
    missingInformation.push('请补充文档体裁、语气要求和必须引用的事实。');
  }

  return uniqueStrings(missingInformation).slice(0, 4);
};

const buildRecommendedCapabilities = (intent = 'general_assistant') => {
  if (intent === 'material_preparation') {
    return ['知识检索', '资料汇总', '结构化整理'];
  }

  if (intent === 'reference_document') {
    return ['信息提炼', '提纲规划', '参考文稿生成'];
  }

  if (intent === 'decision_support') {
    return ['信息理解', '风险判断', '下一步建议'];
  }

  return ['信息理解', '任务拆解', '协作建议'];
};

const buildPromptBindingSummary = ({ assistantId = '', moduleName = 'analyze' }) => {
  const prompt = getPromptForModule(assistantId, moduleName);

  return {
    moduleName,
    moduleLabel: MODULE_LABELS[moduleName] || moduleName,
    promptId: prompt?.id || '',
    promptName: prompt?.name || '',
    promptVersion: prompt?.version || '',
    promptPreview: truncateText(prompt?.content || '', 160),
  };
};

const buildRouteRecommendation = ({
  intent = 'general_assistant',
  taskInput = '',
  contextNote = '',
  expectedDeliverable = '',
}) => {
  const moduleName = mapIntentToModule(intent);

  if (moduleName === 'search') {
    return {
      moduleName,
      moduleLabel: MODULE_LABELS[moduleName],
      path: '/retrieve',
      label: '进入资料整理链',
      carryPayload: {
        taskInput,
        context: contextNote,
        goal: intent,
        deliverable: expectedDeliverable,
        keyword: taskInput || expectedDeliverable,
        remark: contextNote,
      },
    };
  }

  if (moduleName === 'script') {
    return {
      moduleName,
      moduleLabel: MODULE_LABELS[moduleName],
      path: '/compose',
      label: '进入参考写作链',
      carryPayload: {
        taskInput,
        context: contextNote || expectedDeliverable,
        goal: expectedDeliverable || intent,
        deliverable: expectedDeliverable,
        referenceSummary: contextNote || expectedDeliverable,
      },
    };
  }

  return {
    moduleName,
    moduleLabel: MODULE_LABELS[moduleName],
    path: '/judge',
    label: '进入判断分析链',
    carryPayload: {
      taskInput,
      context: contextNote || expectedDeliverable,
      goal: expectedDeliverable || intent,
      deliverable: expectedDeliverable,
    },
  };
};

const buildMaterialPackage = ({
  intent = 'general_assistant',
  taskInput = '',
  contextNote = '',
  expectedDeliverable = '',
  keyFacts = [],
  missingInformation = [],
  roleHints = [],
  promptBinding = null,
}) => {
  const roleLabel = roleHints.map((item) => item.label).join(' / ') || '通用岗位';
  const promptLine = promptBinding?.promptName
    ? `当前将优先使用「${promptBinding.promptName}」(${promptBinding.moduleLabel}) 对任务进行约束。`
    : `当前将优先使用 ${promptBinding?.moduleLabel || '默认能力'} 处理任务。`;

  const basePackage = [
    {
      id: 'task-summary',
      type: 'summary',
      title: '任务摘要',
      contentLines: [
        `任务原文：${taskInput || '未提供'}`,
        contextNote ? `补充上下文：${contextNote}` : '补充上下文：未提供',
        expectedDeliverable ? `目标产物：${expectedDeliverable}` : '目标产物：未明确',
        `岗位提示：${roleLabel}`,
        promptLine,
      ],
    },
    {
      id: 'facts',
      type: 'facts',
      title: '已识别关键信息',
      contentLines: keyFacts.length ? keyFacts : ['当前输入仍偏短，建议补充更多事实信息。'],
    },
  ];

  if (intent === 'reference_document') {
    return [
      ...basePackage,
      {
        id: 'draft-outline',
        type: 'outline',
        title: '建议文稿大纲',
        contentLines: [
          '1. 目的与背景',
          '2. 关键事实与判断依据',
          '3. 建议方案或执行动作',
          '4. 风险提示与边界说明',
          '5. 后续协作安排',
        ],
      },
      {
        id: 'draft-checklist',
        type: 'checklist',
        title: '成文前核对项',
        contentLines: missingInformation.length
          ? missingInformation
          : ['建议补充时间要求、目标对象和必须引用的事实。'],
      },
    ];
  }

  if (intent === 'material_preparation') {
    return [
      ...basePackage,
      {
        id: 'material-bucket',
        type: 'materials',
        title: '建议资料包结构',
        contentLines: [
          '1. 背景与问题定义',
          '2. 关键术语 / 检索关键词',
          '3. 事实依据与来源清单',
          '4. 风险与限制条件',
          '5. 可直接复用的模板或附件',
        ],
      },
      {
        id: 'material-gap',
        type: 'gaps',
        title: '待补充信息',
        contentLines: missingInformation.length
          ? missingInformation
          : ['建议补充资料范围、来源限制和必须覆盖的章节。'],
      },
    ];
  }

  return [
    ...basePackage,
    {
      id: 'decision-frame',
      type: 'decision',
      title: '建议判断框架',
      contentLines: [
        '1. 明确目标与成功标准',
        '2. 识别当前约束与风险',
        '3. 罗列可选路径与取舍',
        '4. 给出推荐动作与原因',
      ],
    },
    {
      id: 'decision-gap',
      type: 'gaps',
      title: '判断前仍需确认',
      contentLines: missingInformation.length
        ? missingInformation
        : ['建议补充时间要求、对象范围和判断标准。'],
    },
  ];
};

const buildNextActions = ({ intent = 'general_assistant', routeRecommendation = null }) => {
  const sharedActions = [
    '先确认缺失信息，避免助手在事实不足时给出过度推断。',
    '把关键事实沉成结构化字段，后续才能稳定复用 Prompt 和工作流。',
  ];

  if (intent === 'reference_document') {
    return [
      ...sharedActions,
      '确认文档体裁、收件对象和语气后，再进入参考写作链生成初稿。',
      routeRecommendation
        ? `如需继续执行，可直接点击「${routeRecommendation.label}」。`
        : '如需继续执行，可直接进入参考写作链。',
    ];
  }

  if (intent === 'material_preparation') {
    return [
      ...sharedActions,
      '先把资料范围和来源边界确定清楚，再调用知识检索与资料整理能力。',
      routeRecommendation
        ? `如需继续执行，可直接点击「${routeRecommendation.label}」。`
        : '如需继续执行，可直接进入资料整理链。',
    ];
  }

  return [
    ...sharedActions,
    '先确认判断标准和不可接受结果，再进入判断分析链。',
    routeRecommendation
      ? `如需继续执行，可直接点击「${routeRecommendation.label}」。`
      : '如需继续执行，可直接进入判断分析链。',
  ];
};

export const buildTaskWorkbenchResult = (rawInput = {}, options = {}) => {
  const settings = options.settings || readSettings();
  const taskInput =
    normalizeString(rawInput.taskInput) ||
    normalizeString(rawInput.customerText) ||
    normalizeString(rawInput.keyword);
  const contextNote =
    normalizeString(rawInput.contextNote) || normalizeString(rawInput.referenceSummary);
  const expectedOutcome = normalizeString(rawInput.expectedOutcome || 'auto') || 'auto';
  const expectedDeliverable = normalizeString(rawInput.expectedDeliverable);
  const providedAssistantId = normalizeString(rawInput.assistantId);

  const assistantProfile =
    resolveAssistantProfile(providedAssistantId) ||
    resolveAssistantProfile(settings?.assistant?.activeAssistantId || '') ||
    getDefaultAssistantProfile();

  const intentResult = inferIntent({
    taskInput,
    contextNote,
    expectedOutcome,
    expectedDeliverable,
  });
  const suggestedModule = mapIntentToModule(intentResult.intent);
  const promptBinding = buildPromptBindingSummary({
    assistantId: assistantProfile?.id || '',
    moduleName: suggestedModule,
  });
  const executionContext = getResolvedExecutionContextForModule(
    suggestedModule,
    {
      ...(settings?.assistant?.executionContext || {}),
      assistantId: assistantProfile?.id || '',
      resolvedAssistant: {
        assistantId: assistantProfile?.id || '',
      },
      resolvedPrompt: {
        promptId: promptBinding.promptId,
        promptVersion: promptBinding.promptVersion,
      },
    },
    {
      modulePrompt: {
        promptId: promptBinding.promptId,
        promptVersion: promptBinding.promptVersion,
      },
    },
  );
  const roleHints = inferRoleHints(
    `${taskInput} ${contextNote} ${expectedDeliverable}`,
    assistantProfile?.industryType || '',
  );
  const keyFacts = buildKeyFacts({
    taskInput,
    contextNote,
    expectedDeliverable,
  });
  const missingInformation = buildMissingInformation({
    intent: intentResult.intent,
    taskInput,
    contextNote,
    expectedDeliverable,
  });
  const routeRecommendation = buildRouteRecommendation({
    intent: intentResult.intent,
    taskInput,
    contextNote,
    expectedDeliverable,
  });
  const materialPackage = buildMaterialPackage({
    intent: intentResult.intent,
    taskInput,
    contextNote,
    expectedDeliverable,
    keyFacts,
    missingInformation,
    roleHints,
    promptBinding,
  });

  return {
    assistant: {
      assistantId: assistantProfile?.id || '',
      assistantName: assistantProfile?.assistantName || assistantProfile?.name || '',
      industryType: assistantProfile?.industryType || 'other',
      description: assistantProfile?.description || '',
    },
    recognizedTask: {
      intent: intentResult.intent,
      intentLabel: INTENT_LABELS[intentResult.intent] || intentResult.intent,
      confidence: intentResult.confidence,
      reason: intentResult.reason,
      roleHints: roleHints.map((item) => ({
        key: item.key,
        label: item.label,
      })),
      suggestedModule,
      suggestedModuleLabel: MODULE_LABELS[suggestedModule] || suggestedModule,
      expectedOutcome,
      expectedDeliverable,
      keyFacts,
      missingInformation,
      recommendedCapabilities: buildRecommendedCapabilities(intentResult.intent),
      summary:
        truncateText(taskInput || contextNote, 120) ||
        '已识别为一条待进一步结构化的岗位任务。',
    },
    promptBinding,
    executionContextSummary: executionContext?.summary || null,
    routeRecommendation,
    materialPackage,
    nextActions: buildNextActions({
      intent: intentResult.intent,
      routeRecommendation,
    }),
  };
};
