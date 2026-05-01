#!/usr/bin/env node
/**
 * Fix-5 E2E：mock + 带 VITE_WORKBENCH_AUTORUN=true 的 Vite，跑 Playwright fix5-autorun。
 *
 *   npm run test:fix5:e2e
 *
 * FIX5_E2E_USE_EXISTING=1 — 假定 :3001 与 Vite（默认 :5174）已可用，且 Vite 已设 `VITE_WORKBENCH_AUTORUN=true`。
 * 自定义前端基址：`FIX5_E2E_BASE_URL=http://127.0.0.1:xxxx`
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const useExisting = process.env.FIX5_E2E_USE_EXISTING === '1';

  if (!useExisting) {
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

    const fix5Base = 'http://127.0.0.1:5174';
    const viteUp = await httpGetOk(`${fix5Base}/`);
    if (!viteUp) {
      startedVite = true;
      viteProc = spawn('npm', ['run', 'dev', '--', '--port', '5174', '--strictPort'], {
        cwd: root,
        env: { ...process.env, VITE_WORKBENCH_AUTORUN: 'true' },
        stdio: 'inherit',
        shell: true,
      });
      await waitForUrl(`${fix5Base}/`, 'Vite dev :5174 (AUTORUN)', 120_000);
    }
  } else {
    await waitForUrl('http://127.0.0.1:3001/', 'mock-server (existing)', 10_000);
    await waitForUrl(process.env.FIX5_E2E_BASE_URL || 'http://127.0.0.1:5174/', 'Vite (existing)', 10_000);
  }

  const pw = spawn(
    process.execPath,
    [playwrightCli, 'test', join(root, 'e2e', 'fix5-autorun.spec.ts'), '--config', join(root, 'playwright.config.ts')],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        FIX5_E2E_BASE_URL: process.env.FIX5_E2E_BASE_URL || 'http://127.0.0.1:5174',
      },
    },
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
