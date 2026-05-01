#!/usr/bin/env node
/**
 * 在 mock-server :3001 可用前提下，顺序执行 Fix-4 API 回归 + task-main-chain-smoke。
 * 若本机未起 mock，则自动拉起并在结束后关闭（仅当本脚本启动的进程）。
 */
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, label, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await httpGetOk(url)) return;
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Timeout waiting for ${label}: ${url}`);
}

let mockProc;
let startedMock = false;

function shutdownMock() {
  if (startedMock && mockProc && !mockProc.killed) {
    try {
      mockProc.kill('SIGTERM');
    } catch {
      /* */
    }
  }
}

async function main() {
  const mockUp = await httpGetOk('http://127.0.0.1:3001/');
  if (!mockUp) {
    startedMock = true;
    mockProc = spawn(process.execPath, [join(root, 'mock-server', 'server.js')], {
      cwd: root,
      env: { ...process.env },
      stdio: 'inherit',
    });
    await waitForUrl('http://127.0.0.1:3001/', 'mock-server', 180_000);
  }

  const env = { ...process.env, API_BASE_URL: process.env.API_BASE_URL || 'http://127.0.0.1:3001' };

  execFileSync(process.execPath, [join(root, 'scripts', 'phase1-fix4-regression.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env,
  });

  execFileSync(process.execPath, [join(root, 'scripts', 'task-main-chain-smoke.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env,
  });

  shutdownMock();
}

main().catch((err) => {
  console.error(err);
  shutdownMock();
  process.exit(1);
});
