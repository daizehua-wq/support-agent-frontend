import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const safeJsonParse = (value = '', fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stringifyField = (value = null) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const slugify = (value = '') => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

const mapPack = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    scenario_key: row.scenario_key || '',
    scenarioKey: row.scenario_key || '',
    name: row.name || '',
    description: row.description || '',
    status: row.status || 'draft',
    version: row.version || '0.1.0',
    requirement_source: safeJsonParse(row.requirement_source, {}),
    requirementSource: safeJsonParse(row.requirement_source, {}),
    business_objects: safeJsonParse(row.business_objects, []),
    businessObjects: safeJsonParse(row.business_objects, []),
    data_contracts: safeJsonParse(row.data_contracts, []),
    dataContracts: safeJsonParse(row.data_contracts, []),
    tool_bindings: safeJsonParse(row.tool_bindings, []),
    toolBindings: safeJsonParse(row.tool_bindings, []),
    workflow_spec: safeJsonParse(row.workflow_spec, {}),
    workflowSpec: safeJsonParse(row.workflow_spec, {}),
    rule_bindings: safeJsonParse(row.rule_bindings, []),
    ruleBindings: safeJsonParse(row.rule_bindings, []),
    output_contract: safeJsonParse(row.output_contract, {}),
    outputContract: safeJsonParse(row.output_contract, {}),
    review_policy: safeJsonParse(row.review_policy, {}),
    reviewPolicy: safeJsonParse(row.review_policy, {}),
    acceptance_tests: safeJsonParse(row.acceptance_tests, []),
    acceptanceTests: safeJsonParse(row.acceptance_tests, []),
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
    published_at: row.published_at || '',
    publishedAt: row.published_at || '',
  };
};

const buildPackParams = (data = {}) => {
  const name = normalizeText(data.name);
  const scenarioKey =
    normalizeText(data.scenarioKey || data.scenario_key) ||
    slugify(name) ||
    `application-${Date.now()}`;

  return {
    id: normalizeText(data.id) || randomUUID(),
    scenarioKey,
    name,
    description: normalizeText(data.description),
    status: normalizeText(data.status) || 'draft',
    version: normalizeText(data.version) || '0.1.0',
    requirementSource: stringifyField(data.requirementSource ?? data.requirement_source ?? {}),
    businessObjects: stringifyField(data.businessObjects ?? data.business_objects ?? []),
    dataContracts: stringifyField(data.dataContracts ?? data.data_contracts ?? []),
    toolBindings: stringifyField(data.toolBindings ?? data.tool_bindings ?? []),
    workflowSpec: stringifyField(data.workflowSpec ?? data.workflow_spec ?? {}),
    ruleBindings: stringifyField(data.ruleBindings ?? data.rule_bindings ?? []),
    outputContract: stringifyField(data.outputContract ?? data.output_contract ?? {}),
    reviewPolicy: stringifyField(data.reviewPolicy ?? data.review_policy ?? {}),
    acceptanceTests: stringifyField(data.acceptanceTests ?? data.acceptance_tests ?? []),
  };
};

export const listApplicationPacks = ({ status = '' } = {}) => {
  const normalizedStatus = normalizeText(status);
  const rows = normalizedStatus
    ? getDb()
        .prepare(
          `
          SELECT * FROM application_packs
          WHERE status = ?
          ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
          `,
        )
        .all(normalizedStatus)
    : getDb()
        .prepare(
          `
          SELECT * FROM application_packs
          ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
          `,
        )
        .all();

  return rows.map(mapPack);
};

export const getApplicationPack = (idOrScenarioKey = '') => {
  const normalizedId = normalizeText(idOrScenarioKey);
  if (!normalizedId) {
    return null;
  }

  return mapPack(
    getDb()
      .prepare('SELECT * FROM application_packs WHERE id = ? OR scenario_key = ?')
      .get(normalizedId, normalizedId),
  );
};

export const createApplicationPack = (data = {}) => {
  const pack = buildPackParams(data);

  if (!pack.name) {
    throw new Error('application pack name is required');
  }

  getDb().prepare(
    `
    INSERT INTO application_packs (
      id,
      scenario_key,
      name,
      description,
      status,
      version,
      requirement_source,
      business_objects,
      data_contracts,
      tool_bindings,
      workflow_spec,
      rule_bindings,
      output_contract,
      review_policy,
      acceptance_tests
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    pack.id,
    pack.scenarioKey,
    pack.name,
    pack.description,
    pack.status,
    pack.version,
    pack.requirementSource,
    pack.businessObjects,
    pack.dataContracts,
    pack.toolBindings,
    pack.workflowSpec,
    pack.ruleBindings,
    pack.outputContract,
    pack.reviewPolicy,
    pack.acceptanceTests,
  );

  return getApplicationPack(pack.id);
};

export const updateApplicationPack = (idOrScenarioKey = '', data = {}) => {
  const existing = getApplicationPack(idOrScenarioKey);
  if (!existing) {
    return null;
  }

  const pack = buildPackParams({
    ...existing,
    ...data,
    id: existing.id,
    scenarioKey: data.scenarioKey ?? data.scenario_key ?? existing.scenarioKey,
    requirementSource:
      data.requirementSource ?? data.requirement_source ?? existing.requirementSource,
    businessObjects: data.businessObjects ?? data.business_objects ?? existing.businessObjects,
    dataContracts: data.dataContracts ?? data.data_contracts ?? existing.dataContracts,
    toolBindings: data.toolBindings ?? data.tool_bindings ?? existing.toolBindings,
    workflowSpec: data.workflowSpec ?? data.workflow_spec ?? existing.workflowSpec,
    ruleBindings: data.ruleBindings ?? data.rule_bindings ?? existing.ruleBindings,
    outputContract: data.outputContract ?? data.output_contract ?? existing.outputContract,
    reviewPolicy: data.reviewPolicy ?? data.review_policy ?? existing.reviewPolicy,
    acceptanceTests: data.acceptanceTests ?? data.acceptance_tests ?? existing.acceptanceTests,
  });

  if (!pack.name) {
    throw new Error('application pack name is required');
  }

  getDb().prepare(
    `
    UPDATE application_packs
    SET scenario_key = ?,
        name = ?,
        description = ?,
        status = ?,
        version = ?,
        requirement_source = ?,
        business_objects = ?,
        data_contracts = ?,
        tool_bindings = ?,
        workflow_spec = ?,
        rule_bindings = ?,
        output_contract = ?,
        review_policy = ?,
        acceptance_tests = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(
    pack.scenarioKey,
    pack.name,
    pack.description,
    pack.status,
    pack.version,
    pack.requirementSource,
    pack.businessObjects,
    pack.dataContracts,
    pack.toolBindings,
    pack.workflowSpec,
    pack.ruleBindings,
    pack.outputContract,
    pack.reviewPolicy,
    pack.acceptanceTests,
    existing.id,
  );

  return getApplicationPack(existing.id);
};

export const publishApplicationPack = (idOrScenarioKey = '') => {
  const existing = getApplicationPack(idOrScenarioKey);
  if (!existing) {
    return null;
  }

  getDb().prepare(
    `
    UPDATE application_packs
    SET status = 'published',
        published_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(existing.id);

  return getApplicationPack(existing.id);
};

export const deleteApplicationPack = (idOrScenarioKey = '') => {
  const existing = getApplicationPack(idOrScenarioKey);
  if (!existing) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM application_packs WHERE id = ?').run(existing.id);
  return result.changes > 0;
};

export const compileApplicationPackFromRequirement = (requirement = {}) => {
  const name =
    normalizeText(requirement.projectName || requirement.aiApplicationName || requirement.name) ||
    '未命名 Agent 应用';
  const scenarioKey =
    normalizeText(requirement.scenarioKey) ||
    slugify(name) ||
    `application-${Date.now()}`;
  const painPoints = normalizeText(requirement.painPoints || requirement.painPoint);
  const businessGoal = normalizeText(requirement.businessGoal || requirement.goal);
  const nextPlan = normalizeText(requirement.nextPlan || requirement.plan);

  return createApplicationPack({
    scenarioKey,
    name,
    description: businessGoal || painPoints,
    requirementSource: {
      sourceType: 'business-requirement',
      raw: requirement,
    },
    businessObjects: [
      {
        name: 'BusinessSubject',
        description: '真实业务流程中的核心任务对象，需要在落地时替换成场景实体。',
        fields: ['id', 'name', 'status', 'owner', 'created_at', 'updated_at'],
      },
      {
        name: 'AgentFinding',
        description: 'Agent 对业务对象提取出的结构化发现、风险、证据和建议。',
        fields: ['finding_type', 'severity', 'summary', 'evidence_refs', 'recommended_action'],
      },
    ],
    dataContracts: [
      {
        name: 'ApplicationInput',
        direction: 'input',
        schema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            context: { type: 'string' },
          },
        },
      },
      {
        name: 'ApplicationOutput',
        direction: 'output',
        schema: {
          type: 'object',
          required: ['summary', 'findings', 'next_actions'],
          properties: {
            summary: { type: 'string' },
            findings: { type: 'array' },
            next_actions: { type: 'array' },
            human_review_required: { type: 'boolean' },
          },
        },
      },
    ],
    toolBindings: [],
    workflowSpec: {
      entryNodeId: 'intake',
      nodes: [
        { id: 'intake', type: 'requirement.intake', description: painPoints || '接收业务输入' },
        { id: 'collect-evidence', type: 'evidence.collect', dependsOn: ['intake'] },
        { id: 'reason', type: 'agent.reason', dependsOn: ['collect-evidence'] },
        { id: 'human-review', type: 'human.review', dependsOn: ['reason'] },
      ],
    },
    ruleBindings: [
      {
        type: 'safety',
        name: 'high-impact-decision-guard',
        description: '涉及财务、信用、医疗、法律等高影响场景时只输出建议，不自动做最终决策。',
      },
    ],
    outputContract: {
      format: 'structured-json-plus-report',
      requiredFields: ['summary', 'findings', 'evidence_refs', 'next_actions', 'human_review_required'],
    },
    reviewPolicy: {
      humanReviewRequired: true,
      reason: '真实业务应用默认需要人工确认后才能发布或执行高影响动作。',
    },
    acceptanceTests: [
      {
        name: '需求可装配',
        input: { query: name },
        expected: ['summary', 'findings', 'next_actions'],
      },
      {
        name: '人审保护',
        input: { query: '触发高影响判断' },
        expected: ['human_review_required=true'],
      },
    ],
  });
};
