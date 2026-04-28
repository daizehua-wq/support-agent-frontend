import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  buildFileExistsCheck,
  buildPreflightCheck,
  buildPreflightPayload,
  buildRequiredValueCheck,
  hasFailedChecks,
  printPreflightReport,
  probeApiHealth,
  probeTcpEndpoint,
} from './lib/databaseRegressionPreflight.mjs';

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

const hasDbConfigHints = (config = {}) => {
  return Boolean(
    config.dbHost ||
      config.dbUsername ||
      config.dbPassword ||
      config.dbAdminUsername ||
      config.dbAdminPassword,
  );
};

const buildTargetPreflight = async ({ config = {}, drySkip = false, apiHealthCheck = null } = {}) => {
  if (drySkip) {
    return {
      dbType: config.dbType,
      runnable: false,
      reason: 'skipped-by-flag',
      payload: buildPreflightPayload({
        label: `${config.dbType}-preflight`,
        checks: [
          buildPreflightCheck({
            id: `${config.dbType}-skip-flag`,
            label: `${config.dbType} 回归开关`,
            status: 'skipped',
            detail: `已通过 --skip-${config.dbType} 或环境变量跳过。`,
          }),
        ],
      }),
    };
  }

  if (!hasDbConfigHints(config)) {
    return {
      dbType: config.dbType,
      runnable: false,
      reason: 'missing-runtime-credentials',
      payload: buildPreflightPayload({
        label: `${config.dbType}-preflight`,
        checks: [
          buildPreflightCheck({
            id: `${config.dbType}-credentials`,
            label: `${config.dbType} 运行参数`,
            status: 'warning',
            detail: `未检测到 ${config.dbType} 的运行参数，当前目标不会执行。`,
            hint: `请在 ${envFilePath} 或当前环境中补充 ${config.dbType.toUpperCase()}_* 配置。`,
          }),
        ],
      }),
    };
  }

  const checks = [
    buildRequiredValueCheck({
      id: `${config.dbType}-host`,
      label: `${config.dbType} 主机`,
      value: config.dbHost,
      reference: `${config.dbType.toUpperCase()}_HOST`,
    }),
    buildRequiredValueCheck({
      id: `${config.dbType}-port`,
      label: `${config.dbType} 端口`,
      value: config.dbPort,
      reference: `${config.dbType.toUpperCase()}_PORT`,
    }),
    buildRequiredValueCheck({
      id: `${config.dbType}-username`,
      label: `${config.dbType} 用户名`,
      value: config.dbUsername,
      reference: `${config.dbType.toUpperCase()}_USERNAME`,
    }),
  ];

  if (apiHealthCheck) {
    checks.push(apiHealthCheck);
  }

  if (!hasFailedChecks(checks)) {
    checks.push(
      await probeTcpEndpoint({
        id: `${config.dbType}-tcp`,
        label: `${config.dbType} 目标端口`,
        host: config.dbHost,
        port: config.dbPort,
        hint: `请确认 ${config.dbType} 服务已启动，且 ${config.dbHost}:${config.dbPort} 当前可访问。`,
      }),
    );
  }

  return {
    dbType: config.dbType,
    runnable: !hasFailedChecks(checks),
    reason: hasFailedChecks(checks) ? 'preflight-failed' : 'ready',
    payload: buildPreflightPayload({
      label: `${config.dbType}-preflight`,
      checks,
    }),
  };
};

const executeDbRegression = ({ config = {}, drySkip = false, targetPreflight = null }) => {
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

  if (targetPreflight && targetPreflight.runnable === false) {
    return {
      dbType: config.dbType,
      status: 'preflight-failed',
      reason: targetPreflight.reason || 'preflight-failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      command: [],
      stdout: '',
      stderr: '',
      exitCode: 1,
      preflight: targetPreflight.payload,
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
    preflight: targetPreflight?.payload,
  };
};

const apiHealthCheck = await probeApiHealth({
  label: 'Mock Server /health',
  apiBaseUrl,
  hint: '请先启动 mock server，并确认 API_BASE_URL 指向可访问的本地服务。',
});
const envFileCheck = buildFileExistsCheck({
  id: 'enterprise-env-file',
  label: '企业回归环境文件',
  filePath: envFilePath,
  missingStatus:
    hasDbConfigHints(mysqlConfig) || hasDbConfigHints(postgresConfig) ? 'warning' : 'failed',
  missingHint: `请基于 config/database-enterprise.env.example 创建 ${envFilePath}，或直接通过进程环境变量提供 MYSQL_* / POSTGRES_*。`,
});
const mysqlPreflight = await buildTargetPreflight({
  config: mysqlConfig,
  drySkip: skipMysql,
  apiHealthCheck,
});
const postgresPreflight = await buildTargetPreflight({
  config: postgresConfig,
  drySkip: skipPostgres,
  apiHealthCheck,
});

const executionResults = [];
executionResults.push(
  executeDbRegression({
    config: mysqlConfig,
    drySkip: skipMysql,
    targetPreflight: mysqlPreflight,
  }),
);
executionResults.push(
  executeDbRegression({
    config: postgresConfig,
    drySkip: skipPostgres,
    targetPreflight: postgresPreflight,
  }),
);

const configuredCount = executionResults.filter(
  (item) => item.reason !== 'missing-runtime-credentials' && item.reason !== 'skipped-by-flag',
).length;
const passedCount = executionResults.filter((item) => item.status === 'passed').length;
const failedCount = executionResults.filter((item) => item.status === 'failed').length;
const preflightFailedCount = executionResults.filter((item) => item.status === 'preflight-failed').length;
const skippedCount = executionResults.filter((item) => item.status === 'skipped').length;

const requireAllViolation =
  requireAll &&
  executionResults.some((item) => item.status !== 'passed');

const finalStatus =
  failedCount > 0 || preflightFailedCount > 0 || requireAllViolation || configuredCount === 0
    ? 'failed'
    : 'passed';

const enterprisePreflightPayload = buildPreflightPayload({
  label: 'database-enterprise-regression',
  checks: [
    envFileCheck,
    apiHealthCheck,
    buildPreflightCheck({
      id: 'mysql-target',
      label: 'MySQL 目标状态',
      status:
        mysqlPreflight.reason === 'ready'
          ? 'passed'
          : mysqlPreflight.reason === 'skipped-by-flag'
            ? 'skipped'
            : mysqlPreflight.reason === 'missing-runtime-credentials'
              ? 'warning'
              : 'failed',
      detail:
        mysqlPreflight.reason === 'ready'
          ? 'MySQL 目标已通过预检。'
          : mysqlPreflight.reason === 'skipped-by-flag'
            ? 'MySQL 目标已被显式跳过。'
            : mysqlPreflight.reason === 'missing-runtime-credentials'
              ? 'MySQL 目标未配置运行参数。'
              : 'MySQL 目标预检失败。',
    }),
    buildPreflightCheck({
      id: 'postgres-target',
      label: 'PostgreSQL 目标状态',
      status:
        postgresPreflight.reason === 'ready'
          ? 'passed'
          : postgresPreflight.reason === 'skipped-by-flag'
            ? 'skipped'
            : postgresPreflight.reason === 'missing-runtime-credentials'
              ? 'warning'
              : 'failed',
      detail:
        postgresPreflight.reason === 'ready'
          ? 'PostgreSQL 目标已通过预检。'
          : postgresPreflight.reason === 'skipped-by-flag'
            ? 'PostgreSQL 目标已被显式跳过。'
            : postgresPreflight.reason === 'missing-runtime-credentials'
              ? 'PostgreSQL 目标未配置运行参数。'
              : 'PostgreSQL 目标预检失败。',
    }),
  ],
  guidance: [
    `优先检查 ${envFilePath} 是否存在并填好 MYSQL_* / POSTGRES_*。`,
    '如果 mock server 未启动，先启动 3001 端口服务后再执行企业回归。',
  ],
});

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
    preflightFailedCount,
    skippedCount,
  },
  preflight: enterprisePreflightPayload,
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
  preflightFailedCount,
  skippedCount,
  requireAll,
  reportFile,
});

printPreflightReport({
  label: 'database-enterprise-regression',
  payload: enterprisePreflightPayload,
});

if (configuredCount === 0) {
  console.error(
    `[database-enterprise-regression] no executable database target found. Please set MYSQL_* and/or POSTGRES_* in ${envFilePath}`,
  );
}

process.exit(1);
