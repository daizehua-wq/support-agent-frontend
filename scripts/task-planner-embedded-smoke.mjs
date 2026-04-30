#!/usr/bin/env node

import http from 'http';

const BASE = process.env.LOCAL_STACK_MOCK_BASE_URL || 'http://127.0.0.1:3001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function testPlan(userGoal, label, validate = null) {
  console.log(`\n--- ${label} ---`);
  console.log(`Input: ${userGoal}`);
  const res = await post('/api/tasks/plans', { userGoal });
  console.log(`Status: ${res.status}`);
  if (res.status !== 200) {
    console.log('FAIL: non-200 response');
    return false;
  }
  const topData = res.body?.data;
  const data = topData?.taskId ? topData : (topData?.data || topData || res.body);
  if (!data || !data.taskId) {
    console.log(`FAIL: no taskId. topData keys: ${topData ? JSON.stringify(Object.keys(topData)) : 'null'}`);
    return false;
  }
  const ctx = data.taskPlan?.executionContext;
  const planner = ctx?.taskPlanner;
  console.log(`taskId: ${data.taskId}`);
  console.log(`taskType: ${data.taskPlan?.taskType}`);
  console.log(`planner.source: ${planner?.source}`);
  console.log(`planner.status: ${planner?.status}`);
  console.log(`planner.modelName: ${planner?.modelName}`);
  console.log(`exec.plannerModel: ${ctx?.plannerModel}`);
  console.log(`exec.executionModel: ${ctx?.executionModel}`);
  console.log(`exec.routeSource: ${ctx?.routeSource}`);
  console.log(`exec.fallbackApplied: ${ctx?.fallbackApplied}`);
  console.log(`exec.fallbackReason: ${ctx?.fallbackReason || '(none)'}`);

  if (planner?.routeDecision) {
    console.log(`routeDecision.taskType: ${planner.routeDecision.taskType}`);
    console.log(`routeDecision.confidence: ${planner.routeDecision.confidence}`);
    console.log(`routeDecision.shouldUseExternalSources: ${planner.routeDecision.shouldUseExternalSources}`);
  }

  const missingInfo = data.taskPlan?.missingInfo || [];
  const companyNameItem = missingInfo.find((m) => m.field === 'companyName');
  if (companyNameItem) {
    console.log(`missingInfo.companyName.level: ${companyNameItem.level}`);
  }

  const riskHints = data.taskPlan?.riskHints || [];
  if (riskHints.length > 0) {
    console.log(`riskHints: ${riskHints.join('; ')}`);
  }

  if (validate) {
    const validation = validate({ data, ctx, planner, missingInfo, riskHints });
    if (validation !== true) {
      console.log(`FAIL: ${validation}`);
      return false;
    }
  }

  return true;
}

async function run() {
  let passed = 0;
  let total = 0;
  const errors = [];

  const check = async (label, fn) => {
    total++;
    try {
      const ok = await fn();
      if (ok) passed++; else errors.push(label);
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  };

  // Test A: embedded model ready → source=embedded_model
  await check('A: embedded ready task', async () => {
    return testPlan('分析创世纪机械有限公司的背景资料', 'Test A: Company background analysis', ({ ctx, planner }) => {
      if (planner?.source === 'embedded_model') {
        if (!String(planner.modelName || ctx?.plannerModel || '').toLowerCase().includes('qwen3')) {
          return 'embedded planner did not expose Qwen planner model';
        }
        return true;
      }
      if (!ctx?.fallbackReason && !planner?.fallbackReason) {
        return 'fallback planner did not expose fallbackReason';
      }
      return true;
    });
  });

  // Test B: company business task → companyName required
  await check('B: company工商 task', async () => {
    return testPlan('通过企查查查询华为公司的工商背景和经营风险', 'Test B: Qichacha company check', ({ planner, missingInfo }) => {
      const companyNameItem = missingInfo.find((m) => m.field === 'companyName');
      if (companyNameItem?.level !== 'required') return 'companyName is not required';
      if (planner?.routeDecision?.shouldUseExternalSources !== true) {
        return 'routeDecision.shouldUseExternalSources is not true';
      }
      return true;
    });
  });

  // Test C: general task
  await check('C: general task', async () => {
    return testPlan('帮我准备一份销售跟进报告', 'Test C: Sales report');
  });

  // Test D: verify response shape is valid TaskPlan
  await check('D: TaskPlan shape valid', async () => {
    const res = await post('/api/tasks/plans', { userGoal: '验证形状测试' });
    const topData = res.body?.data;
    const data = topData?.taskId ? topData : (topData?.data || topData || res.body);
    const plan = data?.taskPlan;
    if (!plan?.taskId) return false;
    if (!plan?.steps || plan.steps.length !== 4) return false;
    if (!plan?.executionContext) return false;
    if (!plan?.executionContext?.taskPlanner) return false;
    if (!['embedded_model', 'rule_engine_fallback', 'rule_engine', 'fallback'].includes(plan.executionContext.taskPlanner.source)) return false;
    return true;
  });

  // Test E: no secrets leaked in response
  await check('E: no secrets leaked', async () => {
    const res = await post('/api/tasks/plans', { userGoal: '测试安全' });
    const raw = JSON.stringify(res.body);
    if (raw.includes('api_key') || raw.includes('secret') || raw.includes('token') || raw.includes('password')) return false;
    return true;
  });

  // Test F: original Workbench TaskPlan shape not broken
  await check('F: Workbench shape', async () => {
    const res = await post('/api/tasks/plans', { userGoal: '常规任务' });
    const topData = res.body?.data;
    const data = topData?.taskId ? topData : (topData?.data || topData || res.body);
    const plan = data?.taskPlan;
    if (!plan?.taskId) return false;
    if (typeof plan?.userGoal !== 'string') return false;
    if (typeof plan?.taskTitle !== 'string') return false;
    if (typeof plan?.understanding !== 'string') return false;
    if (!Array.isArray(plan?.missingInfo)) return false;
    if (plan.missingInfo.length === 0) return false;
    return true;
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed}/${total} passed`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.join(', ')}`);
    process.exit(1);
  }
  console.log(`OK`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
