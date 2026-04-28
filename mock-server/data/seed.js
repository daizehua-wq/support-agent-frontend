import { getDb } from './database.js';
import { createApplicationPack } from './models/applicationPack.js';
import { migrate as migrateKnowledge } from './migrateKnowledge.js';

const seedExternalConnections = () => {
  const db = getDb();
  const ensureConnection = ({ id, provider, apiKeyRef, envKey, fallbackApiKey = '' }) => {
    const existing = db.prepare('SELECT * FROM external_connections WHERE provider = ?').get(provider);
    const hasRuntimeKey = Boolean(process.env[envKey]);

    if (existing) {
      if (existing.has_api_key && fallbackApiKey && !process.env[envKey]) {
        process.env[envKey] = fallbackApiKey;
      }
      return;
    }

    if (fallbackApiKey && !process.env[envKey]) {
      process.env[envKey] = fallbackApiKey;
    }

    db.prepare(
      `
      INSERT INTO external_connections (id, provider, api_key_ref, has_api_key, is_active)
      VALUES (?, ?, ?, ?, 1)
      `,
    ).run(id, provider, apiKeyRef, process.env[envKey] || hasRuntimeKey ? 1 : 0);
  };

  ensureConnection({
    id: 'conn_openai_default',
    provider: 'openai',
    apiKeyRef: 'openai_key_placeholder',
    envKey: 'KEY_OPENAI',
    fallbackApiKey: 'sk-xxxxxxxxxxxxxxxxxxxx',
  });
  ensureConnection({
    id: 'conn_qichacha_default',
    provider: 'qichacha',
    apiKeyRef: 'qichacha_key_ref',
    envKey: 'KEY_QICHACHA',
  });
};

const seedApplicationPacks = () => {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM application_packs WHERE scenario_key = ?')
    .get('marketing-risk-control');

  if (existing) {
    return;
  }

  createApplicationPack({
    id: 'pack_marketing_risk_control',
    scenarioKey: 'marketing-risk-control',
    name: '营销智能风控系统',
    description: '从客户名称出发，装配外部工商风险、内部交易记录、规则评分和人审报告闭环。',
    status: 'draft',
    version: '0.1.0',
    requirementSource: {
      sourceType: 'user-business-table',
      fields: {
        painPoint:
          '客户信用信息分散，客户资信、诉讼、被执行、失信等不良记录需要人工查询，风险变化难以及时监控。',
        businessGoal:
          '接入第三方网站和内部交易记录，分析客户信用报告，及时共享重大风险信息，提升审核效率和质量。',
        expectedCompletionTime: '2026-07-30',
        nextPlan: '法务明确具体需求和表单，IT 进行技术开发。',
      },
    },
    businessObjects: [
      {
        name: 'CustomerProfile',
        description: '客户工商与基础资信画像。',
        fields: ['company_name', 'credit_code', 'enterprise_status', 'registered_capital'],
      },
      {
        name: 'RiskSignal',
        description: '可解释、可追溯的风险信号。',
        fields: ['signal_type', 'severity', 'summary', 'evidence_source', 'occurred_at'],
      },
      {
        name: 'RiskReport',
        description: '面向销售、法务、财务共用的风控报告。',
        fields: ['risk_level', 'summary', 'signals', 'recommended_actions', 'review_status'],
      },
    ],
    dataContracts: [
      {
        name: 'RiskControlInput',
        direction: 'input',
        schema: {
          type: 'object',
          required: ['company_name'],
          properties: {
            company_name: { type: 'string' },
            internal_customer_id: { type: 'string' },
          },
        },
      },
      {
        name: 'RiskControlOutput',
        direction: 'output',
        schema: {
          type: 'object',
          required: ['risk_level', 'risk_signals', 'human_review_required'],
          properties: {
            risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
            risk_signals: { type: 'array' },
            evidence_refs: { type: 'array' },
            recommended_actions: { type: 'array' },
            human_review_required: { type: 'boolean' },
          },
        },
      },
    ],
    toolBindings: [
      {
        toolName: 'query_qichacha_company',
        provider: 'qichacha',
        required: true,
        inputMapping: {
          company_name: '$input.company_name',
        },
      },
    ],
    workflowSpec: {
      entryNodeId: 'input-company',
      nodes: [
        { id: 'input-company', type: 'form.input', output: 'RiskControlInput' },
        {
          id: 'query-external-risk',
          type: 'tool.call',
          toolName: 'query_qichacha_company',
          dependsOn: ['input-company'],
        },
        {
          id: 'query-internal-transactions',
          type: 'data.query',
          dataContract: 'InternalTransactionHistory',
          dependsOn: ['input-company'],
        },
        {
          id: 'score-risk-signals',
          type: 'rules.evaluate',
          ruleSet: 'marketing-risk-control.rules.v1',
          dependsOn: ['query-external-risk', 'query-internal-transactions'],
        },
        {
          id: 'generate-risk-report',
          type: 'output.generate',
          outputContract: 'RiskControlOutput',
          dependsOn: ['score-risk-signals'],
        },
        {
          id: 'human-review',
          type: 'human.review',
          dependsOn: ['generate-risk-report'],
        },
      ],
    },
    ruleBindings: [
      {
        ruleSet: 'marketing-risk-control.rules.v1',
        rules: [
          '失信记录必须标记为高风险',
          '被执行记录必须进入人工复核',
          '企业状态异常必须提示销售暂停自动推进',
          '内部交易逾期必须进入证据列表',
        ],
      },
    ],
    outputContract: {
      format: 'structured-json-plus-report',
      requiredFields: [
        'risk_level',
        'risk_signals',
        'evidence_refs',
        'recommended_actions',
        'human_review_required',
      ],
      forbiddenActions: ['auto_approve_credit', 'auto_reject_customer', 'auto_adjust_credit_limit'],
    },
    reviewPolicy: {
      humanReviewRequired: true,
      reviewers: ['legal', 'finance', 'sales_manager'],
      reason: '信用/风控属于高影响业务场景，Agent 只能提供建议和证据，不能自动做最终授信或拒绝决定。',
    },
    acceptanceTests: [
      {
        name: '公司名可生成风控报告',
        input: { company_name: '示例科技有限公司' },
        expected: ['risk_level', 'risk_signals', 'human_review_required'],
      },
      {
        name: '失信记录触发高风险和人审',
        fixture: { dishonestRecords: [{ caseNo: 'demo-case' }] },
        expected: ['risk_level=high', 'human_review_required=true'],
      },
    ],
  });
};

seedExternalConnections();
seedApplicationPacks();
await migrateKnowledge();
