import { randomUUID } from 'crypto';
import { readJsonFile, resolveMockDataPath, writeJsonFile } from './jsonDataService.js';
import { nowLocalIso } from '../utils/localTime.js';

const OPS_OBSERVABILITY_CONTRACT_VERSION = 'ops-observability/v1';
const OPS_OBSERVABILITY_FILE = 'opsRuntimeDashboard.json';

const MAX_ALERT_COUNT = 200;
const MAX_PROCESS_EVENT_COUNT = 600;
const MAX_DURATION_HISTORY = 200;

const DEFAULT_ALERT_POLICY = Object.freeze({
  minSampleSize: 20,
  maxErrorRatePercent: 25,
  consecutiveFailures: 3,
  dailyCostUsdThreshold: 20,
  pythonRuntimeFailureThreshold: 2,
});

const DEFAULT_COST_POLICY = Object.freeze({
  cloudPromptUsdPer1k: 0.0005,
  cloudCompletionUsdPer1k: 0.0015,
  localPromptUsdPer1k: 0,
  localCompletionUsdPer1k: 0,
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value = '') => String(value || '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Math.round(toNumber(value, fallback));
  return parsed >= 0 ? parsed : fallback;
};

const nowIso = nowLocalIso;

const resolveAlertPolicy = () => {
  return {
    minSampleSize: Math.max(
      1,
      toPositiveInt(process.env.OPS_ALERT_MIN_SAMPLE_SIZE, DEFAULT_ALERT_POLICY.minSampleSize),
    ),
    maxErrorRatePercent: Math.max(
      1,
      toNumber(process.env.OPS_ALERT_MAX_ERROR_RATE_PERCENT, DEFAULT_ALERT_POLICY.maxErrorRatePercent),
    ),
    consecutiveFailures: Math.max(
      1,
      toPositiveInt(process.env.OPS_ALERT_CONSECUTIVE_FAILURES, DEFAULT_ALERT_POLICY.consecutiveFailures),
    ),
    dailyCostUsdThreshold: Math.max(
      0,
      toNumber(process.env.OPS_ALERT_DAILY_COST_USD_THRESHOLD, DEFAULT_ALERT_POLICY.dailyCostUsdThreshold),
    ),
    pythonRuntimeFailureThreshold: Math.max(
      1,
      toPositiveInt(
        process.env.OPS_PY_RUNTIME_FAILURE_THRESHOLD,
        DEFAULT_ALERT_POLICY.pythonRuntimeFailureThreshold,
      ),
    ),
  };
};

const resolveCostPolicy = () => {
  return {
    cloudPromptUsdPer1k: Math.max(
      0,
      toNumber(process.env.OPS_CLOUD_PROMPT_USD_PER_1K, DEFAULT_COST_POLICY.cloudPromptUsdPer1k),
    ),
    cloudCompletionUsdPer1k: Math.max(
      0,
      toNumber(
        process.env.OPS_CLOUD_COMPLETION_USD_PER_1K,
        DEFAULT_COST_POLICY.cloudCompletionUsdPer1k,
      ),
    ),
    localPromptUsdPer1k: Math.max(
      0,
      toNumber(process.env.OPS_LOCAL_PROMPT_USD_PER_1K, DEFAULT_COST_POLICY.localPromptUsdPer1k),
    ),
    localCompletionUsdPer1k: Math.max(
      0,
      toNumber(
        process.env.OPS_LOCAL_COMPLETION_USD_PER_1K,
        DEFAULT_COST_POLICY.localCompletionUsdPer1k,
      ),
    ),
  };
};

const buildDefaultStore = () => ({
  contractVersion: OPS_OBSERVABILITY_CONTRACT_VERSION,
  updatedAt: nowIso(),
  totals: {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
  },
  routeBuckets: {},
  costByDate: {},
  health: {
    pythonRuntime: {
      status: 'unknown',
      consecutiveFailures: 0,
      lastCheckedAt: '',
      lastHealthyAt: '',
      lastErrorAt: '',
      lastErrorMessage: '',
      lastLatencyMs: 0,
      baseUrl: '',
    },
  },
  alerts: [],
  processEvents: [],
});

const normalizeDurations = (durations = []) => {
  if (!Array.isArray(durations)) {
    return [];
  }

  return durations
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .slice(-MAX_DURATION_HISTORY);
};

const normalizeAlert = (alert = {}) => {
  const now = nowIso();

  return {
    alertId: normalizeText(alert.alertId) || randomUUID(),
    level: normalizeText(alert.level) || 'warning',
    category: normalizeText(alert.category) || 'general',
    title: normalizeText(alert.title) || 'runtime alert',
    message: normalizeText(alert.message) || 'runtime alert triggered',
    fingerprint: normalizeText(alert.fingerprint),
    status: normalizeText(alert.status) || 'open',
    createdAt: normalizeText(alert.createdAt) || now,
    updatedAt: normalizeText(alert.updatedAt) || now,
    lastSeenAt: normalizeText(alert.lastSeenAt) || now,
    count: Math.max(1, toPositiveInt(alert.count, 1)),
    acknowledgedBy: normalizeText(alert.acknowledgedBy),
    acknowledgedAt: normalizeText(alert.acknowledgedAt),
    metadata: isPlainObject(alert.metadata) ? alert.metadata : {},
  };
};

const normalizeRouteBucket = (bucket = {}, routeKey = '') => {
  const durations = normalizeDurations(bucket.durations);
  const requestCount = Math.max(0, toPositiveInt(bucket.requestCount, 0));
  const failureCount = Math.max(0, toPositiveInt(bucket.failureCount, 0));
  const successCount = Math.max(0, toPositiveInt(bucket.successCount, 0));
  const promptTokens = Math.max(0, toPositiveInt(bucket.promptTokens, 0));
  const completionTokens = Math.max(0, toPositiveInt(bucket.completionTokens, 0));
  const totalTokens = Math.max(0, toPositiveInt(bucket.totalTokens, promptTokens + completionTokens));
  const totalCostUsd = Math.max(0, toNumber(bucket.totalCostUsd, 0));
  const consecutiveFailures = Math.max(0, toPositiveInt(bucket.consecutiveFailures, 0));

  return {
    routeKey: normalizeText(bucket.routeKey) || routeKey,
    kind: normalizeText(bucket.kind),
    route: normalizeText(bucket.route),
    pluginId: normalizeText(bucket.pluginId),
    requestCount,
    successCount,
    failureCount,
    errorRatePercent:
      requestCount > 0 ? Number(((failureCount / requestCount) * 100).toFixed(2)) : 0,
    avgLatencyMs:
      durations.length > 0
        ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2))
        : 0,
    p95LatencyMs: computeP95Latency(durations),
    durations,
    promptTokens,
    completionTokens,
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    modelProvider: normalizeText(bucket.modelProvider),
    modelName: normalizeText(bucket.modelName),
    lastStatus: normalizeText(bucket.lastStatus) || 'unknown',
    consecutiveFailures,
    lastUpdatedAt: normalizeText(bucket.lastUpdatedAt),
  };
};

const normalizeStore = (payload = null) => {
  const source = isPlainObject(payload) ? payload : {};
  const fallback = buildDefaultStore();
  const routeBuckets = isPlainObject(source.routeBuckets) ? source.routeBuckets : {};

  const normalizedRouteBuckets = Object.fromEntries(
    Object.entries(routeBuckets).map(([routeKey, bucket]) => {
      return [routeKey, normalizeRouteBucket(bucket, routeKey)];
    }),
  );

  const totals = {
    requestCount: Math.max(0, toPositiveInt(source?.totals?.requestCount, 0)),
    successCount: Math.max(0, toPositiveInt(source?.totals?.successCount, 0)),
    failureCount: Math.max(0, toPositiveInt(source?.totals?.failureCount, 0)),
    promptTokens: Math.max(0, toPositiveInt(source?.totals?.promptTokens, 0)),
    completionTokens: Math.max(0, toPositiveInt(source?.totals?.completionTokens, 0)),
    totalTokens: Math.max(0, toPositiveInt(source?.totals?.totalTokens, 0)),
    totalCostUsd: Math.max(0, toNumber(source?.totals?.totalCostUsd, 0)),
  };

  return {
    contractVersion: OPS_OBSERVABILITY_CONTRACT_VERSION,
    updatedAt: normalizeText(source.updatedAt) || fallback.updatedAt,
    totals,
    routeBuckets: normalizedRouteBuckets,
    costByDate: isPlainObject(source.costByDate) ? source.costByDate : {},
    health: {
      pythonRuntime: {
        ...fallback.health.pythonRuntime,
        ...(isPlainObject(source?.health?.pythonRuntime) ? source.health.pythonRuntime : {}),
      },
    },
    alerts: Array.isArray(source.alerts)
      ? source.alerts
          .map((item) => normalizeAlert(item))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, MAX_ALERT_COUNT)
      : [],
    processEvents: Array.isArray(source.processEvents)
      ? source.processEvents.slice(0, MAX_PROCESS_EVENT_COUNT)
      : [],
  };
};

let store = null;

const ensureStore = () => {
  if (!store) {
    const hydrated = readJsonFile(OPS_OBSERVABILITY_FILE, buildDefaultStore());
    store = normalizeStore(hydrated);
  }

  return store;
};

const persistStore = () => {
  if (!store) {
    return;
  }

  store.updatedAt = nowIso();
  writeJsonFile(OPS_OBSERVABILITY_FILE, store);
};

const computeP95Latency = (durations = []) => {
  if (!Array.isArray(durations) || durations.length === 0) {
    return 0;
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)] || 0;
};

const estimateTokenCount = (payload = null) => {
  if (payload === null || payload === undefined) {
    return 0;
  }

  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (!text) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / 4));
};

const normalizeModelRuntimeForCost = (modelRuntime = null) => {
  if (!isPlainObject(modelRuntime)) {
    return {
      provider: '',
      modelName: '',
    };
  }

  return {
    provider: normalizeText(
      modelRuntime?.resolvedModel?.resolvedProvider ||
        modelRuntime?.resolvedModel?.source ||
        modelRuntime?.route ||
        '',
    ).toLowerCase(),
    modelName: normalizeText(
      modelRuntime?.resolvedModel?.resolvedModelName ||
        modelRuntime?.resolvedModel?.modelName ||
        '',
    ),
  };
};

const resolveTokenPrice = ({ provider = '', modelName = '' } = {}) => {
  const normalizedProvider = normalizeText(provider).toLowerCase();
  const normalizedModel = normalizeText(modelName).toLowerCase();
  const costPolicy = resolveCostPolicy();

  const isLocal =
    normalizedProvider.includes('local') ||
    normalizedProvider.includes('ollama') ||
    normalizedModel.includes('ollama');

  if (isLocal) {
    return {
      promptUsdPer1k: costPolicy.localPromptUsdPer1k,
      completionUsdPer1k: costPolicy.localCompletionUsdPer1k,
      pricingPlan: 'local',
    };
  }

  return {
    promptUsdPer1k: costPolicy.cloudPromptUsdPer1k,
    completionUsdPer1k: costPolicy.cloudCompletionUsdPer1k,
    pricingPlan: 'cloud',
  };
};

const buildAlertFingerprint = ({ category = '', title = '', routeKey = '', pluginId = '' } = {}) => {
  return [normalizeText(category), normalizeText(title), normalizeText(routeKey), normalizeText(pluginId)]
    .filter(Boolean)
    .join('::');
};

const upsertAlert = ({
  category = 'general',
  level = 'warning',
  title = 'runtime alert',
  message = 'runtime alert triggered',
  routeKey = '',
  pluginId = '',
  metadata = {},
} = {}) => {
  const dataStore = ensureStore();
  const now = nowIso();
  const fingerprint = buildAlertFingerprint({ category, title, routeKey, pluginId });
  const matchedAlert = dataStore.alerts.find(
    (item) => item.status === 'open' && item.fingerprint === fingerprint,
  );

  if (matchedAlert) {
    matchedAlert.updatedAt = now;
    matchedAlert.lastSeenAt = now;
    matchedAlert.count = Math.max(1, Number(matchedAlert.count || 1) + 1);
    matchedAlert.message = message || matchedAlert.message;
    matchedAlert.metadata = {
      ...(isPlainObject(matchedAlert.metadata) ? matchedAlert.metadata : {}),
      ...(isPlainObject(metadata) ? metadata : {}),
    };
    return matchedAlert;
  }

  const nextAlert = normalizeAlert({
    alertId: randomUUID(),
    category,
    level,
    title,
    message,
    fingerprint,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    count: 1,
    metadata,
  });

  dataStore.alerts.unshift(nextAlert);
  dataStore.alerts = dataStore.alerts
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_ALERT_COUNT);

  return nextAlert;
};

const resolveRouteBucket = ({ kind = '', route = '', pluginId = '' } = {}) => {
  const dataStore = ensureStore();
  const routeKey = `${normalizeText(kind)}:${normalizeText(route)}:${normalizeText(pluginId)}`;

  if (!dataStore.routeBuckets[routeKey]) {
    dataStore.routeBuckets[routeKey] = normalizeRouteBucket(
      {
        routeKey,
        kind,
        route,
        pluginId,
      },
      routeKey,
    );
  }

  return dataStore.routeBuckets[routeKey];
};

const addCostByDate = ({ dateKey = '', costUsd = 0 } = {}) => {
  if (!dateKey || costUsd <= 0) {
    return;
  }

  const dataStore = ensureStore();
  const currentCost = toNumber(dataStore.costByDate[dateKey], 0);
  dataStore.costByDate[dateKey] = Number((currentCost + costUsd).toFixed(6));
};

export const recordWorkflowObservation = ({
  kind = '',
  route = '',
  pluginId = '',
  success = false,
  durationMs = 0,
  requestPayload = null,
  outputPayload = null,
  modelRuntime = null,
  resolutionMode = '',
  fallbackReason = '',
} = {}) => {
  const dataStore = ensureStore();
  const bucket = resolveRouteBucket({ kind, route, pluginId });
  const normalizedDuration = Math.max(0, toNumber(durationMs, 0));
  const promptTokens = estimateTokenCount(requestPayload);
  const completionTokens = estimateTokenCount(outputPayload);
  const totalTokens = Math.max(0, promptTokens + completionTokens);
  const modelForCost = normalizeModelRuntimeForCost(modelRuntime);
  const tokenPrice = resolveTokenPrice(modelForCost);
  const estimatedCostUsd = Number(
    (
      (promptTokens / 1000) * tokenPrice.promptUsdPer1k +
      (completionTokens / 1000) * tokenPrice.completionUsdPer1k
    ).toFixed(6),
  );

  bucket.requestCount += 1;
  bucket.successCount += success ? 1 : 0;
  bucket.failureCount += success ? 0 : 1;
  bucket.promptTokens += promptTokens;
  bucket.completionTokens += completionTokens;
  bucket.totalTokens += totalTokens;
  bucket.totalCostUsd = Number((Number(bucket.totalCostUsd || 0) + estimatedCostUsd).toFixed(6));
  bucket.modelProvider = modelForCost.provider || bucket.modelProvider || '';
  bucket.modelName = modelForCost.modelName || bucket.modelName || '';
  bucket.lastStatus = success ? 'success' : 'failed';
  bucket.lastUpdatedAt = nowIso();
  bucket.consecutiveFailures = success ? 0 : bucket.consecutiveFailures + 1;
  bucket.durations = normalizeDurations([...(bucket.durations || []), normalizedDuration]);
  bucket.errorRatePercent =
    bucket.requestCount > 0
      ? Number(((bucket.failureCount / bucket.requestCount) * 100).toFixed(2))
      : 0;
  bucket.avgLatencyMs =
    bucket.durations.length > 0
      ? Number(
          (
            bucket.durations.reduce((sum, value) => sum + value, 0) /
            bucket.durations.length
          ).toFixed(2),
        )
      : 0;
  bucket.p95LatencyMs = computeP95Latency(bucket.durations);

  dataStore.totals.requestCount += 1;
  dataStore.totals.successCount += success ? 1 : 0;
  dataStore.totals.failureCount += success ? 0 : 1;
  dataStore.totals.promptTokens += promptTokens;
  dataStore.totals.completionTokens += completionTokens;
  dataStore.totals.totalTokens += totalTokens;
  dataStore.totals.totalCostUsd = Number(
    (Number(dataStore.totals.totalCostUsd || 0) + estimatedCostUsd).toFixed(6),
  );

  addCostByDate({
    dateKey: nowIso().slice(0, 10),
    costUsd: estimatedCostUsd,
  });

  const alertPolicy = resolveAlertPolicy();

  if (bucket.consecutiveFailures >= alertPolicy.consecutiveFailures) {
    upsertAlert({
      category: 'workflow-consecutive-failures',
      level: 'critical',
      title: `工作流连续失败：${bucket.kind}/${bucket.route}`,
      message: `插件 ${bucket.pluginId || 'unknown'} 连续失败 ${bucket.consecutiveFailures} 次。`,
      routeKey: bucket.routeKey,
      pluginId: bucket.pluginId,
      metadata: {
        consecutiveFailures: bucket.consecutiveFailures,
        errorRatePercent: bucket.errorRatePercent,
      },
    });
  }

  if (
    bucket.requestCount >= alertPolicy.minSampleSize &&
    bucket.errorRatePercent >= alertPolicy.maxErrorRatePercent
  ) {
    upsertAlert({
      category: 'workflow-error-rate',
      level: 'warning',
      title: `工作流错误率告警：${bucket.kind}/${bucket.route}`,
      message: `最近 ${bucket.requestCount} 次请求错误率达到 ${bucket.errorRatePercent}%`,
      routeKey: bucket.routeKey,
      pluginId: bucket.pluginId,
      metadata: {
        requestCount: bucket.requestCount,
        failureCount: bucket.failureCount,
        errorRatePercent: bucket.errorRatePercent,
      },
    });
  }

  const todayKey = nowIso().slice(0, 10);
  const todayCost = toNumber(dataStore.costByDate[todayKey], 0);
  if (todayCost >= alertPolicy.dailyCostUsdThreshold && alertPolicy.dailyCostUsdThreshold > 0) {
    upsertAlert({
      category: 'workflow-daily-cost',
      level: 'warning',
      title: '当日成本阈值告警',
      message: `当日成本估算 ${todayCost.toFixed(4)} USD，超过阈值 ${alertPolicy.dailyCostUsdThreshold} USD`,
      routeKey: bucket.routeKey,
      pluginId: bucket.pluginId,
      metadata: {
        day: todayKey,
        todayCostUsd: todayCost,
        thresholdUsd: alertPolicy.dailyCostUsdThreshold,
      },
    });
  }

  if (normalizeText(fallbackReason)) {
    upsertAlert({
      category: 'workflow-fallback',
      level: 'info',
      title: `触发回退：${bucket.kind}/${bucket.route}`,
      message: normalizeText(fallbackReason),
      routeKey: bucket.routeKey,
      pluginId: bucket.pluginId,
      metadata: {
        resolutionMode: normalizeText(resolutionMode),
      },
    });
  }

  persistStore();

  return {
    routeKey: bucket.routeKey,
    kind: bucket.kind,
    route: bucket.route,
    pluginId: bucket.pluginId,
    requestCount: bucket.requestCount,
    successCount: bucket.successCount,
    failureCount: bucket.failureCount,
    errorRatePercent: bucket.errorRatePercent,
    avgLatencyMs: bucket.avgLatencyMs,
    p95LatencyMs: bucket.p95LatencyMs,
    promptTokens: bucket.promptTokens,
    completionTokens: bucket.completionTokens,
    totalTokens: bucket.totalTokens,
    totalCostUsd: bucket.totalCostUsd,
    estimatedCostUsd,
    modelProvider: bucket.modelProvider,
    modelName: bucket.modelName,
    pricingPlan: tokenPrice.pricingPlan,
    tokenPrice,
  };
};

export const recordPythonRuntimeHealthProbe = ({
  healthy = false,
  latencyMs = 0,
  statusCode = 0,
  message = '',
  baseUrl = '',
} = {}) => {
  const dataStore = ensureStore();
  const runtimeHealth = dataStore.health.pythonRuntime || buildDefaultStore().health.pythonRuntime;
  const now = nowIso();
  const previousConsecutiveFailures = Math.max(
    0,
    toPositiveInt(runtimeHealth.consecutiveFailures, 0),
  );
  const hadRecentFailure = previousConsecutiveFailures > 0;

  runtimeHealth.status = healthy ? 'healthy' : 'unhealthy';
  runtimeHealth.lastCheckedAt = now;
  runtimeHealth.lastLatencyMs = Math.max(0, toNumber(latencyMs, 0));
  runtimeHealth.baseUrl = normalizeText(baseUrl);

  if (healthy) {
    runtimeHealth.consecutiveFailures = 0;
    runtimeHealth.lastHealthyAt = now;
  } else {
    runtimeHealth.consecutiveFailures = previousConsecutiveFailures + 1;
    runtimeHealth.lastErrorAt = now;
    runtimeHealth.lastErrorMessage = normalizeText(message) || `http ${statusCode || 0}`;
  }

  dataStore.health.pythonRuntime = runtimeHealth;

  const alertPolicy = resolveAlertPolicy();
  if (!healthy && runtimeHealth.consecutiveFailures >= alertPolicy.pythonRuntimeFailureThreshold) {
    upsertAlert({
      category: 'python-runtime-health',
      level: 'critical',
      title: 'Python Runtime 健康告警',
      message:
        normalizeText(message) ||
        `Python Runtime 健康检查连续失败 ${runtimeHealth.consecutiveFailures} 次`,
      metadata: {
        statusCode,
        latencyMs: runtimeHealth.lastLatencyMs,
        consecutiveFailures: runtimeHealth.consecutiveFailures,
        baseUrl: runtimeHealth.baseUrl,
      },
    });
  }

  if (healthy && hadRecentFailure) {
    upsertAlert({
      category: 'python-runtime-recovery',
      level: 'info',
      title: 'Python Runtime 已恢复',
      message: '健康检查恢复正常，连续失败计数已清零。',
      metadata: {
        baseUrl: runtimeHealth.baseUrl,
      },
    });
  }

  persistStore();

  return {
    ...runtimeHealth,
  };
};

export const recordOpsProcessEvent = ({
  processName = '',
  eventType = '',
  message = '',
  metadata = {},
} = {}) => {
  const dataStore = ensureStore();
  const normalizedProcessName = normalizeText(processName) || 'unknown-process';
  const normalizedEventType = normalizeText(eventType) || 'event';
  const event = {
    eventId: randomUUID(),
    processName: normalizedProcessName,
    eventType: normalizedEventType,
    message: normalizeText(message),
    metadata: isPlainObject(metadata) ? metadata : {},
    occurredAt: nowIso(),
  };

  dataStore.processEvents.unshift(event);
  dataStore.processEvents = dataStore.processEvents.slice(0, MAX_PROCESS_EVENT_COUNT);

  if (
    normalizedEventType.includes('crash') ||
    normalizedEventType.includes('restart') ||
    normalizedEventType.includes('health-failed')
  ) {
    upsertAlert({
      category: 'process-supervision',
      level: 'warning',
      title: `进程事件：${normalizedProcessName}`,
      message: `${normalizedEventType}${event.message ? ` / ${event.message}` : ''}`,
      metadata: {
        processName: normalizedProcessName,
        eventType: normalizedEventType,
      },
    });
  }

  persistStore();

  return event;
};

const computeAlertSummary = (alerts = []) => {
  const normalizedAlerts = Array.isArray(alerts) ? alerts : [];
  const openAlerts = normalizedAlerts.filter((item) => item.status === 'open');

  return {
    total: normalizedAlerts.length,
    open: openAlerts.length,
    critical: openAlerts.filter((item) => item.level === 'critical').length,
    warning: openAlerts.filter((item) => item.level === 'warning').length,
    info: openAlerts.filter((item) => item.level === 'info').length,
  };
};

const buildTopCostRoutes = (routeBuckets = {}, limit = 10) => {
  return Object.values(routeBuckets)
    .sort((left, right) => Number(right.totalCostUsd || 0) - Number(left.totalCostUsd || 0))
    .slice(0, limit)
    .map((item) => ({
      routeKey: item.routeKey,
      kind: item.kind,
      route: item.route,
      pluginId: item.pluginId,
      requestCount: item.requestCount,
      errorRatePercent: item.errorRatePercent,
      totalCostUsd: Number(Number(item.totalCostUsd || 0).toFixed(6)),
      totalTokens: item.totalTokens,
      p95LatencyMs: item.p95LatencyMs,
      modelProvider: item.modelProvider,
      modelName: item.modelName,
      lastUpdatedAt: item.lastUpdatedAt,
    }));
};

export const getOpsDashboardSnapshot = () => {
  const dataStore = ensureStore();

  return {
    contractVersion: OPS_OBSERVABILITY_CONTRACT_VERSION,
    updatedAt: dataStore.updatedAt,
    persistence: {
      file: resolveMockDataPath(OPS_OBSERVABILITY_FILE),
    },
    totals: {
      requestCount: dataStore.totals.requestCount,
      successCount: dataStore.totals.successCount,
      failureCount: dataStore.totals.failureCount,
      errorRatePercent:
        dataStore.totals.requestCount > 0
          ? Number(
              ((dataStore.totals.failureCount / dataStore.totals.requestCount) * 100).toFixed(2),
            )
          : 0,
      promptTokens: dataStore.totals.promptTokens,
      completionTokens: dataStore.totals.completionTokens,
      totalTokens: dataStore.totals.totalTokens,
      totalCostUsd: Number(Number(dataStore.totals.totalCostUsd || 0).toFixed(6)),
    },
    health: {
      pythonRuntime: {
        ...(dataStore.health.pythonRuntime || {}),
      },
    },
    alerts: {
      summary: computeAlertSummary(dataStore.alerts),
      items: dataStore.alerts,
    },
    cost: {
      costByDate: dataStore.costByDate,
      topRoutes: buildTopCostRoutes(dataStore.routeBuckets, 10),
    },
    routes: Object.values(dataStore.routeBuckets)
      .sort((left, right) => Number(right.requestCount || 0) - Number(left.requestCount || 0)),
    processEvents: dataStore.processEvents,
    policy: {
      alert: resolveAlertPolicy(),
      cost: resolveCostPolicy(),
    },
  };
};

export const acknowledgeOpsAlert = ({ alertId = '', actorId = '' } = {}) => {
  const normalizedAlertId = normalizeText(alertId);

  if (!normalizedAlertId) {
    return null;
  }

  const dataStore = ensureStore();
  const matchedAlert = dataStore.alerts.find((item) => item.alertId === normalizedAlertId);

  if (!matchedAlert) {
    return null;
  }

  matchedAlert.status = 'acknowledged';
  matchedAlert.acknowledgedBy = normalizeText(actorId) || 'ops-console';
  matchedAlert.acknowledgedAt = nowIso();
  matchedAlert.updatedAt = matchedAlert.acknowledgedAt;

  persistStore();

  return matchedAlert;
};

export const getOpsObservabilityPersistenceSummary = () => {
  return {
    contractVersion: OPS_OBSERVABILITY_CONTRACT_VERSION,
    file: resolveMockDataPath(OPS_OBSERVABILITY_FILE),
    loadedAt: nowIso(),
  };
};
