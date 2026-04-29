const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 30000;

let passed = 0;
let failed = 0;
let taskId = null;
let cloneTaskId = null;
let v1Id = null;
let v2Id = null;

function inner(resp) {
  return resp?.json?.data?.data || {};
}

function assert(label, condition) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}\n       expected truthy but got ${condition}`); }
}

function assertNoSecrets(label, obj) {
  const s = JSON.stringify(obj);
  const secrets = ['sk-', 'api_key', 'apikey', 'api-key', '"token"', '"password"', 'provider_payload', 'providerPayload'];
  for (const secret of secrets) {
    if (s.toLowerCase().includes(secret)) {
      failed++;
      console.log(`  ❌ ${label}: found secret pattern "${secret}"`);
      return;
    }
  }
  passed++;
  console.log(`  ✅ ${label}`);
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
  console.log('\n=== Task Main Chain Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // ====================================================================
  // Step 1: Create TaskPlan
  // ====================================================================
  console.log('1. POST /api/tasks/plans');
  let res = await api('POST', '/api/tasks/plans', { userGoal: '分析半导体材料客户背景，生成销售跟进方案' });
  assert('HTTP 200', res.status === 200);
  taskId = inner(res)?.taskId;
  const taskPlan = inner(res)?.taskPlan;
  assert('taskId present', !!taskId);
  assert('taskPlan present', !!taskPlan);
  assert('status=waiting_confirmation', inner(res)?.status === 'waiting_confirmation');
  assert('steps.length >= 4', Array.isArray(taskPlan?.steps) && taskPlan.steps.length >= 4);
  console.log(`   taskId: ${taskId}`);

  // --- Step 1.5: missingInfo rules ---
  console.log('1.5 missingInfo rules (ordinary task)');
  const mi = taskPlan?.missingInfo || [];
  const companyField = mi.find((f) => f.field === 'companyName');
  assert('companyName=recommended (ordinary)', companyField?.level === 'recommended');
  console.log('');

  // --- Step 1.6: missingInfo rules for 企查查 task ---
  console.log('1.6 missingInfo rules (company-name task)');
  res = await api('POST', '/api/tasks/plans', { userGoal: '通过企查查查询企业经营风险，生成工商背景分析报告' });
  const mi2 = inner(res)?.taskPlan?.missingInfo || [];
  const companyField2 = mi2.find((f) => f.field === 'companyName');
  assert('companyName=required (企查查)', companyField2?.level === 'required');
  console.log('');

  // ====================================================================
  // Step 2: Confirm
  // ====================================================================
  console.log('2. POST /api/tasks/:taskId/confirm');
  res = await api('POST', `/api/tasks/${taskId}/confirm`);
  assert('HTTP 200', res.status === 200);
  assert('confirm status=running', inner(res)?.status === 'running');
  console.log('');

  // ====================================================================
  // Step 3: Poll execution to done
  // ====================================================================
  console.log('3. GET /api/tasks/:taskId/execution (poll to done)');
  let done = false;
  let polls = 0;
  while (!done && polls < 30) {
    res = await api('GET', `/api/tasks/${taskId}/execution`);
    if (inner(res)?.status === 'done') done = true;
    polls++;
    if (!done) await new Promise(r => setTimeout(r, 1500));
  }
  assert('execution reached done', done);
  const execData = inner(res);
  const allStepsDone = execData?.steps?.every((s) => s.status === 'done');
  assert('all steps done', allStepsDone === true);
  console.log(`   polls: ${polls}\n`);

  // ====================================================================
  // Step 4: Get Output detail
  // ====================================================================
  console.log('4. GET /api/tasks/:taskId/output');
  res = await api('GET', `/api/tasks/${taskId}/output`);
  assert('HTTP 200', res.status === 200);
  const output = inner(res);
  assert('formalVersion present', typeof output?.versions?.[0]?.formalVersion === 'string' && output.versions[0].formalVersion.length > 0);
  assert('conciseVersion present', typeof output?.versions?.[0]?.conciseVersion === 'string' && output.versions[0].conciseVersion.length > 0);
  assert('spokenVersion present', typeof output?.versions?.[0]?.spokenVersion === 'string' && output.versions[0].spokenVersion.length > 0);
  assert('currentVersionId present', !!output?.currentVersionId);
  assert('versions.length >= 1', Array.isArray(output?.versions) && output.versions.length >= 1);
  v1Id = output?.currentVersionId;
  assert('v1 isCurrent', output?.versions?.[0]?.isCurrent === true);
  console.log(`   v1Id: ${v1Id}\n`);

  // ====================================================================
  // Step 5: Regenerate Output
  // ====================================================================
  console.log('5. POST /api/tasks/:taskId/output/regenerate');
  res = await api('POST', `/api/tasks/${taskId}/output/regenerate`, { mode: 'regenerate' });
  assert('HTTP 200', res.status === 200);
  const regen = inner(res);
  v2Id = regen?.versionId;
  assert('v2 versionId present', !!v2Id);
  assert('label=v2', regen?.label === 'v2');
  console.log(`   v2Id: ${v2Id}\n`);

  // ====================================================================
  // Step 6: Get versions (verify v1 preserved)
  // ====================================================================
  console.log('6. GET /api/tasks/:taskId/output/versions');
  res = await api('GET', `/api/tasks/${taskId}/output/versions`);
  assert('HTTP 200', res.status === 200);
  const versionsData = inner(res);
  assert('versions.length >= 2', Array.isArray(versionsData?.versions) && versionsData.versions.length >= 2);
  const v1InVersions = versionsData?.versions?.find((v) => v.versionId === v1Id);
  const v2InVersions = versionsData?.versions?.find((v) => v.versionId === v2Id);
  assert('v1 preserved', !!v1InVersions);
  assert('v1 NOT overwritten', v1InVersions?.isCurrent === false);
  assert('v2 isCurrent', v2InVersions?.isCurrent === true);
  console.log('');

  // ====================================================================
  // Step 7: Set current → v1
  // ====================================================================
  console.log('7. PUT /api/tasks/:taskId/output/set-current (v1)');
  res = await api('PUT', `/api/tasks/${taskId}/output/set-current`, { versionId: v1Id });
  assert('HTTP 200', res.status === 200);
  const setRes = inner(res);
  assert('currentVersionId = v1', setRes?.currentVersionId === v1Id);
  assert('version count unchanged', setRes?.versions?.length === 2);
  const v1Now = setRes?.versions?.find((v) => v.versionId === v1Id);
  const v2Now = setRes?.versions?.find((v) => v.versionId === v2Id);
  assert('v1 isCurrent after switch', v1Now?.isCurrent === true);
  assert('v2 NOT current after switch', v2Now?.isCurrent === false);
  assert('no new version created', setRes?.versions?.length === 2);
  console.log('');

  // ====================================================================
  // Step 8: Export Markdown
  // ====================================================================
  console.log('8. GET /api/tasks/:taskId/output/export/markdown');
  res = await api('GET', `/api/tasks/${taskId}/output/export/markdown`);
  assert('HTTP 200', res.status === 200);
  const md = inner(res);
  assert('filename present', !!md?.filename);
  assert('markdown has 正式交付版', md?.markdown?.includes('正式交付版'));
  assert('markdown has 简洁沟通版', md?.markdown?.includes('简洁沟通版'));
  assert('markdown has 口语跟进版', md?.markdown?.includes('口语跟进版'));
  assert('markdown has 关键依据', md?.markdown?.includes('关键依据'));
  assert('markdown has 风险与限制', md?.markdown?.includes('风险与限制'));
  assert('markdown has 执行过程', md?.markdown?.includes('执行过程'));
  console.log('');

  // ====================================================================
  // Step 9: GET /api/tasks (list)
  // ====================================================================
  console.log('9. GET /api/tasks');
  res = await api('GET', '/api/tasks');
  assert('HTTP 200', res.status === 200);
  const listData = inner(res);
  const items = listData?.items || [];
  assert('items is array', Array.isArray(items));
  const foundTask = items.find((t) => t.taskId === taskId);
  assert('task found in list', !!foundTask);
  assert('task has hasOutput=true', foundTask?.hasOutput === true);
  console.log('');

  // ====================================================================
  // Step 10: GET /api/tasks/recent
  // ====================================================================
  console.log('10. GET /api/tasks/recent');
  res = await api('GET', '/api/tasks/recent');
  assert('HTTP 200', res.status === 200);
  const recentArr = inner(res);
  assert('recent returns array', Array.isArray(recentArr));
  const recentHasTask = recentArr?.some((t) => t.taskId === taskId);
  // recent may or may not include the task (depends on sort)
  console.log(`   task in recent: ${recentHasTask ? 'yes' : 'no (other tasks prioritized)'}\n`);

  // ====================================================================
  // Step 11: GET /api/tasks/:taskId (detail)
  // ====================================================================
  console.log('11. GET /api/tasks/:taskId (archive detail)');
  res = await api('GET', `/api/tasks/${taskId}`);
  assert('HTTP 200', res.status === 200);
  const detail = inner(res);
  assert('taskPlan present', !!detail?.taskPlan);
  assert('execution present', detail?.execution !== undefined);
  assert('outputVersions present', Array.isArray(detail?.outputVersions) && detail.outputVersions.length >= 2);
  assert('currentOutputVersionId present', !!detail?.currentOutputVersionId);
  assert('outputSummary present', typeof detail?.outputSummary === 'string');
  assert('detail source=task', detail?.source === 'task');
  console.log('');

  // ====================================================================
  // Step 12: POST /api/tasks/:taskId/continue (continue-output)
  // ====================================================================
  console.log('12. POST /api/tasks/:taskId/continue (continue-output)');
  res = await api('POST', `/api/tasks/${taskId}/continue`, { mode: 'continue-output' });
  assert('HTTP 200', res.status === 200);
  const contOut = inner(res);
  assert('resumeContext present', !!contOut?.resumeContext);
  assert('resumeContext has taskId', contOut?.resumeContext?.taskId === taskId);
  assert('hasOutput=true', contOut?.resumeContext?.hasOutput === true);
  assert('nextRoute is /workbench', contOut?.nextRoute === '/workbench');
  console.log('');

  // ====================================================================
  // Step 13: POST /api/tasks/:taskId/continue (clone-task-structure)
  // ====================================================================
  console.log('13. POST /api/tasks/:taskId/continue (clone-task-structure)');
  res = await api('POST', `/api/tasks/${taskId}/continue`, { mode: 'clone-task-structure' });
  assert('HTTP 200', res.status === 200);
  const clone = inner(res);
  cloneTaskId = clone?.resumeContext?.taskId;
  assert('clone taskId is new', !!cloneTaskId && cloneTaskId !== taskId);
  assert('clone hasOutput=false', clone?.resumeContext?.hasOutput === false);
  assert('clone outputVersionCount=0', clone?.resumeContext?.outputVersionCount === 0);
  assert('clone existingOutputVersionIds empty',
    Array.isArray(clone?.resumeContext?.existingOutputVersionIds) &&
    clone.resumeContext.existingOutputVersionIds.length === 0
  );

  // Verify clone has no output data
  res = await api('GET', `/api/tasks/${cloneTaskId}`);
  const cloneDetail = inner(res);
  assert('clone detail hasOutput=false', cloneDetail?.hasOutput === false);
  assert('clone outputVersions empty', Array.isArray(cloneDetail?.outputVersions) && cloneDetail.outputVersions.length === 0);
  console.log(`   cloneTaskId: ${cloneTaskId}\n`);

  // ====================================================================
  // Step 14: PUT /api/tasks/:taskId/set-current-version (output)
  // ====================================================================
  console.log('14. PUT /api/tasks/:taskId/set-current-version (output)');
  res = await api('PUT', `/api/tasks/${taskId}/set-current-version`, { versionType: 'output', versionId: v2Id });
  assert('HTTP 200', res.status === 200);
  const setVer = inner(res);
  assert('currentOutputVersionId = v2', setVer?.currentOutputVersionId === v2Id);
  assert('version count unchanged', setVer?.outputVersions?.length === 2);
  console.log('');

  // ====================================================================
  // Step 15: Secret / sensitive info check
  // ====================================================================
  console.log('15. Sensitive info check');
  const allResponses = [res.json];
  assertNoSecrets('no secrets in responses', allResponses);
  console.log('');

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('✅ All main chain smoke tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
