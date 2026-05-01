const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 30000;

let passed = 0;
let failed = 0;
let taskId = null;
let cloneTaskId = null;

function inner(resp) {
  return resp?.json?.data?.data || {};
}

function assert(label, condition) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}\n       expected truthy but got ${condition}`); }
}

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  console.log('\n=== Task Archive API Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // --- Step 1: Create task plan ---
  console.log('1. POST /api/tasks/plans');
  let res = await api('POST', '/api/tasks/plans', { userGoal: '分析半导体材料客户背景，生成销售跟进方案' });
  assert('HTTP 200', res.status === 200);
  taskId = inner(res)?.taskId;
  assert('taskId present', !!taskId);
  if (!taskId) { console.log('\nCannot continue\n'); process.exit(1); }
  console.log(`   taskId: ${taskId}\n`);

  // --- Step 2: Confirm ---
  console.log('2. POST /api/tasks/:taskId/confirm');
  res = await api('POST', `/api/tasks/${taskId}/confirm`);
  assert('HTTP 200', res.status === 200);

  // --- Step 3: Poll until done ---
  console.log('3. Poll execution until done');
  let done = false;
  let polls = 0;
  while (!done && polls < 30) {
    res = await api('GET', `/api/tasks/${taskId}/execution`);
    if (inner(res)?.status === 'done') done = true;
    polls++;
    if (!done) await new Promise(r => setTimeout(r, 1500));
  }
  assert('execution done', done);
  console.log(`   polls: ${polls}\n`);

  // --- Step 4: Trigger Output generation ---
  console.log('4. GET /api/tasks/:taskId/output (trigger lazy output)');
  res = await api('GET', `/api/tasks/${taskId}/output`);
  assert('HTTP 200', res.status === 200);
  const outputV1Id = inner(res)?.currentVersionId;
  assert('output v1 generated', !!outputV1Id);
  console.log(`   output v1: ${outputV1Id}\n`);

  // --- Step 5: GET /api/tasks (list) ---
  console.log('5. GET /api/tasks');
  res = await api('GET', '/api/tasks');
  assert('HTTP 200', res.status === 200);
  const listData = inner(res);
  const items = listData?.items || [];
  assert('items is array', Array.isArray(items));
  const foundTask = items.find(t => t.taskId === taskId);
  assert('task found in list', !!foundTask);
  assert('task has hasOutput=true', foundTask?.hasOutput === true);
  assert('task has outputVersions', Array.isArray(foundTask?.outputVersions) && foundTask.outputVersions.length > 0);
  console.log('');

  // --- Step 6: GET /api/tasks/recent ---
  console.log('6. GET /api/tasks/recent');
  res = await api('GET', '/api/tasks/recent');
  assert('HTTP 200', res.status === 200);
  const recentItems = inner(res);
  assert('recent is array', Array.isArray(recentItems) || Array.isArray(res.json?.data?.data));
  console.log('');

  // --- Step 7: GET /api/tasks/:taskId (detail) ---
  console.log('7. GET /api/tasks/:taskId');
  res = await api('GET', `/api/tasks/${taskId}`);
  assert('HTTP 200', res.status === 200);
  const detail = inner(res);
  assert('detail has taskPlan', !!detail?.taskPlan);
  assert('detail has execution', detail?.execution !== undefined);
  assert('detail has outputVersions', Array.isArray(detail?.outputVersions) && detail.outputVersions.length > 0);
  assert('detail has currentOutputVersionId', !!detail?.currentOutputVersionId);
  assert('detail source=task', detail?.source === 'task');
  console.log(`   currentOutputVersionId: ${detail?.currentOutputVersionId}\n`);

  // --- Step 8: PUT /api/tasks/:taskId/set-current-version ---
  console.log('8. PUT /api/tasks/:taskId/set-current-version (output)');
  res = await api('PUT', `/api/tasks/${taskId}/set-current-version`, { versionType: 'output', versionId: outputV1Id });
  assert('HTTP 200', res.status === 200);
  const setResult = inner(res);
  assert('set-current returns detail', !!setResult?.taskId);
  assert('outputVersion count unchanged', setResult?.outputVersions?.length === 1);
  console.log('');

  // --- Step 9: POST /api/tasks/:taskId/continue (continue-output) ---
  console.log('9. POST /api/tasks/:taskId/continue (continue-output)');
  res = await api('POST', `/api/tasks/${taskId}/continue`, { mode: 'continue-output' });
  assert('HTTP 200', res.status === 200);
  const contResult = inner(res);
  assert('resumeContext present', !!contResult?.resumeContext);
  assert('nextRoute is /workbench', contResult?.nextRoute === '/workbench');
  assert('hasOutput=true in resumeContext', contResult?.resumeContext?.hasOutput === true);
  console.log('');

  // --- Step 10: POST /api/tasks/:taskId/continue (clone-task-structure) ---
  console.log('10. POST /api/tasks/:taskId/continue (clone-task-structure)');
  res = await api('POST', `/api/tasks/${taskId}/continue`, { mode: 'clone-task-structure' });
  assert('HTTP 200', res.status === 200);
  const cloneResult = inner(res);
  cloneTaskId = cloneResult?.resumeContext?.taskId;
  assert('clone taskId is new', !!cloneTaskId && cloneTaskId !== taskId);
  assert('clone hasOutput=false', cloneResult?.resumeContext?.hasOutput === false);
  assert('clone outputVersionCount=0', cloneResult?.resumeContext?.outputVersionCount === 0);
  assert('clone existingOutputVersionIds empty', Array.isArray(cloneResult?.resumeContext?.existingOutputVersionIds) && cloneResult.resumeContext.existingOutputVersionIds.length === 0);
  console.log(`   cloneTaskId: ${cloneTaskId}\n`);

  // --- Verify clone has no output data ---
  console.log('   Verify clone has no output');
  res = await api('GET', `/api/tasks/${cloneTaskId}`);
  const cloneDetail = inner(res);
  assert('clone hasOutput=false', cloneDetail?.hasOutput === false);
  assert('clone outputVersions empty', Array.isArray(cloneDetail?.outputVersions) && cloneDetail.outputVersions.length === 0);

  // --- Summary ---
  console.log('\n=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('✅ All smoke tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
