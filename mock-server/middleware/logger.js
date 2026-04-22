import { randomUUID } from 'crypto';
import { context as otelContext, trace } from '@opentelemetry/api';
import { sanitizeLogPayload } from '../services/logService.js';

const readTraceIdHeader = (req) => {
  const value = req.get('X-Trace-Id') || req.get('x-trace-id') || '';
  return typeof value === 'string' ? value.trim() : '';
};

const resolveTraceId = (req) => {
  return readTraceIdHeader(req) || randomUUID();
};

const readActiveSpanContext = () => {
  return trace.getSpan(otelContext.active())?.spanContext() || null;
};

const readInstrumentedSpanContext = (req) => {
  const traceId = typeof req?.otelTraceId === 'string' ? req.otelTraceId.trim() : '';
  const spanId = typeof req?.otelSpanId === 'string' ? req.otelSpanId.trim() : '';

  if (!traceId || !spanId) {
    return null;
  }

  return {
    traceId,
    spanId,
  };
};

const resolveSpanContextForLogging = (req, res, requestTraceId) => {
  const instrumentedSpanContext =
    readInstrumentedSpanContext(req) || readInstrumentedSpanContext(res);
  const activeSpanContext = readActiveSpanContext();
  const traceId =
    instrumentedSpanContext?.traceId || activeSpanContext?.traceId || requestTraceId;
  const spanId = instrumentedSpanContext?.spanId || activeSpanContext?.spanId || 'no-span';

  if (!req.otelTraceId && traceId && traceId !== requestTraceId) {
    req.otelTraceId = traceId;
  }

  if (!req.otelSpanId && spanId && spanId !== 'no-span') {
    req.otelSpanId = spanId;
  }

  return {
    traceId,
    spanId,
  };
};

export default function logger(req, res, next) {
  const startedAt = Date.now();
  const requestTraceId = resolveTraceId(req);
  let hasLoggedRequestLine = false;

  req.traceId = requestTraceId;
  res.locals.traceId = requestTraceId;
  res.setHeader('X-Trace-Id', requestTraceId);

  const logRequestLine = () => {
    const { traceId, spanId } = resolveSpanContextForLogging(req, res, requestTraceId);

    if (spanId === 'no-span') {
      return false;
    }

    const activeSpan = trace.getSpan(otelContext.active());

    if (activeSpan) {
      activeSpan.setAttribute('app.request.trace_id', requestTraceId);
      activeSpan.setAttribute('app.request.span_id', spanId);
    }

    console.log(
      `[mock][trace=${traceId} span=${spanId} requestTrace=${requestTraceId}] ${req.method} ${req.originalUrl || req.url}`,
    );

    if (req.method !== 'GET') {
      console.log(
        `[mock][trace=${traceId} span=${spanId} requestTrace=${requestTraceId}] request body:`,
        sanitizeLogPayload(req.body),
      );
    }

    hasLoggedRequestLine = true;
    return true;
  };

  if (!logRequestLine()) {
    setImmediate(() => {
      if (!hasLoggedRequestLine) {
        logRequestLine();
      }
    });
  }

  res.on('finish', () => {
    if (!hasLoggedRequestLine) {
      logRequestLine();
    }

    const { traceId, spanId } = resolveSpanContextForLogging(req, res, requestTraceId);
    console.log(
      `[mock][trace=${traceId} span=${spanId} requestTrace=${requestTraceId}] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });

  next();
}
