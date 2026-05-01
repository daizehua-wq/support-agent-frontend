const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 30000;

let passed = 0;
let failed = 0;
let taskId = null;

// The mock server wraps responses: { code, data: { success, data: { ... } } }
// This helper extracts the innermost `data` payload.
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
  console.log('\n=== Output API Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // --- Step 1: Create Task Plan ---
  console.log('1. POST /api/tasks/plans');
  let res = await api('POST', '/api/tasks/plans', { userGoal: '分析半导体材料客户背景，生成销售跟进方案' });
  assert('HTTP 200', res.status === 200);
  taskId = inner(res)?.taskId;
  assert('taskId present', !!taskId);
  if (!taskId) { console.log('\nCannot continue without taskId\n'); process.exit(1); }
  console.log(`   taskId: ${taskId}\n`);

  // --- Step 2: Confirm ---
  console.log('2. POST /api/tasks/:taskId/confirm');
  res = await api('POST', `/api/tasks/${taskId}/confirm`);
  assert('HTTP 200', res.status === 200);
  assert('confirm status=running', inner(res)?.status === 'running');
  console.log('');

  // --- Step 3: Poll execution until done ---
  console.log('3. GET /api/tasks/:taskId/execution (poll until done)');
  let done = false;
  let polls = 0;
  while (!done && polls < 30) {
    res = await api('GET', `/api/tasks/${taskId}/execution`);
    const execStatus = inner(res)?.status;
    if (execStatus === 'done') { done = true; }
    polls++;
    if (!done) await new Promise(r => setTimeout(r, 1500));
  }
  assert('execution reached done', done);
  console.log(`   polls: ${polls}\n`);

  // --- Step 4: Get Output Detail ---
  console.log('4. GET /api/tasks/:taskId/output');
  res = await api('GET', `/api/tasks/${taskId}/output`);
  assert('HTTP 200', res.status === 200);
  const output = inner(res);
  assert('currentVersionId present', !!output?.currentVersionId);
  assert('versions array non-empty', Array.isArray(output?.versions) && output.versions.length > 0);
  assert('v1 has formalVersion', !!output?.versions?.[0]?.formalVersion);
  const v1Id = output?.currentVersionId;
  console.log(`   currentVersionId: ${v1Id}\n`);

  // --- Step 5: Get Output Versions ---
  console.log('5. GET /api/tasks/:taskId/output/versions');
  res = await api('GET', `/api/tasks/${taskId}/output/versions`);
  assert('HTTP 200', res.status === 200);
  const vData = inner(res);
  assert('versions list present', Array.isArray(vData?.versions));
  assert('currentVersionId matches', vData?.currentVersionId === v1Id);
  console.log('');

  // --- Step 6: Regenerate Output ---
  console.log('6. POST /api/tasks/:taskId/output/regenerate');
  res = await api('POST', `/api/tasks/${taskId}/output/regenerate`, { mode: 'regenerate' });
  const regenCode = res.status;
  assert('HTTP 200', regenCode === 200);
  const regenData = inner(res);
  assert('new versionId present', !!regenData?.versionId);
  assert('label is v2', regenData?.label === 'v2');
  const v2Id = regenData?.versionId;
  console.log(`   versionId: ${v2Id}\n`);

  // --- Step 7: Set previous version as current ---
  console.log('7. PUT /api/tasks/:taskId/output/set-current');
  res = await api('PUT', `/api/tasks/${taskId}/output/set-current`, { versionId: v1Id });
  assert('HTTP 200', res.status === 200);
  const setData = inner(res);
  assert('currentVersionId set to v1', setData?.currentVersionId === v1Id);
  const switchedVersions = setData?.versions;
  const v1InVersions = switchedVersions?.find(v => v.versionId === v1Id);
  const v2InVersions = switchedVersions?.find(v => v.versionId === v2Id);
  assert('v1 isCurrent=true', v1InVersions?.isCurrent === true);
  assert('v2 isCurrent=false', v2InVersions?.isCurrent === false);
  assert('still 2 versions (no new version)', switchedVersions?.length === 2);
  console.log('');

  // --- Step 8: Export Markdown ---
  console.log('8. GET /api/tasks/:taskId/output/export/markdown');
  res = await api('GET', `/api/tasks/${taskId}/output/export/markdown`);
  assert('HTTP 200', res.status === 200);
  const exportData = inner(res);
  assert('filename present', !!exportData?.filename);
  assert('markdown non-empty', typeof exportData?.markdown === 'string' && exportData.markdown.length > 0);
  if (exportData?.markdown) {
    console.log(`   markdown preview (first 200 chars):\n   ${exportData.markdown.slice(0, 200)}...`);
  }
  console.log('');

  // --- Summary ---
  console.log('=== Results ===');
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
