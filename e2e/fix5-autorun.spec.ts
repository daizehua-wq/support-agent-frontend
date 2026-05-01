import { test, expect } from '@playwright/test';

/**
 * Fix-5：需 Vite 以 VITE_WORKBENCH_AUTORUN=true 启动（`npm run test:fix5:e2e` 会注入）。
 * 验证「生成计划后**不点**确认并开始执行」仍能通过 AutoRun 跑完主链。
 */
test.describe('Fix-5 Workbench AutoRun', () => {
  test('生成计划后自动执行到完成（不点击确认并开始执行）', async ({ page }) => {
    await page.goto('/workbench');

    const goal = `E2E Fix-5 AutoRun ${Date.now()}：分析客户背景并生成销售跟进建议`;
    await page.locator('.ap-task-input__field').fill(goal);

    const plansPromise = page.waitForResponse(
      (r) => r.url().includes('/api/tasks/plans') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: '生成任务计划' }).click();
    await plansPromise;

    // 刻意不点击「确认并开始执行」——仅依赖 AutoRun
    await expect(page.getByRole('heading', { name: '执行中' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('任务完成')).toBeVisible({ timeout: 180_000 });

    const timeline = page.locator('.ap-task-timeline');
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('.ant-steps-item')).toHaveCount(4);
  });
});
