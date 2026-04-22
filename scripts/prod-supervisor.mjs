import { spawn } from 'child_process';

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

const normalizeText = (value = '') => String(value || '').trim();

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const asInteger = (value, fallback = 0, min = 0) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.round(parsed));
};

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

const config = {
  withPythonRuntime: asBoolean(
    readOption({
      key: 'with-python-runtime',
      envKeys: ['OPS_WITH_PY_RUNTIME'],
      defaultValue: 'false',
    }),
    false,
  ),
  healthUrl: normalizeText(
    readOption({
      key: 'health-url',
      envKeys: ['OPS_HEALTH_URL'],
      defaultValue: 'http://127.0.0.1:3001/health',
    }),
  ),
  healthIntervalMs: asInteger(
    readOption({
      key: 'health-interval-ms',
      envKeys: ['OPS_HEALTH_INTERVAL_MS'],
      defaultValue: 15000,
    }),
    15000,
    1000,
  ),
  healthFailureThreshold: asInteger(
    readOption({
      key: 'health-failure-threshold',
      envKeys: ['OPS_HEALTH_FAILURE_THRESHOLD'],
      defaultValue: 3,
    }),
    3,
    1,
  ),
  maxRestarts: asInteger(
    readOption({
      key: 'max-restarts',
      envKeys: ['OPS_MAX_RESTARTS'],
      defaultValue: 20,
    }),
    20,
    1,
  ),
  restartBackoffBaseMs: asInteger(
    readOption({
      key: 'restart-backoff-base-ms',
      envKeys: ['OPS_RESTART_BACKOFF_BASE_MS'],
      defaultValue: 1500,
    }),
    1500,
    100,
  ),
  restartBackoffMaxMs: asInteger(
    readOption({
      key: 'restart-backoff-max-ms',
      envKeys: ['OPS_RESTART_BACKOFF_MAX_MS'],
      defaultValue: 30000,
    }),
    30000,
    1000,
  ),
  opsEventEndpoint: normalizeText(
    readOption({
      key: 'ops-event-endpoint',
      envKeys: ['OPS_EVENT_ENDPOINT'],
      defaultValue: 'http://127.0.0.1:3001/api/settings/ops/process-events',
    }),
  ),
  opsEventToken: normalizeText(
    readOption({
      key: 'ops-event-token',
      envKeys: ['OPS_EVENT_TOKEN'],
      defaultValue: '',
    }),
  ),
};

const processDefinitions = {
  mockServer: {
    name: 'mock-server',
    command: process.execPath,
    args: ['mock-server/server.js'],
    child: null,
    restartCount: 0,
    lastExit: null,
  },
  pythonRuntime: {
    name: 'python-runtime',
    command: process.platform === 'win32' ? 'python' : 'python3',
    args: ['-m', 'uvicorn', 'python_runtime.app.main:app', '--host', '0.0.0.0', '--port', '8008'],
    child: null,
    restartCount: 0,
    lastExit: null,
  },
};

let shuttingDown = false;
let healthCheckTimer = null;
let mockServerHealthFailures = 0;

const sleep = (durationMs = 0) => {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, durationMs));
  });
};

const postOpsProcessEvent = async ({ processName = '', eventType = '', message = '', metadata = {} } = {}) => {
  if (!config.opsEventEndpoint) {
    return;
  }

  try {
    await fetch(config.opsEventEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.opsEventToken ? { 'x-ops-token': config.opsEventToken } : {}),
      },
      body: JSON.stringify({
        processName,
        eventType,
        message,
        metadata,
      }),
    });
  } catch {
    // supervisor should never crash due to telemetry post failure
  }
};

const spawnManagedProcess = (processKey = 'mockServer') => {
  const processDefinition = processDefinitions[processKey];

  if (!processDefinition) {
    return;
  }

  const child = spawn(processDefinition.command, processDefinition.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  processDefinition.child = child;

  console.log(`[ops-supervisor] started ${processDefinition.name} pid=${child.pid}`);
  void postOpsProcessEvent({
    processName: processDefinition.name,
    eventType: processDefinition.restartCount > 0 ? 'restarted' : 'started',
    message: `${processDefinition.name} started`,
    metadata: {
      pid: child.pid,
      restartCount: processDefinition.restartCount,
    },
  });

  child.on('exit', async (code, signal) => {
    processDefinition.lastExit = {
      code: Number(code ?? 0),
      signal: normalizeText(signal),
      exitedAt: new Date().toISOString(),
    };
    processDefinition.child = null;

    console.error(
      `[ops-supervisor] ${processDefinition.name} exited with code=${code ?? 0} signal=${signal || ''}`,
    );

    await postOpsProcessEvent({
      processName: processDefinition.name,
      eventType: 'crash',
      message: `${processDefinition.name} exited with code=${code ?? 0} signal=${signal || ''}`,
      metadata: {
        code: Number(code ?? 0),
        signal: normalizeText(signal),
      },
    });

    if (shuttingDown) {
      return;
    }

    processDefinition.restartCount += 1;

    if (processDefinition.restartCount > config.maxRestarts) {
      console.error(
        `[ops-supervisor] ${processDefinition.name} exceeded max restarts=${config.maxRestarts}, shutting down supervisor`,
      );
      await postOpsProcessEvent({
        processName: processDefinition.name,
        eventType: 'restart-limit-exceeded',
        message: `max restarts exceeded (${config.maxRestarts})`,
      });
      await shutdown(1);
      return;
    }

    const backoffMs = Math.min(
      config.restartBackoffMaxMs,
      config.restartBackoffBaseMs * Math.max(1, processDefinition.restartCount),
    );
    console.log(`[ops-supervisor] restarting ${processDefinition.name} in ${backoffMs}ms`);
    await sleep(backoffMs);

    if (!shuttingDown) {
      spawnManagedProcess(processKey);
    }
  });
};

const killChild = (processKey = 'mockServer', signal = 'SIGTERM') => {
  const processDefinition = processDefinitions[processKey];

  if (!processDefinition?.child) {
    return;
  }

  try {
    processDefinition.child.kill(signal);
  } catch {
    // ignore
  }
};

const restartMockServerByHealthCheck = async () => {
  const processDefinition = processDefinitions.mockServer;

  if (!processDefinition.child || shuttingDown) {
    return;
  }

  processDefinition.restartCount += 1;

  if (processDefinition.restartCount > config.maxRestarts) {
    console.error('[ops-supervisor] mock-server exceeded max restarts due to health check failures');
    await shutdown(1);
    return;
  }

  console.error('[ops-supervisor] health check failed repeatedly, restarting mock-server');
  await postOpsProcessEvent({
    processName: processDefinition.name,
    eventType: 'health-failed-restart',
    message: `health failures reached threshold ${config.healthFailureThreshold}`,
    metadata: {
      failureCount: mockServerHealthFailures,
    },
  });

  killChild('mockServer', 'SIGTERM');
};

const runHealthCheckLoop = () => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }

  healthCheckTimer = setInterval(async () => {
    if (shuttingDown) {
      return;
    }

    try {
      const response = await fetch(config.healthUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        mockServerHealthFailures += 1;
      } else {
        const data = await response.json().catch(() => ({}));
        if (data?.success === false) {
          mockServerHealthFailures += 1;
        } else {
          if (mockServerHealthFailures > 0) {
            await postOpsProcessEvent({
              processName: 'mock-server',
              eventType: 'health-recovered',
              message: 'health check recovered',
            });
          }
          mockServerHealthFailures = 0;
        }
      }
    } catch {
      mockServerHealthFailures += 1;
    }

    if (mockServerHealthFailures >= config.healthFailureThreshold) {
      await restartMockServerByHealthCheck();
      mockServerHealthFailures = 0;
    }
  }, config.healthIntervalMs);
};

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  await postOpsProcessEvent({
    processName: 'ops-supervisor',
    eventType: 'stopping',
    message: 'supervisor shutting down',
  });

  killChild('mockServer', 'SIGTERM');
  killChild('pythonRuntime', 'SIGTERM');

  await sleep(1000);

  killChild('mockServer', 'SIGKILL');
  killChild('pythonRuntime', 'SIGKILL');

  process.exit(exitCode);
};

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

console.log('[ops-supervisor] configuration', config);
void postOpsProcessEvent({
  processName: 'ops-supervisor',
  eventType: 'started',
  message: 'ops supervisor started',
  metadata: config,
});

spawnManagedProcess('mockServer');

if (config.withPythonRuntime) {
  spawnManagedProcess('pythonRuntime');
}

runHealthCheckLoop();
