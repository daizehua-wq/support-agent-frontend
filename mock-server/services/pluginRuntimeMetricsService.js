import { readJsonFile, resolveMockDataPath, writeJsonFile } from './jsonDataService.js';

const DEFAULT_MAX_HISTORY = 120;
const PLUGIN_RUNTIME_METRICS_CONTRACT_VERSION = 'plugin-runtime-metrics/v1';
const PLUGIN_RUNTIME_METRICS_FILE = 'pluginRuntimeMetrics.json';

const normalizeString = (value = '') => String(value || '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildMetricsKey = ({ kind = '', route = '', pluginId = '' } = {}) =>
  `${normalizeString(kind)}:${normalizeString(route)}:${normalizeString(pluginId)}`;

const metricsStore = new Map();

const normalizeDurations = (durations = []) => {
  if (!Array.isArray(durations)) {
    return [];
  }

  return durations
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .slice(-DEFAULT_MAX_HISTORY);
};

const normalizeMetricsBucket = (bucket = {}) => {
  const kind = normalizeString(bucket.kind);
  const route = normalizeString(bucket.route);
  const pluginId = normalizeString(bucket.pluginId);
  const key = buildMetricsKey({ kind, route, pluginId });
  const totalCount = Math.max(0, toNumber(bucket.totalCount, 0));
  const successCount = Math.max(0, toNumber(bucket.successCount, 0));
  const failureCount = Math.max(0, toNumber(bucket.failureCount, 0));
  const durations = normalizeDurations(bucket.durations);

  return {
    key,
    kind,
    route,
    pluginId,
    totalCount,
    successCount,
    failureCount,
    durations,
    updatedAt: normalizeString(bucket.updatedAt),
  };
};

const persistMetricsStore = () => {
  const items = [...metricsStore.values()].map((bucket) => ({
    key: bucket.key,
    kind: bucket.kind,
    route: bucket.route,
    pluginId: bucket.pluginId,
    totalCount: bucket.totalCount,
    successCount: bucket.successCount,
    failureCount: bucket.failureCount,
    durations: normalizeDurations(bucket.durations),
    updatedAt: bucket.updatedAt || '',
  }));

  writeJsonFile(PLUGIN_RUNTIME_METRICS_FILE, {
    contractVersion: PLUGIN_RUNTIME_METRICS_CONTRACT_VERSION,
    persistedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  });
};

const hydrateMetricsStore = () => {
  try {
    const payload = readJsonFile(PLUGIN_RUNTIME_METRICS_FILE, {
      contractVersion: PLUGIN_RUNTIME_METRICS_CONTRACT_VERSION,
      items: [],
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];

    items.forEach((item) => {
      const normalizedBucket = normalizeMetricsBucket(item);

      if (!normalizedBucket.kind || !normalizedBucket.route || !normalizedBucket.pluginId) {
        return;
      }

      metricsStore.set(normalizedBucket.key, normalizedBucket);
    });
  } catch (error) {
    console.warn(
      '[plugin-runtime-metrics] failed to hydrate persisted metrics:',
      error.message,
    );
  }
};

hydrateMetricsStore();

const getOrCreateMetricsBucket = ({
  kind = '',
  route = '',
  pluginId = '',
} = {}) => {
  const key = buildMetricsKey({ kind, route, pluginId });

  if (!metricsStore.has(key)) {
    metricsStore.set(key, {
      key,
      kind: normalizeString(kind),
      route: normalizeString(route),
      pluginId: normalizeString(pluginId),
      totalCount: 0,
      failureCount: 0,
      successCount: 0,
      durations: [],
      updatedAt: '',
    });
  }

  return metricsStore.get(key);
};

const computeP95 = (durations = []) => {
  if (!Array.isArray(durations) || durations.length === 0) {
    return 0;
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)] || 0;
};

export const recordPluginExecutionMetrics = ({
  kind = '',
  route = '',
  pluginId = '',
  success = false,
  durationMs = 0,
} = {}) => {
  const bucket = getOrCreateMetricsBucket({ kind, route, pluginId });
  bucket.totalCount += 1;
  bucket.successCount += success ? 1 : 0;
  bucket.failureCount += success ? 0 : 1;
  bucket.updatedAt = new Date().toISOString();

  if (Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0) {
    bucket.durations.push(Number(durationMs));

    if (bucket.durations.length > DEFAULT_MAX_HISTORY) {
      bucket.durations.splice(0, bucket.durations.length - DEFAULT_MAX_HISTORY);
    }
  }

  persistMetricsStore();

  const errorRatePercent =
    bucket.totalCount > 0
      ? Number(((bucket.failureCount / bucket.totalCount) * 100).toFixed(2))
      : 0;

  return {
    kind: bucket.kind,
    route: bucket.route,
    pluginId: bucket.pluginId,
    totalCount: bucket.totalCount,
    successCount: bucket.successCount,
    failureCount: bucket.failureCount,
    errorRatePercent,
    p95LatencyMs: computeP95(bucket.durations),
    updatedAt: bucket.updatedAt,
  };
};

export const getPluginExecutionMetricsSnapshot = ({
  kind = '',
  route = '',
  pluginId = '',
} = {}) => {
  const key = buildMetricsKey({ kind, route, pluginId });

  if (!metricsStore.has(key)) {
    return {
      kind: normalizeString(kind),
      route: normalizeString(route),
      pluginId: normalizeString(pluginId),
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      errorRatePercent: 0,
      p95LatencyMs: 0,
      updatedAt: '',
    };
  }

  const bucket = metricsStore.get(key);
  const errorRatePercent =
    bucket.totalCount > 0
      ? Number(((bucket.failureCount / bucket.totalCount) * 100).toFixed(2))
      : 0;

  return {
    kind: bucket.kind,
    route: bucket.route,
    pluginId: bucket.pluginId,
    totalCount: bucket.totalCount,
    successCount: bucket.successCount,
    failureCount: bucket.failureCount,
    errorRatePercent,
    p95LatencyMs: computeP95(bucket.durations),
    updatedAt: bucket.updatedAt,
  };
};

export const shouldGuardCanaryByMetrics = ({
  metrics = null,
  releaseConfig = null,
} = {}) => {
  const normalizedMetrics = metrics || {};
  const normalizedReleaseConfig = releaseConfig || {};
  const guardEnabled = normalizedReleaseConfig.guardEnabled === true;

  if (!guardEnabled) {
    return {
      triggered: false,
      reason: '',
      policy: null,
      metrics: normalizedMetrics,
    };
  }

  const minSampleSize = Math.max(1, toNumber(normalizedReleaseConfig.minSampleSize, 20));
  const maxErrorRatePercent = Math.max(0, toNumber(normalizedReleaseConfig.maxErrorRatePercent, 20));
  const maxP95LatencyMs = Math.max(0, toNumber(normalizedReleaseConfig.maxP95LatencyMs, 25000));

  if (Number(normalizedMetrics.totalCount || 0) < minSampleSize) {
    return {
      triggered: false,
      reason: 'sample-not-enough',
      policy: {
        minSampleSize,
        maxErrorRatePercent,
        maxP95LatencyMs,
      },
      metrics: normalizedMetrics,
    };
  }

  if (Number(normalizedMetrics.errorRatePercent || 0) > maxErrorRatePercent) {
    return {
      triggered: true,
      reason: 'error-rate-threshold-exceeded',
      policy: {
        minSampleSize,
        maxErrorRatePercent,
        maxP95LatencyMs,
      },
      metrics: normalizedMetrics,
    };
  }

  if (Number(normalizedMetrics.p95LatencyMs || 0) > maxP95LatencyMs) {
    return {
      triggered: true,
      reason: 'latency-p95-threshold-exceeded',
      policy: {
        minSampleSize,
        maxErrorRatePercent,
        maxP95LatencyMs,
      },
      metrics: normalizedMetrics,
    };
  }

  return {
    triggered: false,
    reason: '',
    policy: {
      minSampleSize,
      maxErrorRatePercent,
      maxP95LatencyMs,
    },
    metrics: normalizedMetrics,
  };
};

export const getAllPluginExecutionMetrics = () => {
  return [...metricsStore.values()].map((bucket) => ({
    kind: bucket.kind,
    route: bucket.route,
    pluginId: bucket.pluginId,
    totalCount: bucket.totalCount,
    successCount: bucket.successCount,
    failureCount: bucket.failureCount,
    errorRatePercent:
      bucket.totalCount > 0
        ? Number(((bucket.failureCount / bucket.totalCount) * 100).toFixed(2))
        : 0,
    p95LatencyMs: computeP95(bucket.durations),
    updatedAt: bucket.updatedAt,
  }));
};

export const getPluginExecutionMetricsPersistenceSummary = () => {
  const metricsFilePath = resolveMockDataPath(PLUGIN_RUNTIME_METRICS_FILE);

  return {
    contractVersion: PLUGIN_RUNTIME_METRICS_CONTRACT_VERSION,
    metricsFile: metricsFilePath,
    itemCount: metricsStore.size,
    loadedAt: new Date().toISOString(),
  };
};
