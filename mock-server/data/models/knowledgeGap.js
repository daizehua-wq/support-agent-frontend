import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeDate = (value = '') => {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const sanitizeQuery = (value = '') => {
  return normalizeText(value)
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱]')
    .slice(0, 500);
};

const mapGap = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    session_id: row.session_id || '',
    sessionId: row.session_id || '',
    app_id: row.app_id || '',
    appId: row.app_id || '',
    user_query: row.user_query || '',
    userQuery: row.user_query || '',
    matched_rule_count: Number(row.matched_rule_count || 0),
    matchedRuleCount: Number(row.matched_rule_count || 0),
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
  };
};

export const getGap = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return mapGap(getDb().prepare('SELECT * FROM knowledge_gaps WHERE id = ?').get(normalizedId));
};

const buildDateWhere = ({ start = '', end = '' } = {}) => {
  const clauses = [];
  const params = [];
  const normalizedStart = normalizeDate(start);
  const normalizedEnd = normalizeDate(end);

  if (normalizedStart) {
    clauses.push('date(created_at) >= ?');
    params.push(normalizedStart);
  }

  if (normalizedEnd) {
    clauses.push('date(created_at) <= ?');
    params.push(normalizedEnd);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
};

export const recordGap = (sessionId = '', appId = '', query = '', matchedCount = 0) => {
  const userQuery = sanitizeQuery(query);

  if (!userQuery) {
    return null;
  }

  const result = getDb().prepare(
    `
    INSERT INTO knowledge_gaps (
      session_id,
      app_id,
      user_query,
      matched_rule_count
    )
    VALUES (?, ?, ?, ?)
    `,
  ).run(
    normalizeText(sessionId) || null,
    normalizeText(appId) || null,
    userQuery,
    Math.max(0, Number(matchedCount) || 0),
  );

  return mapGap(getDb().prepare('SELECT * FROM knowledge_gaps WHERE id = ?').get(result.lastInsertRowid));
};

export const safeRecordGap = (...args) => {
  try {
    return recordGap(...args);
  } catch (error) {
    console.warn('[knowledgeGap] failed to record gap:', error.message);
    return null;
  }
};

export const getGaps = ({ start = '', end = '', limit = 50 } = {}) => {
  const { where, params } = buildDateWhere({ start, end });
  const normalizedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  return getDb()
    .prepare(
      `
      SELECT *
      FROM knowledge_gaps
      ${where}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
      `,
    )
    .all(...params, normalizedLimit)
    .map(mapGap);
};

export const deleteGap = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM knowledge_gaps WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};

export const updateGap = (id = '', updates = {}) => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const existing = getGap(normalizedId);
  if (!existing) {
    return null;
  }

  getDb().prepare(
    `
    UPDATE knowledge_gaps
    SET session_id = ?,
        app_id = ?,
        user_query = ?,
        matched_rule_count = ?
    WHERE id = ?
    `,
  ).run(
    normalizeText(updates.sessionId ?? updates.session_id ?? existing.sessionId) || null,
    normalizeText(updates.appId ?? updates.app_id ?? existing.appId) || null,
    sanitizeQuery(updates.userQuery ?? updates.user_query ?? existing.userQuery),
    Math.max(
      0,
      Number(updates.matchedRuleCount ?? updates.matched_rule_count ?? existing.matchedRuleCount) ||
        0,
    ),
    normalizedId,
  );

  return getGap(normalizedId);
};

export const countGaps = ({ start = '', end = '' } = {}) => {
  const { where, params } = buildDateWhere({ start, end });
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS gap_count
      FROM knowledge_gaps
      ${where}
      `,
    )
    .get(...params);

  return Number(row?.gap_count || 0);
};
