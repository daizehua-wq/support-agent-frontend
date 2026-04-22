import { recordPythonRuntimeHealthProbe } from './opsObservabilityService.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeRoute = (value = '', fallback = '') => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'local' || normalized === 'cloud') {
    return normalized;
  }
  return fallback;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const DEFAULT_PY_RUNTIME_BASE_URL = 'http://127.0.0.1:8008';
const DEFAULT_PY_HEALTH_GATE_SETTINGS = Object.freeze({
  enabled: true,
  strictGate: true,
  checkPath: '/health',
  timeoutMs: 1500,
  cacheTtlMs: 5000,
  maxConsecutiveFailures: 2,
  cooldownMs: 15000,
});

const pythonRuntimeHealthState = {
  status: 'unknown',
  healthy: null,
  checkedAt: '',
  latencyMs: 0,
  message: '',
  consecutiveFailures: 0,
  cooldownUntil: 0,
  cacheExpiresAt: 0,
  baseUrl: '',
};

const safeRecordPythonRuntimeHealthProbe = (payload = {}) => {
  try {
    return recordPythonRuntimeHealthProbe(payload);
  } catch (error) {
    console.warn('[python-runtime] failed to record health probe:', error.message);
    return null;
  }
};

const getPythonRuntimeSettings = (runtimeSettings = {}) => {
  if (!isPlainObject(runtimeSettings) || !isPlainObject(runtimeSettings.pythonRuntime)) {
    return {};
  }

  return runtimeSettings.pythonRuntime;
};

const resolvePythonRuntimeBaseUrl = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  const settingsBaseUrl = normalizeText(pythonRuntimeSettings.baseUrl || '').replace(/\/$/, '');

  return settingsBaseUrl || DEFAULT_PY_RUNTIME_BASE_URL;
};

const resolvePythonRuntimeStrictMode = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  if (typeof pythonRuntimeSettings.strictMode === 'boolean') {
    return pythonRuntimeSettings.strictMode;
  }

  return false;
};

const resolvePythonRuntimeFallbackEnabled = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  const modelRouting = isPlainObject(pythonRuntimeSettings.modelRouting)
    ? pythonRuntimeSettings.modelRouting
    : {};

  if (typeof modelRouting.fallbackEnabled === 'boolean') {
    return modelRouting.fallbackEnabled;
  }

  return true;
};

const resolvePythonRuntimeHealthGateSettings = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  const healthGateSettings = isPlainObject(pythonRuntimeSettings.healthGate)
    ? pythonRuntimeSettings.healthGate
    : {};

  return {
    enabled:
      healthGateSettings.enabled === undefined
        ? DEFAULT_PY_HEALTH_GATE_SETTINGS.enabled === true
        : healthGateSettings.enabled === true,
    strictGate:
      healthGateSettings.strictGate === undefined
        ? DEFAULT_PY_HEALTH_GATE_SETTINGS.strictGate === true
        : healthGateSettings.strictGate === true,
    checkPath:
      normalizeText(healthGateSettings.checkPath || DEFAULT_PY_HEALTH_GATE_SETTINGS.checkPath) ||
      DEFAULT_PY_HEALTH_GATE_SETTINGS.checkPath,
    timeoutMs: Math.max(
      300,
      Number(healthGateSettings.timeoutMs || DEFAULT_PY_HEALTH_GATE_SETTINGS.timeoutMs) ||
        DEFAULT_PY_HEALTH_GATE_SETTINGS.timeoutMs,
    ),
    cacheTtlMs: Math.max(
      0,
      Number(healthGateSettings.cacheTtlMs || DEFAULT_PY_HEALTH_GATE_SETTINGS.cacheTtlMs) ||
        DEFAULT_PY_HEALTH_GATE_SETTINGS.cacheTtlMs,
    ),
    maxConsecutiveFailures: Math.max(
      1,
      Number(
        healthGateSettings.maxConsecutiveFailures ||
          DEFAULT_PY_HEALTH_GATE_SETTINGS.maxConsecutiveFailures,
      ) || DEFAULT_PY_HEALTH_GATE_SETTINGS.maxConsecutiveFailures,
    ),
    cooldownMs: Math.max(
      0,
      Number(healthGateSettings.cooldownMs || DEFAULT_PY_HEALTH_GATE_SETTINGS.cooldownMs) ||
        DEFAULT_PY_HEALTH_GATE_SETTINGS.cooldownMs,
    ),
  };
};

const resolveModuleRouteFromSettings = (moduleName = '', runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  const modelRouting = isPlainObject(pythonRuntimeSettings.modelRouting)
    ? pythonRuntimeSettings.modelRouting
    : {};
  const moduleRoutes = isPlainObject(modelRouting.moduleRoutes)
    ? modelRouting.moduleRoutes
    : {};

  return normalizeRoute(moduleRoutes[moduleName], '');
};

const buildRuntimeConfigPayload = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);
  const modelRouting = isPlainObject(pythonRuntimeSettings.modelRouting)
    ? pythonRuntimeSettings.modelRouting
    : {};
  const channels = isPlainObject(pythonRuntimeSettings.channels)
    ? pythonRuntimeSettings.channels
    : {};
  const localChannel = isPlainObject(channels.local) ? channels.local : {};
  const cloudChannel = isPlainObject(channels.cloud) ? channels.cloud : {};

  const localModel = normalizeText(localChannel.model || '');
  const localApiBase = normalizeText(localChannel.apiBase || '');
  const localApiKey = normalizeText(localChannel.apiKey || '');
  const cloudModel = normalizeText(cloudChannel.model || '');
  const cloudApiBase = normalizeText(cloudChannel.apiBase || '');
  const cloudApiKey = normalizeText(cloudChannel.apiKey || '');
  const analyzeRoute = normalizeRoute(modelRouting.moduleRoutes?.analyze, '');
  const searchRoute = normalizeRoute(modelRouting.moduleRoutes?.search, '');
  const scriptRoute = normalizeRoute(modelRouting.moduleRoutes?.script, '');

  const payload = {
    modelRouting: {
      enabled: modelRouting.enabled !== false,
      fallbackEnabled: modelRouting.fallbackEnabled !== false,
      moduleRoutes: {
        analyze: analyzeRoute || undefined,
        search: searchRoute || undefined,
        script: scriptRoute || undefined,
      },
    },
    channels: {
      local: {
        model: localModel || undefined,
        apiBase: localApiBase || undefined,
        apiKey: localApiKey || undefined,
      },
      cloud: {
        model: cloudModel || undefined,
        apiBase: cloudApiBase || undefined,
        apiKey: cloudApiKey || undefined,
      },
    },
  };

  return payload;
};

const fetchJsonWithTimeout = async ({
  url = '',
  timeoutMs = 1500,
  method = 'GET',
  payload = null,
} = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      signal: controller.signal,
      body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
    });

    let data = null;
    let rawText = '';

    try {
      rawText = await response.text();
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
    };
  } finally {
    clearTimeout(timer);
  }
};

const probePythonRuntimeHealthInternal = async ({ runtimeSettings = {}, force = false } = {}) => {
  const baseUrl = resolvePythonRuntimeBaseUrl(runtimeSettings);
  const healthGate = resolvePythonRuntimeHealthGateSettings(runtimeSettings);
  const now = Date.now();

  if (!healthGate.enabled) {
    return {
      healthy: true,
      status: 'skipped',
      reason: 'health-gate-disabled',
      checkedAt: new Date(now).toISOString(),
      latencyMs: 0,
      strictGate: healthGate.strictGate,
      baseUrl,
      fromCache: false,
    };
  }

  if (!force && pythonRuntimeHealthState.cacheExpiresAt > now && pythonRuntimeHealthState.healthy !== null) {
    return {
      healthy: pythonRuntimeHealthState.healthy === true,
      status: pythonRuntimeHealthState.status,
      reason: pythonRuntimeHealthState.message,
      checkedAt: pythonRuntimeHealthState.checkedAt,
      latencyMs: pythonRuntimeHealthState.latencyMs,
      strictGate: healthGate.strictGate,
      baseUrl,
      fromCache: true,
      consecutiveFailures: pythonRuntimeHealthState.consecutiveFailures,
      cooldownUntil: pythonRuntimeHealthState.cooldownUntil,
    };
  }

  if (!force && pythonRuntimeHealthState.cooldownUntil > now) {
    const cooldownMessage = 'python-runtime-health-cooldown';

    safeRecordPythonRuntimeHealthProbe({
      healthy: false,
      latencyMs: 0,
      statusCode: 0,
      message: cooldownMessage,
      baseUrl,
    });

    return {
      healthy: false,
      status: 'cooldown',
      reason: cooldownMessage,
      checkedAt: new Date(now).toISOString(),
      latencyMs: 0,
      strictGate: healthGate.strictGate,
      baseUrl,
      fromCache: false,
      consecutiveFailures: pythonRuntimeHealthState.consecutiveFailures,
      cooldownUntil: pythonRuntimeHealthState.cooldownUntil,
    };
  }

  const targetPath = healthGate.checkPath.startsWith('/')
    ? healthGate.checkPath
    : `/${healthGate.checkPath}`;
  const healthUrl = `${baseUrl.replace(/\/$/, '')}${targetPath}`;
  const probeStartedAt = Date.now();

  try {
    const response = await fetchJsonWithTimeout({
      url: healthUrl,
      timeoutMs: healthGate.timeoutMs,
      method: 'GET',
    });
    const latencyMs = Math.max(0, Date.now() - probeStartedAt);
    const healthPayload = isPlainObject(response.data) ? response.data : {};
    const responseSuccessFlag = healthPayload.success;
    const healthy =
      response.ok &&
      (responseSuccessFlag === undefined || responseSuccessFlag === true);
    const message = healthy
      ? 'python-runtime-healthy'
      : normalizeText(
          healthPayload.error ||
            healthPayload.message ||
            response.rawText ||
            `python-runtime-health-http-${response.status}`,
        );

    pythonRuntimeHealthState.healthy = healthy;
    pythonRuntimeHealthState.status = healthy ? 'healthy' : 'unhealthy';
    pythonRuntimeHealthState.checkedAt = new Date().toISOString();
    pythonRuntimeHealthState.latencyMs = latencyMs;
    pythonRuntimeHealthState.message = message;
    pythonRuntimeHealthState.baseUrl = baseUrl;
    pythonRuntimeHealthState.consecutiveFailures = healthy
      ? 0
      : pythonRuntimeHealthState.consecutiveFailures + 1;
    pythonRuntimeHealthState.cacheExpiresAt = Date.now() + healthGate.cacheTtlMs;

    if (
      !healthy &&
      pythonRuntimeHealthState.consecutiveFailures >= healthGate.maxConsecutiveFailures
    ) {
      pythonRuntimeHealthState.cooldownUntil = Date.now() + healthGate.cooldownMs;
    }

    if (healthy) {
      pythonRuntimeHealthState.cooldownUntil = 0;
    }

    safeRecordPythonRuntimeHealthProbe({
      healthy,
      latencyMs,
      statusCode: response.status,
      message,
      baseUrl,
    });

    return {
      healthy,
      status: pythonRuntimeHealthState.status,
      reason: message,
      checkedAt: pythonRuntimeHealthState.checkedAt,
      latencyMs,
      strictGate: healthGate.strictGate,
      baseUrl,
      fromCache: false,
      consecutiveFailures: pythonRuntimeHealthState.consecutiveFailures,
      cooldownUntil: pythonRuntimeHealthState.cooldownUntil,
    };
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - probeStartedAt);
    const message = normalizeText(error?.message || 'python-runtime-health-check-failed');

    pythonRuntimeHealthState.healthy = false;
    pythonRuntimeHealthState.status = 'unhealthy';
    pythonRuntimeHealthState.checkedAt = new Date().toISOString();
    pythonRuntimeHealthState.latencyMs = latencyMs;
    pythonRuntimeHealthState.message = message;
    pythonRuntimeHealthState.baseUrl = baseUrl;
    pythonRuntimeHealthState.consecutiveFailures += 1;
    pythonRuntimeHealthState.cacheExpiresAt = Date.now() + healthGate.cacheTtlMs;

    if (pythonRuntimeHealthState.consecutiveFailures >= healthGate.maxConsecutiveFailures) {
      pythonRuntimeHealthState.cooldownUntil = Date.now() + healthGate.cooldownMs;
    }

    safeRecordPythonRuntimeHealthProbe({
      healthy: false,
      latencyMs,
      statusCode: 0,
      message,
      baseUrl,
    });

    return {
      healthy: false,
      status: 'unhealthy',
      reason: message,
      checkedAt: pythonRuntimeHealthState.checkedAt,
      latencyMs,
      strictGate: healthGate.strictGate,
      baseUrl,
      fromCache: false,
      consecutiveFailures: pythonRuntimeHealthState.consecutiveFailures,
      cooldownUntil: pythonRuntimeHealthState.cooldownUntil,
    };
  }
};

export const probePythonRuntimeHealth = async ({ runtimeSettings = {}, force = false } = {}) => {
  return probePythonRuntimeHealthInternal({
    runtimeSettings,
    force,
  });
};

export const getPythonRuntimeHealthSnapshot = () => {
  return {
    status: pythonRuntimeHealthState.status,
    healthy: pythonRuntimeHealthState.healthy,
    checkedAt: pythonRuntimeHealthState.checkedAt,
    latencyMs: pythonRuntimeHealthState.latencyMs,
    message: pythonRuntimeHealthState.message,
    consecutiveFailures: pythonRuntimeHealthState.consecutiveFailures,
    cooldownUntil: pythonRuntimeHealthState.cooldownUntil
      ? new Date(pythonRuntimeHealthState.cooldownUntil).toISOString()
      : '',
    baseUrl: pythonRuntimeHealthState.baseUrl,
  };
};

const assertPythonRuntimeHealthy = async (runtimeSettings = {}) => {
  const healthProbe = await probePythonRuntimeHealth({
    runtimeSettings,
    force: false,
  });

  if (healthProbe.healthy) {
    return healthProbe;
  }

  const error = new Error(
    `[python-runtime] health gate blocked request: ${healthProbe.reason || 'runtime unhealthy'}`,
  );
  error.code = 'PY_RUNTIME_HEALTH_GATE_FAILED';
  error.healthProbe = healthProbe;

  throw error;
};

const callPythonRuntime = async ({
  endpoint = '',
  payload = {},
  baseUrl = '',
} = {}) => {
  const resolvedBaseUrl = normalizeText(baseUrl || DEFAULT_PY_RUNTIME_BASE_URL).replace(/\/$/, '');
  const targetUrl = `${resolvedBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`python-runtime http ${response.status}: ${errorText}`);
  }

  const responseData = await response.json();

  if (responseData?.success === false) {
    throw new Error(responseData?.error || responseData?.message || 'python-runtime request failed');
  }

  return responseData?.data || {};
};

const resolveInputPayload = (input = {}, context = {}, moduleName = '') => {
  const runtimeSettings = context?.settings || {};
  const requestedRoute = normalizeRoute(input?.modelRoute, '');
  const routeFromSettings = resolveModuleRouteFromSettings(moduleName, runtimeSettings);
  const modelRoute = requestedRoute || routeFromSettings;

  const runtimeConfig = buildRuntimeConfigPayload(runtimeSettings);

  const payload = {
    ...(input && typeof input === 'object' ? input : {}),
    sessionId: normalizeText(input?.sessionId || context?.requestPayload?.sessionId),
  };

  if (modelRoute) {
    payload.modelRoute = modelRoute;
  }

  payload.runtimeConfig = runtimeConfig;

  return payload;
};

export const isPythonRuntimeEnabled = (runtimeSettings = {}) => {
  const pythonRuntimeSettings = getPythonRuntimeSettings(runtimeSettings);

  return pythonRuntimeSettings.enabled === true;
};

export const runPythonAnalyzeNode = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/analyze-customer',
    payload: resolveInputPayload(input, context, 'analyze'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const runPythonSearchNode = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/search-documents',
    payload: resolveInputPayload(input, context, 'search'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const runPythonScriptNode = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/generate-script',
    payload: resolveInputPayload(input, context, 'script'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const runPythonExternalSourceQuery = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/external-sources/query',
    payload: resolveInputPayload(input, context, 'search'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const runPythonExternalSourceFetch = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/external-sources/fetch',
    payload: resolveInputPayload(input, context, 'search'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const runPythonExternalSourceDownload = async ({ input = {}, context = {} } = {}) => {
  await assertPythonRuntimeHealthy(context?.settings || {});

  return callPythonRuntime({
    endpoint: '/api/v1/external-sources/download',
    payload: resolveInputPayload(input, context, 'search'),
    baseUrl: resolvePythonRuntimeBaseUrl(context?.settings || {}),
  });
};

export const handlePythonRuntimeFallback = ({
  error = null,
  nodeType = '',
  runtimeSettings = {},
} = {}) => {
  const message = normalizeText(error?.message || 'python-runtime failed');
  console.warn(`[python-runtime] ${nodeType} fallback to node implementation: ${message}`);

  const strictMode = resolvePythonRuntimeStrictMode(runtimeSettings);
  const fallbackEnabled = resolvePythonRuntimeFallbackEnabled(runtimeSettings);
  const healthGateSettings = resolvePythonRuntimeHealthGateSettings(runtimeSettings);
  const isHealthGateFailure =
    normalizeText(error?.code) === 'PY_RUNTIME_HEALTH_GATE_FAILED' ||
    message.includes('health gate blocked');

  if (
    !fallbackEnabled ||
    strictMode ||
    (healthGateSettings.strictGate === true && isHealthGateFailure)
  ) {
    throw error;
  }
};
