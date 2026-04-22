import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

const parseCliArgs = (argv = []) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const normalizedToken = token.slice(2);

    if (normalizedToken.startsWith('no-')) {
      parsed[normalizedToken.slice(3)] = false;
      continue;
    }

    const equalIndex = normalizedToken.indexOf('=');
    if (equalIndex >= 0) {
      parsed[normalizedToken.slice(0, equalIndex)] = normalizedToken.slice(equalIndex + 1);
      continue;
    }

    const nextToken = argv[index + 1];
    if (nextToken && !nextToken.startsWith('--')) {
      parsed[normalizedToken] = nextToken;
      index += 1;
      continue;
    }

    parsed[normalizedToken] = true;
  }

  return parsed;
};

const cliArgs = parseCliArgs(args);

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const normalizeText = (value = '') => String(value || '').trim();

const parseEnvFile = (filePath = '') => {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return {};
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const envRecord = {};

  content.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      return;
    }

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();

    if (key) {
      envRecord[key] = value;
    }
  });

  return envRecord;
};

const readOption = ({ key, envKeys = [], envMap = {}, defaultValue = '' }) => {
  if (cliArgs[key] !== undefined) {
    return cliArgs[key];
  }

  for (const envKey of envKeys) {
    if (envMap[envKey] !== undefined && envMap[envKey] !== '') {
      return envMap[envKey];
    }

    if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
      return process.env[envKey];
    }
  }

  return defaultValue;
};

const envFilePath = normalizeText(
  readOption({
    key: 'env-file',
    envKeys: ['DB_ENTERPRISE_ENV_FILE'],
    defaultValue: 'config/database-enterprise.env',
  }),
);
const envFileValues = parseEnvFile(envFilePath);

const apiBaseUrl = normalizeText(
  readOption({
    key: 'api-base-url',
    envKeys: ['API_BASE_URL'],
    envMap: envFileValues,
    defaultValue: 'http://127.0.0.1:3001',
  }),
);

const requireAll = asBoolean(
  readOption({
    key: 'require-all',
    envKeys: ['DB_ENTERPRISE_REQUIRE_ALL'],
    envMap: envFileValues,
    defaultValue: 'false',
  }),
  false,
);

const skipMysql = asBoolean(
  readOption({
    key: 'skip-mysql',
    envKeys: ['DB_ENTERPRISE_SKIP_MYSQL'],
    envMap: envFileValues,
    defaultValue: 'false',
  }),
  false,
);

const skipPostgres = asBoolean(
  readOption({
    key: 'skip-postgres',
    envKeys: ['DB_ENTERPRISE_SKIP_POSTGRES'],
    envMap: envFileValues,
    defaultValue: 'false',
  }),
  false,
);

const reportDir = path.join(process.cwd(), 'mock-server', 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
const reportFile = path.join(
  reportDir,
  `database-enterprise-regression-${Date.now()}.json`,
);

const buildDbConfig = ({ dbType = '', prefix = '' } = {}) => {
  const normalizedDbType = normalizeText(dbType);
  const normalizedPrefix = normalizeText(prefix);

  const readPrefixed = (key = '', fallback = '') => {
    return normalizeText(
      readOption({
        key: `${normalizedDbType}-${key.replace(/_/g, '-')}`,
        envKeys: [`${normalizedPrefix}_${key}`],
        envMap: envFileValues,
        defaultValue: fallback,
      }),
    );
  };

  return {
    dbType: normalizedDbType,
    dbHost: readPrefixed('HOST'),
    dbPort: readPrefixed('PORT', normalizedDbType === 'mysql' ? '3306' : '5432'),
    dbUsername: readPrefixed('USERNAME'),
    dbPassword: readPrefixed('PASSWORD'),
    dbAdminUsername: readPrefixed('ADMIN_USERNAME'),
    dbAdminPassword: readPrefixed('ADMIN_PASSWORD'),
    dbName: readPrefixed('NAME', `enterprise_regression_${normalizedDbType}_${Date.now()}`),
    dbId: readPrefixed('ID', `enterprise-${normalizedDbType}-${Date.now()}`),
    dbEnvironment: readPrefixed('ENVIRONMENT', 'enterprise-regression'),
    dbDescription: readPrefixed('DESCRIPTION', `enterprise regression for ${normalizedDbType}`),
    accountId: readPrefixed('ACCOUNT_ID', `enterprise-${normalizedDbType}`),
    adminDatabase: readPrefixed('ADMIN_DATABASE', normalizedDbType === 'postgres' ? 'postgres' : ''),
    maintenanceDatabase: readPrefixed(
      'MAINTENANCE_DATABASE',
      normalizedDbType === 'postgres' ? 'postgres' : '',
    ),
  };
};

const mysqlConfig = buildDbConfig({ dbType: 'mysql', prefix: 'MYSQL' });
const postgresConfig = buildDbConfig({ dbType: 'postgres', prefix: 'POSTGRES' });

const isDbConfigReady = (config = {}) => {
  return Boolean(config.dbHost && config.dbPort && config.dbUsername);
};

const executeDbRegression = ({ config = {}, drySkip = false }) => {
  if (drySkip) {
    return {
      dbType: config.dbType,
      status: 'skipped',
      reason: 'skipped-by-flag',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      command: [],
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  if (!isDbConfigReady(config)) {
    return {
      dbType: config.dbType,
      status: 'skipped',
      reason: 'missing-runtime-credentials',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      command: [],
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  const commandArgs = [
    'scripts/database-api-integration.mjs',
    `--db-type=${config.dbType}`,
    `--db-host=${config.dbHost}`,
    `--db-port=${config.dbPort}`,
    `--db-username=${config.dbUsername}`,
    `--db-password=${config.dbPassword}`,
    `--db-admin-username=${config.dbAdminUsername}`,
    `--db-admin-password=${config.dbAdminPassword}`,
    `--db-name=${config.dbName}`,
    `--db-id=${config.dbId}`,
    `--db-environment=${config.dbEnvironment}`,
    `--db-description=${config.dbDescription}`,
    `--account-id=${config.accountId}`,
    `--api-base-url=${apiBaseUrl}`,
    '--exercise-settings-store=true',
  ];

  if (config.adminDatabase) {
    commandArgs.push(`--admin-database=${config.adminDatabase}`);
  }

  if (config.maintenanceDatabase) {
    commandArgs.push(`--maintenance-database=${config.maintenanceDatabase}`);
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const commandResult = spawnSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_BASE_URL: apiBaseUrl,
      DB_TYPE: config.dbType,
      DB_HOST: config.dbHost,
      DB_PORT: config.dbPort,
      DB_USERNAME: config.dbUsername,
      DB_PASSWORD: config.dbPassword,
      DB_ADMIN_USERNAME: config.dbAdminUsername,
      DB_ADMIN_PASSWORD: config.dbAdminPassword,
      DB_NAME: config.dbName,
      DB_ID: config.dbId,
      DB_ENVIRONMENT: config.dbEnvironment,
      DB_DESCRIPTION: config.dbDescription,
      DB_ACCOUNT_ID: config.accountId,
      DB_ADMIN_DATABASE: config.adminDatabase,
      DB_MAINTENANCE_DATABASE: config.maintenanceDatabase,
      EXERCISE_SETTINGS_STORE: 'true',
    },
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 10,
  });

  const completedAtMs = Date.now();
  const completedAt = new Date(completedAtMs).toISOString();
  const durationMs = Math.max(0, completedAtMs - startedAtMs);

  return {
    dbType: config.dbType,
    status: commandResult.status === 0 ? 'passed' : 'failed',
    reason: commandResult.status === 0 ? 'integration-pass' : 'integration-failed',
    startedAt,
    completedAt,
    durationMs,
    command: [process.execPath, ...commandArgs],
    stdout: String(commandResult.stdout || ''),
    stderr: String(commandResult.stderr || ''),
    exitCode: Number(commandResult.status ?? 1),
  };
};

const executionResults = [];
executionResults.push(
  executeDbRegression({
    config: mysqlConfig,
    drySkip: skipMysql,
  }),
);
executionResults.push(
  executeDbRegression({
    config: postgresConfig,
    drySkip: skipPostgres,
  }),
);

const configuredCount = executionResults.filter((item) => item.reason !== 'missing-runtime-credentials' && item.reason !== 'skipped-by-flag').length;
const passedCount = executionResults.filter((item) => item.status === 'passed').length;
const failedCount = executionResults.filter((item) => item.status === 'failed').length;
const skippedCount = executionResults.filter((item) => item.status === 'skipped').length;

const requireAllViolation =
  requireAll &&
  executionResults.some((item) => item.status !== 'passed');

const finalStatus =
  failedCount > 0 || requireAllViolation || configuredCount === 0
    ? 'failed'
    : 'passed';

const reportPayload = {
  contractVersion: 'database-enterprise-regression/v1',
  status: finalStatus,
  startedAt: new Date().toISOString(),
  apiBaseUrl,
  envFilePath: path.resolve(envFilePath),
  requireAll,
  summary: {
    configuredCount,
    passedCount,
    failedCount,
    skippedCount,
  },
  results: executionResults,
};

fs.writeFileSync(reportFile, `${JSON.stringify(reportPayload, null, 2)}\n`, 'utf-8');

if (finalStatus === 'passed') {
  console.log('[database-enterprise-regression] PASS', {
    configuredCount,
    passedCount,
    skippedCount,
    reportFile,
  });
  process.exit(0);
}

console.error('[database-enterprise-regression] FAIL', {
  configuredCount,
  failedCount,
  skippedCount,
  requireAll,
  reportFile,
});

if (configuredCount === 0) {
  console.error(
    '[database-enterprise-regression] no executable database target found. Please set MYSQL_* and/or POSTGRES_* in config/database-enterprise.env',
  );
}

process.exit(1);
