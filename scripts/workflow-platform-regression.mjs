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

const requestJson = async ({ method = 'GET', urlPath = '/', payload = undefined }) => {
  const fullUrl = `${baseUrl}${urlPath}`;
  let response = null;

  try {
    response = await fetch(fullUrl, {
      method,
      headers: {
        'content-type': 'application/json',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(
      `${method} ${urlPath} failed: ${error.message}. 请先启动 mock server（npm run dev:mock）。`,
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      `${method} ${urlPath} failed: ${data?.message || `HTTP ${response.status}`}`,
    );
  }

  return data;
};

const assertCondition = (condition, message, details = null) => {
  if (condition) {
    return;
  }

  const error = new Error(message);
  error.details = details;
  throw error;
};

const extractPluginRuntimeSummary = (response = {}) => {
  return response?.meta?.pluginRuntimeSummary || null;
};

const ensurePluginRuntimeSummary = ({
  response = {},
  expectedKind = '',
  expectedRoute = '',
  stageName = '',
} = {}) => {
  const pluginRuntimeSummary = extractPluginRuntimeSummary(response);

  assertCondition(Boolean(pluginRuntimeSummary), `${stageName} missing pluginRuntimeSummary`);
  assertCondition(
    pluginRuntimeSummary.kind === expectedKind,
    `${stageName} plugin kind mismatch`,
    {
      expectedKind,
      actualKind: pluginRuntimeSummary.kind,
    },
  );
  assertCondition(
    pluginRuntimeSummary.route === expectedRoute,
    `${stageName} plugin route mismatch`,
    {
      expectedRoute,
      actualRoute: pluginRuntimeSummary.route,
    },
  );
  assertCondition(
    Boolean(pluginRuntimeSummary.executedPluginId),
    `${stageName} executedPluginId is empty`,
  );

  return pluginRuntimeSummary;
};

const runAnalyzeRegression = async () => {
  const response = await requestJson({
    method: 'POST',
    urlPath: '/api/agent/analyze-customer',
    payload: {
      customerText: '客户希望在湿制程里先做样测，关注清洗后残留控制和兼容性。',
      industryType: 'pcb',
      sessionId: `workflow-platform-regression-analyze-${Date.now()}`,
    },
  });

  const pluginRuntimeSummary = ensurePluginRuntimeSummary({
    response,
    expectedKind: 'analyze',
    expectedRoute: 'analyze-customer',
    stageName: 'analyze',
  });

  assertCondition(Boolean(response?.data?.summary), 'analyze summary is empty');

  return {
    mode: pluginRuntimeSummary?.resolution?.mode || '',
    executedPluginId: pluginRuntimeSummary.executedPluginId,
    selectedPluginId: pluginRuntimeSummary.selectedPluginId,
  };
};

const runSearchRegression = async () => {
  const response = await requestJson({
    method: 'POST',
    urlPath: '/api/agent/search-documents',
    payload: {
      keyword: 'PCB 清洗 工艺',
      industryType: 'pcb',
      docType: 'spec',
      enableExternalSupplement: false,
      sessionId: `workflow-platform-regression-search-${Date.now()}`,
    },
  });

  const pluginRuntimeSummary = ensurePluginRuntimeSummary({
    response,
    expectedKind: 'search',
    expectedRoute: 'search-documents',
    stageName: 'search',
  });

  assertCondition(
    Array.isArray(response?.data?.evidenceItems),
    'search evidenceItems is not an array',
  );

  return {
    mode: pluginRuntimeSummary?.resolution?.mode || '',
    executedPluginId: pluginRuntimeSummary.executedPluginId,
    selectedPluginId: pluginRuntimeSummary.selectedPluginId,
    evidenceCount: response?.data?.evidenceItems?.length || 0,
  };
};

const runOutputReleaseRegression = () => {
  const commandResult = spawnSync(
    'node',
    [
      'scripts/workflow-release-regression.mjs',
      '--api-base-url',
      baseUrl,
      '--kind',
      'output',
      '--route',
      'generate-script',
    ],
    {
      encoding: 'utf-8',
    },
  );

  if (commandResult.status !== 0) {
    throw new Error(
      `output release regression failed: ${normalizeText(commandResult.stdout)} ${normalizeText(
        commandResult.stderr,
      )}`.trim(),
    );
  }

  const output = `${commandResult.stdout || ''}\n${commandResult.stderr || ''}`;
  const reportFileMatch = output.match(/reportFile:\s*'([^']+)'/);

  assertCondition(
    output.includes('[workflow-release-regression] PASS'),
    'output release regression did not pass',
    {
      output,
    },
  );

  return {
    status: 'passed',
    reportFile: reportFileMatch?.[1] || '',
  };
};

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
    `workflow-platform-regression-${Date.now()}.json`,
  );
  const payload = {
    contractVersion: 'workflow-platform-regression/v1',
    status,
    startedAt,
    completedAt,
    baseUrl,
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

const main = async () => {
  const startedAt = new Date().toISOString();

  try {
    const analyze = await runAnalyzeRegression();
    const search = await runSearchRegression();
    const output = runOutputReleaseRegression();
    const completedAt = new Date().toISOString();
    const reportFile = saveReport({
      status: 'passed',
      startedAt,
      completedAt,
      checkpoints: {
        analyze,
        search,
        output,
      },
      error: null,
    });

    console.log('[workflow-platform-regression] PASS', {
      baseUrl,
      analyze,
      search,
      output,
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

    console.error('[workflow-platform-regression] FAIL', {
      message: error.message,
      details: error.details || null,
      reportFile,
    });
    process.exitCode = 1;
  }
};

await main();
