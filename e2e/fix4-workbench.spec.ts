import { test, expect } from '@playwright/test';

const SECRET_PATTERNS = [/sk-[a-z0-9]{10,}/i, /api_key/i, /apikey/i, /provider_payload/i, /"password"\s*:/i, /"token"\s*:\s*"/i];

function unwrapApiData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const d = o.data;
  if (d && typeof d === 'object' && 'data' in d && (d as Record<string, unknown>).data !== undefined) {
    return (d as { data: Record<string, unknown> }).data;
  }
  if (d && typeof d === 'object') return d as Record<string, unknown>;
  return o;
}

function assertNoSecretsInJson(label: string, rawText: string) {
  const low = rawText.toLowerCase();
  for (const p of SECRET_PATTERNS) {
    if (p.test(low)) {
      throw new Error(`${label}: matched secret pattern ${String(p)}`);
    }
  }
}

test.describe('Fix-4 手测表（Workbench + Output + History）', () => {
  test('主链：生成计划 → 确认 → 四步已完成 → Output → 历史摘要', async ({ page }) => {
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/tasks//') || u.includes('/api/tasks/%2F%2F')) {
        throw new Error(`Malformed tasks URL: ${u}`);
      }
    });

    await page.goto('/workbench');

    const goal = `E2E Fix-4 ${Date.now()}：分析客户背景并生成销售跟进建议`;
    await page.locator('.ap-task-input__field').fill(goal);
    const plansPromise = page.waitForResponse(
      (r) => r.url().includes('/api/tasks/plans') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: '生成任务计划' }).click();
    const plansRes = await plansPromise;

    await expect(page.getByText('确认并开始执行')).toBeVisible({ timeout: 120_000 });

    const plansJson = await plansRes.json();
    const planData = unwrapApiData(plansJson) as { taskId?: string };
    const taskId = planData.taskId;
    expect(taskId && String(taskId).trim().length > 0).toBeTruthy();

    await page.getByRole('button', { name: '确认并开始执行' }).click();
    // 确认后进入「执行中」视图，确认按钮从 DOM 移除（非 disabled），故断言标题而非按钮 disabled
    await expect(page.getByRole('heading', { name: '执行中' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('任务完成')).toBeVisible({ timeout: 180_000 });

    const timeline = page.locator('.ap-task-timeline');
    await expect(timeline).toBeVisible();
    // Ant Steps 每步一个 item；避免用「已完成」计数（描述区可能重复匹配）
    await expect(timeline.locator('.ant-steps-item')).toHaveCount(4);

    const execReq = await page.request.get(`/api/tasks/${encodeURIComponent(taskId!)}/execution`);
    expect(execReq.ok()).toBeTruthy();
    const execText = await execReq.text();
    assertNoSecretsInJson('execution', execText);
    const exec = unwrapApiData(JSON.parse(execText)) as {
      status?: string;
      steps?: Array<{ status?: string; source?: string; type?: string }>;
    };
    expect(exec.status).toBe('done');
    expect(exec.steps?.length).toBe(4);
    for (const s of exec.steps || []) {
      expect(typeof s.source).toBe('string');
      expect((s.source as string).length).toBeGreaterThan(0);
    }

    const outReq = await page.request.get(`/api/tasks/${encodeURIComponent(taskId!)}/output`);
    expect(outReq.ok()).toBeTruthy();
    const outText = await outReq.text();
    assertNoSecretsInJson('output', outText);
    const outData = unwrapApiData(JSON.parse(outText)) as { versions?: Array<{ formalVersion?: string }> };
    expect(outData.versions?.[0]?.formalVersion && outData.versions[0].formalVersion.length > 0).toBeTruthy();

    await page.getByRole('button', { name: '查看 Output' }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}/output`));
    await expect(page.getByRole('tab', { name: '正式交付版' })).toBeVisible({ timeout: 60_000 });

    await page.goto(`/tasks/${taskId}`);
    await expect(page.getByText('最终输出摘要')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('进入 Output 工作台查看完整交付').first()).toBeVisible();

    const detailReq = await page.request.get(`/api/tasks/${encodeURIComponent(taskId!)}`);
    expect(detailReq.ok()).toBeTruthy();
    const detailText = await detailReq.text();
    assertNoSecretsInJson('archive-detail', detailText);
    const detail = unwrapApiData(JSON.parse(detailText)) as { outputSummary?: string; evidenceSummary?: string };
    expect(typeof detail.outputSummary).toBe('string');
    expect((detail.outputSummary || '').length).toBeGreaterThan(0);
  });
});
