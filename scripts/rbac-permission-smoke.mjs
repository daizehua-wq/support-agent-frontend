const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

let passed = 0;
let failed = 0;

function inner(resp) {
  return resp?.json?.data?.data || resp?.json?.data || {};
}

function assert(label, condition) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

async function api(method, path) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  const res = await fetch(url, opts);
  const json = await res.json();
  return { status: res.status, json };
}

async function checkRole(queryRole, checks) {
  const res = await api('GET', `/api/auth/me${queryRole ? `?role=${queryRole}` : ''}`);
  const data = inner(res);
  assert(`HTTP 200 (${queryRole || 'default'})`, res.status === 200);
  for (const { label, fn } of checks) {
    assert(label, fn(data));
  }
}

async function main() {
  console.log('\n=== RBAC Permission Smoke Test ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // ====================================================================
  // 1. Default → user
  // ====================================================================
  console.log('1. GET /api/auth/me (default)');
  await checkRole(null, [
    { label: 'role=user', fn: (d) => d.role === 'user' },
    { label: 'canAccessAdminUi=false', fn: (d) => d.permissions?.canAccessAdminUi === false },
    { label: 'canAccessPlatformManager=false', fn: (d) => d.permissions?.canAccessPlatformManager === false },
    { label: 'canViewSettingsOverview=true', fn: (d) => d.permissions?.canViewSettingsOverview === true },
  ]);
  console.log('');

  // ====================================================================
  // 2. role=user
  // ====================================================================
  console.log('2. GET /api/auth/me?role=user');
  await checkRole('user', [
    { label: 'role=user', fn: (d) => d.role === 'user' },
    { label: 'canManageModels=false', fn: (d) => d.permissions?.canManageModels === false },
    { label: 'canAccessAdminUi=false', fn: (d) => d.permissions?.canAccessAdminUi === false },
    { label: 'canAccessPlatformManager=false', fn: (d) => d.permissions?.canAccessPlatformManager === false },
  ]);
  console.log('');

  // ====================================================================
  // 3. role=business_admin
  // ====================================================================
  console.log('3. GET /api/auth/me?role=business_admin');
  await checkRole('business_admin', [
    { label: 'role=business_admin', fn: (d) => d.role === 'business_admin' },
    { label: 'canManageAssistants=true', fn: (d) => d.permissions?.canManageAssistants === true },
    { label: 'canManageApps=true', fn: (d) => d.permissions?.canManageApps === true },
    { label: 'canAccessAdminUi=false', fn: (d) => d.permissions?.canAccessAdminUi === false },
    { label: 'canAccessPlatformManager=false', fn: (d) => d.permissions?.canAccessPlatformManager === false },
  ]);
  console.log('');

  // ====================================================================
  // 4. role=system_admin
  // ====================================================================
  console.log('4. GET /api/auth/me?role=system_admin');
  await checkRole('system_admin', [
    { label: 'role=system_admin', fn: (d) => d.role === 'system_admin' },
    { label: 'canManageModels=true', fn: (d) => d.permissions?.canManageModels === true },
    { label: 'canAccessAdminUi=true', fn: (d) => d.permissions?.canAccessAdminUi === true },
    { label: 'canAccessPlatformManager=true', fn: (d) => d.permissions?.canAccessPlatformManager === true },
    { label: 'canViewGovernance=true', fn: (d) => d.permissions?.canViewGovernance === true },
  ]);
  console.log('');

  // ====================================================================
  // 5. role=internal_ops
  // ====================================================================
  console.log('5. GET /api/auth/me?role=internal_ops');
  await checkRole('internal_ops', [
    { label: 'role=internal_ops', fn: (d) => d.role === 'internal_ops' },
    { label: 'canViewRuntime=true', fn: (d) => d.permissions?.canViewRuntime === true },
    { label: 'canAccessAdminUi=true', fn: (d) => d.permissions?.canAccessAdminUi === true },
    { label: 'canAccessPlatformManager=true', fn: (d) => d.permissions?.canAccessPlatformManager === true },
    { label: 'canManageModels=false', fn: (d) => d.permissions?.canManageModels === false },
  ]);
  console.log('');

  // ====================================================================
  // 6. Invalid role → fallback to user
  // ====================================================================
  console.log('6. GET /api/auth/me?role=invalid');
  await checkRole('invalid', [
    { label: 'invalid role defaults to user', fn: (d) => d.role === 'user' },
  ]);
  console.log('');

  // ====================================================================
  // 7. Secret check
  // ====================================================================
  console.log('7. Sensitive info check');
  const allRes = await api('GET', '/api/auth/me?role=system_admin');
  const body = JSON.stringify(allRes.json);
  const secrets = ['sk-', '"api_key"', '"apikey"', '"token"', '"password"', '"provider_payload"'];
  let found = false;
  for (const s of secrets) {
    if (body.toLowerCase().includes(s)) { found = true; break; }
  }
  assert('no secrets in auth response', !found);
  console.log('');

  // ====================================================================
  // 8. Route-level permission mapping verification
  // ====================================================================
  console.log('8. PERMISSION_REQUIRED route mapping');
  // Simulate the frontend PERMISSION_REQUIRED map
  const PERMISSION_REQUIRED = {
    '/settings/overview': 'canViewSettingsOverview',
    '/settings/models': 'canManageModels',
    '/settings/assistants': 'canManageAssistants',
    '/settings/data-sources': 'canManageDataSources',
    '/settings/apps': 'canManageApps',
    '/settings/rules': 'canManageRules',
    '/settings/runtime': 'canViewRuntime',
    '/settings/governance': 'canViewGovernance',
  };

  const userRes = await api('GET', '/api/auth/me');
  const userPerm = inner(userRes)?.permissions || {};

  const adminRes = await api('GET', '/api/auth/me?role=system_admin');
  const adminPerm = inner(adminRes)?.permissions || {};

  const opsRes = await api('GET', '/api/auth/me?role=internal_ops');
  const opsPerm = inner(opsRes)?.permissions || {};

  // user → /settings/models blocked
  const modelsKey = PERMISSION_REQUIRED['/settings/models'];
  assert('user /settings/models permission=false', userPerm[modelsKey] === false);

  // UI/admin permissions
  assert('user canAccessAdminUi=false', userPerm.canAccessAdminUi === false);
  assert('user canAccessPlatformManager=false', userPerm.canAccessPlatformManager === false);
  assert('system_admin canAccessAdminUi=true', adminPerm.canAccessAdminUi === true);
  assert('system_admin canAccessPlatformManager=true', adminPerm.canAccessPlatformManager === true);

  // system_admin → /settings/models allowed
  assert('system_admin /settings/models permission=true', adminPerm[modelsKey] === true);

  // internal_ops → /settings/runtime allowed
  const runtimeKey = PERMISSION_REQUIRED['/settings/runtime'];
  assert('internal_ops /settings/runtime permission=true', opsPerm[runtimeKey] === true);

  // internal_ops → /settings/governance allowed
  const govKey = PERMISSION_REQUIRED['/settings/governance'];
  assert('internal_ops /settings/governance permission=true', opsPerm[govKey] === true);

  // internal_ops → /settings/models blocked
  assert('internal_ops /settings/models permission=false', opsPerm[modelsKey] === false);

  // business_admin → /settings/assistants allowed, admin ui blocked
  const bizRes = await api('GET', '/api/auth/me?role=business_admin');
  const bizPerm = inner(bizRes)?.permissions || {};
  assert('business_admin /settings/assistants permission=true', bizPerm[PERMISSION_REQUIRED['/settings/assistants']] === true);
  assert('business_admin canAccessAdminUi=false', bizPerm.canAccessAdminUi === false);

  // permissionAdapter fallback: user should be the conservative default
  assert('PERMISSION_REQUIRED has 8 entries', Object.keys(PERMISSION_REQUIRED).length === 8);

  // settings-center API response checks
  const appsRes = await api('GET', '/api/settings-center/apps');
  const appsData = inner(appsRes);
  assert('settings-center apps has platformManager', !!appsData?.platformManager);
  assert('settings-center apps has adminUi', !!appsData?.adminUi);

  const overviewRes = await api('GET', '/api/settings-center/overview');
  const overviewData = inner(overviewRes);
  assert('settings-center overview has degradedCapabilities', Array.isArray(overviewData?.degradedCapabilities));
  console.log('');

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('✅ All RBAC permission tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
