import '../config/loadEnv.js';

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const command = process.argv[2] || 'help';
const flags = parseFlags(process.argv.slice(3));
const jaegerFlag = readCliFlagValue('jaeger');
const typeCheckFlag = readCliFlagValue('type-check', 'typeCheck');
const artifactsDir = path.join(root, 'mock-server', 'test-results', 'local-stack');
const stateFile = path.join(artifactsDir, 'state.json');
const httpHost = '127.0.0.1';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const defaultJaegerUrl = normalizeUrl(process.env.JAEGER_UI_URL || 'http://127.0.0.1:16686');
const mockBaseUrl = normalizeUrl(process.env.LOCAL_STACK_MOCK_BASE_URL || 'http://127.0.0.1:3001');
const pythonBaseUrl = normalizeUrl(process.env.LOCAL_STACK_PYTHON_BASE_URL || 'http://127.0.0.1:8008');
const gatewayBaseUrl = normalizeUrl(process.env.LOCAL_STACK_GATEWAY_BASE_URL || 'http://127.0.0.1:3000');
const platformManagerBaseUrl = normalizeUrl(
  process.env.LOCAL_STACK_PLATFORM_MANAGER_BASE_URL || 'http://127.0.0.1:3003',
);
const viteBaseUrl = normalizeUrl(process.env.LOCAL_STACK_VITE_BASE_URL || 'http://127.0.0.1:5173');
const expectedServiceName = process.env.OTEL_SERVICE_NAME || 'mock-server';
const shouldCheckJaeger =
  !isFalsey(jaegerFlag) && (readEnvFlag('LOCAL_STACK_VERIFY_JAEGER', true) || isTruthy(jaegerFlag));
const shouldRunTypeCheck =
  !isFalsey(typeCheckFlag) &&
  (readEnvFlag('LOCAL_STACK_TYPE_CHECK', true) || isTruthy(typeCheckFlag));

const services = [
  {
    id: 'jaeger',
    label: 'jaeger',
    port: 16686,
    optional: true,
    logFile: path.join(artifactsDir, 'jaeger.log'),
    start: () => resolveJaegerStartCommand(),
    wait: () => waitForJson(`${defaultJaegerUrl}/api/services`, isArrayResponse, 30000),
  },
  {
    id: 'python-runtime',
    label: 'python runtime',
    port: 8008,
    logFile: path.join(artifactsDir, 'python-runtime.log'),
    start: () => ({
      command: 'python3',
      args: ['-m', 'uvicorn', 'python_runtime.app.main:app', '--host', '0.0.0.0', '--port', '8008'],
    }),
    wait: () => waitForJson(`${pythonBaseUrl}/health`, isHealthyResponse, 30000),
  },
  {
    id: 'mock-server',
    label: 'mock server',
    port: 3001,
    logFile: path.join(artifactsDir, 'mock-server.log'),
    start: () => ({
      command: process.execPath,
      args: ['mock-server/server.js'],
    }),
    wait: () => waitForJson(`${mockBaseUrl}/health`, isHealthyResponse, 30000),
  },
  {
    id: 'api-gateway',
    label: 'api gateway',
    port: 3000,
    logFile: path.join(artifactsDir, 'api-gateway.log'),
    start: () => ({
      command: process.execPath,
      args: ['api-gateway/src/index.js'],
      env: {
        ...process.env,
        PORT: '3000',
        MOCK_SERVER_URL: mockBaseUrl,
      },
    }),
    wait: () => waitForJson(`${gatewayBaseUrl}/health`, isHealthyResponse, 30000),
  },
  {
    id: 'platform-manager',
    label: 'platform manager',
    port: 3003,
    logFile: path.join(artifactsDir, 'platform-manager.log'),
    start: () => ({
      command: process.execPath,
      args: ['platform-manager/src/index.js'],
      env: {
        ...process.env,
        PORT: '3003',
        MOCK_SERVER_URL: mockBaseUrl,
        API_GATEWAY_URL: gatewayBaseUrl,
      },
    }),
    wait: () => waitForJson(`${platformManagerBaseUrl}/health`, isHealthyResponse, 30000),
  },
  {
    id: 'vite',
    label: 'vite dev server',
    port: 5173,
    logFile: path.join(artifactsDir, 'vite.log'),
    start: () => ({
      command: npmCommand,
      args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'],
    }),
    wait: () =>
      waitForText(
        viteBaseUrl,
        (body) =>
          body.includes('<title>sales-support-agent-frontend</title>') ||
          body.includes('<div id="root"></div>'),
        30000,
      ),
  },
];

async function main() {
  ensureArtifactsDir();

  switch (command) {
    case 'up':
      await startLocalStack();
      break;
    case 'verify':
      await verifyLocalStack();
      break;
    case 'down':
      await stopLocalStack();
      break;
    case 'run':
      await startLocalStack();
      await verifyLocalStack();
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

function parseFlags(argv = []) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const normalized = token.slice(2);

    if (normalized.startsWith('no-')) {
      parsed[normalized.slice(3)] = false;
      continue;
    }

    const equalIndex = normalized.indexOf('=');
    if (equalIndex >= 0) {
      parsed[normalized.slice(0, equalIndex)] = normalized.slice(equalIndex + 1);
      continue;
    }

    const nextToken = argv[index + 1];
    if (nextToken && !nextToken.startsWith('--')) {
      parsed[normalized] = nextToken;
      index += 1;
      continue;
    }

    parsed[normalized] = true;
  }

  return parsed;
}

function normalizeUrl(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function readCliFlagValue(...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      return flags[key];
    }
  }

  return undefined;
}

function readEnvFlag(key, defaultValue = false) {
  if (process.env[key] === undefined) {
    return defaultValue;
  }

  return isTruthy(process.env[key]);
}

function isTruthy(value) {
  return value === true || value === 'true' || value === '1';
}

function isFalsey(value) {
  return value === false || value === 'false' || value === '0';
}

function ensureArtifactsDir() {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function readState() {
  if (!fs.existsSync(stateFile)) {
    return { services: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (error) {
    console.warn(`[local-stack] failed to read state file, resetting it: ${error.message}`);
    return { services: {} };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function isPidRunning(pid) {
  if (!pid || !Number.isInteger(pid)) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortBusy(port, host = httpHost) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (busy) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(busy);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (error) => {
      if (
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'EHOSTUNREACH' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ETIMEDOUT'
      ) {
        finish(false);
        return;
      }

      console.warn(
        `[local-stack] failed to probe ${host}:${port}, treating it as unavailable: ${error?.message ?? error}`,
      );
      finish(false);
    });
  });
}

async function startLocalStack() {
  const state = readState();

  console.log('[local-stack] starting required local services');

  for (const service of services) {
    const existingRecord = state.services?.[service.id];
    if (existingRecord?.managed && isPidRunning(existingRecord.pid)) {
      console.log(
        `[local-stack] ${service.label} already managed by this script (pid ${existingRecord.pid}), reusing it`,
      );
      await service.wait();
      continue;
    }

    const portBusy = await isPortBusy(service.port);
    if (portBusy) {
      console.log(`[local-stack] detected existing ${service.label} on port ${service.port}, skipping startup`);
      state.services[service.id] = {
        ...(state.services[service.id] || {}),
        label: service.label,
        port: service.port,
        managed: false,
        detectedAt: new Date().toISOString(),
        logFile: service.logFile,
      };
      writeState(state);
      await service.wait();
      continue;
    }

    const launchConfig = service.start();
    if (!launchConfig) {
      if (service.optional) {
        console.warn(`[local-stack] ${service.label} is not available locally, skipping startup`);
        continue;
      }

      throw new Error(`${service.label} is required but no launch command was found`);
    }

    console.log(`[local-stack] launching ${service.label}`);
    const pid = spawnDetachedProcess({
      ...launchConfig,
      logFile: service.logFile,
    });

    state.services[service.id] = {
      label: service.label,
      port: service.port,
      managed: true,
      pid,
      startedAt: new Date().toISOString(),
      logFile: service.logFile,
    };
    writeState(state);

    try {
      await service.wait();
    } catch (error) {
      const tail = readLogTail(service.logFile);
      throw new Error(
        `${service.label} failed to become ready.\n${error.message}\n\nRecent log tail:\n${tail || '(empty log)'}`,
      );
    }
  }

  printServiceSummary(readState());
}

function spawnDetachedProcess({ command, args = [], logFile, env = process.env }) {
  const output = fs.openSync(logFile, 'a');
  fs.writeFileSync(
    logFile,
    `\n[${new Date().toISOString()}] launching: ${command} ${args.join(' ')}\n`,
    { flag: 'a' },
  );

  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', output, output],
    shell: false,
  });

  child.unref();
  return child.pid;
}

function resolveJaegerStartCommand() {
  const override = process.env.JAEGER_BIN || process.env.JAEGER_BINARY;
  const candidates = [
    override,
    '/tmp/jaeger-2.17.0-darwin-arm64/jaeger',
    path.join(root, 'bin', 'jaeger'),
    findExecutableInPath('jaeger'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && fs.existsSync(candidate)) {
      return {
        command: candidate,
        args: [],
      };
    }
  }

  if (findExecutableInPath('jaeger')) {
    return {
      command: 'jaeger',
      args: [],
    };
  }

  return null;
}

function findExecutableInPath(binaryName) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [binaryName], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) {
    return '';
  }

  const [firstMatch = ''] = String(result.stdout || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return firstMatch;
}

async function verifyLocalStack() {
  console.log('[local-stack] running health checks and regression verification');

  await waitForJson(`${mockBaseUrl}/health`, isHealthyResponse, 20000);
  await waitForJson(`${gatewayBaseUrl}/health`, isHealthyResponse, 20000);
  await waitForJson(`${platformManagerBaseUrl}/health`, isHealthyResponse, 20000);
  await waitForJson(
    `${mockBaseUrl}/internal/data/external-connections`,
    isDataEnvelopeResponse,
    20000,
    { internal: true },
  );
  await waitForJson(`${pythonBaseUrl}/health`, isHealthyResponse, 20000);
  await waitForText(
    viteBaseUrl,
    (body) =>
      body.includes('<title>sales-support-agent-frontend</title>') ||
      body.includes('<div id="root"></div>'),
    20000,
  );

  const flowSummary = await runProxyWorkflowRegression();
  let jaegerSummary = null;

  if (shouldCheckJaeger && (await isPortBusy(16686))) {
    jaegerSummary = await verifyJaegerTraceExport();
  } else if (shouldCheckJaeger) {
    console.warn('[local-stack] Jaeger is not reachable on port 16686, skipping trace verification');
  }

  if (shouldRunTypeCheck) {
    runTypeCheck();
  }

  const report = {
    verifiedAt: new Date().toISOString(),
    flowSummary,
    jaegerSummary,
    typeCheck: shouldRunTypeCheck ? 'passed' : 'skipped',
  };

  const reportFile = path.join(artifactsDir, `verification-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log('[local-stack] verification passed');
  console.log(`[local-stack] report saved to ${reportFile}`);
  console.log(
    `[local-stack] analyze -> search -> generate sessionId=${flowSummary.sessionId} evidence=${flowSummary.evidenceCount} llmRoute=${flowSummary.llmRoute}`,
  );

  if (jaegerSummary) {
    console.log(
      `[local-stack] jaeger verified service=${jaegerSummary.serviceName} traceCount=${jaegerSummary.traceCount}`,
    );
  }
}

async function runProxyWorkflowRegression() {
  const analyzeResponse = await postJson(`${viteBaseUrl}/api/agent/analyze-context`, {
    taskInput: '双氧水体系蚀刻液客户需要规格书和首轮正式回复，请先分析业务上下文。',
    taskSubject: '双氧水体系蚀刻液',
    industryType: 'pcb',
  });
  const analyzePayload = unwrapEnvelope(analyzeResponse);
  const analyzeData = analyzePayload.data;

  assertCondition(
    analyzePayload.code === 200 && analyzePayload.success,
    'analyze-context did not return a successful envelope',
    analyzeResponse,
  );
  assertCondition(
    typeof analyzeData.sessionId === 'string' && analyzeData.sessionId.length > 0,
    'analyze-context did not return a sessionId',
    analyzePayload,
  );
  assertCondition(
    Array.isArray(analyzeData.recommendedProducts) && analyzeData.recommendedProducts.length > 0,
    'analyze-context did not recommend any products',
    analyzePayload,
  );

  const searchResponse = await postJson(`${viteBaseUrl}/api/agent/search-references`, {
    sessionId: analyzeData.sessionId,
    docType: 'spec',
  });
  const searchPayload = unwrapEnvelope(searchResponse);
  const searchData = searchPayload.data;
  const searchMeta = searchPayload.meta;

  assertCondition(
    searchPayload.code === 200 && searchPayload.success,
    'search-references did not return a successful envelope',
    searchResponse,
  );
  assertCondition(
    Array.isArray(searchData.evidenceItems) && searchData.evidenceItems.length > 0,
    'search-references did not return any evidence items',
    searchPayload,
  );
  assertCondition(
    typeof searchMeta.referenceSummary === 'string' && searchMeta.referenceSummary.length > 0,
    'search-references did not hydrate referenceSummary from managed session',
    searchPayload,
  );

  const generateResponse = await postJson(`${viteBaseUrl}/api/agent/generate-content`, {
    sessionId: analyzeData.sessionId,
    taskInput: '请给客户生成一段首轮正式回复。',
    goal: 'first_reply',
    toneStyle: 'formal',
  });
  const generatePayload = unwrapEnvelope(generateResponse);
  const generateData = generatePayload.data;

  assertCondition(
    generatePayload.code === 200 && generatePayload.success,
    'generate-content did not return a successful envelope',
    generateResponse,
  );
  assertCondition(
    generateData.sessionId === analyzeData.sessionId,
    'generate-content did not keep the same sessionId',
    generatePayload,
  );
  assertCondition(
    typeof generateData.llmRoute === 'string' && generateData.llmRoute.length > 0,
    'generate-content did not expose llmRoute',
    generatePayload,
  );
  assertCondition(
    extractGeneratedText(generateData).length > 0,
    'generate-content did not return any generated text',
    generatePayload,
  );

  return {
    sessionId: analyzeData.sessionId,
    analyzeTraceId: analyzePayload.traceId,
    searchTraceId: searchPayload.traceId,
    generateTraceId: generatePayload.traceId,
    recommendedProducts: analyzeData.recommendedProducts,
    evidenceCount: searchData.evidenceItems.length,
    referenceSummary: searchMeta.referenceSummary,
    llmRoute: generateData.llmRoute,
    generatedPreview: extractGeneratedText(generateData).slice(0, 120),
  };
}

function extractGeneratedText(data = {}) {
  const candidates = [
    data.llmVersion,
    data.formalVersion,
    data.markdownVersion,
    data.scriptDraft,
    data.replyText,
    data.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

async function verifyJaegerTraceExport() {
  await sleep(2500);

  const servicesResponse = await fetchJson(`${defaultJaegerUrl}/api/services`);
  const serviceNames = Array.isArray(servicesResponse?.data)
    ? servicesResponse.data
    : Array.isArray(servicesResponse)
      ? servicesResponse
      : [];

  assertCondition(
    serviceNames.includes(expectedServiceName),
    `Jaeger does not report service "${expectedServiceName}"`,
    servicesResponse,
  );

  const tracesResponse = await fetchJson(
    `${defaultJaegerUrl}/api/traces?service=${encodeURIComponent(expectedServiceName)}&limit=20&lookback=1h`,
  );
  const traces = Array.isArray(tracesResponse?.data) ? tracesResponse.data : [];
  const operationNames = new Set();

  for (const trace of traces) {
    const spans = Array.isArray(trace?.spans) ? trace.spans : [];
    for (const span of spans) {
      if (typeof span?.operationName === 'string' && span.operationName) {
        operationNames.add(span.operationName);
      }
    }
  }

  const expectedOperations = [
    'mock-server.agent.analyze-context',
    'mock-server.agent.search-references',
    'mock-server.agent.generate-content',
  ];

  for (const operation of expectedOperations) {
    assertCondition(
      operationNames.has(operation),
      `Jaeger trace export is missing operation "${operation}"`,
      {
        expectedServiceName,
        operationNames: Array.from(operationNames),
      },
    );
  }

  return {
    serviceName: expectedServiceName,
    traceCount: traces.length,
    operations: Array.from(operationNames).sort(),
  };
}

function runTypeCheck() {
  console.log('[local-stack] running type-check');

  const result = spawnSync(npmCommand, ['run', 'type-check'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`type-check failed with exit code ${result.status ?? 1}`);
  }

  const gatewayCheck = spawnSync(npmCommand, ['--prefix', 'api-gateway', 'run', 'check'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (gatewayCheck.status !== 0) {
    throw new Error(`api-gateway check failed with exit code ${gatewayCheck.status ?? 1}`);
  }

  const platformManagerCheck = spawnSync(
    npmCommand,
    ['--prefix', 'platform-manager', 'run', 'check'],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (platformManagerCheck.status !== 0) {
    throw new Error(
      `platform-manager check failed with exit code ${platformManagerCheck.status ?? 1}`,
    );
  }
}

async function stopLocalStack() {
  const state = readState();
  const managedServices = Object.entries(state.services || {}).filter(([, record]) => record?.managed);

  if (!managedServices.length) {
    console.log('[local-stack] no managed services to stop');
    return;
  }

  console.log('[local-stack] stopping managed services');

  for (const [serviceId, record] of managedServices.reverse()) {
    if (!isPidRunning(record.pid)) {
      delete state.services[serviceId];
      continue;
    }

    await terminateProcess(record.pid);
    delete state.services[serviceId];
    console.log(`[local-stack] stopped ${record.label || serviceId} (pid ${record.pid})`);
  }

  writeState(state);
}

async function terminateProcess(pid) {
  const targets = process.platform === 'win32' ? [pid] : [-pid, pid];

  for (const target of targets) {
    try {
      process.kill(target, 'SIGTERM');
      break;
    } catch {
      // ignore and try the next target
    }
  }

  if (await waitForProcessExit(pid, 3000)) {
    return;
  }

  for (const target of targets) {
    try {
      process.kill(target, 'SIGKILL');
      break;
    } catch {
      // ignore and try the next target
    }
  }

  await waitForProcessExit(pid, 1000);
}

function pickNestedStatus(payload = {}) {
  if (payload?.data?.data?.status) {
    return payload.data.data.status;
  }

  if (payload?.data?.status) {
    return payload.data.status;
  }

  if (payload?.status) {
    return payload.status;
  }

  return '';
}

function isHealthyResponse(payload = {}) {
  const nestedPayload =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload;
  const message = String(nestedPayload?.message || payload?.message || '').toLowerCase();
  const nestedStatus = String(pickNestedStatus(payload) || '').toLowerCase();

  if (nestedStatus === 'ok') {
    return true;
  }

  if (nestedPayload?.success === true && /(healthy|health|ok)/.test(message)) {
    return true;
  }

  if (payload?.success === true && /(healthy|health|ok)/.test(String(payload?.message || '').toLowerCase())) {
    return true;
  }

  return false;
}

function isDataEnvelopeResponse(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const envelope = unwrapEnvelope(payload);
  return envelope.success === true && Array.isArray(envelope.data);
}

function unwrapEnvelope(payload = {}) {
  const outerCode = typeof payload?.code === 'number' ? payload.code : 200;
  const outerTraceId = typeof payload?.traceId === 'string' ? payload.traceId : '';

  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'success' in payload) {
    return {
      code: outerCode,
      traceId: outerTraceId,
      success: payload.success !== false,
      message: payload.message || '',
      data: payload.data || {},
      meta: payload.meta || {},
      raw: payload,
    };
  }

  const outerData = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;

  if (outerData && typeof outerData === 'object' && !Array.isArray(outerData) && 'success' in outerData) {
    return {
      code: outerCode,
      traceId: outerTraceId,
      success: outerData.success !== false,
      message: outerData.message || '',
      data: outerData.data || {},
      meta: outerData.meta || {},
      raw: payload,
    };
  }

  return {
    code: outerCode,
    traceId: outerTraceId,
    success: true,
    message: '',
    data: outerData || {},
    meta: {},
    raw: payload,
  };
}

const POST_JSON_TIMEOUT_MS = 120000;

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-type': 'web',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(POST_JSON_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function fetchJson(url, options = {}) {
  const headers = options.internal
    ? {
        'X-Internal-Call': 'true',
      }
    : undefined;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function waitForJson(url, matcher, timeoutMs = 20000, options = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const payload = await fetchJson(url, options);
      if (matcher(payload)) {
        return payload;
      }

      lastError = new Error(`response did not match readiness check: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw new Error(`timed out waiting for ${url}. Last error: ${lastError?.message || 'unknown error'}`);
}

async function waitForText(url, matcher, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.text();

      if (response.ok && matcher(body)) {
        return body;
      }

      lastError = new Error(`response did not match readiness check: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw new Error(`timed out waiting for ${url}. Last error: ${lastError?.message || 'unknown error'}`);
}

function isArrayResponse(payload) {
  return Array.isArray(payload?.data) || Array.isArray(payload);
}

function assertCondition(condition, message, details = null) {
  if (condition) {
    return;
  }

  const error = new Error(message);
  error.details = details;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProcessExit(pid, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidRunning(pid)) {
      return true;
    }

    await sleep(100);
  }

  return !isPidRunning(pid);
}

function readLogTail(logFile, maxLines = 40) {
  if (!logFile || !fs.existsSync(logFile)) {
    return '';
  }

  const content = fs.readFileSync(logFile, 'utf8');
  return content.split('\n').slice(-maxLines).join('\n').trim();
}

function printServiceSummary(state) {
  const entries = Object.entries(state.services || {});
  if (!entries.length) {
    console.log('[local-stack] no services recorded in state');
    return;
  }

  console.log('[local-stack] service summary');
  for (const [, record] of entries) {
    const ownership = record.managed ? `managed pid=${record.pid}` : 'external';
    console.log(`- ${record.label}: ${ownership} port=${record.port}`);
    if (record.logFile) {
      console.log(`  log: ${record.logFile}`);
    }
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/local-stack.mjs up
  node scripts/local-stack.mjs verify [--no-jaeger] [--no-type-check]
  node scripts/local-stack.mjs down
  node scripts/local-stack.mjs run

Recommended:
  npm run stack:run
  npm run stack:down`);
}

main().catch((error) => {
  console.error('[local-stack] failed:', error.message);
  if (error?.details) {
    console.error('[local-stack] details:', JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
