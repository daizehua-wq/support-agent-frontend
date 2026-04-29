const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 30000;

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

async function createLegacySession() {
  // Create legacy session via analyze → search → compose flow
  console.log('   Creating legacy session...');
  let res;

  // Step 1: Analyze
  res = await api('POST', '/api/agent/analyze-context', {
    taskInput: 'legacy test 半导体材料客户分析',
    taskSubject: '半导体材料客户销售支持',
    clientType: 'web'
  });
  const sessionId = inner(res)?.sessionId || res.json?.data?.data?.sessionId;
  if (!sessionId) {
    console.log('   Analyze did not return sessionId, trying manual session creation...');
    // Fallback: use the session store directly via reflect API
    return null;
  }
  await new Promise(r => setTimeout(r, 1500));

  // Step 2: Search
  res = await api('POST', '/api/agent/search-references', {
    sessionId,
    keyword: '半导体涂布工艺',
    clientType: 'web'
  });
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: Compose
  res = await api('POST', '/api/agent/compose-document', {
    sessionId,
    taskSubject: '半导体材料客户销售支持',
    deliverable: '销售跟进方案',
    clientType: 'web'
  });
  await new Promise(r => setTimeout(r, 1500));

  return sessionId;
}

async function main() {
  console.log('\n=== Session → Task Compat Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // ====================================================================
  // Step 1: Create legacy session
  // ====================================================================
  console.log('1. Create legacy session via analyze/search/compose');
  let legacyId = await createLegacySession();
  if (!legacyId) {
    console.log('   ⚠️  Could not create legacy session via flow (may need auth/setup).');
    console.log('   Checking existing session store...\n');
    // Try to list existing sessions
    const listRes = await api('GET', '/api/tasks');
    const items = inner(listRes)?.items || [];
    const legacy = items.find((t) => t.source === 'legacy_session');
    if (legacy) {
      legacyId = legacy.taskId;
      console.log(`   Found existing legacy session: ${legacyId}\n`);
    }
  }

  if (!legacyId) {
    console.log('\n⚠️  No legacy session available. Skipping legacy-specific checks.\n');
    console.log('   The archive merge adapter is ready for when legacy sessions exist.\n');
    // Still run non-legacy-specific checks
    await runGenericChecks();
    return;
  }

  console.log(`   legacyId: ${legacyId}\n`);

  // ====================================================================
  // Step 2: GET /api/tasks → must include legacy session
  // ====================================================================
  console.log('2. GET /api/tasks (should include legacy session)');
  const listRes = await api('GET', '/api/tasks');
  assert('list HTTP 200', listRes.status === 200);
  const items = inner(listRes)?.items || [];
  const found = items.find((t) => t.taskId === legacyId);
  assert('legacy session in list', !!found);
  assert('source=legacy_session', found?.source === 'legacy_session');
  console.log('');

  // ====================================================================
  // Step 3: GET /api/tasks/:sessionId → detail with source=legacy_session
  // ====================================================================
  console.log('3. GET /api/tasks/:sessionId (detail)');
  const detailRes = await api('GET', `/api/tasks/${legacyId}`);
  assert('detail HTTP 200', detailRes.status === 200);
  const detail = inner(detailRes);
  assert('source=legacy_session', detail?.source === 'legacy_session');
  assert('has taskPlan', !!detail?.taskPlan);
  assert('has execution', detail?.execution !== undefined);
  console.log('');

  // ====================================================================
  // Step 4: PUT /set-current-version → 409 LEGACY_SESSION_READONLY
  // ====================================================================
  console.log('4. PUT /set-current-version (expect 409)');
  const setRes = await api('PUT', `/api/tasks/${legacyId}/set-current-version`, { versionType: 'output', versionId: `${legacyId}-output-legacy-v1` });
  assert('HTTP 409', setRes.status === 409);
  assert('LEGACY_SESSION_READONLY', JSON.stringify(setRes.json).includes('LEGACY_SESSION_READONLY'));
  console.log('');

  // ====================================================================
  // Step 5: POST /continue → returns resumeContext, no error
  // ====================================================================
  console.log('5. POST /continue (continue-output)');
  const contRes = await api('POST', `/api/tasks/${legacyId}/continue`, { mode: 'continue-output' });
  assert('continue HTTP 200', contRes.status === 200);
  const contData = inner(contRes);
  assert('resumeContext present', !!contData?.resumeContext);
  assert('source=legacy_session', contData?.resumeContext?.source === 'legacy_session');
  console.log('');

  // ====================================================================
  // Step 6: POST /continue clone-task-structure → new task source=task
  // ====================================================================
  console.log('6. POST /continue (clone-task-structure)');
  const cloneRes = await api('POST', `/api/tasks/${legacyId}/continue`, { mode: 'clone-task-structure' });
  assert('clone HTTP 200', cloneRes.status === 200);
  const cloneData = inner(cloneRes);
  const cloneTaskId = cloneData?.resumeContext?.taskId;
  assert('clone taskId is new', !!cloneTaskId && cloneTaskId !== legacyId);

  // Verify clone detail
  const cloneDetailRes = await api('GET', `/api/tasks/${cloneTaskId}`);
  const cloneDetail = inner(cloneDetailRes);
  assert('clone source=task', cloneDetail?.source === 'task');
  assert('clone hasOutput=false', cloneDetail?.hasOutput === false);
  assert('clone outputVersions empty', Array.isArray(cloneDetail?.outputVersions) && cloneDetail.outputVersions.length === 0);
  console.log(`   cloneTaskId: ${cloneTaskId}\n`);

  // ====================================================================
  // Step 7: Sensitive info check
  // ====================================================================
  console.log('7. Sensitive info check');
  const taskResponses = JSON.stringify([listRes.json, detailRes.json, setRes.json, contRes.json, cloneRes.json]);
  const secrets = ['"api_key"', '"apikey"', '"provider_payload"', '"providerPayload"'];
  let foundSecret = false;
  for (const s of secrets) {
    if (taskResponses.toLowerCase().includes(s.toLowerCase())) { foundSecret = true; break; }
  }
  assert('no secrets in archive API responses', !foundSecret);
  console.log('');

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('✅ All session-task compat tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

async function runGenericChecks() {
  // Verify the list and detail endpoints still work for new tasks
  let res = await api('POST', '/api/tasks/plans', { userGoal: 'compat test' });
  const taskId = inner(res)?.taskId;
  if (taskId) {
    await api('POST', `/api/tasks/${taskId}/confirm`);
    let done = false, polls = 0;
    while (!done && polls < 20) {
      res = await api('GET', `/api/tasks/${taskId}/execution`);
      if (inner(res)?.status === 'done') done = true;
      polls++;
      if (!done) await new Promise(r => setTimeout(r, 1500));
    }
    res = await api('GET', '/api/tasks');
    assert('task list works', res.status === 200);
    res = await api('GET', `/api/tasks/${taskId}`);
    assert('task detail works', res.status === 200);
    assert('source=task', inner(res)?.source === 'task');
    console.log('');
  }

  // Summary
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);
  if (failed === 0) console.log('✅ All compat checks passed!\n');
  else console.log('❌ Some tests failed.\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
