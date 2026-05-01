import { defineConfig, devices } from '@playwright/test';

/**
 * Fix-4 UI 自动化：默认假定由 `npm run test:fix4:e2e` 拉起或复用 mock (:3001) + Vite (:5173)。
 * 仅本地/CI 显式跑 E2E 时使用；日常 `verify:frontend` 不包含浏览器依赖。
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 45_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.FIX4_E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    video: 'off',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
