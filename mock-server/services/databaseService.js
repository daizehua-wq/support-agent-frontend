import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { nowLocalIso } from '../utils/localTime.js';

const { Client: PgClient } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const dataDir = path.join(projectRoot, 'data');

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

export const normalizeDatabaseType = (databaseType = 'sqlite') => {
  const normalizedType = String(databaseType || 'sqlite').trim().toLowerCase();

  if (!normalizedType) {
    return 'sqlite';
  }

  if (normalizedType === 'postgresql') {
    return 'postgres';
  }

  if (normalizedType === 'sqlite3') {
    return 'sqlite';
  }

  return normalizedType;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseJsonRecord = (value, fallback = {}) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(value);
    return isPlainObject(parsedValue) ? parsedValue : fallback;
  } catch (_error) {
    return fallback;
  }
};

const normalizeStoredDatabaseList = (databaseConfigs = [], fallbackDatabase = {}) => {
  const normalizedDatabases = Array.isArray(databaseConfigs)
    ? databaseConfigs.filter((item) => isPlainObject(item))
    : [];

  if (normalizedDatabases.length > 0) {
    return normalizedDatabases;
  }

  if (isPlainObject(fallbackDatabase) && Object.keys(fallbackDatabase).length > 0) {
    return [fallbackDatabase];
  }

  return [];
};

const getDefaultPort = (dbType = 'sqlite') => {
  if (dbType === 'mysql') {
    return '3306';
  }

  if (dbType === 'postgres') {
    return '5432';
  }

  return '';
};

const normalizeTimeoutMs = (value, fallback = 5000) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const sanitizeSqliteFilename = (databaseName = 'sales_support_agent') => {
  const normalizedName = String(databaseName || 'sales_support_agent').trim();
  const safeName = normalizedName.replace(/[\\/:*?"<>|]/g, '_');
  return safeName || 'sales_support_agent';
};

const resolveSqliteFile = (databaseConfig = {}) => {
  const normalizedPath =
    databaseConfig.path || databaseConfig.databaseFile || databaseConfig.filename || '';

  if (normalizedPath) {
    return path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.join(projectRoot, normalizedPath);
  }

  const databaseName = sanitizeSqliteFilename(databaseConfig.databaseName || 'sales_support_agent');
  return path.join(dataDir, `${databaseName}.db`);
};

const openSqliteDatabase = (dbFile) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });

const runSqlite = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });

const getSqlite = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });

const allSqlite = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Array.isArray(rows) ? rows : []);
    });
  });

const closeSqlite = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const buildMysqlConnectionConfig = (databaseConfig = {}, databaseOverride = undefined) => ({
  host: databaseConfig.host || '127.0.0.1',
  port: Number(databaseConfig.port || 3306),
  user: databaseConfig.username || databaseConfig.user || '',
  password: databaseConfig.password || '',
  connectTimeout: normalizeTimeoutMs(databaseConfig.connectionTimeoutMs),
  database: databaseOverride === undefined ? databaseConfig.databaseName || undefined : databaseOverride,
});

const buildMysqlAdminConnectionConfig = (databaseConfig = {}) => {
  const adminUsername = databaseConfig.adminUsername || databaseConfig.adminUser || '';
  const useDedicatedAdminCredentials = Boolean(adminUsername);

  return {
    ...buildMysqlConnectionConfig(
      {
        ...databaseConfig,
        username:
          adminUsername || databaseConfig.username || databaseConfig.user || '',
        password: useDedicatedAdminCredentials
          ? databaseConfig.adminPassword || databaseConfig.password || ''
          : databaseConfig.password || '',
      },
      undefined,
    ),
    database: undefined,
  };
};

const buildPostgresConnectionConfig = (databaseConfig = {}, databaseOverride = undefined) => ({
  host: databaseConfig.host || '127.0.0.1',
  port: Number(databaseConfig.port || 5432),
  user: databaseConfig.username || databaseConfig.user || '',
  password: databaseConfig.password || '',
  connectionTimeoutMillis: normalizeTimeoutMs(databaseConfig.connectionTimeoutMs),
  database: databaseOverride === undefined ? databaseConfig.databaseName || undefined : databaseOverride,
});

const buildPostgresAdminConnectionConfig = (databaseConfig = {}) => {
  const adminUsername = databaseConfig.adminUsername || databaseConfig.adminUser || '';
  const useDedicatedAdminCredentials = Boolean(adminUsername);

  return {
    ...buildPostgresConnectionConfig(
      {
        ...databaseConfig,
        username:
          adminUsername || databaseConfig.username || databaseConfig.user || '',
        password: useDedicatedAdminCredentials
          ? databaseConfig.adminPassword || databaseConfig.password || ''
          : databaseConfig.password || '',
      },
      databaseConfig.adminDatabase || databaseConfig.maintenanceDatabase || 'postgres',
    ),
  };
};

const ensureDatabaseNameValue = (databaseConfig = {}) => {
  const databaseName = String(databaseConfig.databaseName || '').trim();

  if (!databaseName) {
    throw new Error('databaseName is required');
  }

  if (/[\u0000-\u001f]/.test(databaseName)) {
    throw new Error('databaseName contains unsupported control characters');
  }

  if (databaseName.length > 128) {
    throw new Error('databaseName is too long');
  }

  return databaseName;
};

const quoteMysqlIdentifier = (identifier = '') => `\`${String(identifier).replace(/`/g, '``')}\``;

const quotePostgresIdentifier = (identifier = '') =>
  `"${String(identifier).replace(/"/g, '""')}"`;

const MYSQL_PROTECTED_DATABASES = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
]);

const POSTGRES_PROTECTED_DATABASES = new Set(['postgres', 'template0', 'template1']);

const isProtectedDatabaseName = (dbType = 'sqlite', databaseName = '') => {
  const normalizedName = String(databaseName || '').trim().toLowerCase();

  if (!normalizedName) {
    return false;
  }

  if (dbType === 'mysql') {
    return MYSQL_PROTECTED_DATABASES.has(normalizedName);
  }

  if (dbType === 'postgres') {
    return POSTGRES_PROTECTED_DATABASES.has(normalizedName);
  }

  return false;
};

const createSqliteClient = async (databaseConfig = {}) => {
  ensureDataDir();
  const dbFile = resolveSqliteFile(databaseConfig);
  const db = await openSqliteDatabase(dbFile);

  return {
    dbType: 'sqlite',
    metadata: {
      dbFile,
    },
    queryOne(sql, params = []) {
      return getSqlite(db, sql, params);
    },
    queryAll(sql, params = []) {
      return allSqlite(db, sql, params);
    },
    execute(sql, params = []) {
      return runSqlite(db, sql, params);
    },
    close() {
      return closeSqlite(db);
    },
  };
};

const createMysqlClient = async (databaseConfig = {}, databaseOverride = undefined) => {
  const connection = await mysql.createConnection(
    buildMysqlConnectionConfig(databaseConfig, databaseOverride),
  );

  return {
    dbType: 'mysql',
    metadata: {
      host: databaseConfig.host || '',
      port: String(databaseConfig.port || 3306),
      databaseName:
        databaseOverride === undefined ? databaseConfig.databaseName || '' : databaseOverride || '',
    },
    async queryOne(sql, params = []) {
      const [rows] = await connection.execute(sql, params);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    },
    async queryAll(sql, params = []) {
      const [rows] = await connection.execute(sql, params);
      return Array.isArray(rows) ? rows : [];
    },
    execute(sql, params = []) {
      return connection.execute(sql, params);
    },
    close() {
      return connection.end();
    },
  };
};

const createMysqlAdminClient = async (databaseConfig = {}) => {
  const connection = await mysql.createConnection(buildMysqlAdminConnectionConfig(databaseConfig));

  return {
    async queryOne(sql, params = []) {
      const [rows] = await connection.execute(sql, params);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    },
    execute(sql, params = []) {
      return connection.execute(sql, params);
    },
    close() {
      return connection.end();
    },
  };
};

const createPostgresClient = async (databaseConfig = {}, databaseOverride = undefined) => {
  const client = new PgClient(buildPostgresConnectionConfig(databaseConfig, databaseOverride));
  await client.connect();

  return {
    dbType: 'postgres',
    metadata: {
      host: databaseConfig.host || '',
      port: String(databaseConfig.port || 5432),
      databaseName:
        databaseOverride === undefined ? databaseConfig.databaseName || '' : databaseOverride || '',
    },
    async queryOne(sql, params = []) {
      const result = await client.query(sql, params);
      return Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    },
    async queryAll(sql, params = []) {
      const result = await client.query(sql, params);
      return Array.isArray(result.rows) ? result.rows : [];
    },
    execute(sql, params = []) {
      return client.query(sql, params);
    },
    close() {
      return client.end();
    },
  };
};

const createPostgresAdminClient = async (databaseConfig = {}) => {
  const client = new PgClient(buildPostgresAdminConnectionConfig(databaseConfig));
  await client.connect();

  return {
    async queryOne(sql, params = []) {
      const result = await client.query(sql, params);
      return Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    },
    execute(sql, params = []) {
      return client.query(sql, params);
    },
    close() {
      return client.end();
    },
  };
};

const createDatabaseClient = async (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  if (normalizedConfig.dbType === 'sqlite') {
    return createSqliteClient(normalizedConfig);
  }

  if (normalizedConfig.dbType === 'mysql') {
    return createMysqlClient(normalizedConfig);
  }

  if (normalizedConfig.dbType === 'postgres') {
    return createPostgresClient(normalizedConfig);
  }

  throw new Error(`Unsupported database type: ${normalizedConfig.dbType}`);
};

const ensureSystemSettingsTable = async (client, databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  if (normalizedConfig.dbType === 'sqlite') {
    await client.execute(
      `
        CREATE TABLE IF NOT EXISTS system_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          database_json TEXT NOT NULL,
          model_json TEXT NOT NULL,
          strategy_json TEXT NOT NULL,
          assistant_json TEXT NOT NULL DEFAULT '{}',
          search_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        )
      `,
    );

    const columns = await client.queryAll('PRAGMA table_info(system_settings)');
    if (!columns.some((column) => column.name === 'assistant_json')) {
      await client.execute(
        "ALTER TABLE system_settings ADD COLUMN assistant_json TEXT NOT NULL DEFAULT '{}'",
      );
    }

    if (!columns.some((column) => column.name === 'search_json')) {
      await client.execute(
        "ALTER TABLE system_settings ADD COLUMN search_json TEXT NOT NULL DEFAULT '{}'",
      );
    }

    return;
  }

  if (normalizedConfig.dbType === 'mysql') {
    await client.execute(
      `
        CREATE TABLE IF NOT EXISTS system_settings (
          id INT PRIMARY KEY,
          database_json LONGTEXT NOT NULL,
          model_json LONGTEXT NOT NULL,
          strategy_json LONGTEXT NOT NULL,
          assistant_json LONGTEXT,
          search_json LONGTEXT,
          updated_at VARCHAR(64) NOT NULL
        )
      `,
    );

    const columns = await client.queryAll(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'system_settings'
          AND COLUMN_NAME = ?
      `,
      ['assistant_json'],
    );

    if (columns.length === 0) {
      await client.execute('ALTER TABLE system_settings ADD COLUMN assistant_json LONGTEXT NULL');
      await client.execute(
        "UPDATE system_settings SET assistant_json = '{}' WHERE assistant_json IS NULL",
      );
    }

    const searchColumns = await client.queryAll(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'system_settings'
          AND COLUMN_NAME = ?
      `,
      ['search_json'],
    );

    if (searchColumns.length === 0) {
      await client.execute('ALTER TABLE system_settings ADD COLUMN search_json LONGTEXT NULL');
      await client.execute(
        "UPDATE system_settings SET search_json = '{}' WHERE search_json IS NULL",
      );
    }

    return;
  }

  if (normalizedConfig.dbType === 'postgres') {
    await client.execute(
      `
        CREATE TABLE IF NOT EXISTS system_settings (
          id INTEGER PRIMARY KEY,
          database_json TEXT NOT NULL,
          model_json TEXT NOT NULL,
          strategy_json TEXT NOT NULL,
          assistant_json TEXT NOT NULL DEFAULT '{}',
          search_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        )
      `,
    );

    const columns = await client.queryAll(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      `,
      ['system_settings', 'assistant_json'],
    );

    if (columns.length === 0) {
      await client.execute(
        "ALTER TABLE system_settings ADD COLUMN assistant_json TEXT NOT NULL DEFAULT '{}'",
      );
    }

    const searchColumns = await client.queryAll(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      `,
      ['system_settings', 'search_json'],
    );

    if (searchColumns.length === 0) {
      await client.execute(
        "ALTER TABLE system_settings ADD COLUMN search_json TEXT NOT NULL DEFAULT '{}'",
      );
    }
  }
};

const remoteDatabaseExists = async (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  const databaseName = ensureDatabaseNameValue(normalizedConfig);

  if (normalizedConfig.dbType === 'sqlite') {
    return {
      exists: fs.existsSync(resolveSqliteFile(normalizedConfig)),
      databaseFile: resolveSqliteFile(normalizedConfig),
    };
  }

  let adminClient = null;

  try {
    if (normalizedConfig.dbType === 'mysql') {
      adminClient = await createMysqlAdminClient(normalizedConfig);
      const row = await adminClient.queryOne(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [databaseName],
      );

      return {
        exists: Boolean(row),
        databaseName,
      };
    }

    if (normalizedConfig.dbType === 'postgres') {
      adminClient = await createPostgresAdminClient(normalizedConfig);
      const row = await adminClient.queryOne('SELECT datname FROM pg_database WHERE datname = $1', [
        databaseName,
      ]);

      return {
        exists: Boolean(row),
        databaseName,
      };
    }

    throw new Error(`Unsupported database type: ${normalizedConfig.dbType}`);
  } finally {
    await closeClientSafely(adminClient);
  }
};

const closeClientSafely = async (client) => {
  if (!client || typeof client.close !== 'function') {
    return;
  }

  try {
    await client.close();
  } catch (_error) {
    // no-op
  }
};

const buildSettingsDatabasePayload = (settings = {}) => ({
  database: isPlainObject(settings.database) ? settings.database : {},
  databases: Array.isArray(settings.databases)
    ? settings.databases.filter((item) => isPlainObject(item))
    : [],
});

const getStoredPrimaryDatabase = (parsedDatabasePayload = {}) => {
  if (isPlainObject(parsedDatabasePayload.database)) {
    return parsedDatabasePayload.database;
  }

  const looksLikeDatabaseRecord =
    isPlainObject(parsedDatabasePayload) &&
    [
      'databaseId',
      'databaseName',
      'databaseType',
      'dbType',
      'host',
      'port',
      'username',
      'password',
      'path',
    ].some((key) => key in parsedDatabasePayload);

  return looksLikeDatabaseRecord ? parsedDatabasePayload : {};
};

export const initDatabase = async (databaseConfig = {}) => {
  const client = await createDatabaseClient(databaseConfig);

  try {
    await ensureSystemSettingsTable(client, databaseConfig);
    return client;
  } catch (error) {
    await closeClientSafely(client);
    throw error;
  }
};

export const testDatabaseConnection = async (databaseConfig = {}) => {
  const checkedAt = nowLocalIso();
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  let client = null;

  try {
    client = await createDatabaseClient(normalizedConfig);

    if (normalizedConfig.dbType === 'postgres') {
      await client.queryOne('SELECT 1 as ok');
    } else {
      await client.queryOne('SELECT 1 as ok');
    }

    return {
      success: true,
      databaseType: normalizedConfig.dbType,
      databaseFile:
        normalizedConfig.dbType === 'sqlite' ? resolveSqliteFile(normalizedConfig) : '',
      connectionStatus: 'connected',
      availabilityStatus: 'available',
      lastCheckedAt: checkedAt,
      healthMessage: '连接正常',
    };
  } catch (error) {
    return {
      success: false,
      databaseType: normalizedConfig.dbType,
      databaseFile:
        normalizedConfig.dbType === 'sqlite' ? resolveSqliteFile(normalizedConfig) : '',
      connectionStatus: 'disconnected',
      availabilityStatus: 'unavailable',
      lastCheckedAt: checkedAt,
      healthMessage: error?.message || '连接异常',
    };
  } finally {
    await closeClientSafely(client);
  }
};

export const createPhysicalDatabase = async (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  const databaseName = ensureDatabaseNameValue(normalizedConfig);

  if (isProtectedDatabaseName(normalizedConfig.dbType, databaseName)) {
    return {
      created: false,
      existed: true,
      databaseType: normalizedConfig.dbType,
      databaseName,
      blocked: true,
      reason: 'protected-system-database',
    };
  }

  if (normalizedConfig.dbType === 'sqlite') {
    ensureDataDir();
    const sqliteFile = resolveSqliteFile(normalizedConfig);

    if (fs.existsSync(sqliteFile)) {
      return {
        created: false,
        existed: true,
        databaseType: normalizedConfig.dbType,
        databaseName,
        databaseFile: sqliteFile,
      };
    }

    let sqliteClient = null;

    try {
      sqliteClient = await createSqliteClient(normalizedConfig);
      return {
        created: true,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
        databaseFile: sqliteFile,
      };
    } finally {
      await closeClientSafely(sqliteClient);
    }
  }

  if (normalizedConfig.dbType === 'mysql') {
    const existingState = await remoteDatabaseExists(normalizedConfig);

    if (existingState.exists) {
      return {
        created: false,
        existed: true,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    }

    let adminClient = null;

    try {
      adminClient = await createMysqlAdminClient(normalizedConfig);
      await adminClient.execute(`CREATE DATABASE ${quoteMysqlIdentifier(databaseName)}`);

      return {
        created: true,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    } finally {
      await closeClientSafely(adminClient);
    }
  }

  if (normalizedConfig.dbType === 'postgres') {
    const existingState = await remoteDatabaseExists(normalizedConfig);

    if (existingState.exists) {
      return {
        created: false,
        existed: true,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    }

    let adminClient = null;

    try {
      adminClient = await createPostgresAdminClient(normalizedConfig);
      await adminClient.execute(`CREATE DATABASE ${quotePostgresIdentifier(databaseName)}`);

      return {
        created: true,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    } finally {
      await closeClientSafely(adminClient);
    }
  }

  throw new Error(`Unsupported database type: ${normalizedConfig.dbType}`);
};

export const deletePhysicalDatabase = async (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  const databaseName = ensureDatabaseNameValue(normalizedConfig);

  if (isProtectedDatabaseName(normalizedConfig.dbType, databaseName)) {
    return {
      deleted: false,
      existed: true,
      databaseType: normalizedConfig.dbType,
      databaseName,
      blocked: true,
      reason: 'protected-system-database',
    };
  }

  if (normalizedConfig.dbType === 'sqlite') {
    const sqliteFile = resolveSqliteFile(normalizedConfig);

    if (!fs.existsSync(sqliteFile)) {
      return {
        deleted: false,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
        databaseFile: sqliteFile,
      };
    }

    fs.unlinkSync(sqliteFile);

    return {
      deleted: true,
      existed: true,
      databaseType: normalizedConfig.dbType,
      databaseName,
      databaseFile: sqliteFile,
    };
  }

  if (normalizedConfig.dbType === 'mysql') {
    const existingState = await remoteDatabaseExists(normalizedConfig);

    if (!existingState.exists) {
      return {
        deleted: false,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    }

    let adminClient = null;

    try {
      adminClient = await createMysqlAdminClient(normalizedConfig);
      await adminClient.execute(`DROP DATABASE ${quoteMysqlIdentifier(databaseName)}`);

      return {
        deleted: true,
        existed: true,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    } finally {
      await closeClientSafely(adminClient);
    }
  }

  if (normalizedConfig.dbType === 'postgres') {
    const existingState = await remoteDatabaseExists(normalizedConfig);

    if (!existingState.exists) {
      return {
        deleted: false,
        existed: false,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    }

    let adminClient = null;

    try {
      adminClient = await createPostgresAdminClient(normalizedConfig);
      await adminClient.execute(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await adminClient.execute(`DROP DATABASE ${quotePostgresIdentifier(databaseName)}`);

      return {
        deleted: true,
        existed: true,
        databaseType: normalizedConfig.dbType,
        databaseName,
      };
    } finally {
      await closeClientSafely(adminClient);
    }
  }

  throw new Error(`Unsupported database type: ${normalizedConfig.dbType}`);
};

const normalizeDatabaseConfig = (databaseConfig = {}) => {
  const dbType = normalizeDatabaseType(
    databaseConfig.dbType || databaseConfig.databaseType || 'sqlite',
  );
  const databaseId =
    databaseConfig.databaseId ||
    databaseConfig.id ||
    databaseConfig.databaseName ||
    'sales_support_agent';
  const databaseName = databaseConfig.databaseName || databaseId || 'sales_support_agent';
  const description =
    databaseConfig.description ||
    '当前用于承接销售支持 Agent 配置与运行数据的数据库对象。';

  return {
    databaseId,
    databaseName,
    dbType,
    databaseType: dbType,
    host: databaseConfig.host || '',
    port: String(databaseConfig.port || getDefaultPort(dbType)),
    username: databaseConfig.username || databaseConfig.user || '',
    password: databaseConfig.password || '',
    adminUsername: databaseConfig.adminUsername || databaseConfig.adminUser || '',
    adminPassword: databaseConfig.adminPassword || '',
    path: databaseConfig.path || databaseConfig.databaseFile || '',
    adminDatabase: databaseConfig.adminDatabase || '',
    maintenanceDatabase: databaseConfig.maintenanceDatabase || '',
    connectionTimeoutMs: normalizeTimeoutMs(databaseConfig.connectionTimeoutMs),
    environment: databaseConfig.environment || '',
    descriptionShort:
      databaseConfig.descriptionShort ||
      databaseConfig.databaseName ||
      description ||
      '数据库对象',
    description,
    bindingSource: databaseConfig.bindingSource || 'account-default',
    futurePermission: databaseConfig.futurePermission || null,
    futureDataScope: databaseConfig.futureDataScope || null,
    lightBindingSummary:
      databaseConfig.lightBindingSummary && typeof databaseConfig.lightBindingSummary === 'object'
        ? databaseConfig.lightBindingSummary
        : {},
  };
};

const normalizeDatabaseConfigs = (databaseConfigs = []) =>
  Array.isArray(databaseConfigs)
    ? databaseConfigs.filter((item) => item && typeof item === 'object')
    : [];

const findDatabaseConfigById = (databaseConfigs = [], databaseId = '') =>
  normalizeDatabaseConfigs(databaseConfigs).find(
    (item) => normalizeDatabaseConfig(item).databaseId === databaseId,
  );

export const buildDatabaseSummary = (databaseConfig = {}, status = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  return {
    databaseId: normalizedConfig.databaseId,
    databaseName: normalizedConfig.databaseName,
    dbType: normalizedConfig.dbType,
    connectionStatus: status.connectionStatus || 'unknown',
    availabilityStatus: status.availabilityStatus || 'unknown',
    descriptionShort: normalizedConfig.descriptionShort,
    host: normalizedConfig.host,
    port: normalizedConfig.port,
    username: normalizedConfig.username,
    adminUsername: normalizedConfig.adminUsername,
    hasPassword: Boolean(normalizedConfig.password),
    hasAdminPassword: Boolean(normalizedConfig.adminPassword),
  };
};

export const buildDatabaseDetail = (databaseConfig = {}, status = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  const summary = buildDatabaseSummary(databaseConfig, status);

  return {
    ...summary,
    databaseType: normalizedConfig.dbType,
    environment: normalizedConfig.environment,
    databaseFile:
      normalizedConfig.dbType === 'sqlite' ? resolveSqliteFile(normalizedConfig) : '',
    description: normalizedConfig.description,
    lastCheckedAt: status.lastCheckedAt || databaseConfig.lastCheckedAt || null,
    healthMessage: status.healthMessage || databaseConfig.healthMessage || '',
  };
};

export const buildDatabaseReference = (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  return {
    databaseId: normalizedConfig.databaseId,
    databaseName: normalizedConfig.databaseName,
    dbType: normalizedConfig.dbType,
    descriptionShort: normalizedConfig.descriptionShort,
  };
};

export const buildDatabaseRelationSummary = (
  databaseConfig = {},
  {
    relationType = 'default-database',
    bindingSource = null,
  } = {},
) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  return {
    databaseId: normalizedConfig.databaseId,
    databaseName: normalizedConfig.databaseName,
    relationType,
    bindingSource: bindingSource || normalizedConfig.bindingSource || 'account-default',
  };
};

export const buildAccountDatabaseBinding = (
  databaseConfig = {},
  accountId = 'default',
  databaseConfigs = [],
) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);
  const currentDatabase = buildDatabaseReference(databaseConfig);
  const lightBindingSummary = normalizedConfig.lightBindingSummary;
  const normalizedConfigs = normalizeDatabaseConfigs(databaseConfigs);

  const defaultDatabaseId =
    lightBindingSummary.defaultAssociatedDatabase || currentDatabase.databaseId;

  const resolvedDefaultConfig = findDatabaseConfigById(normalizedConfigs, defaultDatabaseId);

  const defaultDatabase = resolvedDefaultConfig
    ? buildDatabaseReference(resolvedDefaultConfig)
    : defaultDatabaseId === currentDatabase.databaseId
      ? currentDatabase
      : {
          databaseId: defaultDatabaseId,
          databaseName: defaultDatabaseId,
          dbType: '',
          descriptionShort: '',
        };

  const visibleDatabaseIds = Array.isArray(lightBindingSummary.visibleDatabases)
    ? lightBindingSummary.visibleDatabases
    : [defaultDatabase.databaseId].filter(Boolean);

  const visibleDatabases = visibleDatabaseIds.map((databaseId) => {
    const resolvedConfig = findDatabaseConfigById(normalizedConfigs, databaseId);

    if (resolvedConfig) {
      return buildDatabaseReference(resolvedConfig);
    }

    if (databaseId === currentDatabase.databaseId) {
      return currentDatabase;
    }

    if (databaseId === defaultDatabase.databaseId) {
      return defaultDatabase;
    }

    return {
      databaseId,
      databaseName: databaseId,
      dbType: '',
      descriptionShort: '',
    };
  });

  return {
    accountId,
    defaultDatabase,
    visibleDatabases,
    bindingSource: lightBindingSummary.relationSource || normalizedConfig.bindingSource,
  };
};

export const buildDatabaseReserved = (databaseConfig = {}) => {
  const normalizedConfig = normalizeDatabaseConfig(databaseConfig);

  return {
    futurePermission: normalizedConfig.futurePermission,
    futureDataScope: normalizedConfig.futureDataScope,
  };
};

export const getSettingsFromDatabase = async (defaultSettings, databaseConfig = {}) => {
  let client = null;

  try {
    client = await initDatabase(databaseConfig);
    const row = await client.queryOne('SELECT * FROM system_settings WHERE id = 1');

    if (!row) {
      return defaultSettings;
    }

    const parsedDatabasePayload = parseJsonRecord(row.database_json, {});
    const parsedModel = parseJsonRecord(row.model_json, {});
    const parsedStrategy = parseJsonRecord(row.strategy_json, {});
    const parsedAssistant = parseJsonRecord(row.assistant_json || '{}', {});
    const parsedSearch = parseJsonRecord(row.search_json || '{}', {});

    const defaultDatabase = isPlainObject(defaultSettings.database)
      ? defaultSettings.database
      : {};
    const storedPrimaryDatabase = getStoredPrimaryDatabase(parsedDatabasePayload);
    const defaultDatabases = normalizeStoredDatabaseList(
      defaultSettings.databases,
      defaultDatabase,
    );
    const storedDatabases = normalizeStoredDatabaseList(
      parsedDatabasePayload.databases,
      storedPrimaryDatabase,
    );
    const resolvedPrimaryDatabase =
      Object.keys(storedPrimaryDatabase).length > 0
        ? {
            ...defaultDatabase,
            ...storedPrimaryDatabase,
          }
        : storedDatabases[0]
          ? {
              ...defaultDatabase,
              ...storedDatabases[0],
            }
          : defaultDatabase;

    return {
      ...defaultSettings,
      database: resolvedPrimaryDatabase,
      databases: storedDatabases.length > 0 ? storedDatabases : defaultDatabases,
      model: {
        ...defaultSettings.model,
        ...parsedModel,
      },
      strategy: {
        ...defaultSettings.strategy,
        ...parsedStrategy,
      },
      assistant: {
        ...defaultSettings.assistant,
        ...parsedAssistant,
      },
      search: {
        ...defaultSettings.search,
        ...parsedSearch,
      },
    };
  } finally {
    await closeClientSafely(client);
  }
};

export const saveSettingsToDatabase = async (payload, defaultSettings, databaseConfig = {}) => {
  let client = null;

  try {
    client = await initDatabase(databaseConfig);
    const currentSettings = await getSettingsFromDatabase(defaultSettings, databaseConfig);
    const nextDatabase = {
      ...(currentSettings.database || {}),
      ...(payload.database || {}),
    };
    const nextDatabases = Array.isArray(payload.databases)
      ? payload.databases.filter((item) => isPlainObject(item))
      : normalizeStoredDatabaseList(currentSettings.databases, nextDatabase);

    const nextSettings = {
      ...currentSettings,
      database: nextDatabase,
      databases: nextDatabases,
      model: {
        ...currentSettings.model,
        ...(payload.model || {}),
      },
      strategy: {
        ...currentSettings.strategy,
        ...(payload.strategy || {}),
      },
      assistant: {
        ...currentSettings.assistant,
        ...(payload.assistant || {}),
      },
      search: {
        ...currentSettings.search,
        ...(payload.search || {}),
      },
    };
    const databasePayload = buildSettingsDatabasePayload(nextSettings);
    const updatedAt = nowLocalIso();

    if (normalizeDatabaseType(databaseConfig.dbType || databaseConfig.databaseType) === 'postgres') {
      await client.execute(
        `
          INSERT INTO system_settings (
            id,
            database_json,
            model_json,
            strategy_json,
            assistant_json,
            search_json,
            updated_at
          )
          VALUES (1, $1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            database_json = EXCLUDED.database_json,
            model_json = EXCLUDED.model_json,
            strategy_json = EXCLUDED.strategy_json,
            assistant_json = EXCLUDED.assistant_json,
            search_json = EXCLUDED.search_json,
            updated_at = EXCLUDED.updated_at
        `,
        [
          JSON.stringify(databasePayload),
          JSON.stringify(nextSettings.model),
          JSON.stringify(nextSettings.strategy),
          JSON.stringify(nextSettings.assistant || {}),
          JSON.stringify(nextSettings.search || {}),
          updatedAt,
        ],
      );
    } else if (
      normalizeDatabaseType(databaseConfig.dbType || databaseConfig.databaseType) === 'mysql'
    ) {
      await client.execute(
        `
          INSERT INTO system_settings (
            id,
            database_json,
            model_json,
            strategy_json,
            assistant_json,
            search_json,
            updated_at
          )
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            database_json = VALUES(database_json),
            model_json = VALUES(model_json),
            strategy_json = VALUES(strategy_json),
            assistant_json = VALUES(assistant_json),
            search_json = VALUES(search_json),
            updated_at = VALUES(updated_at)
        `,
        [
          JSON.stringify(databasePayload),
          JSON.stringify(nextSettings.model),
          JSON.stringify(nextSettings.strategy),
          JSON.stringify(nextSettings.assistant || {}),
          JSON.stringify(nextSettings.search || {}),
          updatedAt,
        ],
      );
    } else {
      await client.execute(
        `
          INSERT INTO system_settings (
            id,
            database_json,
            model_json,
            strategy_json,
            assistant_json,
            search_json,
            updated_at
          )
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            database_json = excluded.database_json,
            model_json = excluded.model_json,
            strategy_json = excluded.strategy_json,
            assistant_json = excluded.assistant_json,
            search_json = excluded.search_json,
            updated_at = excluded.updated_at
        `,
        [
          JSON.stringify(databasePayload),
          JSON.stringify(nextSettings.model),
          JSON.stringify(nextSettings.strategy),
          JSON.stringify(nextSettings.assistant || {}),
          JSON.stringify(nextSettings.search || {}),
          updatedAt,
        ],
      );
    }

    return nextSettings;
  } finally {
    await closeClientSafely(client);
  }
};
