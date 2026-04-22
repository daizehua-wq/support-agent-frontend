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

const readOption = ({ key, envKey = '', defaultValue = '' }) => {
  if (cliArgs[key] !== undefined) {
    return cliArgs[key];
  }

  if (envKey && process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return process.env[envKey];
  }

  return defaultValue;
};

const normalizeText = (value = '') => String(value || '').trim();

const baseUrl = normalizeText(
  readOption({
    key: 'api-base-url',
    envKey: 'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:3001',
  }),
).replace(/\/$/, '');
const tenantId =
  normalizeText(
    readOption({
      key: 'tenant-id',
      defaultValue: 'tenant-governance-regression',
    }),
  ) || 'tenant-governance-regression';
const testTicket =
  normalizeText(
    readOption({
      key: 'change-ticket',
      defaultValue: `CHG-${Date.now()}`,
    }),
  ) || `CHG-${Date.now()}`;

const ensureReportDirectory = () => {
  const directory = path.join(process.cwd(), 'mock-server', 'test-results');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

const saveReport = ({
  status = 'passed',
  startedAt = '',
  completedAt = '',
  checkpoints = {},
  error = null,
} = {}) => {
  const reportDirectory = ensureReportDirectory();
  const reportFile = path.join(
    reportDirectory,
    `settings-governance-regression-${Date.now()}.json`,
  );
  const payload = {
    contractVersion: 'settings-governance-regression/v1',
    status,
    startedAt,
    completedAt,
    baseUrl,
    tenantId,
    checkpoints,
    error: error
      ? {
          message: error.message,
          details: error.details || null,
        }
      : null,
  };

  fs.writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return reportFile;
};

const buildHeaders = ({
  role = 'viewer',
  actorId = 'settings-governance-regression',
  changeTicket = '',
} = {}) => {
  const headers = {
    'content-type': 'application/json',
    'x-tenant-id': tenantId,
    'x-user-role': role,
    'x-user-id': actorId,
  };

  if (changeTicket) {
    headers['x-change-ticket'] = changeTicket;
  }

  return headers;
};

const requestJson = async ({
  method = 'GET',
  urlPath = '/',
  payload = undefined,
  headers = {},
} = {}) => {
  const fullUrl = `${baseUrl}${urlPath}`;
  let response = null;

  try {
    response = await fetch(fullUrl, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(
      `${method} ${urlPath} failed: ${error.message}. 请先启动 mock server（npm run dev:mock）。`,
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const requestError = new Error(
      `${method} ${urlPath} failed: ${data?.message || `HTTP ${response.status}`}`,
    );
    requestError.details = data;
    throw requestError;
  }

  return data;
};

const extractSettingsPayload = (response = {}) => {
  const settingsData = response?.data || {};
  const primarySettings = settingsData?.primaryContract?.settings;

  if (primarySettings && typeof primarySettings === 'object' && !Array.isArray(primarySettings)) {
    return primarySettings;
  }

  if (settingsData?.configSummary && typeof settingsData.configSummary === 'object') {
    return settingsData.configSummary;
  }

  return settingsData;
};

const assertCondition = (condition, message, details = null) => {
  if (condition) {
    return;
  }

  const error = new Error(message);
  error.details = details;
  throw error;
};

const getSettings = async () => {
  return requestJson({
    method: 'GET',
    urlPath: '/api/settings',
    headers: buildHeaders({
      role: 'viewer',
      actorId: 'settings-governance-auditor',
    }),
  });
};

const saveSettingsPatch = async ({
  settingsPatch = {},
  role = 'config-editor',
  actorId = 'settings-governance-editor',
} = {}) => {
  return requestJson({
    method: 'POST',
    urlPath: '/api/settings',
    headers: buildHeaders({
      role,
      actorId,
    }),
    payload: {
      primaryContract: {
        contractVersion: 'settings-primary/v1',
        settings: settingsPatch,
      },
    },
  });
};

const releaseVersion = async ({
  versionId = '',
  reason = '',
  actorId = 'settings-governance-release-manager',
} = {}) => {
  return requestJson({
    method: 'POST',
    urlPath: '/api/settings/governance/release',
    headers: buildHeaders({
      role: 'release-manager',
      actorId,
      changeTicket: testTicket,
    }),
    payload: {
      versionId,
      reason,
    },
  });
};

const rollbackToPrevious = async ({
  actorId = 'settings-governance-release-manager',
} = {}) => {
  return requestJson({
    method: 'POST',
    urlPath: '/api/settings/governance/rollback',
    headers: buildHeaders({
      role: 'release-manager',
      actorId,
      changeTicket: testTicket,
    }),
    payload: {
      reason: 'regression rollback to previous release',
    },
  });
};

const getGovernanceHistory = async () => {
  return requestJson({
    method: 'GET',
    urlPath: '/api/settings/governance/history?limit=20',
    headers: buildHeaders({
      role: 'auditor',
      actorId: 'settings-governance-auditor',
    }),
  });
};

const main = async () => {
  const startedAt = new Date().toISOString();

  try {
    const markerA = `governance-regression-A-${Date.now()}`;
    const markerB = `governance-regression-B-${Date.now()}`;

    const saveA = await saveSettingsPatch({
      settingsPatch: {
        strategy: {
          analyzeStrategy: markerA,
        },
      },
      role: 'config-editor',
      actorId: 'settings-governance-editor-A',
    });
    const versionA = saveA?.meta?.governance?.settingsVersion?.versionId || '';
    assertCondition(Boolean(versionA), 'save A does not return settings version id');

    const releaseA = await releaseVersion({
      versionId: versionA,
      reason: 'release A for rollback baseline',
      actorId: 'settings-governance-release-A',
    });
    const releaseVersionA = releaseA?.data?.publishedVersion?.versionId || '';
    assertCondition(
      releaseVersionA === versionA,
      'release A version mismatch',
      {
        expected: versionA,
        actual: releaseVersionA,
      },
    );

    const saveB = await saveSettingsPatch({
      settingsPatch: {
        strategy: {
          analyzeStrategy: markerB,
        },
      },
      role: 'config-editor',
      actorId: 'settings-governance-editor-B',
    });
    const versionB = saveB?.meta?.governance?.settingsVersion?.versionId || '';
    assertCondition(Boolean(versionB), 'save B does not return settings version id');

    const releaseB = await releaseVersion({
      versionId: versionB,
      reason: 'release B before rollback',
      actorId: 'settings-governance-release-B',
    });
    const releaseVersionB = releaseB?.data?.publishedVersion?.versionId || '';
    assertCondition(
      releaseVersionB === versionB,
      'release B version mismatch',
      {
        expected: versionB,
        actual: releaseVersionB,
      },
    );

    const rollback = await rollbackToPrevious({
      actorId: 'settings-governance-rollback',
    });
    const rollbackDurationMs = Number(rollback?.data?.rollbackDurationMs || 0);
    const rollbackSlaMs = Number(rollback?.data?.rollbackSlaMs || 0);
    const rollbackSlaMet = rollback?.data?.rollbackSlaMet === true;
    const restoredFromVersion = rollback?.data?.restoredFromVersion?.versionId || '';

    assertCondition(
      rollbackSlaMet,
      'rollback SLA check failed',
      {
        rollbackDurationMs,
        rollbackSlaMs,
      },
    );
    assertCondition(
      rollbackDurationMs > 0 && rollbackDurationMs <= 300000,
      'rollback duration is out of expected range',
      {
        rollbackDurationMs,
      },
    );
    assertCondition(
      restoredFromVersion === versionA,
      'rollback target is not previous published version',
      {
        expected: versionA,
        actual: restoredFromVersion,
      },
    );

    const settingsAfterRollback = extractSettingsPayload(await getSettings());
    assertCondition(
      settingsAfterRollback?.strategy?.analyzeStrategy === markerA,
      'settings analyzeStrategy was not restored to previous release',
      {
        expected: markerA,
        actual: settingsAfterRollback?.strategy?.analyzeStrategy,
      },
    );

    const historyResponse = await getGovernanceHistory();
    const historyVersions = Array.isArray(historyResponse?.data?.versions)
      ? historyResponse.data.versions
      : [];
    const historyAudits = Array.isArray(historyResponse?.data?.audits)
      ? historyResponse.data.audits
      : [];
    const actions = new Set(historyAudits.map((item) => item?.action).filter(Boolean));

    assertCondition(
      historyVersions.length >= 3,
      'history version count is too small',
      {
        versionCount: historyVersions.length,
      },
    );
    assertCondition(actions.has('settings.save'), 'audit does not include settings.save', {
      actions: [...actions],
    });
    assertCondition(actions.has('settings.publish'), 'audit does not include settings.publish', {
      actions: [...actions],
    });
    assertCondition(actions.has('settings.rollback'), 'audit does not include settings.rollback', {
      actions: [...actions],
    });

    const completedAt = new Date().toISOString();
    const reportFile = saveReport({
      status: 'passed',
      startedAt,
      completedAt,
      checkpoints: {
        tenantId,
        versionA,
        versionB,
        restoredFromVersion,
        rollbackDurationMs,
        rollbackSlaMs,
        historyVersionCount: historyVersions.length,
        historyAuditCount: historyAudits.length,
      },
      error: null,
    });

    console.log('[settings-governance-regression] PASS', {
      tenantId,
      versionA,
      versionB,
      restoredFromVersion,
      rollbackDurationMs,
      rollbackSlaMs,
      reportFile,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const reportFile = saveReport({
      status: 'failed',
      startedAt,
      completedAt,
      checkpoints: {},
      error,
    });

    console.error('[settings-governance-regression] FAIL', {
      message: error.message,
      details: error.details || null,
      tenantId,
      reportFile,
    });
    process.exitCode = 1;
  }
};

await main();
