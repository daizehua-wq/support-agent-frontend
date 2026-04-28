import fs from 'fs';
import net from 'net';
import { getDb, getDbPath } from '../data/database.js';
import { readSettings } from './settingsService.js';
import { getContextStoreSummary } from './sessionService.js';
import { nowLocalIso } from '../utils/localTime.js';

const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_PROBE_TIMEOUT_MS = 800;

const normalizeText = (value = '') => String(value || '').trim();

const normalizeDatabaseType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'postgresql') return 'postgres';
  return normalized || 'sqlite';
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const readDatabaseSettings = () => {
  const settings = readSettings();
  const database = settings.database || {};
  const databaseType = normalizeDatabaseType(
    process.env.AP_DATABASE_TYPE ||
      process.env.DATABASE_TYPE ||
      database.databaseType ||
      database.dbType ||
      'sqlite',
  );

  return {
    databaseType,
    host: normalizeText(process.env.POSTGRES_HOST || database.host),
    port: toPositiveInteger(process.env.POSTGRES_PORT || database.port, DEFAULT_POSTGRES_PORT),
    databaseName: normalizeText(
      process.env.POSTGRES_DATABASE ||
        process.env.POSTGRES_DB ||
        database.databaseName ||
        database.dbName ||
        'sales_support_agent',
    ),
    username: normalizeText(process.env.POSTGRES_USERNAME || process.env.POSTGRES_USER || database.username),
    passwordConfigured: Boolean(
      normalizeText(process.env.POSTGRES_PASSWORD || database.password),
    ),
  };
};

const probeTcp = ({ host = '', port = 0, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS } = {}) => {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve({
        reachable: false,
        reason: 'missing-host-or-port',
      });
      return;
    }

    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (payload) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ reachable: true, reason: 'tcp-ready' }));
    socket.once('timeout', () => finish({ reachable: false, reason: 'tcp-timeout' }));
    socket.once('error', (error) =>
      finish({
        reachable: false,
        reason: error?.code || 'tcp-error',
        message: normalizeText(error?.message),
      }),
    );
  });
};

const probePostgresQuery = async ({
  host = '',
  port = DEFAULT_POSTGRES_PORT,
  databaseName = '',
  username = '',
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
} = {}) => {
  const password = process.env.POSTGRES_PASSWORD || readSettings()?.database?.password || '';

  if (!host || !databaseName || !username) {
    return {
      reachable: false,
      reason: 'missing-postgres-credentials',
    };
  }

  let client = null;
  try {
    const pgModule = await import('pg');
    client = new pgModule.Client({
      host,
      port,
      database: databaseName,
      user: username,
      password,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
    });
    await client.connect();
    await client.query('SELECT 1 AS ready');

    return {
      reachable: true,
      reason: 'query-ready',
    };
  } catch (error) {
    return {
      reachable: false,
      reason: 'query-failed',
      message: normalizeText(error?.message),
    };
  } finally {
    try {
      await client?.end?.();
    } catch {
      // noop
    }
  }
};

const getSqliteSummary = () => {
  const dbPath = getDbPath();
  const db = getDb();
  const tables = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
      `,
    )
    .all()
    .map((row) => row.name);

  return {
    active: true,
    database: dbPath,
    fileExists: fs.existsSync(dbPath),
    tableCount: tables.length,
    tables,
  };
};

export const getStorageHealthSnapshot = async ({ probeExternal = false } = {}) => {
  const databaseSettings = readDatabaseSettings();
  const sqlite = getSqliteSummary();
  const contextStore = await getContextStoreSummary();
  const postgresConfigured =
    databaseSettings.databaseType === 'postgres' ||
    Boolean(databaseSettings.host && databaseSettings.username);
  const postgresTcp =
    probeExternal && postgresConfigured
      ? await probeTcp({
          host: databaseSettings.host,
          port: databaseSettings.port,
        })
      : {
          reachable: false,
          reason: postgresConfigured ? 'probe-skipped' : 'not-configured',
        };
  const postgresQuery =
    probeExternal && postgresConfigured && postgresTcp.reachable
      ? await probePostgresQuery(databaseSettings)
      : {
          reachable: false,
          reason:
            postgresTcp.reason === 'tcp-ready'
              ? 'query-skipped'
              : postgresTcp.reason || 'not-configured',
        };
  const redisReady = contextStore.activeStore === 'redis';
  const postgresReady = postgresQuery.reachable === true;

  return {
    contractVersion: 'p2_5-storage-health/v1',
    checkedAt: nowLocalIso(),
    activeStore: 'sqlite',
    targetStore: databaseSettings.databaseType,
    readiness:
      postgresReady && redisReady
        ? 'production-storage-ready'
        : postgresConfigured
          ? 'production-storage-preflight-required'
          : 'sqlite-mvp-active',
    sqlite,
    redis: contextStore,
    postgres: {
      configured: postgresConfigured,
      host: databaseSettings.host,
      port: databaseSettings.port,
      databaseName: databaseSettings.databaseName,
      username: databaseSettings.username,
      passwordConfigured: databaseSettings.passwordConfigured,
      tcp: postgresTcp,
      query: postgresQuery,
    },
    migrationGate: {
      canSwitchPrimaryStore: postgresReady && redisReady,
      blockers: [
        ...(postgresReady ? [] : ['postgres-not-ready']),
        ...(redisReady ? [] : ['redis-context-store-not-ready']),
      ],
    },
  };
};

export const buildStorageMigrationPlan = async () => {
  const snapshot = await getStorageHealthSnapshot({ probeExternal: false });

  return {
    contractVersion: 'p2_5-storage-migration-plan/v1',
    generatedAt: nowLocalIso(),
    source: {
      type: 'sqlite',
      database: snapshot.sqlite.database,
      tables: snapshot.sqlite.tables,
    },
    target: {
      type: 'postgres',
      configured: snapshot.postgres.configured,
      host: snapshot.postgres.host,
      port: snapshot.postgres.port,
      databaseName: snapshot.postgres.databaseName,
    },
    phases: [
      {
        id: 'preflight',
        status: snapshot.postgres.configured ? 'ready-to-run' : 'blocked',
        requiredChecks: ['postgres tcp reachable', 'postgres SELECT 1', 'redis context store ready'],
      },
      {
        id: 'schema-create',
        status: 'planned',
        action: 'create PostgreSQL schema equivalent to current P2.5 SQLite tables',
      },
      {
        id: 'dual-write',
        status: 'planned',
        action: 'enable append-only dual write for sessions/messages/usage/model logs',
      },
      {
        id: 'backfill',
        status: 'planned',
        action: 'copy SQLite rows to PostgreSQL and compare table counts',
      },
      {
        id: 'read-switch',
        status: 'planned',
        action: 'switch reads after parity checks pass',
      },
      {
        id: 'rollback',
        status: 'planned',
        action: 'keep SQLite read path available until PostgreSQL parity is stable',
      },
    ],
    gate: snapshot.migrationGate,
  };
};

export default {
  buildStorageMigrationPlan,
  getStorageHealthSnapshot,
};
