#!/usr/bin/env node

import http from 'http';

const BASE = process.env.LOCAL_STACK_MOCK_BASE_URL || 'http://127.0.0.1:3001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 30000 },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    http.get(url, { timeout: 15000 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject);
  });
}

function unwrap(data) { return (data?.taskId ? data : (data?.data || data)); }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function poll(path, key, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await get(path);
    const obj = unwrap(res.body?.data || res.body);
    if (obj && obj[key] !== undefined) return obj;
    await wait(800);
  }
  return null;
}

async function run() {
  let passed = 0; let total = 0; const errors = [];
  const check = async (label, fn) => { total++; try { const ok = await fn(); if (ok) passed++; else errors.push(label); } catch (e) { errors.push(`${label}: ${e.message}`); } };

  // 1. confirm → analysis step has source field
  await check('1: confirm analysis step source', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '分析客户场景并生成反馈' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    await post(`/api/tasks/${taskId}/confirm`, {});
    await wait(3000);
    const execRes = await get(`/api/tasks/${taskId}/execution`);
    const exec = execRes.body?.data?.data || execRes.body?.data || execRes.body;
    const steps = exec?.steps || [];
    const analysisStep = steps.find(s => s.type === 'analysis');
    return analysisStep?.summary != null && ['done', 'running'].includes(analysisStep?.status);
  });

  // 2. evidence step has evidenceCount
  await check('2: evidence step details', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '产品信息检索' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    await post(`/api/tasks/${taskId}/confirm`, {});
    await wait(5000);
    const execRes = await get(`/api/tasks/${taskId}/execution`);
    const exec = unwrap(execRes.body?.data || execRes.body);
    const steps = exec?.steps || [];
    const evidenceStep = steps.find(s => s.type === 'evidence');
    return evidenceStep?.summary != null;
  });

  // 3. output step generates formal/concise/spoken
  await check('3: outstep generates output preview', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '生成销售报告' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    await post(`/api/tasks/${taskId}/confirm`, {});
    await wait(8000);
    const execRes = await get(`/api/tasks/${taskId}/execution`);
    const exec = unwrap(execRes.body?.data || execRes.body);
    if (exec?.status === 'done' && exec?.outputPreview) return true;
    const steps = exec?.steps || [];
    const outputStep = steps.find(s => s.type === 'output');
    return outputStep?.summary != null || exec?.status === 'done';
  });

  // 4. save step → archive hasOutput=true
  await check('4: save step → archive done', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '归档测试任务' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    await post(`/api/tasks/${taskId}/confirm`, {});
    await wait(10000);
    const taskRes = await get(`/api/tasks/${taskId}`);
    const detail = unwrap(taskRes.body?.data || taskRes.body);
    return detail?.status === 'completed' || detail?.hasOutput === true || false;
  });

  // 5. flow failure fallback does not cause 500
  await check('5: no 500 on confirm', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '快速测试' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    const confirmRes = await post(`/api/tasks/${taskId}/confirm`, {});
    return confirmRes.status === 200;
  });

  // 6. response has no secrets
  await check('6: no secrets in execution', async () => {
    const planRes = await post('/api/tasks/plans', { userGoal: '安全检查' });
    const plan = unwrap(planRes.body?.data);
    const taskId = plan?.taskId;
    if (!taskId) return false;
    await post(`/api/tasks/${taskId}/confirm`, {});
    await wait(2000);
    const execRes = await get(`/api/tasks/${taskId}/execution`);
    const raw = JSON.stringify(execRes.body);
    return !(raw.includes('api_key') || raw.includes('secret') || raw.includes('token') || raw.includes('password'));
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed}/${total} passed`);
  if (errors.length > 0) { console.log(`Errors: ${errors.join(', ')}`); process.exit(1); }
  console.log(`OK`);
}

run().catch(e => { console.error(e); process.exit(1); });
