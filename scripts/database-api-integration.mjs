import fs from 'fs';
import path from 'path';

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

const readOption = ({ key, envKeys = [], defaultValue = '' }) => {
  if (cliArgs[key] !== undefined) {
    return cliArgs[key];
  }

  for (const envKey of envKeys) {
    if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
      return process.env[envKey];
    }
  }

  return defaultValue;
};

const readFlag = ({ key, envKeys = [], defaultValue = false }) => {
  if (cliArgs[key] !== undefined) {
    return cliArgs[key] === true || cliArgs[key] === 'true' || cliArgs[key] === '1';
  }

  for (const envKey of envKeys) {
    const value = process.env[envKey];
    if (value !== undefined) {
      return value === 'true' || value === '1';
    }
  }

  return defaultValue;
};

const printUsage = () => {
  console.log(`
Usage:
  npm run test:db:api -- --db-type=mysql --db-host=127.0.0.1 --db-port=3306 --db-username=root --db-password=secret

Required:
  --db-type=mysql|postgres
  --db-host=<hostname>
  --db-port=<port>
  --db-username=<username>

Optional:
  --db-password=<password>
  --db-admin-username=<username>
  --db-admin-password=<password>
  --db-name=<databaseName>
  --db-id=<databaseId>
  --db-environment=<label>
  --db-description=<text>
  --api-base-url=http://127.0.0.1:3001
  --account-id=<binding account id>
  --exercise-settings-store
  --skip-delete
  --admin-database=<postgres maintenance db>
  --maintenance-database=<postgres maintenance db>

Environment equivalents:
  API_BASE_URL, DB_TYPE, DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_ID,
  DB_ENVIRONMENT, DB_DESCRIPTION, DB_ACCOUNT_ID, EXERCISE_SETTINGS_STORE, SKIP_DELETE,
  DB_ADMIN_USERNAME, DB_ADMIN_PASSWORD, DB_ADMIN_DATABASE, DB_MAINTENANCE_DATABASE
`);
};

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

const dbType = String(readOption({ key: 'db-type', envKeys: ['DB_TYPE'] })).trim().toLowerCase();
const apiBaseUrl = String(
  readOption({
    key: 'api-base-url',
    envKeys: ['API_BASE_URL'],
    defaultValue: 'http://127.0.0.1:3001',
  }),
).trim();
const dbHost = String(readOption({ key: 'db-host', envKeys: ['DB_HOST'] })).trim();
const dbPort = String(
  readOption({
    key: 'db-port',
    envKeys: ['DB_PORT'],
    defaultValue: dbType === 'mysql' ? '3306' : '5432',
  }),
).trim();
const dbUsername = String(readOption({ key: 'db-username', envKeys: ['DB_USERNAME'] })).trim();
const dbPassword = String(
  readOption({ key: 'db-password', envKeys: ['DB_PASSWORD'], defaultValue: '' }),
);
const dbAdminUsername = String(
  readOption({ key: 'db-admin-username', envKeys: ['DB_ADMIN_USERNAME'], defaultValue: '' }),
).trim();
const dbAdminPassword = String(
  readOption({ key: 'db-admin-password', envKeys: ['DB_ADMIN_PASSWORD'], defaultValue: '' }),
);
const dbName = String(
  readOption({
    key: 'db-name',
    envKeys: ['DB_NAME'],
    defaultValue: `codex_it_${dbType || 'db'}_${Date.now()}`,
  }),
).trim();
const dbId = String(readOption({ key: 'db-id', envKeys: ['DB_ID'], defaultValue: dbName })).trim();
const dbEnvironment = String(
  readOption({
    key: 'db-environment',
    envKeys: ['DB_ENVIRONMENT'],
    defaultValue: 'integration',
  }),
).trim();
const dbDescription = String(
  readOption({
    key: 'db-description',
    envKeys: ['DB_DESCRIPTION'],
    defaultValue: `Codex API integration for ${dbType || 'database'}`,
  }),
).trim();
const accountId = String(
  readOption({
    key: 'account-id',
    envKeys: ['DB_ACCOUNT_ID'],
    defaultValue: `integration-${dbType || 'database'}`,
  }),
).trim();
const exerciseSettingsStore = readFlag({
  key: 'exercise-settings-store',
  envKeys: ['EXERCISE_SETTINGS_STORE'],
  defaultValue: false,
});
const skipDelete = readFlag({
  key: 'skip-delete',
  envKeys: ['SKIP_DELETE'],
  defaultValue: false,
});
const adminDatabase = String(
  readOption({
    key: 'admin-database',
    envKeys: ['DB_ADMIN_DATABASE'],
    defaultValue: '',
  }),
).trim();
const maintenanceDatabase = String(
  readOption({
    key: 'maintenance-database',
    envKeys: ['DB_MAINTENANCE_DATABASE'],
    defaultValue: '',
  }),
).trim();

if (!['mysql', 'postgres'].includes(dbType)) {
  console.error('`--db-type` must be `mysql` or `postgres`.');
  printUsage();
  process.exit(1);
}

if (!dbHost || !dbPort || !dbUsername) {
  console.error('Missing required database connection fields.');
  printUsage();
  process.exit(1);
}

const reportDir = path.join(process.cwd(), 'mock-server', 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
const reportFile = path.join(
  reportDir,
  `database-api-integration-${dbType}-${Date.now()}.json`,
);

const state = {
  settingsStoreSwitched: false,
  bindingApplied: false,
  databaseCreated: false,
  cleanupErrors: [],
  originalSettingsDatabase: null,
};

const steps = [];

const log = (message) => {
  console.log(message);
};

const summarizePayload = (payload) => {
  if (payload === undefined) {
    return undefined;
  }

  const text = JSON.stringify(payload);
  if (text.length <= 500) {
    return payload;
  }

  return {
    truncated: true,
    preview: text.slice(0, 500),
  };
};

const writeReport = (status, error = null) => {
  const report = {
    time: new Date().toISOString(),
    status,
    apiBaseUrl,
    dbType,
    dbHost,
    dbPort,
    dbUsername,
    dbName,
    dbId,
    exerciseSettingsStore,
    skipDelete,
    error:
      error && typeof error === 'object'
        ? {
            message: error.message || String(error),
            status: error.status || null,
            payload: summarizePayload(error.payload),
          }
        : error
          ? { message: String(error) }
          : null,
    cleanupErrors: state.cleanupErrors,
    steps,
  };

  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const assertCondition = (condition, message, details = undefined) => {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
};

const apiRequest = async (method, pathname, body = undefined) => {
  const url = new URL(pathname, apiBaseUrl).toString();
  const requestInit = {
    method,
    headers: {
      Accept: 'application/json',
    },
  };

  if (body !== undefined) {
    requestInit.headers['Content-Type'] = 'application/json';
    requestInit.body = JSON.stringify(body);
  }

  const startedAt = new Date().toISOString();
  const response = await fetch(url, requestInit);
  const rawText = await response.text();
  let payload = rawText;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (_error) {
      payload = rawText;
    }
  }

  const step = {
    time: startedAt,
    method,
    pathname,
    statusCode: response.status,
    ok: response.ok,
    requestBody: summarizePayload(body),
    responseBody: summarizePayload(payload),
  };

  steps.push(step);

  if (!response.ok) {
    const error = new Error(`${method} ${pathname} failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (payload && typeof payload === 'object' && 'success' in payload && payload.success === false) {
    const error = new Error(`${method} ${pathname} returned success=false`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const dbConfig = {
  databaseId: dbId,
  databaseName: dbName,
  databaseType: dbType,
  host: dbHost,
  port: dbPort,
  username: dbUsername,
  password: dbPassword,
  ...(dbAdminUsername ? { adminUsername: dbAdminUsername } : {}),
  ...(dbAdminPassword ? { adminPassword: dbAdminPassword } : {}),
  environment: dbEnvironment,
  description: dbDescription,
  ...(adminDatabase ? { adminDatabase } : {}),
  ...(maintenanceDatabase ? { maintenanceDatabase } : {}),
};

const cleanup = async () => {
  if (state.settingsStoreSwitched && state.originalSettingsDatabase) {
    try {
      log('Cleaning up: restoring original settings store...');
      await apiRequest('POST', '/api/settings', {
        database: state.originalSettingsDatabase,
      });
      state.settingsStoreSwitched = false;
    } catch (error) {
      state.cleanupErrors.push({
        step: 'restore-settings-store',
        message: error.message,
        payload: summarizePayload(error.payload),
      });
    }
  }

  if (state.bindingApplied) {
    try {
      log('Cleaning up: clearing temporary light binding...');
      await apiRequest('POST', `/api/database-manager/accounts/${accountId}/database-binding/save`, {
        databaseId: dbId,
        lightBindingSummary: {
          defaultAssociatedDatabase: null,
          visibleDatabases: [],
          relationSource: 'integration-test-reset',
        },
      });
      state.bindingApplied = false;
    } catch (error) {
      state.cleanupErrors.push({
        step: 'clear-light-binding',
        message: error.message,
        payload: summarizePayload(error.payload),
      });
    }
  }

  if (state.databaseCreated && !skipDelete) {
    try {
      log('Cleaning up: deleting temporary remote database...');
      await apiRequest('POST', `/api/database-manager/databases/${dbId}/delete`, {
        deleteMode: 'drop-remote',
      });
      state.databaseCreated = false;
    } catch (error) {
      state.cleanupErrors.push({
        step: 'delete-database',
        message: error.message,
        payload: summarizePayload(error.payload),
      });
    }
  }
};

const main = async () => {
  log(`Running ${dbType} API integration against ${apiBaseUrl}`);
  log(`Target database: ${dbName}`);

  await apiRequest('GET', '/health');

  const settingsSnapshot = await apiRequest('GET', '/api/settings');
  state.originalSettingsDatabase = settingsSnapshot?.data?.database || null;
  assertCondition(state.originalSettingsDatabase, 'Failed to snapshot current settings database');

  const connectionTest = await apiRequest('POST', '/api/settings/test-database', {
    database: dbConfig,
  });
  assertCondition(
    connectionTest?.data?.success === true,
    'settings/test-database did not report success',
    connectionTest,
  );

  const createResult = await apiRequest('POST', '/api/database-manager/databases/create', {
    ...dbConfig,
    createMode: 'create-remote',
  });
  assertCondition(createResult?.targetId === dbId, 'Database create targetId mismatch', createResult);
  assertCondition(
    createResult?.data?.remoteCreateResult?.created === true,
    'Remote database was not created',
    createResult,
  );
  state.databaseCreated = true;

  const listResult = await apiRequest('GET', '/api/database-manager/databases');
  const listItems = Array.isArray(listResult?.data) ? listResult.data : [];
  assertCondition(
    listItems.some((item) => item.databaseId === dbId || item.id === dbId),
    'Created database was not found in database list',
    listResult,
  );

  const healthCheckResult = await apiRequest(
    'POST',
    `/api/database-manager/databases/${dbId}/health-check`,
    {},
  );
  assertCondition(
    healthCheckResult?.data?.result?.success === true,
    'Database health check did not succeed',
    healthCheckResult,
  );

  const detailResult = await apiRequest('GET', `/api/database-manager/databases/${dbId}`);
  const detail = detailResult?.data?.detail || {};
  assertCondition(
    detail.databaseId === dbId || detail.id === dbId,
    'Database detail did not return the created target',
    detailResult,
  );
  assertCondition(
    !('password' in detail) && !('adminPassword' in detail),
    'Database detail should not expose stored passwords',
    detailResult,
  );

  const updateResult = await apiRequest(
    'POST',
    `/api/database-manager/databases/${dbId}/update`,
    {
      description: `${dbDescription} [updated]`,
      environment: `${dbEnvironment}-updated`,
      version: Number(detail.version || 1),
    },
  );
  assertCondition(
    updateResult?.data?.detail?.description?.includes('[updated]'),
    'Database update did not persist description',
    updateResult,
  );

  const bindingResult = await apiRequest(
    'POST',
    `/api/database-manager/accounts/${accountId}/database-binding/save`,
    {
      databaseId: dbId,
      lightBindingSummary: {
        defaultAssociatedDatabase: dbId,
        visibleDatabases: [dbId],
        relationSource: 'integration-test',
      },
    },
  );
  assertCondition(
    bindingResult?.data?.binding?.defaultDatabase?.databaseId === dbId,
    'Light binding save did not return the expected default database',
    bindingResult,
  );
  state.bindingApplied = true;

  if (exerciseSettingsStore) {
    log('Exercising /api/settings store switch and restore...');

    const switchResult = await apiRequest('POST', '/api/settings', {
      database: dbConfig,
    });
    assertCondition(
      switchResult?.data?.database?.databaseName === dbName,
      'Settings store switch did not point to the temporary database',
      switchResult,
    );
    state.settingsStoreSwitched = true;

    const switchedSettings = await apiRequest('GET', '/api/settings');
    assertCondition(
      switchedSettings?.data?.database?.databaseName === dbName,
      'GET /api/settings did not read back from the temporary database',
      switchedSettings,
    );

    const restoreResult = await apiRequest('POST', '/api/settings', {
      database: state.originalSettingsDatabase,
    });
    assertCondition(
      restoreResult?.data?.database?.databaseName === state.originalSettingsDatabase.databaseName,
      'Settings store restore did not point back to the original database',
      restoreResult,
    );
    state.settingsStoreSwitched = false;

    const restoredSettings = await apiRequest('GET', '/api/settings');
    assertCondition(
      restoredSettings?.data?.database?.databaseName === state.originalSettingsDatabase.databaseName,
      'GET /api/settings did not restore the original database',
      restoredSettings,
    );
  }

  await cleanup();
  writeReport('passed');

  log(`Integration passed. Report written to ${reportFile}`);
};

main()
  .catch(async (error) => {
    console.error(`Integration failed: ${error.message}`);

    if (error.payload !== undefined) {
      console.error(JSON.stringify(error.payload, null, 2));
    }

    await cleanup();
    writeReport('failed', error);
    process.exitCode = 1;
  });
