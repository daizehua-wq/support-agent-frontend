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
    if (process.env[envKey] !== undefined) {
      return process.env[envKey] === 'true' || process.env[envKey] === '1';
    }
  }

  return defaultValue;
};

const toInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeString = (value = '') => String(value || '').trim();

const baseUrl = normalizeString(
  readOption({
    key: 'api-base-url',
    envKeys: ['API_BASE_URL'],
    defaultValue: 'http://127.0.0.1:3001',
  }),
).replace(/\/$/, '');
const targetKind = normalizeString(readOption({ key: 'kind', defaultValue: 'output' })) || 'output';
const targetRoute = normalizeString(readOption({ key: 'route', defaultValue: 'generate-script' })) || 'generate-script';
const sessionPrefix =
  normalizeString(readOption({ key: 'session-prefix', defaultValue: `workflow-release-${targetKind}-${targetRoute}` })) ||
  `workflow-release-${targetKind}-${targetRoute}`;
const defaultTrafficPercent = toInteger(
  readOption({ key: 'traffic-percent', defaultValue: 20 }),
  20,
);
const autoConfigure = readFlag({ key: 'auto-configure', defaultValue: true });
const loop = readFlag({ key: 'loop', defaultValue: false });
const intervalMs = toInteger(readOption({ key: 'interval-ms', defaultValue: 60000 }), 60000);
const maxRuns = toInteger(readOption({ key: 'max-runs', defaultValue: 0 }), 0);
const saveReport = readFlag({ key: 'save-report', defaultValue: true });
const outputFile = normalizeString(readOption({ key: 'output-file', defaultValue: '' }));

const reportDir = path.join(process.cwd(), 'mock-server', 'test-results');

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
    const networkError = new Error(
      `${method} ${urlPath} failed: ${error.message}. 请先确认 mock server 已启动（npm run dev:mock）且 api-base-url 可达。`,
    );
    networkError.cause = error;
    throw networkError;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const message = data?.message || `HTTP ${response.status}`;
    const error = new Error(`${method} ${urlPath} failed: ${message}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const getSettings = async () => {
  return requestJson({ method: 'GET', urlPath: '/api/settings' });
};

const getWorkflowReleaseOptions = async () => {
  return requestJson({ method: 'GET', urlPath: '/api/settings/workflow-release-options' });
};

const saveWorkflowReleaseSettings = async (workflowRelease) => {
  return requestJson({
    method: 'POST',
    urlPath: '/api/settings',
    payload: {
      sessionId: `workflow-release-regression-save-${Date.now()}`,
      primaryContract: {
        contractVersion: 'settings-primary/v1',
        settings: {
          workflowRelease,
        },
      },
    },
  });
};

const runGenerateScript = async (payload = {}) => {
  return requestJson({
    method: 'POST',
    urlPath: '/api/agent/generate-script',
    payload,
  });
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

const stableHashBucket = (seed = '') => {
  const normalizedSeed = normalizeString(seed) || 'default-release-bucket';
  let hash = 2166136261;

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return (hash >>> 0) % 100;
};

const toRouteKey = (kind = '', route = '') => `${normalizeString(kind)}:${normalizeString(route)}`;

const assertCondition = (condition, message, details = null) => {
  if (condition) {
    return;
  }

  const error = new Error(message);
  error.details = details;
  throw error;
};

const pickFixedSessions = ({
  kind,
  route,
  trafficPercent,
  prefix,
}) => {
  let stableSessionId = '';
  let canarySessionId = '';

  for (let index = 1; index <= 5000; index += 1) {
    const sessionId = `${prefix}-session-${index}`;
    const bucket = stableHashBucket(`${kind}:${route}:${sessionId}`);

    if (bucket < trafficPercent && !canarySessionId) {
      canarySessionId = sessionId;
    }

    if (bucket >= trafficPercent && !stableSessionId) {
      stableSessionId = sessionId;
    }

    if (stableSessionId && canarySessionId) {
      break;
    }
  }

  return {
    stableSessionId,
    canarySessionId,
  };
};

const createBaseScriptPayload = (sessionId = '') => ({
  sessionId,
  customerText: '客户咨询寄样和技术参数，想要先拿到一版标准沟通话术。',
  communicationGoal: 'first_reply',
  productDirection: '水性清洗剂',
  referenceSummary: '来自规格书和 FAQ 的可公开摘要。',
  toneStyle: 'formal',
});

const extractPluginRuntimeSummary = (response = {}) => response?.meta?.pluginRuntimeSummary || null;

const ensureTargetRouteConfigured = async ({
  kind,
  route,
  routeOption,
  trafficPercent,
}) => {
  const settingsResponse = await getSettings();
  const settingsPayload = extractSettingsPayload(settingsResponse);
  const currentWorkflowRelease = settingsPayload.workflowRelease || {
    contractVersion: 'workflow-release-settings/v1',
    routes: {},
  };
  const routeKey = toRouteKey(kind, route);
  const currentRoutes =
    currentWorkflowRelease.routes && typeof currentWorkflowRelease.routes === 'object'
      ? currentWorkflowRelease.routes
      : {};

  const stablePluginId =
    normalizeString(routeOption?.stablePluginId) ||
    normalizeString(
      routeOption?.candidates?.find((item) => item.releaseStage !== 'canary' && item.defaultPlugin)?.pluginId,
    ) ||
    normalizeString(routeOption?.candidates?.find((item) => item.releaseStage !== 'canary')?.pluginId) ||
    normalizeString(routeOption?.candidates?.[0]?.pluginId);
  const canaryPluginId =
    normalizeString(routeOption?.canaryPluginId) ||
    normalizeString(routeOption?.candidates?.find((item) => item.releaseStage === 'canary')?.pluginId);

  assertCondition(Boolean(stablePluginId), '未找到稳定插件候选，请检查 manifest。', {
    routeKey,
  });
  assertCondition(Boolean(canaryPluginId), '未找到灰度插件候选，请检查 manifest。', {
    routeKey,
  });

  const expectedRouteConfig = {
    kind,
    route,
    displayName: routeOption?.displayName || `${kind} / ${route}`,
    stablePluginId,
    canaryPluginId,
    trafficPercent: Math.min(100, Math.max(1, Number(trafficPercent || 0))),
    rollbackOnError: true,
    bucketBy: 'sessionId',
    enabled: true,
  };

  if (!autoConfigure) {
    const currentRouteConfig =
      currentRoutes[routeKey] ||
      Object.values(currentRoutes).find(
        (item) => normalizeString(item?.kind) === kind && normalizeString(item?.route) === route,
      );

    assertCondition(Boolean(currentRouteConfig), '当前 settings 未配置目标路由发布策略，请先在 Settings 页面保存。', {
      routeKey,
    });

    return {
      workflowRelease: currentWorkflowRelease,
      appliedRouteConfig: currentRouteConfig,
      stablePluginId,
      canaryPluginId,
    };
  }

  const nextWorkflowRelease = {
    contractVersion:
      normalizeString(currentWorkflowRelease.contractVersion) ||
      'workflow-release-settings/v1',
    routes: {
      ...currentRoutes,
      [routeKey]: {
        ...expectedRouteConfig,
      },
    },
  };

  await saveWorkflowReleaseSettings(nextWorkflowRelease);

  return {
    workflowRelease: nextWorkflowRelease,
    appliedRouteConfig: expectedRouteConfig,
    stablePluginId,
    canaryPluginId,
  };
};

const runRegressionOnce = async ({ runIndex = 1 } = {}) => {
  const startedAt = new Date().toISOString();
  const routeOptionsResponse = await getWorkflowReleaseOptions();
  const routeOptions = Array.isArray(routeOptionsResponse?.data?.routes)
    ? routeOptionsResponse.data.routes
    : [];
  const targetRouteOption = routeOptions.find(
    (item) => normalizeString(item.kind) === targetKind && normalizeString(item.route) === targetRoute,
  );

  assertCondition(Boolean(targetRouteOption), '未找到目标路由发布选项。', {
    kind: targetKind,
    route: targetRoute,
  });

  const {
    appliedRouteConfig,
    stablePluginId,
    canaryPluginId,
  } = await ensureTargetRouteConfigured({
    kind: targetKind,
    route: targetRoute,
    routeOption: targetRouteOption,
    trafficPercent: defaultTrafficPercent,
  });

  const effectiveTrafficPercent = Number(appliedRouteConfig?.trafficPercent || 0);
  assertCondition(effectiveTrafficPercent > 0, '灰度流量比例必须大于 0 才能验收灰度与回滚。', {
    trafficPercent: effectiveTrafficPercent,
  });
  assertCondition(
    normalizeString(appliedRouteConfig?.bucketBy) === 'sessionId',
    '当前脚本要求 bucketBy=sessionId 才能使用固定 session 桶位。',
    {
      bucketBy: appliedRouteConfig?.bucketBy,
    },
  );

  const { stableSessionId, canarySessionId } = pickFixedSessions({
    kind: targetKind,
    route: targetRoute,
    trafficPercent: effectiveTrafficPercent,
    prefix: sessionPrefix,
  });

  assertCondition(Boolean(stableSessionId), '未找到稳定桶位 sessionId。');
  assertCondition(Boolean(canarySessionId), '未找到灰度桶位 sessionId。');

  const stableRequest = createBaseScriptPayload(stableSessionId);
  const canaryRequest = createBaseScriptPayload(canarySessionId);

  const stableResponse = await runGenerateScript(stableRequest);
  const stablePluginRuntimeSummary = extractPluginRuntimeSummary(stableResponse);
  assertCondition(Boolean(stablePluginRuntimeSummary), '稳定请求返回缺失 pluginRuntimeSummary。');
  assertCondition(
    normalizeString(stablePluginRuntimeSummary.executedPluginId) === normalizeString(stablePluginId),
    '稳定流量未命中稳定插件。',
    {
      expected: stablePluginId,
      actual: stablePluginRuntimeSummary.executedPluginId,
    },
  );
  assertCondition(
    normalizeString(stablePluginRuntimeSummary?.resolution?.mode) === 'stable',
    '稳定流量 mode 非 stable。',
    {
      mode: stablePluginRuntimeSummary?.resolution?.mode,
    },
  );

  const canaryResponse = await runGenerateScript(canaryRequest);
  const canaryPluginRuntimeSummary = extractPluginRuntimeSummary(canaryResponse);
  assertCondition(Boolean(canaryPluginRuntimeSummary), '灰度请求返回缺失 pluginRuntimeSummary。');
  assertCondition(
    normalizeString(canaryPluginRuntimeSummary.executedPluginId) === normalizeString(canaryPluginId),
    '灰度流量未命中灰度插件。',
    {
      expected: canaryPluginId,
      actual: canaryPluginRuntimeSummary.executedPluginId,
    },
  );
  assertCondition(
    normalizeString(canaryPluginRuntimeSummary?.resolution?.mode) === 'canary',
    '灰度流量 mode 非 canary。',
    {
      mode: canaryPluginRuntimeSummary?.resolution?.mode,
    },
  );
  assertCondition(
    canaryPluginRuntimeSummary?.rollback?.triggered !== true,
    '正常灰度请求不应触发回滚。',
    {
      rollback: canaryPluginRuntimeSummary?.rollback,
    },
  );

  const rollbackResponse = await runGenerateScript({
    ...canaryRequest,
    forceCanaryNodeFailure: true,
  });
  const rollbackPluginRuntimeSummary = extractPluginRuntimeSummary(rollbackResponse);
  assertCondition(Boolean(rollbackPluginRuntimeSummary), '回滚演练返回缺失 pluginRuntimeSummary。');
  assertCondition(
    normalizeString(rollbackPluginRuntimeSummary.executedPluginId) === normalizeString(stablePluginId),
    '回滚后未执行稳定插件。',
    {
      expected: stablePluginId,
      actual: rollbackPluginRuntimeSummary.executedPluginId,
    },
  );
  assertCondition(
    normalizeString(rollbackPluginRuntimeSummary?.resolution?.mode) === 'rollback',
    '回滚演练 mode 非 rollback。',
    {
      mode: rollbackPluginRuntimeSummary?.resolution?.mode,
    },
  );
  assertCondition(
    rollbackPluginRuntimeSummary?.rollback?.triggered === true,
    '回滚演练未触发 rollback 标记。',
    {
      rollback: rollbackPluginRuntimeSummary?.rollback,
    },
  );

  const completedAt = new Date().toISOString();

  return {
    runIndex,
    status: 'passed',
    startedAt,
    completedAt,
    baseUrl,
    route: {
      kind: targetKind,
      route: targetRoute,
      key: toRouteKey(targetKind, targetRoute),
    },
    releaseConfig: {
      stablePluginId,
      canaryPluginId,
      trafficPercent: effectiveTrafficPercent,
      rollbackOnError: appliedRouteConfig?.rollbackOnError === true,
      bucketBy: appliedRouteConfig?.bucketBy || 'sessionId',
      enabled: appliedRouteConfig?.enabled !== false,
      autoConfigure,
    },
    sessions: {
      stableSessionId,
      canarySessionId,
    },
    checkpoints: {
      stable: {
        mode: stablePluginRuntimeSummary?.resolution?.mode,
        executedPluginId: stablePluginRuntimeSummary?.executedPluginId,
        rollback: stablePluginRuntimeSummary?.rollback || null,
      },
      canary: {
        mode: canaryPluginRuntimeSummary?.resolution?.mode,
        executedPluginId: canaryPluginRuntimeSummary?.executedPluginId,
        rollback: canaryPluginRuntimeSummary?.rollback || null,
      },
      rollback: {
        mode: rollbackPluginRuntimeSummary?.resolution?.mode,
        executedPluginId: rollbackPluginRuntimeSummary?.executedPluginId,
        rollback: rollbackPluginRuntimeSummary?.rollback || null,
      },
    },
  };
};

const writeReport = (report = {}) => {
  if (!saveReport) {
    return '';
  }

  fs.mkdirSync(reportDir, { recursive: true });

  const filePath = outputFile
    ? path.resolve(process.cwd(), outputFile)
    : path.join(
        reportDir,
        `workflow-release-regression-${targetKind}-${targetRoute}-${Date.now()}.json`,
      );

  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  return filePath;
};

const run = async () => {
  let runIndex = 1;

  while (true) {
    const startedAt = new Date().toISOString();

    try {
      const report = await runRegressionOnce({ runIndex });
      const reportFile = writeReport(report);

      console.log('[workflow-release-regression] PASS', {
        runIndex,
        route: `${targetKind}/${targetRoute}`,
        stableSessionId: report.sessions.stableSessionId,
        canarySessionId: report.sessions.canarySessionId,
        stablePluginId: report.releaseConfig.stablePluginId,
        canaryPluginId: report.releaseConfig.canaryPluginId,
        reportFile,
      });
    } catch (error) {
      const failedReport = {
        runIndex,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        baseUrl,
        route: {
          kind: targetKind,
          route: targetRoute,
        },
        error: {
          message: error.message || String(error),
          details: error.details || null,
          status: error.status || null,
          payload: error.payload || null,
        },
      };
      const reportFile = writeReport(failedReport);

      console.error('[workflow-release-regression] FAIL', {
        runIndex,
        message: failedReport.error.message,
        reportFile,
      });
      process.exit(1);
    }

    if (!loop) {
      break;
    }

    if (maxRuns > 0 && runIndex >= maxRuns) {
      break;
    }

    runIndex += 1;
    await sleep(Math.max(1000, intervalMs));
  }
};

run().catch((error) => {
  console.error('[workflow-release-regression] fatal error', error);
  process.exit(1);
});
