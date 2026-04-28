import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const clampConfidence = (value = 1) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 1;
  }

  return Math.min(1, Math.max(0, numberValue));
};

const normalizeRuleStatus = (value = 'active', fallback = 'active') => {
  const normalized = normalizeText(value || fallback).toLowerCase();
  return ['active', 'disabled', 'deprecated'].includes(normalized) ? normalized : fallback;
};

const normalizeCreator = (value = 'human') => {
  return normalizeText(value).toLowerCase() === 'p5' ? 'p5' : 'human';
};

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

const stringifyField = (value = '') => {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value);
  }

  return normalizeText(value);
};

const normalizeKeywordList = (value = []) => {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }

  const parsed = safeJsonParse(value, null);
  if (Array.isArray(parsed)) {
    return parsed.map(normalizeText).filter(Boolean);
  }

  return normalizeText(value)
    .split(/[,，\s]+/)
    .map(normalizeText)
    .filter(Boolean);
};

const parseMaybeJson = (value = '') => {
  const parsed = safeJsonParse(value, null);
  return parsed ?? normalizeText(value);
};

const getPriority = (suggestions = null) => {
  if (!suggestions || typeof suggestions !== 'object') {
    return 0;
  }

  return Number(suggestions.priority || suggestions.legacyRule?.priority || 0);
};

const mapRule = (row = null) => {
  if (!row) {
    return null;
  }

  const keywords = normalizeKeywordList(row.keywords);
  const suggestions = parseMaybeJson(row.suggestions);
  const riskNotes = parseMaybeJson(row.risk_notes);

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    domain_type: row.domain_type || '',
    domainType: row.domain_type || '',
    topic: row.topic || '',
    workflow_stage: row.workflow_stage || '',
    workflowStage: row.workflow_stage || '',
    keywords,
    scenario: row.scenario || '',
    suggestions,
    risk_notes: riskNotes,
    riskNotes,
    legacyRule:
      suggestions && typeof suggestions === 'object' && suggestions.legacyRule
        ? suggestions.legacyRule
        : null,
    priority: getPriority(suggestions),
    created_by: row.created_by || 'human',
    createdBy: row.created_by || 'human',
    confidence: Number(row.confidence ?? 1),
    last_hit_at: row.last_hit_at || '',
    lastHitAt: row.last_hit_at || '',
    hit_count: Number(row.hit_count || 0),
    hitCount: Number(row.hit_count || 0),
    status: row.status || 'active',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const collectSearchText = (rule = {}) => {
  return [
    rule.domainType,
    rule.topic,
    rule.workflowStage,
    rule.scenario,
    ...(rule.keywords || []),
    typeof rule.suggestions === 'string' ? rule.suggestions : JSON.stringify(rule.suggestions || {}),
    typeof rule.riskNotes === 'string' ? rule.riskNotes : JSON.stringify(rule.riskNotes || {}),
  ]
    .join(' ')
    .toLowerCase();
};

const matchesKeyword = (rule = {}, keyword = '') => {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  const keywordHit = (rule.keywords || []).some((item) => {
    const normalizedItem = normalizeText(item).toLowerCase();
    return normalizedKeyword.includes(normalizedItem) || normalizedItem.includes(normalizedKeyword);
  });

  return keywordHit || collectSearchText(rule).includes(normalizedKeyword);
};

const markRulesHit = (rules = []) => {
  const ids = (rules || []).map((rule) => normalizeText(rule.id)).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  const db = getDb();
  const update = db.prepare(
    `
    UPDATE knowledge_rules
    SET last_hit_at = CURRENT_TIMESTAMP,
        hit_count = COALESCE(hit_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  );

  const run = db.transaction((ruleIds) => {
    ruleIds.forEach((id) => update.run(id));
  });

  run(ids);
};

const buildRuleParams = (data = {}) => {
  return {
    id: normalizeText(data.id) || randomUUID(),
    appId: normalizeText(data.appId || data.app_id),
    domainType:
      normalizeText(data.domainType || data.domain_type || data.domain) || 'general',
    topic: normalizeText(data.topic),
    workflowStage: normalizeText(data.workflowStage || data.workflow_stage),
    keywords: JSON.stringify(normalizeKeywordList(data.keywords)),
    scenario: normalizeText(data.scenario),
    suggestions: stringifyField(data.suggestions),
    riskNotes: stringifyField(data.riskNotes ?? data.risk_notes),
    createdBy: normalizeCreator(data.createdBy || data.created_by || 'human'),
    confidence: clampConfidence(data.confidence ?? 1),
    status: normalizeRuleStatus(data.status || 'active'),
  };
};

const queryRules = (
  { domain, domainType, topic, workflowStage, appId, app_id: appIdSnake } = {},
  options = {},
) => {
  const clauses = ['1 = 1'];
  const params = [];
  const normalizedAppId = normalizeText(appId || appIdSnake);
  const normalizedDomain = normalizeText(domainType || domain);
  const normalizedTopic = normalizeText(topic);
  const normalizedWorkflowStage = normalizeText(workflowStage);
  const normalizedStatus = normalizeText(options.status);

  if (options.includeAllApps !== true) {
    if (normalizedAppId) {
      clauses.push('(app_id IS NULL OR app_id = ?)');
      params.push(normalizedAppId);
    } else {
      clauses.push('app_id IS NULL');
    }
  }

  if (options.onlyActive) {
    clauses.push("status = 'active'");
  } else if (normalizedStatus && normalizedStatus !== 'all') {
    clauses.push('status = ?');
    params.push(normalizeRuleStatus(normalizedStatus, 'active'));
  }

  if (normalizedDomain && !options.relaxDomain) {
    clauses.push('(domain_type = ? OR domain_type LIKE ?)');
    params.push(normalizedDomain, `%${normalizedDomain}%`);
  }

  if (normalizedTopic && !options.relaxTopic) {
    clauses.push('(topic = ? OR topic LIKE ?)');
    params.push(normalizedTopic, `%${normalizedTopic}%`);
  }

  if (normalizedWorkflowStage) {
    clauses.push('(workflow_stage = ? OR workflow_stage LIKE ?)');
    params.push(normalizedWorkflowStage, `%${normalizedWorkflowStage}%`);
  }

  const orderParams = [];
  const appPriorityOrder =
    normalizedAppId && options.includeAllApps !== true
      ? 'CASE WHEN app_id = ? THEN 0 ELSE 1 END,'
      : '';
  if (appPriorityOrder) {
    orderParams.push(normalizedAppId);
  }

  return getDb()
    .prepare(
      `
      SELECT * FROM knowledge_rules
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${appPriorityOrder} datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all(...params, ...orderParams)
    .map(mapRule);
};

export const listRules = (filters = {}) => {
  return queryRules(filters, {
    relaxDomain: false,
    relaxTopic: false,
    status: filters.status,
    includeAllApps: filters.includeAllApps === true || filters.includeAllApps === 'true',
  });
};

export const matchRules = (filters = {}) => {
  const keyword = normalizeText(filters.keyword || filters.inputText || filters.text);
  let rules = queryRules(filters, { onlyActive: true }).filter((rule) =>
    matchesKeyword(rule, keyword),
  );

  if (rules.length === 0 && normalizeText(filters.topic)) {
    rules = queryRules(filters, { relaxTopic: true, onlyActive: true }).filter((rule) =>
      matchesKeyword(rule, keyword),
    );
  }

  if (rules.length === 0 && normalizeText(filters.domainType || filters.domain)) {
    rules = queryRules(filters, {
      relaxDomain: true,
      relaxTopic: true,
      onlyActive: true,
    }).filter((rule) => matchesKeyword(rule, keyword));
  }

  const sortedRules = rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  if (keyword) {
    markRulesHit(sortedRules);
  }

  return sortedRules;
};

export const createRule = (data = {}) => {
  const rule = buildRuleParams(data);

  getDb().prepare(
    `
    INSERT INTO knowledge_rules (
      id,
      app_id,
      domain_type,
      topic,
      workflow_stage,
      keywords,
      scenario,
      suggestions,
      risk_notes,
      created_by,
      confidence,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    rule.id,
    rule.appId || null,
    rule.domainType,
    rule.topic,
    rule.workflowStage,
    rule.keywords,
    rule.scenario,
    rule.suggestions,
    rule.riskNotes,
    rule.createdBy,
    rule.confidence,
    rule.status,
  );

  return mapRule(getDb().prepare('SELECT * FROM knowledge_rules WHERE id = ?').get(rule.id));
};

export const updateRule = (id = '', data = {}) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = mapRule(
    getDb().prepare('SELECT * FROM knowledge_rules WHERE id = ?').get(normalizedId),
  );

  if (!existing) {
    return null;
  }

  const next = buildRuleParams({
    ...existing,
    ...data,
    id: normalizedId,
    appId: data.appId ?? data.app_id ?? existing.appId,
    domainType: data.domainType ?? data.domain_type ?? existing.domainType,
    workflowStage: data.workflowStage ?? data.workflow_stage ?? existing.workflowStage,
    riskNotes: data.riskNotes ?? data.risk_notes ?? existing.riskNotes,
    createdBy: data.createdBy ?? data.created_by ?? existing.createdBy,
    confidence: data.confidence ?? existing.confidence,
    status: data.status ?? existing.status,
  });

  getDb().prepare(
    `
    UPDATE knowledge_rules
    SET domain_type = ?,
        app_id = ?,
        topic = ?,
        workflow_stage = ?,
        keywords = ?,
        scenario = ?,
        suggestions = ?,
        risk_notes = ?,
        created_by = ?,
        confidence = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(
    next.domainType,
    next.appId || null,
    next.topic,
    next.workflowStage,
    next.keywords,
    next.scenario,
    next.suggestions,
    next.riskNotes,
    next.createdBy,
    next.confidence,
    next.status,
    normalizedId,
  );

  return mapRule(getDb().prepare('SELECT * FROM knowledge_rules WHERE id = ?').get(normalizedId));
};

export const deleteRule = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM knowledge_rules WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};

export const updateHitTime = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  getDb().prepare(
    `
    UPDATE knowledge_rules
    SET last_hit_at = CURRENT_TIMESTAMP,
        hit_count = COALESCE(hit_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(normalizedId);

  return mapRule(getDb().prepare('SELECT * FROM knowledge_rules WHERE id = ?').get(normalizedId));
};

export const optimizeRules = (optimizations = []) => {
  const db = getDb();
  const updateStatus = db.prepare(
    `
    UPDATE knowledge_rules
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  );
  const updateConfidence = db.prepare(
    `
    UPDATE knowledge_rules
    SET confidence = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  );
  const apply = db.transaction((items) => {
    let affected = 0;

    items.forEach((item = {}) => {
      const id = normalizeText(item.id);
      const action = normalizeText(item.action);

      if (!id) {
        return;
      }

      if (action === 'disable') {
        affected += updateStatus.run('disabled', id).changes;
      } else if (action === 'enable') {
        affected += updateStatus.run('active', id).changes;
      } else if (action === 'set_confidence') {
        affected += updateConfidence.run(clampConfidence(item.value), id).changes;
      }
    });

    return affected;
  });

  return {
    affected: apply(Array.isArray(optimizations) ? optimizations : []),
  };
};

export const getLowPerformanceRules = (minConfidence = 0.3, maxDaysUnused = 30) => {
  const normalizedConfidence = clampConfidence(minConfidence);
  const normalizedDays = Math.max(0, Number(maxDaysUnused) || 30);

  return getDb()
    .prepare(
      `
      SELECT *
      FROM knowledge_rules
      WHERE status = 'active'
        AND (
          COALESCE(confidence, 1.0) < ?
          OR (last_hit_at IS NULL AND date(created_at) <= date('now', ?))
          OR date(last_hit_at) <= date('now', ?)
        )
      ORDER BY COALESCE(confidence, 1.0) ASC,
               datetime(COALESCE(last_hit_at, created_at)) ASC
      `,
    )
    .all(normalizedConfidence, `-${normalizedDays} days`, `-${normalizedDays} days`)
    .map(mapRule);
};
