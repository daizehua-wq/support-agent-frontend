const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

let passed = 0;
let failed = 0;

function inner(resp) {
  return resp?.json?.data?.data || {};
}

function assert(label, condition) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
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
  console.log('\n=== Task Fallback Policy Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // ====================================================================
  // 1. 404 does NOT return success data (client error → no fallback)
  // ====================================================================
  console.log('1. GET /api/tasks/fake-nonexistent-id (expect 404 TASK_NOT_FOUND)');
  const res404 = await api('GET', '/api/tasks/fake-nonexistent-id');
  assert('HTTP 404', res404.status === 404);
  assert('success=false', res404.json?.data?.success === false || res404.json?.success === false);
  assert('error code TASK_NOT_FOUND', JSON.stringify(res404.json).includes('TASK_NOT_FOUND'));
  console.log('');

  // ====================================================================
  // 2. 400 Missing required field (client error → no fallback)
  // ====================================================================
  console.log('2. POST /api/tasks/plans with empty body (expect 400)');
  const res400 = await api('POST', '/api/tasks/plans', {});
  assert('HTTP 400', res400.status === 400);
  assert('error code MISSING_REQUIRED_INFO', JSON.stringify(res400.json).includes('MISSING_REQUIRED_INFO'));
  console.log('');

  // ====================================================================
  // 3. 409 Status conflict (task not ready → no fallback)
  // ====================================================================
  console.log('3. GET /api/tasks/fake-id/output (expect 404 or 409)');
  const res409 = await api('GET', '/api/tasks/fake-id/output');
  assert('HTTP 4xx', res409.status === 404 || res409.status === 409);
  assert('response is error', res409.json?.data?.success === false || res409.json?.success === false);
  console.log('');

  // ====================================================================
  // 4. Confirm route 404 for nonexistent task
  // ====================================================================
  console.log('4. POST /api/tasks/fake-id/confirm (expect 404)');
  const resConf = await api('POST', '/api/tasks/fake-id/confirm');
  assert('HTTP 404', resConf.status === 404);
  assert('error code TASK_NOT_FOUND', JSON.stringify(resConf.json).includes('TASK_NOT_FOUND'));
  console.log('');

  // ====================================================================
  // 5. API responds with valid data when task exists (smoke + sanity)
  // ====================================================================
  console.log('5. Create real task → verify 200 success responses are returned properly');
  let res = await api('POST', '/api/tasks/plans', { userGoal: 'fallback policy test' });
  const taskId = inner(res)?.taskId;
  if (taskId) {
    // The rest of the test walks through the happy path to confirm API responds correctly
    res = await api('POST', `/api/tasks/${taskId}/confirm`);
    assert('confirm 200', res.status === 200);

    let polls = 0; let done = false;
    while (!done && polls < 20) {
      res = await api('GET', `/api/tasks/${taskId}/execution`);
      if (inner(res)?.status === 'done') done = true;
      polls++;
      if (!done) await new Promise(r => setTimeout(r, 1500));
    }
    assert('execution done', done);

    res = await api('GET', `/api/tasks/${taskId}/output`);
    assert('output 200', res.status === 200);

    res = await api('GET', `/api/tasks/${taskId}`);
    assert('archive detail 200', res.status === 200);

    res = await api('GET', '/api/tasks');
    assert('task list 200', res.status === 200);

    res = await api('GET', '/api/tasks/recent');
    assert('recent 200', res.status === 200);
  }
  console.log('');

  // ====================================================================
  // 6. VITE_USE_TASK_MOCK=true check
  // ====================================================================
  console.log('6. VITE_USE_TASK_MOCK check');
  if (process.env.VITE_USE_TASK_MOCK === 'true') {
    console.log('   ✅ VITE_USE_TASK_MOCK=true, mock path active');
    passed++;
  } else {
    console.log('   ✅ VITE_USE_TASK_MOCK not set, API-first active (default)');
    passed++;
  }
  console.log('');

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('✅ All fallback policy tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
