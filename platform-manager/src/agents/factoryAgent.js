import axios from 'axios';
import { createHash } from 'crypto';
import internalClient from '../lib/internalClient.js';

export const FACTORY_SYSTEM_PROMPT = `
你是一个 Agent 平台管理专家。你的任务是帮助用户创建和配置新的 AI 助手。

你需要通过多轮对话收集以下信息：
1. 助手的名称和用途
2. 需要对接的外部数据源（如企查查、天眼查等）
3. 关注的业务领域和风险点
4. 需要生成什么类型的报告

当信息不全时，主动提问澄清。每次只问 1-2 个问题。

当信息充分时，生成一份确认清单，包含：
- 应用名称和描述
- 将要创建的知识规则（列出 3-5 条示例规则）
- 将要使用的报告模板摘要

用户确认后，你会收到一个执行指令，届时请按以下 JSON 格式输出最终配置方案：
{
  "confirmed": true,
  "app": { "name": "...", "description": "..." },
  "rules": [
    { "domain_type": "...", "topic": "...", "workflow_stage": "...", "keywords": [...], "scenario": "...", "suggestions": "...", "risk_notes": "..." }
  ],
  "template": { "scene": "credit_report", "output_target": "信用分析报告", "template_content": "报告模板文本，包含占位符 {company_name} {risk_level} 等" }
}

请保持友好、专业的语气。用中文回复。
`.trim();

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const unwrapInternalData = (payload = {}) => {
  if (payload?.data && isPlainObject(payload.data) && 'data' in payload.data) {
    return payload.data.data;
  }

  if (payload?.data !== undefined) {
    return payload.data;
  }

  return payload;
};

const normalizeHistory = (history = []) => {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      role: ['assistant', 'user'].includes(item?.role) ? item.role : 'user',
      content: normalizeText(item?.content),
    }))
    .filter((item) => item.content);
};

const hasUsableOpenAiKey = () => {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  return apiKey && apiKey !== 'sk-your-key-here';
};

const callOpenAI = async (messages = []) => {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    },
  );

  return normalizeText(response.data?.choices?.[0]?.message?.content);
};

const extractJsonBlock = (text = '') => {
  const normalizedText = normalizeText(text);
  if (!normalizedText.includes('"confirmed"') && !normalizedText.includes('confirmed')) {
    return null;
  }

  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || normalizedText;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end < start) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed?.confirmed === true ? parsed : null;
  } catch {
    return null;
  }
};

const isConfirmationMessage = (value = '') => {
  const text = normalizeText(value);
  return /^(确认|确认执行|确认创建|开始创建|开始执行|执行创建|确认落库|同意执行|可以执行|请执行)$/.test(
    text,
  );
};

const readConversationText = (history = [], userMessage = '') => {
  return [...normalizeHistory(history).map((item) => item.content), userMessage].join('\n');
};

const buildStableKey = (value = '') => {
  return createHash('sha256').update(normalizeText(value)).digest('hex').slice(0, 24);
};

const matchFirst = (text = '', patterns = []) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1].replace(/[，。；,;.!！?？]$/, ''));
    }
  }

  return '';
};

const inferAppName = (text = '') => {
  const explicitName = matchFirst(text, [
    /(?:叫|名称(?:是|为)?|命名为)\s*([^，。；,;\n]{2,40}?助手)/,
    /(?:我需要|我要|创建|生成|搭建|配置|装配)(?:一个|一套)?\s*([^，。；,;\n]{2,40}?助手)/,
    /([^，。；,;\n]{2,40}?助手)/,
  ]);

  return explicitName || '业务智能助手';
};

const inferDomainType = (text = '') => {
  const pairs = [
    [/营销|销售|客户|商机|线索/, 'marketing'],
    [/风控|信用|授信|失信|被执行|风险/, 'risk_control'],
    [/法务|合同|诉讼|合规/, 'legal_compliance'],
    [/客服|售后|工单|服务/, 'customer_service'],
    [/财务|回款|发票|账期|逾期/, 'finance'],
    [/采购|供应商|招投标/, 'procurement'],
  ];

  const matched = pairs
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);

  return matched.length ? [...new Set(matched)].join('_') : 'general_business';
};

const inferReportType = (text = '') => {
  const explicitReport = matchFirst(text, [
    /(?:输出|生成|产出)(?:一份|一个)?([^，。；,;\n]{2,30}?报告)/,
    /([^，。；,;\n]{2,30}?报告)/,
  ]);

  if (explicitReport) {
    return explicitReport;
  }

  if (/摘要|总结|纪要/.test(text)) {
    return '业务分析摘要';
  }

  if (/话术|回复|脚本/.test(text)) {
    return '沟通话术';
  }

  return '';
};

const inferDataSources = (text = '') => {
  const definitions = [
    [/企查查|工商|企业信息/, '企查查'],
    [/天眼查/, '天眼查'],
    [/内部数据|交易记录|订单|CRM|客户库/i, '内部业务数据'],
    [/知识库|制度|SOP|规范/, '知识库'],
  ];

  return definitions
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
};

const inferRiskOrFocusItems = (text = '') => {
  const definitions = [
    ['失信', '失信记录'],
    ['被执行', '被执行人信息'],
    ['诉讼', '诉讼风险'],
    ['经营异常', '经营异常'],
    ['注册资本', '注册资本异常'],
    ['实缴资本', '实缴资本异常'],
    ['回款', '回款异常'],
    ['逾期', '逾期风险'],
    ['合同', '合同风险'],
    ['合规', '合规风险'],
    ['客诉', '客户投诉'],
  ];

  const matched = definitions
    .filter(([keyword]) => text.includes(keyword))
    .map(([, label]) => label);

  return matched.length > 0
    ? [...new Set(matched)]
    : ['关键事实完整性', '异常信号识别', '人工复核要求'];
};

const inferFactoryState = (conversationText = '') => {
  const text = normalizeText(conversationText);
  const dataSources = inferDataSources(text);
  const risks = inferRiskOrFocusItems(text);
  const reportType = inferReportType(text);
  const appName = inferAppName(text);
  const domainType = inferDomainType(text);

  return {
    appName,
    domainType,
    dataSources,
    risks,
    reportType,
  };
};

const buildConfirmationList = (state) => {
  return [
    `我已经把需求初步整理成「${state.appName}」配置方案。`,
    '',
    '确认清单：',
    `- 应用名称：${state.appName}`,
    `- 应用描述：面向销售、法务、财务协同的客户信用风险分析助手。`,
    `- 外部数据源：${state.dataSources.length ? state.dataSources.join('、') : '待确认'}`,
    `- 关注风险：${state.risks.join('、')}`,
    `- 报告类型：${state.reportType || '待确认'}`,
    '',
    '将要创建的示例知识规则：',
    '- 企业状态异常时提示暂停自动推进并进入人工复核。',
    '- 命中被执行人信息时标记为中高风险并要求法务确认。',
    '- 命中失信记录时标记为高风险，不允许自动授信或自动拒绝。',
    '- 注册资本和实缴资本差异明显时提示补充背景核验。',
    '- 内部交易逾期时进入证据列表并提示财务复核。',
    '',
    '报告模板摘要：',
    '将生成信用分析报告，包含企业基础信息、风险信号、证据来源、风险等级、建议动作和人审提示。',
    '',
    '如果确认，我会创建应用、知识规则和报告模板。请点击「确认执行」。',
  ].join('\n');
};

const buildConfirmationListFromPlan = (plan = {}) => {
  const rules = Array.isArray(plan.rules) ? plan.rules : [];
  const resources = Array.isArray(plan.resources) ? plan.resources : [];
  const channels = Array.isArray(plan.channels) ? plan.channels : [];
  const ruleLines = rules.slice(0, 5).map((rule, index) => {
    const topic = normalizeText(rule.topic || rule.scenario || rule.domain_type) || `规则 ${index + 1}`;
    const keywords = Array.isArray(rule.keywords) ? rule.keywords.filter(Boolean).join('、') : '';
    return `- ${topic}${keywords ? `：${keywords}` : ''}`;
  });

  return [
    `我已经把需求初步整理成「${normalizeText(plan.app?.name) || '未命名助手应用'}」配置方案。`,
    '',
    '确认清单：',
    `- 应用名称：${normalizeText(plan.app?.name) || '未命名助手应用'}`,
    `- 应用描述：${normalizeText(plan.app?.description) || '待确认'}`,
    `- 将创建知识规则：${rules.length} 条`,
    `- 将创建知识资源：${resources.length} 条`,
    `- 将创建渠道配置：${channels.length} 条`,
    `- 报告模板：${normalizeText(plan.template?.output_target || plan.template?.scene) || '待确认'}`,
    '',
    '将要创建的示例知识规则：',
    ...(ruleLines.length ? ruleLines : ['- 暂无规则明细，请确认后使用本地默认规则生成。']),
    '',
    '如果确认，我会创建应用，并把规则、模板、资源和渠道配置全部绑定到新应用。请点击「确认执行」。',
  ].join('\n');
};

const buildFinalConfig = (history = [], userMessage = '') => {
  const conversationText = readConversationText(history, userMessage);
  const state = inferFactoryState(conversationText);
  const reportType = state.reportType || '结构化业务分析报告';
  const defaultRules = state.risks.slice(0, 5).map((risk, index) => ({
    domain_type: state.domainType,
    topic: risk.toLowerCase().replace(/\s+/g, '_') || `focus_${index + 1}`,
    workflow_stage: /报告|分析/.test(reportType) ? 'analyze' : 'runtime',
    keywords: [risk],
    scenario: `${risk}识别`,
    suggestions: `命中「${risk}」相关信号时，输出证据、影响范围和建议动作，并保留人工复核提示。`,
    risk_notes: '只输出辅助判断和证据线索，不自动做高影响最终决策。',
    confidence: 0.86,
  }));

  return {
    confirmed: true,
    app: {
      name: state.appName,
      description: `面向「${state.domainType}」场景的智能助手，围绕${state.risks.join('、')}生成可追踪、可人审的业务输出。`,
      rateLimit: 60,
      maxTokens: 100000,
    },
    dataSources: state.dataSources,
    tools: state.dataSources.map((source) => ({
      source,
      required: true,
    })),
    rules: defaultRules,
    template: {
      scene: reportType.includes('报告') ? 'business_report' : 'business_response',
      output_target: reportType,
      template_content:
        `${reportType}\\n对象名称：{subject_name}\\n摘要：{summary}\\n关键信号：{key_signals}\\n证据来源：{evidence_refs}\\n建议动作：{recommended_actions}\\n人审要求：{human_review_required}\\n说明：本输出仅作为辅助判断和人工复核依据，不自动做高影响最终决策。`,
      variables: {
        placeholders: [
          'subject_name',
          'summary',
          'key_signals',
          'evidence_refs',
          'recommended_actions',
          'human_review_required',
        ],
      },
    },
  };
};

const shouldAskForMoreInfo = (state) => {
  return state.dataSources.length === 0 || !state.reportType || state.risks.length < 2;
};

const runLocalFactory = async (sessionId, userMessage, history = []) => {
  const normalizedMessage = normalizeText(userMessage);
  const state = inferFactoryState(readConversationText(history, userMessage));

  if (isConfirmationMessage(normalizedMessage)) {
    return executeFactoryPlan(buildFinalConfig(history, userMessage), { sessionId });
  }

  if (shouldAskForMoreInfo(state)) {
    const questions = [];
    if (state.dataSources.length === 0) {
      questions.push('需要对接哪些外部数据源？例如企查查、天眼查，还是先只用内部数据？');
    }
    if (!state.reportType) {
      questions.push('最终希望生成哪类报告？例如信用分析报告、客户风险摘要、法务复核报告。');
    }
    if (state.risks.length < 2) {
      questions.push('重点关注哪些风险？例如失信、被执行、诉讼、注册资本、回款逾期。');
    }

    return {
      reply: questions.slice(0, 2).join('\n'),
      needsConfirmation: false,
      session_id: sessionId,
    };
  }

  return {
    reply: buildConfirmationList(state),
    needsConfirmation: true,
    session_id: sessionId,
  };
};

const attachAppId = (payload = {}, appId = '') => ({
  ...(isPlainObject(payload) ? payload : {}),
  app_id: appId,
  appId,
});

const normalizeTemplatePayload = (template = {}, appId = '') => {
  const fallbackTemplate = {
    scene: 'credit_report',
    output_target: '信用分析报告',
    template_content:
      '信用分析报告\\n企业名称：{company_name}\\n风险等级：{risk_level}\\n核心风险信号：{risk_signals}\\n建议动作：{recommended_actions}',
  };

  return attachAppId(
    {
      ...fallbackTemplate,
      ...(isPlainObject(template) ? template : {}),
      created_by: normalizeText(template?.created_by || template?.createdBy) || 'p5',
    },
    appId,
  );
};

const normalizeToolBindings = (plan = {}) => {
  const rawTools = [
    ...(Array.isArray(plan.tools) ? plan.tools : []),
    ...(Array.isArray(plan.dataSources)
      ? plan.dataSources.map((source) => ({ source, required: true }))
      : []),
  ];
  const sourceText = rawTools
    .map((item) => normalizeText(item?.source || item?.name || item?.toolId || item))
    .join(' ');
  const bindings = [];

  if (/企查查|工商|企业信息/i.test(sourceText)) {
    bindings.push({
      toolId: 'query_qichacha_company',
      provider: 'qichacha',
      capability: 'company_search',
      required: true,
      authScope: 'app',
    });
  }

  if (/天眼查/i.test(sourceText)) {
    bindings.push({
      toolId: 'tianyancha.company.search',
      provider: 'tianyancha',
      capability: 'company_search',
      required: true,
      authScope: 'app',
      status: 'pending_external_connection',
    });
  }

  if (/内部业务数据|CRM|订单|交易/i.test(sourceText)) {
    bindings.push({
      toolId: 'internal.data.search',
      provider: 'p2_5',
      capability: 'knowledge_and_business_data_search',
      required: false,
      authScope: 'tenant',
    });
  }

  if (/知识库|SOP|制度|规范/i.test(sourceText) || bindings.length === 0) {
    bindings.push({
      toolId: 'knowledge.resources.search',
      provider: 'p2_5',
      capability: 'knowledge_resource_search',
      required: false,
      authScope: 'app',
    });
  }

  return bindings;
};

const buildApplicationPackPayload = ({
  plan = {},
  app = {},
  appId = '',
  createdRules = [],
  createdTemplate = {},
  sessionId = '',
} = {}) => {
  const appName = normalizeText(app.name || plan.app?.name) || '未命名助手应用';
  const scenarioKey =
    normalizeText(plan.scenarioKey || plan.scenario_key) ||
    `p5-${buildStableKey(`${sessionId}:${appName}:${JSON.stringify(plan.rules || [])}`)}`;
  const toolBindings = normalizeToolBindings(plan);
  const templateScene = normalizeText(createdTemplate.scene || plan.template?.scene) || 'business_report';
  const outputTarget =
    normalizeText(createdTemplate.outputTarget || createdTemplate.output_target || plan.template?.output_target) ||
    '结构化业务输出';

  return {
    scenarioKey,
    name: appName,
    description: normalizeText(app.description || plan.app?.description),
    status: 'draft',
    version: normalizeText(plan.version) || '1.0.0',
    requirementSource: {
      sourceType: 'p5-natural-language-factory',
      sessionId,
      raw: {
        app: plan.app || {},
        dataSources: plan.dataSources || [],
        tools: plan.tools || [],
      },
    },
    businessObjects: [
      {
        name: 'TaskSubject',
        description: '终端用户请求中需要分析、检索、生成或路由的核心对象。',
        fields: ['subject_name', 'query', 'context', 'evidence_refs'],
      },
      {
        name: 'AgentFinding',
        description: 'Agent 提取出的结构化信号、证据、风险与建议。',
        fields: ['finding_type', 'severity', 'summary', 'evidence_refs', 'recommended_action'],
      },
    ],
    dataContracts: [
      {
        name: 'AgentInput',
        direction: 'input',
        schema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            app_id: { type: 'string' },
            session_id: { type: 'string' },
            context: { type: 'object' },
          },
        },
      },
      {
        name: 'AgentOutput',
        direction: 'output',
        schema: {
          type: 'object',
          required: ['summary', 'findings', 'next_actions', 'human_review_required'],
          properties: {
            summary: { type: 'string' },
            findings: { type: 'array' },
            evidence_refs: { type: 'array' },
            next_actions: { type: 'array' },
            human_review_required: { type: 'boolean' },
          },
        },
      },
    ],
    toolBindings,
    workflowSpec: {
      entryNodeId: 'p2-fast-router',
      nodes: [
        {
          id: 'p2-fast-router',
          type: 'p2.fast_channel.route',
          description: '优先使用 P2.1 规则与本地微模型进行轻量路由。',
        },
        {
          id: 'p2-react-agent',
          type: 'p2.react.main_agent',
          dependsOn: ['p2-fast-router'],
          description: '复杂请求升级到 P2.2 主业务 Agent。',
        },
        {
          id: 'p3-tools',
          type: 'p3.tool.invoke',
          dependsOn: ['p2-react-agent'],
          toolBindings: toolBindings.map((item) => item.toolId),
        },
        {
          id: 'p2-output',
          type: 'p2.output.compose',
          dependsOn: ['p3-tools'],
          templateScene,
        },
      ],
    },
    ruleBindings: createdRules.map((rule) => ({
      ruleId: rule.id,
      domainType: rule.domainType || rule.domain_type,
      workflowStage: rule.workflowStage || rule.workflow_stage,
      confidence: rule.confidence,
    })),
    outputContract: {
      format: 'structured-json-plus-human-readable-reply',
      templateScene,
      outputTarget,
      requiredFields: ['summary', 'findings', 'evidence_refs', 'next_actions', 'human_review_required'],
    },
    reviewPolicy: {
      humanReviewRequired: true,
      reason: 'P5 自动装配的业务 Agent 默认要求人工确认高影响建议。',
    },
    acceptanceTests: [
      {
        name: '快速通道路由可用',
        input: { message: '你好' },
        expected: ['handled=true OR upgraded=true'],
      },
      {
        name: '主链路升级可用',
        input: { message: `生成一份${outputTarget}` },
        expected: ['main_agent_or_workflow_result'],
      },
      {
        name: '工具授权绑定存在',
        input: { app_id: appId },
        expected: toolBindings.map((item) => item.toolId),
      },
    ],
  };
};

const readNotFoundAsNull = async (path = '') => {
  try {
    return unwrapInternalData(await internalClient.get(path));
  } catch (error) {
    if (Number(error?.response?.status || 0) === 404) {
      return null;
    }

    throw error;
  }
};

const upsertAndPublishApplicationPack = async (payload = {}) => {
  const scenarioKey = normalizeText(payload.scenarioKey || payload.scenario_key);
  const existing = scenarioKey
    ? await readNotFoundAsNull(`/internal/application-packs/${encodeURIComponent(scenarioKey)}`)
    : null;

  const savedResponse = existing?.id
    ? await internalClient.put(`/internal/application-packs/${encodeURIComponent(existing.id)}`, payload)
    : await internalClient.post('/internal/application-packs', payload);
  const savedPack = unwrapInternalData(savedResponse);
  const publishedResponse = await internalClient.post(
    `/internal/application-packs/${encodeURIComponent(savedPack.id)}/publish`,
    {},
  );

  return unwrapInternalData(publishedResponse);
};

const executeFactoryPlan = async (plan = {}, { sessionId = '' } = {}) => {
  if (!plan?.confirmed) {
    return {
      error: 'factory plan is not confirmed',
    };
  }

  const appPayload = {
    name: plan.app?.name || '未命名助手应用',
    description: plan.app?.description || '',
    rateLimit: plan.app?.rateLimit || 60,
    maxTokens: plan.app?.maxTokens || 100000,
    idempotencyKey:
      normalizeText(plan.idempotencyKey || plan.idempotency_key) ||
      `factory:${normalizeText(sessionId) || buildStableKey(JSON.stringify(plan.app || {}))}`,
  };
  const appResponse = await internalClient.post('/internal/apps', appPayload);
  const createdApp = unwrapInternalData(appResponse);
  const createdAppId = createdApp.id || createdApp.app_id || createdApp.appId || '';

  let rulesCreated = 0;
  const createdRules = [];
  for (const rule of plan.rules || []) {
    const ruleResponse = await internalClient.post('/internal/knowledge/rules', {
      ...attachAppId(rule, createdAppId),
      created_by: normalizeText(rule?.created_by || rule?.createdBy) || 'p5',
    });
    createdRules.push(unwrapInternalData(ruleResponse));
    rulesCreated += 1;
  }

  let resourcesCreated = 0;
  const createdResources = [];
  for (const resource of plan.resources || []) {
    const resourceResponse = await internalClient.post(
      '/internal/knowledge/resources',
      attachAppId(resource, createdAppId),
    );
    createdResources.push(unwrapInternalData(resourceResponse));
    resourcesCreated += 1;
  }

  let channelsCreated = 0;
  const createdChannels = [];
  for (const channel of plan.channels || []) {
    const channelResponse = await internalClient.post('/internal/channels', {
      ...attachAppId(channel, createdAppId),
      created_by: normalizeText(channel?.created_by || channel?.createdBy) || 'p5',
    });
    createdChannels.push(unwrapInternalData(channelResponse));
    channelsCreated += 1;
  }

  const templateResponse = await internalClient.post(
    '/internal/knowledge/templates',
    normalizeTemplatePayload(plan.template || {}, createdAppId),
  );
  const createdTemplate = unwrapInternalData(templateResponse);
  const applicationPack = await upsertAndPublishApplicationPack(
    buildApplicationPackPayload({
      plan,
      app: createdApp,
      appId: createdAppId,
      createdRules,
      createdTemplate,
      sessionId,
    }),
  );

  return {
    reply: `配置完成！已创建应用「${createdApp.name || appPayload.name}」、${rulesCreated} 条知识规则、${resourcesCreated} 条知识资源、${channelsCreated} 条渠道配置、报告模板，并发布应用包「${applicationPack.name || applicationPack.scenarioKey}」。请立即保存 API Key，后续无法再次查看明文。`,
    needsConfirmation: false,
    app_id: createdAppId,
    appId: createdAppId,
    api_key: createdApp.api_key || createdApp.apiKey || '',
    apiKey: createdApp.api_key || createdApp.apiKey || '',
    rules_created: rulesCreated,
    rulesCreated,
    resources_created: resourcesCreated,
    resourcesCreated,
    channels_created: channelsCreated,
    channelsCreated,
    application_pack_id: applicationPack.id || '',
    applicationPackId: applicationPack.id || '',
    application_pack_status: applicationPack.status || '',
    applicationPackStatus: applicationPack.status || '',
    tool_bindings: applicationPack.toolBindings || applicationPack.tool_bindings || [],
    toolBindings: applicationPack.toolBindings || applicationPack.tool_bindings || [],
    template_scene: createdTemplate.scene || plan.template?.scene || '',
    templateScene: createdTemplate.scene || plan.template?.scene || '',
  };
};

export const runFactoryConversation = async (
  sessionId = '',
  userMessage = '',
  conversationHistory = [],
) => {
  const normalizedMessage = normalizeText(userMessage);
  const history = normalizeHistory(conversationHistory);

  if (!normalizedMessage) {
    return {
      reply: '请先描述你想创建的助手用途，例如“我需要一个营销智能风控助手”。',
      needsConfirmation: false,
      session_id: sessionId,
    };
  }

  try {
    if (!hasUsableOpenAiKey()) {
      return await runLocalFactory(sessionId, normalizedMessage, history);
    }

    const messages = [
      { role: 'system', content: FACTORY_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: normalizedMessage },
    ];
    const aiReply = await callOpenAI(messages);
    const plan = extractJsonBlock(aiReply);

    if (isConfirmationMessage(normalizedMessage)) {
      return await executeFactoryPlan(plan || buildFinalConfig(history, normalizedMessage), {
        sessionId,
      });
    }

    if (plan) {
      return {
        reply: buildConfirmationListFromPlan(plan),
        needsConfirmation: true,
        session_id: sessionId,
      };
    }

    return {
      reply: aiReply,
      needsConfirmation: /确认清单|将要创建|确认执行|请确认/.test(aiReply),
      session_id: sessionId,
    };
  } catch (error) {
    return {
      error: normalizeText(error.response?.data?.error?.message) || normalizeText(error.message) || '助手工厂执行失败',
      reply: '助手工厂执行失败，请稍后重试或检查 P5 / mock-server 配置。',
      needsConfirmation: false,
    };
  }
};

export const createAgentFromRequirement = async ({
  requirement = '',
  sessionId = '',
  plan = null,
} = {}) => {
  const normalizedRequirement = normalizeText(requirement);
  const factoryPlan =
    plan && isPlainObject(plan)
      ? {
          ...plan,
          confirmed: true,
        }
      : buildFinalConfig([], normalizedRequirement);

  return executeFactoryPlan(factoryPlan, {
    sessionId: normalizeText(sessionId) || `p5-create-agent-${buildStableKey(normalizedRequirement)}`,
  });
};

export default {
  createAgentFromRequirement,
  runFactoryConversation,
};
