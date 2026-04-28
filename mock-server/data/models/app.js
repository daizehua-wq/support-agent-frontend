import { createHash, randomBytes, randomUUID } from 'crypto';
import { getDb } from '../database.js';
import { toLocalDateKey, toLocalMinuteKey } from '../../utils/localTime.js';

const DEFAULT_RATE_LIMIT_PER_MIN = 60;
const DEFAULT_MAX_TOKENS_PER_DAY = 100000;
const rateLimitBuckets = new Map();

const normalizeText = (value = '') => String(value || '').trim();

const todayDate = () => toLocalDateKey();

const currentMinuteKey = () => {
  const now = new Date();
  return toLocalMinuteKey(now);
};

export const hashApiKey = (apiKey = '') => {
  return createHash('sha256').update(normalizeText(apiKey)).digest('hex');
};

const generateApiKey = () => `sk-${randomBytes(16).toString('hex')}`;

const buildApiKeyPrefix = (apiKey = '') => `${normalizeText(apiKey).slice(0, 7)}***`;

const toPositiveInteger = (value, fallback) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : fallback;
};

const mapApp = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    api_key_prefix: row.api_key_prefix || '',
    apiKeyPrefix: row.api_key_prefix || '',
    status: row.status || 'active',
    rate_limit_per_min: Number(row.rate_limit_per_min || DEFAULT_RATE_LIMIT_PER_MIN),
    rateLimitPerMin: Number(row.rate_limit_per_min || DEFAULT_RATE_LIMIT_PER_MIN),
    max_tokens_per_day: Number(row.max_tokens_per_day || DEFAULT_MAX_TOKENS_PER_DAY),
    maxTokensPerDay: Number(row.max_tokens_per_day || DEFAULT_MAX_TOKENS_PER_DAY),
    idempotency_key: row.idempotency_key || '',
    idempotencyKey: row.idempotency_key || '',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const mapUsage = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    date: row.date || '',
    api_calls: Number(row.api_calls || 0),
    apiCalls: Number(row.api_calls || 0),
    tokens_used: Number(row.tokens_used || 0),
    tokensUsed: Number(row.tokens_used || 0),
  };
};

const getRawAppById = (appId = '') => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId) {
    return null;
  }

  return getDb().prepare('SELECT * FROM apps WHERE id = ?').get(normalizedAppId) || null;
};

const cleanupRateLimitBuckets = () => {
  const activeMinute = currentMinuteKey();

  for (const key of rateLimitBuckets.keys()) {
    if (!key.endsWith(`:${activeMinute}`)) {
      rateLimitBuckets.delete(key);
    }
  }
};

export const createApp = ({
  name = '',
  description = '',
  rateLimit = DEFAULT_RATE_LIMIT_PER_MIN,
  maxTokens = DEFAULT_MAX_TOKENS_PER_DAY,
  idempotencyKey = '',
  idempotency_key = '',
} = {}) => {
  const normalizedName = normalizeText(name);
  const normalizedIdempotencyKey = normalizeText(idempotencyKey || idempotency_key);

  if (!normalizedName) {
    throw new Error('name is required');
  }

  if (normalizedIdempotencyKey) {
    const existing = mapApp(
      getDb()
        .prepare('SELECT * FROM apps WHERE idempotency_key = ? AND status != ?')
        .get(normalizedIdempotencyKey, 'deleted'),
    );

    if (existing) {
      return {
        ...existing,
        idempotentReplay: true,
      };
    }
  }

  const apiKey = generateApiKey();
  const appId = randomUUID();

  getDb().prepare(
    `
    INSERT INTO apps (
      id,
      name,
      description,
      api_key_hash,
      api_key_prefix,
      status,
      rate_limit_per_min,
      max_tokens_per_day,
      idempotency_key
    )
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `,
  ).run(
    appId,
    normalizedName,
    normalizeText(description),
    hashApiKey(apiKey),
    buildApiKeyPrefix(apiKey),
    toPositiveInteger(rateLimit, DEFAULT_RATE_LIMIT_PER_MIN),
    toPositiveInteger(maxTokens, DEFAULT_MAX_TOKENS_PER_DAY),
    normalizedIdempotencyKey || null,
  );

  return {
    ...getAppById(appId),
    api_key: apiKey,
    apiKey,
  };
};

export const getAppById = (appId = '') => {
  const app = mapApp(getRawAppById(appId));
  return app?.status === 'deleted' ? null : app;
};

export const getAppByApiKey = (apiKey = '') => {
  const normalizedApiKey = normalizeText(apiKey);
  if (!normalizedApiKey) {
    return null;
  }

  const row = getDb()
    .prepare('SELECT * FROM apps WHERE api_key_hash = ? AND status != ?')
    .get(hashApiKey(normalizedApiKey), 'deleted');

  return mapApp(row);
};

export const listApps = () => {
  return getDb()
    .prepare(
      `
      SELECT * FROM apps
      WHERE status != 'deleted'
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all()
    .map(mapApp);
};

export const updateApp = (appId = '', updates = {}) => {
  const existing = getAppById(appId);
  if (!existing) {
    return null;
  }

  const nextName = 'name' in updates ? normalizeText(updates.name) : existing.name;
  const nextDescription =
    'description' in updates ? normalizeText(updates.description) : existing.description;
  const nextStatus = ['active', 'suspended'].includes(normalizeText(updates.status))
    ? normalizeText(updates.status)
    : existing.status;
  const nextRateLimit = toPositiveInteger(
    updates.rateLimit ?? updates.rate_limit_per_min,
    existing.rateLimitPerMin,
  );
  const nextMaxTokens = toPositiveInteger(
    updates.maxTokens ?? updates.max_tokens_per_day,
    existing.maxTokensPerDay,
  );

  if (!nextName) {
    throw new Error('name is required');
  }

  getDb().prepare(
    `
    UPDATE apps
    SET name = ?,
        description = ?,
        status = ?,
        rate_limit_per_min = ?,
        max_tokens_per_day = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(
    nextName,
    nextDescription,
    nextStatus,
    nextRateLimit,
    nextMaxTokens,
    normalizeText(appId),
  );

  return getAppById(appId);
};

export const deleteApp = (appId = '') => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId || !getAppById(normalizedAppId)) {
    return false;
  }

  const result = getDb().prepare(
    `
    UPDATE apps
    SET status = 'deleted',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(normalizedAppId);

  return result.changes > 0;
};

export const recordUsage = (appId = '', apiCalls = 1, tokensUsed = 0) => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId) {
    return null;
  }

  const normalizedApiCalls = Math.max(0, Number(apiCalls) || 0);
  const normalizedTokensUsed = Math.max(0, Number(tokensUsed) || 0);
  const date = todayDate();

  getDb().prepare(
    `
    INSERT INTO app_usage (app_id, date, api_calls, tokens_used)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(app_id, date) DO UPDATE SET
      api_calls = api_calls + excluded.api_calls,
      tokens_used = tokens_used + excluded.tokens_used
    `,
  ).run(normalizedAppId, date, normalizedApiCalls, normalizedTokensUsed);

  return getDb()
    .prepare('SELECT * FROM app_usage WHERE app_id = ? AND date = ?')
    .get(normalizedAppId, date);
};

export const getAppUsage = (appId = '', startDate = '', endDate = '') => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId) {
    return [];
  }

  const start = normalizeText(startDate) || todayDate();
  const end = normalizeText(endDate) || start;

  return getDb()
    .prepare(
      `
      SELECT * FROM app_usage
      WHERE app_id = ?
        AND date >= ?
        AND date <= ?
      ORDER BY date ASC
      `,
    )
    .all(normalizedAppId, start, end)
    .map(mapUsage);
};

export const checkQuota = (appId = '') => {
  cleanupRateLimitBuckets();

  const app = getAppById(appId);
  if (!app) {
    return {
      allowed: false,
      reason: 'not_found',
      remaining: 0,
    };
  }

  const todayUsage = getDb()
    .prepare('SELECT * FROM app_usage WHERE app_id = ? AND date = ?')
    .get(app.id, todayDate());
  const tokensUsedToday = Number(todayUsage?.tokens_used || 0);

  if (tokensUsedToday >= app.maxTokensPerDay) {
    return {
      allowed: false,
      reason: 'token_quota',
      remaining: 0,
      tokensUsedToday,
    };
  }

  const bucketKey = `${app.id}:${currentMinuteKey()}`;
  const currentCount = Number(rateLimitBuckets.get(bucketKey) || 0);

  if (currentCount >= app.rateLimitPerMin) {
    return {
      allowed: false,
      reason: 'rate_limit',
      remaining: 0,
      tokensUsedToday,
    };
  }

  rateLimitBuckets.set(bucketKey, currentCount + 1);

  return {
    allowed: true,
    reason: '',
    remaining: Math.max(0, app.rateLimitPerMin - currentCount - 1),
    tokensUsedToday,
  };
};
