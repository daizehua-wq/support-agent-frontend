#!/usr/bin/env node
/**
 * 启动（或复用）mock-server + Vite，再跑 Playwright Fix-4 用例。
 *
 *   npm run test:fix4:e2e
 *
 * 环境变量：
 *   FIX4_E2E_USE_EXISTING=1  — 不启动子进程，假定 :3001 / :5173 已可用
 *   FIX4_E2E_BASE_URL       — 覆盖 Playwright baseURL（默认 http://127.0.0.1:5173）
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');

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
let viteProc;
let startedMock = false;
let startedVite = false;

function shutdown() {
  if (startedMock && mockProc && !mockProc.killed) {
    try {
      mockProc.kill('SIGTERM');
    } catch {
      /* */
    }
  }
  if (startedVite && viteProc && !viteProc.killed) {
    try {
      viteProc.kill('SIGTERM');
    } catch {
      /* */
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(143);
});

async function main() {
  const useExisting = process.env.FIX4_E2E_USE_EXISTING === '1';

  if (!useExisting) {
    const mockUp = await httpGetOk('http://127.0.0.1:3001/');
    if (!mockUp) {
      startedMock = true;
      mockProc = spawn(process.execPath, [join(root, 'mock-server', 'server.js')], {
        cwd: root,
        env: { ...process.env },
        stdio: 'inherit',
        detached: false,
      });
      await waitForUrl('http://127.0.0.1:3001/', 'mock-server', 180_000);
    }

    const viteUp = await httpGetOk('http://127.0.0.1:5173/');
    if (!viteUp) {
      startedVite = true;
      viteProc = spawn('npm', ['run', 'dev'], {
        cwd: root,
        env: { ...process.env },
        stdio: 'inherit',
        shell: true,
      });
      await waitForUrl('http://127.0.0.1:5173/', 'Vite dev', 120_000);
    }
  } else {
    await waitForUrl('http://127.0.0.1:3001/', 'mock-server (existing)', 10_000);
    await waitForUrl('http://127.0.0.1:5173/', 'Vite (existing)', 10_000);
  }

  const pw = spawn(
    process.execPath,
    [playwrightCli, 'test', join(root, 'e2e', 'fix4-workbench.spec.ts'), '--config', join(root, 'playwright.config.ts')],
    { cwd: root, stdio: 'inherit', env: { ...process.env } },
  );

  const code = await new Promise((resolve) => {
    pw.on('exit', (c) => resolve(c ?? 1));
  });

  shutdown();
  process.exit(code === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  shutdown();
  process.exit(1);
});
