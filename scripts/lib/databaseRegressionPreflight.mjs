import fs from 'fs';
import net from 'net';
import path from 'path';

export const normalizeText = (value = '') => String(value || '').trim();

const buildAbortSignal = (timeoutMs = 3000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    },
  };
};

export const buildPreflightCheck = ({
  id = '',
  label = '',
  status = 'passed',
  detail = '',
  hint = '',
  metadata = undefined,
} = {}) => {
  const payload = {
    id: normalizeText(id),
    label: normalizeText(label),
    status: normalizeText(status) || 'passed',
    detail: normalizeText(detail),
    hint: normalizeText(hint),
  };

  if (metadata !== undefined) {
    payload.metadata = metadata;
  }

  return payload;
};

export const buildRequiredValueCheck = ({
  id = '',
  label = '',
  value = '',
  allowedValues = [],
  reference = '',
  optional = false,
} = {}) => {
  const normalizedValue = normalizeText(value);
  const normalizedAllowedValues = Array.isArray(allowedValues)
    ? allowedValues.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  if (!normalizedValue) {
    return buildPreflightCheck({
      id,
      label,
      status: optional ? 'warning' : 'failed',
      detail: optional
        ? `${label || id} 未提供，将继续使用默认行为。`
        : `${label || id} 未提供。`,
      hint: reference
        ? `请补充 ${reference}。`
        : optional
          ? ''
          : '请补充必填参数。',
    });
  }

  if (normalizedAllowedValues.length > 0 && !normalizedAllowedValues.includes(normalizedValue)) {
    return buildPreflightCheck({
      id,
      label,
      status: 'failed',
      detail: `${label || id} 当前值为 "${normalizedValue}"，不在允许范围内。`,
      hint: reference
        ? `请改为 ${normalizedAllowedValues.join(' / ')}，来源：${reference}。`
        : `请改为 ${normalizedAllowedValues.join(' / ')}。`,
      metadata: {
        value: normalizedValue,
        allowedValues: normalizedAllowedValues,
      },
    });
  }

  return buildPreflightCheck({
    id,
    label,
    status: 'passed',
    detail: `${label || id} 已提供：${normalizedValue}`,
    metadata: {
      value: normalizedValue,
    },
  });
};

export const buildFileExistsCheck = ({
  id = '',
  label = '',
  filePath = '',
  missingStatus = 'failed',
  missingHint = '',
} = {}) => {
  const absolutePath = path.resolve(filePath);
  const exists = fs.existsSync(absolutePath);

  return buildPreflightCheck({
    id,
    label,
    status: exists ? 'passed' : missingStatus,
    detail: exists
      ? `已找到 ${absolutePath}`
      : `未找到 ${absolutePath}`,
    hint: exists ? '' : missingHint,
    metadata: {
      path: absolutePath,
      exists,
    },
  });
};

export const probeTcpEndpoint = async ({
  id = '',
  label = '',
  host = '',
  port = '',
  timeoutMs = 1500,
  hint = '',
} = {}) => {
  const normalizedHost = normalizeText(host);
  const normalizedPort = Number.parseInt(String(port || '').trim(), 10);

  if (!normalizedHost || !Number.isInteger(normalizedPort) || normalizedPort <= 0) {
    return buildPreflightCheck({
      id,
      label,
      status: 'failed',
      detail: '主机或端口格式无效，无法执行 TCP 探测。',
      hint,
      metadata: {
        host: normalizedHost,
        port,
      },
    });
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const finalize = (payload) => {
      if (finished) {
        return;
      }

      finished = true;
      try {
        socket.destroy();
      } catch {
        // noop
      }
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      finalize(
        buildPreflightCheck({
          id,
          label,
          status: 'passed',
          detail: `TCP 可达：${normalizedHost}:${normalizedPort}`,
          metadata: {
            host: normalizedHost,
            port: normalizedPort,
          },
        }),
      );
    });
    socket.once('timeout', () => {
      finalize(
        buildPreflightCheck({
          id,
          label,
          status: 'failed',
          detail: `TCP 连接超时：${normalizedHost}:${normalizedPort}`,
          hint,
          metadata: {
            host: normalizedHost,
            port: normalizedPort,
            timeoutMs,
          },
        }),
      );
    });
    socket.once('error', (error) => {
      finalize(
        buildPreflightCheck({
          id,
          label,
          status: 'failed',
          detail: `TCP 不可达：${normalizedHost}:${normalizedPort} (${normalizeText(error?.message) || 'unknown-error'})`,
          hint,
          metadata: {
            host: normalizedHost,
            port: normalizedPort,
            error: normalizeText(error?.message || 'unknown-error'),
          },
        }),
      );
    });

    socket.connect(normalizedPort, normalizedHost);
  });
};

export const probeApiHealth = async ({
  id = 'api-health',
  label = 'Mock Server /health',
  apiBaseUrl = '',
  timeoutMs = 3000,
  hint = '',
} = {}) => {
  const normalizedApiBaseUrl = normalizeText(apiBaseUrl);

  if (!normalizedApiBaseUrl) {
    return buildPreflightCheck({
      id,
      label,
      status: 'failed',
      detail: 'API Base URL 未提供，无法执行健康检查。',
      hint: hint || '请补充 --api-base-url 或 API_BASE_URL。',
    });
  }

  let healthUrl = '';
  try {
    healthUrl = new URL('/health', normalizedApiBaseUrl).toString();
  } catch (error) {
    return buildPreflightCheck({
      id,
      label,
      status: 'failed',
      detail: `API Base URL 格式无效：${normalizedApiBaseUrl}`,
      hint: hint || '请确认 --api-base-url / API_BASE_URL 是合法 URL。',
      metadata: {
        error: normalizeText(error?.message || 'invalid-url'),
      },
    });
  }

  const { signal, cleanup } = buildAbortSignal(timeoutMs);

  try {
    const response = await fetch(healthUrl, {
      signal,
      headers: {
        Accept: 'application/json',
      },
    });
    const rawText = await response.text();
    let payload = rawText;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    const healthStatus =
      payload?.data?.data?.status ||
      payload?.data?.status ||
      payload?.status ||
      '';
    const success =
      response.ok &&
      (normalizeText(healthStatus).toLowerCase() === 'ok' ||
        payload?.success === true ||
        payload?.data?.success === true);

    return buildPreflightCheck({
      id,
      label,
      status: success ? 'passed' : 'failed',
      detail: success
        ? `HTTP 可达：${healthUrl}`
        : `HTTP ${response.status}：${normalizeText(
            payload?.message ||
              payload?.data?.message ||
              rawText ||
              'health endpoint did not return an OK payload',
          )}`,
      hint:
        success || !hint
          ? ''
          : hint,
      metadata: {
        url: healthUrl,
        statusCode: response.status,
      },
    });
  } catch (error) {
    return buildPreflightCheck({
      id,
      label,
      status: 'failed',
      detail: `无法访问 ${healthUrl}：${normalizeText(error?.message || 'network-error')}`,
      hint: hint || '请先启动 mock server，并确认 /health 可访问。',
      metadata: {
        url: healthUrl,
        error: normalizeText(error?.message || 'network-error'),
      },
    });
  } finally {
    cleanup();
  }
};

export const summarizePreflightChecks = (checks = []) => {
  const normalizedChecks = Array.isArray(checks) ? checks : [];

  return {
    totalCount: normalizedChecks.length,
    passedCount: normalizedChecks.filter((item) => item?.status === 'passed').length,
    failedCount: normalizedChecks.filter((item) => item?.status === 'failed').length,
    warningCount: normalizedChecks.filter((item) => item?.status === 'warning').length,
    skippedCount: normalizedChecks.filter((item) => item?.status === 'skipped').length,
  };
};

export const hasFailedChecks = (checks = []) => {
  return summarizePreflightChecks(checks).failedCount > 0;
};

export const buildPreflightPayload = ({ label = '', checks = [], guidance = [] } = {}) => {
  return {
    label: normalizeText(label),
    summary: summarizePreflightChecks(checks),
    checks: Array.isArray(checks) ? checks : [],
    guidance: Array.isArray(guidance)
      ? guidance.map((item) => normalizeText(item)).filter(Boolean)
      : [],
  };
};

export const printPreflightReport = ({ label = '', payload = {} } = {}) => {
  const prefix = `[${normalizeText(label) || 'preflight'}]`;
  const summary = payload?.summary || summarizePreflightChecks(payload?.checks);
  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  const guidance = Array.isArray(payload?.guidance) ? payload.guidance : [];
  const hasFailure = summary.failedCount > 0;
  const output = hasFailure ? console.error : console.log;

  output(`${prefix} ${hasFailure ? 'PRECHECK FAILED' : 'PRECHECK PASSED'}`, summary);

  for (const check of checks) {
    if (!check?.status || check.status === 'passed') {
      continue;
    }

    output(`${prefix} - [${check.status}] ${check.label || check.id}: ${check.detail || 'no detail'}`);
    if (check.hint) {
      output(`${prefix}   hint: ${check.hint}`);
    }
  }

  if (guidance.length > 0) {
    output(`${prefix} guidance:`);
    for (const item of guidance) {
      output(`${prefix} - ${item}`);
    }
  }
};
