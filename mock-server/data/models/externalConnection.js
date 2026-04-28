import { randomBytes, randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const envKeyForProvider = (provider = '') => {
  return `KEY_${normalizeText(provider).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
};

const mapConnection = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider || '',
    api_key_ref: row.api_key_ref || '',
    apiKeyRef: row.api_key_ref || '',
    has_api_key: Number(row.has_api_key || 0),
    hasApiKey: Boolean(row.has_api_key),
    is_active: Number(row.is_active || 0),
    isActive: Boolean(row.is_active),
    health_status: row.health_status || 'unknown',
    healthStatus: row.health_status || 'unknown',
    last_checked_at: row.last_checked_at || '',
    lastCheckedAt: row.last_checked_at || '',
    health_message: row.health_message || '',
    healthMessage: row.health_message || '',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
  };
};

const generateApiKeyRef = (provider = '') => {
  const suffix = randomBytes(8).toString('hex');
  return `key_${normalizeText(provider) || 'external'}_${suffix}`;
};

export const getAllConnections = () => {
  return getDb()
    .prepare('SELECT * FROM external_connections ORDER BY provider ASC')
    .all()
    .map(mapConnection);
};

export const getConnection = (provider = '') => {
  const normalizedProvider = normalizeText(provider).toLowerCase();
  if (!normalizedProvider) {
    return null;
  }

  return mapConnection(
    getDb().prepare('SELECT * FROM external_connections WHERE provider = ?').get(normalizedProvider),
  );
};

export const addConnection = (provider = '', apiKey = '') => {
  const db = getDb();
  const normalizedProvider = normalizeText(provider).toLowerCase();
  const normalizedApiKey = normalizeText(apiKey);

  if (!normalizedProvider) {
    throw new Error('provider is required');
  }

  const existing = getConnection(normalizedProvider);
  const apiKeyRef = existing?.api_key_ref || generateApiKeyRef(normalizedProvider);
  const envKey = envKeyForProvider(normalizedProvider);

  if (normalizedApiKey) {
    process.env[envKey] = normalizedApiKey;
  }

  db.prepare(
    `
    INSERT INTO external_connections (id, provider, api_key_ref, has_api_key, is_active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(provider) DO UPDATE SET
      api_key_ref = excluded.api_key_ref,
      has_api_key = excluded.has_api_key,
      is_active = 1
    `,
  ).run(
    existing?.id || randomUUID(),
    normalizedProvider,
    apiKeyRef,
    normalizedApiKey ? 1 : Number(existing?.has_api_key || 0),
  );

  return getConnection(normalizedProvider);
};

export const updateConnectionStatus = (id = '', isActive = true) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const result = getDb()
    .prepare('UPDATE external_connections SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, normalizedId);

  if (result.changes === 0) {
    return null;
  }

  return mapConnection(
    getDb().prepare('SELECT * FROM external_connections WHERE id = ?').get(normalizedId),
  );
};

export const testConnectionHealth = (id = '') => {
  const db = getDb();
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = db.prepare('SELECT * FROM external_connections WHERE id = ?').get(normalizedId);
  if (!existing) {
    return null;
  }

  let healthStatus = 'healthy';
  let healthMessage = 'connection is active and api key is configured';

  if (!Number(existing.is_active || 0)) {
    healthStatus = 'inactive';
    healthMessage = 'connection is disabled';
  } else if (!Number(existing.has_api_key || 0)) {
    healthStatus = 'unhealthy';
    healthMessage = 'api key is missing';
  } else if (!normalizeText(process.env[envKeyForProvider(existing.provider)])) {
    healthStatus = 'degraded';
    healthMessage = 'api key reference exists but runtime secret is not loaded';
  }

  db.prepare(
    `
    UPDATE external_connections
    SET health_status = ?,
        last_checked_at = CURRENT_TIMESTAMP,
        health_message = ?
    WHERE id = ?
    `,
  ).run(healthStatus, healthMessage, normalizedId);

  return mapConnection(db.prepare('SELECT * FROM external_connections WHERE id = ?').get(normalizedId));
};

export const deleteConnection = (id = '') => {
  const db = getDb();
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return false;
  }

  const existing = db.prepare('SELECT * FROM external_connections WHERE id = ?').get(normalizedId);
  if (!existing) {
    return false;
  }

  delete process.env[envKeyForProvider(existing.provider)];
  db.prepare('DELETE FROM external_connections WHERE id = ?').run(normalizedId);
  return true;
};

export const getConnectionApiKey = (provider = '') => {
  const connection = getConnection(provider);
  if (!connection?.isActive || !connection.hasApiKey) {
    return '';
  }

  return normalizeText(process.env[envKeyForProvider(connection.provider)]);
};
