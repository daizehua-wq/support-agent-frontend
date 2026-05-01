import { defineConfig, devices } from '@playwright/test';

/**
 * E2E：Fix-4 默认 :5173；Fix-5 AutoRun 由 `run-fix5-e2e` 起 Vite 于 :5174 并设 `FIX5_E2E_BASE_URL`。
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
    baseURL: process.env.FIX5_E2E_BASE_URL || process.env.FIX4_E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    video: 'off',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
