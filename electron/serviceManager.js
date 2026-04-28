import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { nowLocalIso } from './localTime.js';

const HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 45000;
const SECRET_MASTER_KEY_ENV = 'SETTINGS_SECRET_MASTER_KEY';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeUrl(value = '') {
  return normalizeText(value).replace(/\/$/, '');
}

function parseEnvContent(content = '') {
  const env = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseEnvContent(fs.readFileSync(filePath, 'utf8'));
}

function mergeEnvFiles(filePaths = []) {
  return filePaths.reduce((env, filePath) => ({ ...env, ...readEnvFile(filePath) }), {});
}

function upsertEnvValue(filePath, key, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}\n${line}\n`;
  fs.writeFileSync(filePath, next);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortBusy(port, host = HOST) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (busy) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(busy);
    };

    socket.setTimeout(600);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function requestHttp(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.request(
      target,
      {
        method: 'GET',
        headers,
        timeout: 5000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`request timed out for ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForHttp(url, validator, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await requestHttp(url, headers);
      const text = response.body;
      const contentType = response.headers['content-type'] || '';
      const shouldParseJson =
        String(contentType).includes('application/json') || /^[\[{]/.test(text.trim());
      const payload = shouldParseJson ? JSON.parse(text) : text;

      if (response.statusCode >= 200 && response.statusCode < 300 && validator(payload)) {
        return payload;
      }

      lastError = new Error(`unexpected response from ${url}: ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

function execFileText(command, args = []) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function isProcessAlive(pid) {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function listChildPids(pid) {
  if (!pid || process.platform === 'win32') {
    return [];
  }

  try {
    const stdout = await execFileText('pgrep', ['-P', String(pid)]);
    return stdout
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch (error) {
    if (error?.code === 1) {
      return [];
    }

    throw error;
  }
}

async function collectProcessTree(pid, seen = new Set()) {
  if (!pid || seen.has(pid)) {
    return [];
  }

  seen.add(pid);
  const children = await listChildPids(pid);
  const descendants = [];

  for (const childPid of children) {
    descendants.push(...(await collectProcessTree(childPid, seen)));
  }

  return [...descendants, pid];
}

function killPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }

    return false;
  }
}

async function waitForProcessesToExit(pids, timeoutMs = 2500) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (pids.filter(isProcessAlive).length === 0) {
      return true;
    }

    await delay(120);
  }

  return pids.filter(isProcessAlive).length === 0;
}

async function killProcessTree(pid, label, logger) {
  if (!pid) return;

  if (process.platform === 'win32') {
    try {
      await execFileText('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    } catch (error) {
      logger.warn(`[desktop] taskkill failed for ${label} pid ${pid}`, error);
      return;
    }
  }

  let pids = [];

  try {
    pids = await collectProcessTree(pid);
  } catch (error) {
    logger.warn(`[desktop] failed to collect process tree for ${label} pid ${pid}`, error);
    pids = [pid];
  }

  const uniquePids = [...new Set(pids)].filter(isProcessAlive);
  if (uniquePids.length === 0) {
    return;
  }

  for (const targetPid of uniquePids) {
    try {
      killPid(targetPid, 'SIGTERM');
    } catch (error) {
      logger.warn(`[desktop] failed to SIGTERM ${label} pid ${targetPid}`, error);
    }
  }

  const stoppedGracefully = await waitForProcessesToExit(uniquePids, 2500);
  if (stoppedGracefully) {
    return;
  }

  for (const targetPid of uniquePids.filter(isProcessAlive)) {
    try {
      killPid(targetPid, 'SIGKILL');
    } catch (error) {
      logger.warn(`[desktop] failed to SIGKILL ${label} pid ${targetPid}`, error);
    }
  }

  await waitForProcessesToExit(uniquePids, 1200);
}

function waitForChildExit(child, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const isOkJson = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  return payload.success === true || payload.code === 200 || payload.status === 'ok';
};

const isFrontendHtml = (payload) => {
  const text = typeof payload === 'string' ? payload : '';
  return text.includes('<div id="root"></div>') || text.includes('sales-support-agent-frontend');
};

function appendLaunchLine(logFile, command, args) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(
    logFile,
    `\n[${nowLocalIso()}] launching: ${command} ${args.join(' ')}\n`,
    { flag: 'a' },
  );
}

export class ServiceManager {
  constructor({
    projectRoot,
    logsDir,
    logger,
    nodeCommand,
    userDataDir,
    frontendIndexPath = null,
    packaged = false,
    referenceLibraryDir = '',
  }) {
    this.projectRoot = projectRoot;
    this.logsDir = logsDir;
    this.logger = logger;
    this.nodeCommand = nodeCommand;
    this.userDataDir = userDataDir;
    this.frontendIndexPath = frontendIndexPath;
    this.packaged = packaged;
    this.referenceLibraryDir = referenceLibraryDir;
    this.children = new Map();
    this.serviceProcesses = new Map();
    this.records = new Map();

    this.mockBaseUrl = normalizeUrl(process.env.DESKTOP_MOCK_BASE_URL || 'http://127.0.0.1:3001');
    this.gatewayBaseUrl = normalizeUrl(process.env.DESKTOP_GATEWAY_BASE_URL || 'http://127.0.0.1:3000');
    this.platformBaseUrl = normalizeUrl(
      process.env.DESKTOP_PLATFORM_MANAGER_BASE_URL || 'http://127.0.0.1:3003',
    );
    this.frontendBaseUrl = normalizeUrl(process.env.DESKTOP_FRONTEND_URL || 'http://127.0.0.1:5173');
  }

  get baseEnv() {
    const dataDir = path.join(this.userDataDir, 'data');
    const sqliteDbPath = path.join(dataDir, 'sqlite.db');
    const desktopEnv = this.resolveDesktopEnv();
    const nodePaths = [
      path.join(this.projectRoot, 'node_modules'),
      path.join(this.projectRoot, 'api-gateway', 'node_modules'),
      path.join(this.projectRoot, 'platform-manager', 'node_modules'),
      process.env.NODE_PATH,
    ].filter(Boolean);
    const mergedEnv = {
      ...desktopEnv,
      ...process.env,
    };

    if (
      !normalizeText(mergedEnv[SECRET_MASTER_KEY_ENV]) &&
      normalizeText(desktopEnv[SECRET_MASTER_KEY_ENV])
    ) {
      mergedEnv[SECRET_MASTER_KEY_ENV] = desktopEnv[SECRET_MASTER_KEY_ENV];
    }

    return {
      ...mergedEnv,
      AP_DESKTOP: 'true',
      AP_DESKTOP_PACKAGED: this.packaged ? 'true' : 'false',
      AP_DESKTOP_RESOURCE_ROOT: this.projectRoot,
      AP_DESKTOP_USER_DATA_DIR: this.userDataDir,
      AP_SQLITE_DB_PATH: sqliteDbPath,
      AP_REFERENCE_LIBRARY_PATH: this.referenceLibraryDir || process.env.AP_REFERENCE_LIBRARY_PATH || '',
      NODE_PATH: nodePaths.join(path.delimiter),
    };
  }

  resolveDesktopEnv() {
    const projectConfigDir = path.join(this.projectRoot, 'config');
    const userConfigDir = path.join(this.userDataDir, 'config');
    const projectEnv = mergeEnvFiles([
      path.join(projectConfigDir, 'database.env'),
      path.join(projectConfigDir, 'model.env'),
      path.join(projectConfigDir, 'python-runtime.env'),
    ]);
    let userEnv = mergeEnvFiles([
      path.join(userConfigDir, 'database.env'),
      path.join(userConfigDir, 'model.env'),
      path.join(userConfigDir, 'python-runtime.env'),
    ]);

    if (
      !normalizeText(process.env[SECRET_MASTER_KEY_ENV]) &&
      !normalizeText(projectEnv[SECRET_MASTER_KEY_ENV]) &&
      !normalizeText(userEnv[SECRET_MASTER_KEY_ENV])
    ) {
      const modelEnvPath = path.join(userConfigDir, 'model.env');
      const generatedKey = crypto.randomBytes(32).toString('base64');
      upsertEnvValue(modelEnvPath, SECRET_MASTER_KEY_ENV, generatedKey);
      userEnv = {
        ...userEnv,
        [SECRET_MASTER_KEY_ENV]: generatedKey,
      };
      this.logger.info('[desktop] generated secret vault master key in user config', {
        file: modelEnvPath,
      });
    }

    return {
      ...projectEnv,
      ...userEnv,
    };
  }

  get services() {
    const baseEnv = this.baseEnv;
    const services = [
      {
        id: 'mock-server',
        label: 'mock-server',
        port: 3001,
        command: this.nodeCommand,
        args: [path.join(this.projectRoot, 'mock-server', 'server.js')],
        env: baseEnv,
        healthUrl: `${this.mockBaseUrl}/health`,
        wait: () => waitForHttp(`${this.mockBaseUrl}/health`, isOkJson),
      },
      {
        id: 'api-gateway',
        label: 'api-gateway',
        port: 3000,
        command: this.nodeCommand,
        args: [path.join(this.projectRoot, 'api-gateway', 'src', 'index.js')],
        env: {
          ...baseEnv,
          PORT: '3000',
          MOCK_SERVER_URL: this.mockBaseUrl,
        },
        healthUrl: `${this.gatewayBaseUrl}/health`,
        wait: () => waitForHttp(`${this.gatewayBaseUrl}/health`, isOkJson),
      },
      {
        id: 'platform-manager',
        label: 'platform-manager',
        port: 3003,
        command: this.nodeCommand,
        args: [path.join(this.projectRoot, 'platform-manager', 'src', 'index.js')],
        env: {
          ...baseEnv,
          PORT: '3003',
          MOCK_SERVER_URL: this.mockBaseUrl,
          API_GATEWAY_URL: this.gatewayBaseUrl,
        },
        healthUrl: `${this.platformBaseUrl}/health`,
        wait: () => waitForHttp(`${this.platformBaseUrl}/health`, isOkJson),
      },
    ];

    if (!this.packaged) {
      services.push({
        id: 'vite',
        label: 'vite',
        port: 5173,
        command: npmCommand,
        args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'],
        env: baseEnv,
        healthUrl: this.frontendBaseUrl,
        wait: () => waitForHttp(this.frontendBaseUrl, isFrontendHtml),
      });
    }

    return services;
  }

  getHomeUrl() {
    if (this.packaged) {
      return `${pathToFileURL(this.frontendIndexPath).toString()}#/home`;
    }

    return `${this.frontendBaseUrl}/home`;
  }

  getRecords() {
    return Array.from(this.records.values());
  }

  async startAll() {
    this.logger.info('[desktop] starting local services');

    if (this.packaged) {
      this.ensurePackagedRuntime();
    }

    try {
      for (const service of this.services) {
        await this.startService(service);
      }
    } catch (error) {
      await this.stopAllServices('startup-failure');
      throw error;
    }

    return this.getRecords();
  }

  ensurePackagedRuntime() {
    fs.mkdirSync(path.join(this.userDataDir, 'data'), { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });

    if (!fs.existsSync(this.nodeCommand)) {
      throw new Error(`packaged node runtime missing: ${this.nodeCommand}`);
    }

    if (!fs.existsSync(this.frontendIndexPath)) {
      throw new Error(`packaged frontend entry missing: ${this.frontendIndexPath}`);
    }

    if (process.platform !== 'win32') {
      fs.chmodSync(this.nodeCommand, 0o755);
    }
  }

  async startService(service) {
    const busy = await isPortBusy(service.port);
    const logFile = path.join(this.logsDir, `${service.id}.log`);

    if (busy) {
      this.logger.info(`[desktop] ${service.label} already listens on ${service.port}, reusing`);
      await service.wait();
      this.records.set(service.id, {
        id: service.id,
        label: service.label,
        port: service.port,
        managed: false,
        healthUrl: service.healthUrl,
        logFile,
      });
      return;
    }

    appendLaunchLine(logFile, service.command, service.args);
    const output = fs.openSync(logFile, 'a');
    const child = spawn(service.command, service.args, {
      cwd: this.projectRoot,
      env: service.env,
      stdio: ['ignore', output, output],
      detached: false,
      shell: false,
    });

    const entry = {
      id: service.id,
      name: service.label,
      label: service.label,
      pid: child.pid,
      child,
      port: service.port,
      logFile,
      logFd: output,
    };

    this.children.set(service.id, child);
    this.serviceProcesses.set(service.id, entry);
    this.records.set(service.id, {
      id: service.id,
      label: service.label,
      port: service.port,
      managed: true,
      pid: child.pid,
      healthUrl: service.healthUrl,
      logFile,
    });

    child.once('exit', (code, signal) => {
      this.logger.info(`[desktop] ${service.label} exited`, { code, signal });
      this.children.delete(service.id);
      this.serviceProcesses.delete(service.id);
      this.closeLogFd(entry);
    });

    try {
      await service.wait();
      this.logger.info(`[desktop] ${service.label} ready`, { port: service.port });
    } catch (error) {
      this.logger.error(`[desktop] ${service.label} failed to become ready`, error);
      throw error;
    }
  }

  closeLogFd(entry) {
    if (!entry?.logFd) return;

    try {
      fs.closeSync(entry.logFd);
    } catch {
      // best effort only
    } finally {
      entry.logFd = null;
    }
  }

  async stopAll() {
    await this.stopAllServices('stopAll');
  }

  async stopAllServices(reason = 'shutdown') {
    const entries = Array.from(this.serviceProcesses.values()).reverse();

    if (entries.length === 0) {
      this.logger.info('[desktop] no managed services to stop', { reason });
      return;
    }

    this.logger.info('[desktop] stopping managed services', {
      reason,
      services: entries.map((entry) => ({
        name: entry.name,
        pid: entry.pid,
        port: entry.port,
      })),
    });

    const results = await Promise.allSettled(
      entries.map((entry) => this.stopServiceProcess(entry)),
    );

    results.forEach((result, index) => {
      const entry = entries[index];
      if (result.status === 'rejected') {
        this.logger.warn(`[desktop] failed to stop ${entry.name} pid ${entry.pid}`, result.reason);
      }
    });
  }

  async stopServiceProcess(entry) {
    const { id, name, pid, child, port } = entry;

    this.logger.info(`[desktop] stopping ${name} pid ${pid}`, { port });

    try {
      await killProcessTree(pid, name, this.logger);
      await waitForChildExit(child);
    } finally {
      this.children.delete(id);
      this.serviceProcesses.delete(id);
      this.closeLogFd(entry);
    }

    if (isProcessAlive(pid)) {
      this.logger.warn(`[desktop] ${name} pid ${pid} may still be alive after stop`);
      return;
    }

    this.logger.info(`[desktop] stopped ${name} successfully`, { pid, port });
  }

  async stopService(id) {
    const entry = this.serviceProcesses.get(id);
    if (entry) {
      await this.stopServiceProcess(entry);
    }
  }

  async getHealthSummary() {
    const summary = {};

    for (const service of this.services) {
      try {
        summary[service.id] = await service.wait();
      } catch (error) {
        summary[service.id] = {
          success: false,
          message: error.message,
        };
      }
    }

    if (this.packaged) {
      summary.frontend = {
        success: fs.existsSync(this.frontendIndexPath),
        mode: 'static-file',
        path: this.frontendIndexPath,
      };
    }

    try {
      summary.embeddedModel = await waitForHttp(
        `${this.mockBaseUrl}/internal/embedded-model/status`,
        isOkJson,
        5000,
        { 'X-Internal-Call': 'true' },
      );
    } catch (error) {
      summary.embeddedModel = {
        success: false,
        message: error.message,
      };
    }

    return summary;
  }
}
