import process from 'process';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const TRACING_STATE_KEY = Symbol.for('mock-server.otel.state');

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return fallback;
};

const resolveTracingState = () => {
  if (!globalThis[TRACING_STATE_KEY]) {
    globalThis[TRACING_STATE_KEY] = {
      sdk: null,
      initialized: false,
      shutdownRegistered: false,
    };
  }

  return globalThis[TRACING_STATE_KEY];
};

const buildTracingResource = () =>
  resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME || 'mock-server',
    'service.version': process.env.npm_package_version || '0.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

const normalizeString = (value = '', fallback = '') => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim();
  return normalizedValue || fallback;
};

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveTraceExporterType = () => {
  const exporterType = normalizeString(
    process.env.OTEL_TRACES_EXPORTER || process.env.OTEL_TRACE_EXPORTER,
    'console',
  ).toLowerCase();

  if (['otlp', 'otlp-http', 'otlphttp'].includes(exporterType)) {
    return 'otlp';
  }

  if (['jaeger', 'jaeger-thrift'].includes(exporterType)) {
    return 'jaeger';
  }

  return 'console';
};

const parseHeaderString = (rawValue = '') => {
  const normalizedValue = normalizeString(rawValue);

  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((headers, pair) => {
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex <= 0) {
        return headers;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (!key || !value) {
        return headers;
      }

      headers[key] = value;
      return headers;
    }, {});
};

const buildOtlpExporterOptions = () => {
  const url = normalizeString(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    'http://127.0.0.1:4318/v1/traces',
  );
  const headers =
    parseHeaderString(
      process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ||
        process.env.OTEL_EXPORTER_OTLP_HEADERS,
    ) || undefined;
  const timeoutMillis = normalizeNumber(
    process.env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT ||
      process.env.OTEL_EXPORTER_OTLP_TIMEOUT,
    10000,
  );
  const concurrencyLimit = normalizeNumber(
    process.env.OTEL_EXPORTER_OTLP_TRACES_CONCURRENCY_LIMIT ||
      process.env.OTEL_EXPORTER_OTLP_CONCURRENCY_LIMIT,
    10,
  );

  return {
    url,
    headers,
    timeoutMillis,
    concurrencyLimit,
  };
};

const buildJaegerExporterOptions = () => {
  const endpoint = normalizeString(process.env.OTEL_EXPORTER_JAEGER_ENDPOINT);
  const host = normalizeString(process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST);
  const port = normalizeNumber(process.env.OTEL_EXPORTER_JAEGER_AGENT_PORT, 6832);
  const username = normalizeString(process.env.OTEL_EXPORTER_JAEGER_USERNAME);
  const password = normalizeString(process.env.OTEL_EXPORTER_JAEGER_PASSWORD);
  const flushTimeout = normalizeNumber(process.env.OTEL_EXPORTER_JAEGER_FLUSH_TIMEOUT, 2000);

  return {
    endpoint: endpoint || undefined,
    host: host || undefined,
    port,
    username: username || undefined,
    password: password || undefined,
    flushTimeout,
  };
};

const createTraceExporter = async () => {
  const exporterType = resolveTraceExporterType();

  if (exporterType === 'otlp') {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    return {
      exporterType,
      exporter: new OTLPTraceExporter(buildOtlpExporterOptions()),
    };
  }

  if (exporterType === 'jaeger') {
    const { JaegerExporter } = await import('@opentelemetry/exporter-jaeger');

    return {
      exporterType,
      exporter: new JaegerExporter(buildJaegerExporterOptions()),
    };
  }

  return {
    exporterType: 'console',
    exporter: new ConsoleSpanExporter(),
  };
};

const attachSpanContextToCarrier = (carrier, span) => {
  if (!carrier || typeof carrier !== 'object' || typeof span?.spanContext !== 'function') {
    return;
  }

  const spanContext = span.spanContext();
  if (!spanContext?.traceId || !spanContext?.spanId) {
    return;
  }

  carrier.otelTraceId = spanContext.traceId;
  carrier.otelSpanId = spanContext.spanId;
};

const buildInstrumentations = () => {
  return getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
    '@opentelemetry/instrumentation-http': {
      requestHook: (span, request) => {
        attachSpanContextToCarrier(request, span);
        attachSpanContextToCarrier(request?.res, span);
      },
      responseHook: (span, response) => {
        attachSpanContextToCarrier(response, span);
        attachSpanContextToCarrier(response?.req, span);
      },
    },
  });
};

const registerShutdownHook = (signal) => {
  const state = resolveTracingState();

  if (state.shutdownRegistered) {
    return;
  }

  process.once(signal, async () => {
    try {
      await shutdownTracing(signal);
    } catch (error) {
      console.warn(`[otel] shutdown failed on ${signal}:`, error?.message || error);
    } finally {
      process.exit(0);
    }
  });
};

const enableDiagnosticsIfNeeded = () => {
  if (!normalizeBoolean(process.env.OTEL_DIAGNOSTICS_ENABLED, false)) {
    return;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
};

export const initializeTracing = async () => {
  const state = resolveTracingState();

  if (state.initialized) {
    return state.sdk;
  }

  enableDiagnosticsIfNeeded();
  const { exporter, exporterType } = await createTraceExporter();

  const sdk = new NodeSDK({
    resource: buildTracingResource(),
    traceExporter: exporter,
    instrumentations: [buildInstrumentations()],
  });

  await sdk.start();

  state.sdk = sdk;
  state.initialized = true;

  registerShutdownHook('SIGINT');
  registerShutdownHook('SIGTERM');
  state.shutdownRegistered = true;

  console.log(`[otel] tracing initialized with ${exporterType} exporter`);

  return sdk;
};

export const shutdownTracing = async (reason = 'manual') => {
  const state = resolveTracingState();

  if (!state.initialized || !state.sdk) {
    return;
  }

  await state.sdk.shutdown();
  state.initialized = false;
  state.sdk = null;

  console.log(`[otel] tracing shutdown complete (${reason})`);
};

await initializeTracing();
