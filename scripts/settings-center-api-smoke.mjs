const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

let passed = 0;
let failed = 0;

function inner(resp) { return resp?.json?.data?.data || resp?.json?.data || {}; }

function assert(label, condition) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

async function api(path) {
  const opts = { signal: AbortSignal.timeout(TIMEOUT_MS) };
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const json = await res.json();
  return { status: res.status, json };
}

async function checkEndpoint(label, path, checks) {
  console.log(`${label}. GET ${path}`);
  const res = await api(path);
  assert('HTTP 200', res.status === 200);
  const data = inner(res);
  for (const { label: cl, fn } of checks) {
    assert(cl, fn(data));
  }
  console.log('');
}

async function main() {
  console.log('\n=== Settings Center API Smoke Test ===\n');

  // 1. Overview
  await checkEndpoint('1', '/api/settings-center/overview', [
    { label: 'capabilitySummary present', fn: (d) => !!d?.capabilitySummary },
    { label: 'systemHealth present', fn: (d) => Array.isArray(d?.systemHealth) },
    { label: 'quickActions present', fn: (d) => Array.isArray(d?.quickActions) },
  ]);

  // 2. Models
  await checkEndpoint('2', '/api/settings-center/models', [
    { label: 'plannerModel present', fn: (d) => !!d?.plannerModel },
    { label: 'defaultModel present', fn: (d) => !!d?.defaultModel },
    { label: 'fallbackRules present', fn: (d) => !!d?.fallbackRules },
  ]);

  // 3. Assistants
  await checkEndpoint('3', '/api/settings-center/assistants', [
    { label: 'assistants is array', fn: (d) => Array.isArray(d?.assistants) },
    { label: 'prompts is array', fn: (d) => Array.isArray(d?.prompts) },
    { label: 'governanceEvents is array', fn: (d) => Array.isArray(d?.governanceEvents) },
  ]);

  // 4. Data Sources
  await checkEndpoint('4', '/api/settings-center/data-sources', [
    { label: 'overview present', fn: (d) => !!d?.overview },
    { label: 'providerStates present', fn: (d) => Array.isArray(d?.providerStates) },
    { label: 'credentialReferences present', fn: (d) => Array.isArray(d?.credentialReferences) },
    { label: 'creds use references not raw values', fn: (d) => {
      const refs = d?.credentialReferences || [];
      const s = JSON.stringify(refs).toLowerCase();
      const hasRef = s.includes('secret://') || s.includes('env.');
      const hasRaw = refs.some((r) => typeof r === 'string' && !r.startsWith('secret://') && !r.startsWith('env.'));
      return hasRef && !hasRaw;
    }},
  ]);

  // 5. Apps
  await checkEndpoint('5', '/api/settings-center/apps', [
    { label: 'apiKeys present', fn: (d) => Array.isArray(d?.apiKeys) },
    { label: 'channels present', fn: (d) => Array.isArray(d?.channels) },
    { label: 'platformManager present', fn: (d) => !!d?.platformManager },
    { label: 'adminUi present', fn: (d) => !!d?.adminUi },
  ]);

  // 6. Rules
  await checkEndpoint('6', '/api/settings-center/rules', [
    { label: 'rules present', fn: (d) => Array.isArray(d?.rules) && d.rules.length > 0 },
    { label: 'knowledgeSources present', fn: (d) => Array.isArray(d?.knowledgeSources) && d.knowledgeSources.length > 0 },
  ]);

  // 7. Runtime
  await checkEndpoint('7', '/api/settings-center/runtime', [
    { label: 'health present', fn: (d) => !!d?.health },
    { label: 'secretVault present', fn: (d) => !!d?.secretVault },
    { label: 'webhook present', fn: (d) => !!d?.webhook },
    { label: 'secretVault no raw secrets', fn: (d) => {
      const s = JSON.stringify(d?.secretVault || {});
      return !s.includes('password') && !s.includes('apikey') && !s.includes('sk-');
    }},
  ]);

  // 8. Governance
  await checkEndpoint('8', '/api/settings-center/governance', [
    { label: 'events present', fn: (d) => Array.isArray(d?.events) },
    { label: 'rollbackState present', fn: (d) => !!d?.rollbackState },
    { label: 'rollbackState.available=false', fn: (d) => d?.rollbackState?.available === false },
  ]);

  // 9. Sensitive info scan
  console.log('9. Sensitive info scan');
  const endpoints = [
    '/api/settings-center/overview', '/api/settings-center/models', '/api/settings-center/assistants',
    '/api/settings-center/data-sources', '/api/settings-center/apps', '/api/settings-center/rules',
    '/api/settings-center/runtime', '/api/settings-center/governance',
  ];
  let foundSecret = false;
  for (const ep of endpoints) {
    const res = await api(ep);
    const body = JSON.stringify(res.json).toLowerCase();
    for (const s of ['sk-', '"api_key"', '"token"', '"password"', 'provider_payload', 'rawSecret']) {
      if (body.includes(s)) { foundSecret = true; console.log(`  ❌ ${ep}: found "${s}"`); }
    }
  }
  assert('no secrets in any settings-center response', !foundSecret);
  console.log('');

  // Summary
  console.log('=== Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);
  if (failed === 0) console.log('✅ All settings center API tests passed!\n');
  else console.log('❌ Some tests failed.\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Smoke test error:', err.message); process.exit(1); });
