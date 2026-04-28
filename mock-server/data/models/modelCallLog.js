import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeDate = (value = '') => {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
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

const percentile = (values = [], percentileValue = 0.95) => {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1,
  );

  return Math.round(sorted[index] || 0);
};

export const estimateTokens = (...values) => {
  const text = values.map((value) => normalizeText(value)).join('\n');
  return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
};

export const recordCall = ({
  appId = '',
  app_id = '',
  model = '',
  success = true,
  latencyMs = 0,
  latency_ms = 0,
  tokensUsed = 0,
  tokens_used = 0,
} = {}) => {
  const normalizedModel = normalizeText(model) || 'unknown-model';
  const normalizedLatency = Math.max(0, Number(latencyMs || latency_ms || 0) || 0);
  const normalizedTokens = Math.max(0, Number(tokensUsed || tokens_used || 0) || 0);

  const result = getDb().prepare(
    `
    INSERT INTO model_call_logs (
      app_id,
      model,
      success,
      latency_ms,
      tokens_used
    )
    VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    normalizeText(appId || app_id) || null,
    normalizedModel,
    success ? 1 : 0,
    normalizedLatency,
    normalizedTokens,
  );

  return {
    id: result.lastInsertRowid,
    app_id: normalizeText(appId || app_id),
    appId: normalizeText(appId || app_id),
    model: normalizedModel,
    success: success ? 1 : 0,
    latency_ms: normalizedLatency,
    latencyMs: normalizedLatency,
    tokens_used: normalizedTokens,
    tokensUsed: normalizedTokens,
  };
};

export const getCall = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const row = getDb()
    .prepare('SELECT * FROM model_call_logs WHERE id = ?')
    .get(normalizedId);

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    app_id: row.app_id || '',
    appId: row.app_id || '',
    model: row.model || '',
    success: Number(row.success || 0),
    latency_ms: Number(row.latency_ms || 0),
    latencyMs: Number(row.latency_ms || 0),
    tokens_used: Number(row.tokens_used || 0),
    tokensUsed: Number(row.tokens_used || 0),
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
  };
};

export const listCalls = ({ start = '', end = '', model = '', appId = '', limit = 100 } = {}) => {
  const { where, params } = buildDateWhere({ start, end });
  const clauses = where ? [where.replace(/^WHERE\s+/i, '')] : [];
  const normalizedModel = normalizeText(model);
  const normalizedAppId = normalizeText(appId);
  const normalizedLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  if (normalizedModel) {
    clauses.push('model = ?');
    params.push(normalizedModel);
  }

  if (normalizedAppId) {
    clauses.push('app_id = ?');
    params.push(normalizedAppId);
  }

  return getDb()
    .prepare(
      `
      SELECT *
      FROM model_call_logs
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
      `,
    )
    .all(...params, normalizedLimit)
    .map((row) => getCall(row.id));
};

export const deleteCall = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM model_call_logs WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};

export const safeRecordCall = (payload = {}) => {
  try {
    return recordCall(payload);
  } catch (error) {
    console.warn('[modelCallLog] failed to record model call:', error.message);
    return null;
  }
};

export const getModelPerformance = ({ start = '', end = '' } = {}) => {
  const { where, params } = buildDateWhere({ start, end });
  const rows = getDb()
    .prepare(
      `
      SELECT model, success, latency_ms, tokens_used, created_at
      FROM model_call_logs
      ${where}
      ORDER BY datetime(created_at) DESC
      `,
    )
    .all(...params);

  const grouped = new Map();

  rows.forEach((row) => {
    const model = normalizeText(row.model) || 'unknown-model';
    const current = grouped.get(model) || {
      model,
      calls: 0,
      success: 0,
      failures: 0,
      latencies: [],
      totalTokens: 0,
    };

    current.calls += 1;
    if (Number(row.success) === 1) {
      current.success += 1;
    } else {
      current.failures += 1;
    }

    const latency = Number(row.latency_ms);
    if (Number.isFinite(latency) && latency >= 0) {
      current.latencies.push(latency);
    }

    current.totalTokens += Math.max(0, Number(row.tokens_used || 0) || 0);
    grouped.set(model, current);
  });

  return Array.from(grouped.values())
    .map((item) => {
      const avgLatencyMs = item.latencies.length
        ? Math.round(item.latencies.reduce((sum, value) => sum + value, 0) / item.latencies.length)
        : 0;

      return {
        model: item.model,
        calls: item.calls,
        success: item.success,
        failures: item.failures,
        successRate: item.calls ? Number((item.success / item.calls).toFixed(4)) : 0,
        avgLatencyMs,
        p95LatencyMs: percentile(item.latencies, 0.95),
        totalTokens: item.totalTokens,
      };
    })
    .sort((a, b) => b.calls - a.calls || b.successRate - a.successRate);
};

export const getModelUsageRank = ({ start = '', end = '', limit = 5 } = {}) => {
  return getModelPerformance({ start, end })
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((item) => ({
      model: item.model,
      calls: item.calls,
      successRate: item.successRate,
      avgLatencyMs: item.avgLatencyMs,
    }));
};

export const getTotalTokensUsed = ({ start = '', end = '' } = {}) => {
  const { where, params } = buildDateWhere({ start, end });
  const row = getDb()
    .prepare(
      `
      SELECT COALESCE(SUM(tokens_used), 0) AS total_tokens
      FROM model_call_logs
      ${where}
      `,
    )
    .get(...params);

  return Number(row?.total_tokens || 0);
};
