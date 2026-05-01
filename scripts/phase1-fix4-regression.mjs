#!/usr/bin/env node
/**
 * Phase 1 / Fix-4 — API-level stability regression for the single-task main chain.
 * Requires mock-server listening (default http://127.0.0.1:3001).
 *
 *   npm run test:fix4
 *   API_BASE_URL=http://127.0.0.1:3001 node scripts/phase1-fix4-regression.mjs
 */

const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 45000;
const POLL_INTERVAL_MS = 800;
const MAX_POLLS = 60;

let passed = 0;
let failed = 0;

function unwrapPayload(json) {
  if (!json || typeof json !== 'object') return {};
  const d = json.data;
  if (d && typeof d === 'object' && 'data' in d && d.data !== undefined && typeof d.data === 'object') {
    return d.data;
  }
  return d ?? {};
}

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}`);
  }
}

function assertNoSecrets(label, obj) {
  const s = JSON.stringify(obj).toLowerCase();
  const patterns = ['sk-', 'api_key', 'apikey', 'api-key', '"token":', '"password":', 'provider_payload', 'providerpayload'];
  for (const p of patterns) {
    if (s.includes(p)) {
      failed += 1;
      console.log(`  ❌ ${label}: matched "${p}"`);
      return;
    }
  }
  passed += 1;
  console.log(`  ✅ ${label}`);
}

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function allowedStepSource(type, src) {
  if (typeof src !== 'string' || !src.trim()) return false;
  const s = src.toLowerCase();
  if (type === 'analysis') {
    return s.includes('analyze') || s.includes('flow') || s === 'rule-engine' || s === 'fallback';
  }
  if (type === 'evidence') {
    return s.includes('search') || s.includes('flow') || s === 'rule-engine' || s === 'fallback';
  }
  if (type === 'output') {
    return s.includes('script') || s.includes('flow') || s === 'template';
  }
  if (type === 'save') {
    return s === 'task_store' || s.includes('store');
  }
  return true;
}

async function pollExecutionDone(taskId) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const res = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}/execution`);
    const exec = unwrapPayload(res.json);
    if (res.status === 200 && exec?.status === 'done') return { res, exec };
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { res: null, exec: null };
}

async function main() {
  console.log('\n=== Phase 1 / Fix-4 API regression ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // --- Liveness: GET / or /health；若端口被非 mock 占用则尝试 POST /plans ---
  let res = await api('GET', '/');
  let live =
    res.status === 200 &&
    res.json &&
    (res.json.success === true || String(res.json.message || '').toLowerCase().includes('mock'));
  if (!live) {
    res = await api('GET', '/health');
    live = res.status === 200 && res.json?.success === true;
  }
  if (!live) {
    res = await api('POST', '/api/tasks/plans', { userGoal: '__fix4_liveness__' });
    const p = unwrapPayload(res.json);
    live = res.status === 200 && !!p?.taskId;
  }
  assert('mock-server reachable (/, /health, or POST /plans)', live);

  // --- 1) Empty taskId path must not succeed as confirm ---
  console.log('\n1. POST /api/tasks//confirm (empty segment)');
  res = await api('POST', '/api/tasks//confirm', {});
  assert('empty taskId: not 200 success confirm', !(res.status === 200 && res.json?.success === true && unwrapPayload(res.json)?.status === 'running'));

  // --- 2) Double confirm: first 200, second 409 TASK_STATUS_CONFLICT ---
  console.log('\n2. Double confirm → 409');
  res = await api('POST', '/api/tasks/plans', {
    userGoal: 'Fix-4 双确认测试：半导体材料客户跟进方案',
  });
  const plan1 = unwrapPayload(res.json);
  assert('plan POST returns taskId', res.status === 200 && !!plan1?.taskId);
  const taskId = plan1?.taskId;
  assert('taskId present', !!taskId);

  res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/confirm`, {});
  assert('first confirm HTTP 200', res.status === 200);
  const exec1 = unwrapPayload(res.json);
  assert('first confirm status running or done', exec1?.status === 'running' || exec1?.status === 'done');

  res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/confirm`, {});
  assert('second confirm HTTP 409', res.status === 409);
  assert('second confirm TASK_STATUS_CONFLICT', res.json?.error?.code === 'TASK_STATUS_CONFLICT');

  // --- 3) Fresh task: output before done → 409 ---
  console.log('\n3. Output API before completion');
  res = await api('POST', '/api/tasks/plans', { userGoal: 'Fix-4 Output 就绪门禁' });
  const plan2 = unwrapPayload(res.json);
  const taskB = plan2?.taskId;
  assert('plan B taskId', !!taskB);
  res = await api('GET', `/api/tasks/${encodeURIComponent(taskB)}/output`);
  assert('output before confirm: 409 or not ready', res.status === 409);

  await api('POST', `/api/tasks/${encodeURIComponent(taskB)}/confirm`, {});
  const execAfter = unwrapPayload((await api('GET', `/api/tasks/${encodeURIComponent(taskB)}/execution`)).json);
  res = await api('GET', `/api/tasks/${encodeURIComponent(taskB)}/output`);
  if (execAfter?.status === 'done') {
    assert('output after fast completion: 200', res.status === 200);
  } else {
    assert('output while running: 409', res.status === 409);
  }

  // --- 4) Full chain: poll → 4 steps done + sources + no status contradiction ---
  console.log('\n4. Full chain → done + step.source');
  res = await api('POST', '/api/tasks/plans', {
    userGoal: 'Fix-4 全链验收：分析客户背景并生成销售跟进输出',
  });
  const plan3 = unwrapPayload(res.json);
  const taskC = plan3?.taskId;
  assert('plan C taskId', !!taskC);

  await api('POST', `/api/tasks/${encodeURIComponent(taskC)}/confirm`, {});
  const { exec: execDone } = await pollExecutionDone(taskC);
  assert('execution reached done', !!execDone && execDone.status === 'done');

  const steps = execDone.steps || [];
  assert('exactly 4 steps', steps.length === 4);
  const types = ['analysis', 'evidence', 'output', 'save'];
  for (let i = 0; i < 4; i += 1) {
    assert(`step[${i}] type=${types[i]}`, steps[i]?.type === types[i]);
    assert(`step[${i}] status=done`, steps[i]?.status === 'done');
    assert(`step[${i}] source allowed`, allowedStepSource(types[i], steps[i]?.source));
    assert(`step[${i}] durationMs number`, typeof steps[i]?.durationMs === 'number' && steps[i].durationMs >= 0);
  }
  assert('no done+failed contradiction', execDone.status === 'done' && !steps.some((s) => s.status === 'failed'));

  // --- 5) Output API after done ---
  console.log('\n5. Output + Archive after done');
  res = await api('GET', `/api/tasks/${encodeURIComponent(taskC)}/output`);
  assert('GET output HTTP 200', res.status === 200);
  const output = unwrapPayload(res.json);
  const v0 = output?.versions?.[0];
  assert('output formalVersion non-empty', typeof v0?.formalVersion === 'string' && v0.formalVersion.length > 0);

  res = await api('GET', `/api/tasks/${encodeURIComponent(taskC)}`);
  assert('GET archive detail HTTP 200', res.status === 200);
  const detail = unwrapPayload(res.json);
  assert('archive source=task', detail?.source === 'task');
  assert('outputSummary string', typeof detail?.outputSummary === 'string' && detail.outputSummary.length > 0);
  assert('evidencePackVersions array', Array.isArray(detail?.evidencePackVersions) && detail.evidencePackVersions.length >= 1);

  assertNoSecrets('no secret patterns in execution+output+detail', {
    exec: execDone,
    output,
    detail,
  });

  // --- 6) Fix-4 hand #4: forced analysis skip-flow → rule-engine or fallback, chain still done ---
  console.log('\n6. Forced analysis skip-flow (__FIX4_AF__)');
  res = await api('POST', '/api/tasks/plans', {
    userGoal: '__FIX4_AF__Fix-4 手测：强制跳过 analyzeFlow，验证降级后主链仍 done',
  });
  const planAf = unwrapPayload(res.json);
  const taskAf = planAf?.taskId;
  assert('plan AF taskId', !!taskAf);
  await api('POST', `/api/tasks/${encodeURIComponent(taskAf)}/confirm`, {});
  const { exec: execAf } = await pollExecutionDone(taskAf);
  assert('AF chain done', execAf?.status === 'done');
  const aStep = (execAf?.steps || []).find((s) => s.type === 'analysis');
  assert('analysis source is rule-engine or fallback', aStep?.source === 'rule-engine' || aStep?.source === 'fallback');

  // --- 7) Fix-4 hand #4: forced output template path ---
  console.log('\n7. Forced output template (__FIX4_OT__)');
  res = await api('POST', '/api/tasks/plans', {
    userGoal: '__FIX4_OT__Fix-4 手测：强制跳过 scriptFlow，验证 template 输出',
  });
  const planOt = unwrapPayload(res.json);
  const taskOt = planOt?.taskId;
  assert('plan OT taskId', !!taskOt);
  await api('POST', `/api/tasks/${encodeURIComponent(taskOt)}/confirm`, {});
  const { exec: execOt } = await pollExecutionDone(taskOt);
  assert('OT chain done', execOt?.status === 'done');
  const oStep = (execOt?.steps || []).find((s) => s.type === 'output');
  assert('output step source=template', oStep?.source === 'template');

  // --- 8) Fix-4 hand #8: observe TaskPlan planner branches (embedded vs rule_engine_fallback) ---
  console.log('\n8. Planner executionContext.source coverage');
  const requireDual = process.env.FIX4_REQUIRE_DUAL_PLANNER === '1';
  const seenPlanner = new Set();
  for (let i = 0; i < 24; i += 1) {
    res = await api('POST', '/api/tasks/plans', {
      userGoal: `Fix-4 planner probe ${i} ${Date.now()} 客户分析与销售方案`,
    });
    const p = unwrapPayload(res.json);
    const ctx = p?.taskPlan?.executionContext;
    const src = ctx?.taskPlanner?.source || ctx?.routeSource;
    if (typeof src === 'string' && src) seenPlanner.add(src);
    if (seenPlanner.has('embedded_model') && seenPlanner.has('rule_engine_fallback')) break;
  }
  const allowedPlanner = new Set(['embedded_model', 'rule_engine_fallback']);
  const bad = [...seenPlanner].filter((s) => !allowedPlanner.has(s));
  assert('planner sources are known', bad.length === 0);
  assert('planner saw at least one branch', seenPlanner.size >= 1);
  if (requireDual) {
    assert('FIX4_REQUIRE_DUAL_PLANNER: saw embedded_model', seenPlanner.has('embedded_model'));
    assert('FIX4_REQUIRE_DUAL_PLANNER: saw rule_engine_fallback', seenPlanner.has('rule_engine_fallback'));
  } else if (!(seenPlanner.has('embedded_model') && seenPlanner.has('rule_engine_fallback'))) {
    console.log(`  ⚠️ Single planner branch in this runtime (seen: ${[...seenPlanner].join(', ') || 'none'}). Set FIX4_REQUIRE_DUAL_PLANNER=1 to enforce both.`);
  }

  // --- Summary ---
  console.log('\n=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log('❌ Fix-4 API regression failed.\n');
    process.exit(1);
  }
  console.log('✅ Fix-4 API regression passed.\n');
  console.log('Full gate: npm run test:fix4:verify (API + main-chain + Playwright). See docs/PROJECT_NORTH_STAR.md §5.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fix-4 regression error:', err?.message || err);
  process.exit(1);
});
