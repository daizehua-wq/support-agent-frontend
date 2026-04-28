import fs from 'fs';
import path from 'path';
import { runSearchDocumentsFlow } from '../mock-server/flows/searchFlow.js';
import { runGenerateScriptFlow } from '../mock-server/flows/scriptFlow.js';
import { listExternalDataSourceRuntimeConfigs } from '../mock-server/services/externalDataSourceService.js';
import { listExternalProviderCallLogs } from '../mock-server/services/externalProviderCallLogService.js';

const nowStamp = () => String(Date.now());

const summarizeProviders = (family) =>
  listExternalDataSourceRuntimeConfigs({ family }).map((item) => ({
    id: item.id,
    provider: item.provider || item.providerName,
    sourceType: item.sourceType,
    enabled: item.enabled,
    baseUrlConfigured: Boolean(item.baseUrl),
    apiPathConfigured: Boolean(item.apiPath),
    apiKeyConfigured: Boolean(item.apiKey),
    runtimeReady: item.runtimeReady,
    runtimeStatus: item.runtimeStatus,
    blockerCodes: (item.runtimeBlockers || []).map((blocker) => blocker.code),
  }));

const sampleCases = [
  {
    id: 'paid-normal',
    label: 'paid_api 正常查询',
    keyword: process.env.AP_SMOKE_PAID_NORMAL_QUERY || '腾讯科技',
    sourceScopes: ['paid_api'],
  },
  {
    id: 'paid-empty',
    label: 'paid_api 空结果',
    keyword: process.env.AP_SMOKE_PAID_EMPTY_QUERY || `冷门不存在主体${nowStamp()}`,
    sourceScopes: ['paid_api'],
  },
  {
    id: 'web-official',
    label: 'web_search 官方资料查询',
    keyword: process.env.AP_SMOKE_WEB_OFFICIAL_QUERY || '国家市场监督管理总局 企业信用信息公示',
    sourceScopes: ['web'],
  },
  {
    id: 'web-general',
    label: 'web_search 普通网页查询',
    keyword: process.env.AP_SMOKE_WEB_GENERAL_QUERY || 'PCB 清洗剂 行业资料',
    sourceScopes: ['web'],
  },
  {
    id: 'cold-query',
    label: '冷门查询',
    keyword: process.env.AP_SMOKE_COLD_QUERY || `AP2真实联调冷门查询${nowStamp()}`,
    sourceScopes: ['paid_api', 'web'],
  },
];

const runSample = async (sample) => {
  const result = await runSearchDocumentsFlow({
    keyword: sample.keyword,
    taskInput: sample.keyword,
    industryType: 'external-api-smoke',
    sessionId: `sess-real-api-smoke-${sample.id}-${nowStamp()}`,
    sourceScopes: sample.sourceScopes,
    includePaidApiSources: sample.sourceScopes.includes('paid_api'),
    includeWebSources: sample.sourceScopes.includes('web'),
    useMockExternalProviderFallback: false,
    retainRaw: false,
  });

  return {
    id: sample.id,
    label: sample.label,
    keyword: sample.keyword,
    sourceScopes: sample.sourceScopes,
    referencePackId: result.referencePackId || '',
    referencePackStatus: result.referencePack?.status || '',
    emptyReason: result.referencePack?.emptyReason || '',
    sourceCount: result.referencePack?.sourceCount || 0,
    highTrustCount: result.referencePack?.highTrustCount || 0,
    riskCount: result.referencePack?.riskCount || 0,
    governedEvidenceCount: result.governedEvidenceItems?.length || 0,
    providerStates: result.externalProviderStates || [],
    cacheCleanup: result.referencePackCacheCleanup || null,
  };
};

const main = async () => {
  const providerReadiness = {
    paid_api: summarizeProviders('paid_api'),
    web_search: summarizeProviders('web_search'),
  };
  const readyPaidProviders = providerReadiness.paid_api.filter((item) => item.runtimeReady);
  const readyWebProviders = providerReadiness.web_search.filter((item) => item.runtimeReady);
  const canRunRealSamples = readyPaidProviders.length >= 1 && readyWebProviders.length >= 1;
  const samples = [];

  if (canRunRealSamples) {
    for (const sample of sampleCases) {
      samples.push(await runSample(sample));
    }
  }

  let scriptReadResult = null;
  const firstUsablePack = samples.find((sample) => sample.referencePackId && sample.sourceCount > 0);
  if (firstUsablePack) {
    const scriptResult = await runGenerateScriptFlow({
      referencePackId: firstUsablePack.referencePackId,
      productDirection: firstUsablePack.keyword,
      customerText: '请基于真实外部资料包输出一段简短说明。',
      communicationGoal: 'first_reply',
      sessionId: `sess-real-api-smoke-script-${nowStamp()}`,
    });
    const finalResult = scriptResult.finalResult || {};
    scriptReadResult = {
      referencePackId: firstUsablePack.referencePackId,
      facts: finalResult.facts?.length || 0,
      background: finalResult.background?.length || 0,
      riskNotes: finalResult.riskNotes?.length || 0,
      conflicts: finalResult.conflicts?.length || 0,
      doNotUse: finalResult.doNotUse?.length || 0,
      sourceDocType: finalResult.sourceDocType || '',
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    canRunRealSamples,
    providerReadiness,
    skippedReason: canRunRealSamples
      ? ''
      : '缺少至少一个 runtimeReady 的 paid_api provider 和 web_search provider。未执行真实请求，避免用 mock 结果冒充真实联调。',
    samples,
    scriptReadResult,
    paidApiCallLogs: listExternalProviderCallLogs({ sourceType: 'paid_api', limit: 20 }),
    webSearchCallLogs: listExternalProviderCallLogs({ sourceType: 'web_search', limit: 20 }),
  };
  const reportDir = path.resolve('mock-server', 'test-results');
  const reportPath = path.join(reportDir, `real-external-api-smoke-${Date.now()}.json`);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (!canRunRealSamples) {
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error('[real-external-api-smoke] FAIL', error);
  process.exitCode = 1;
});
