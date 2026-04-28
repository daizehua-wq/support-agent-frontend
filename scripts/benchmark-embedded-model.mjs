import { disposeEmbeddedModel } from '../mock-server/plugins/model-adapters/embeddedModelAdapter.js';
import {
  EMBEDDED_MODEL_TASKS,
  normalizeEmbeddedModelTask,
} from '../mock-server/plugins/model-adapters/embeddedModelSchemas.js';
import {
  getEmbeddedModelConfig,
  getLocalModelHealthSnapshot,
  resolveMaxTokensForTask,
  resolveTimeoutMsForTask,
  runLocalModelPreprocess,
  warmupLocalModel,
} from '../mock-server/services/localModelHealthService.js';

const parseArgs = (argv = []) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const normalizedToken = token.slice(2);
    const equalIndex = normalizedToken.indexOf('=');

    if (equalIndex >= 0) {
      parsed[normalizedToken.slice(0, equalIndex)] = normalizedToken.slice(equalIndex + 1);
      continue;
    }

    const nextToken = argv[index + 1];
    if (nextToken && !nextToken.startsWith('--')) {
      parsed[normalizedToken] = nextToken;
      index += 1;
      continue;
    }

    parsed[normalizedToken] = true;
  }

  return parsed;
};

const toInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const percentile = (values = [], percent = 50) => {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index];
};

const round = (value = 0) => Math.round(Number(value || 0) * 100) / 100;

const isFallbackResult = (result = null) => {
  const data = result?.data || {};
  const routeDecision = data.routeDecision || data.route || '';

  return (
    data.fallback === true ||
    data.needsMainWorkflow === true ||
    routeDecision === 'main_workflow'
  );
};

const args = parseArgs(process.argv.slice(2));

const printUsage = () => {
  console.log(`Usage:
  node scripts/benchmark-embedded-model.mjs [options]

Options:
  --total <n>, --n <n>          Samples per task group. Default: 10.
  --group <task>                route_decision | field_extraction | structured_transform.
  --timeoutMs <ms>, --timeout <ms>
                                Override embedded model timeout.
  --minConfidence <number>      Minimum confidence threshold. Default: 0.6.
  --help                        Show this help and exit.

Safety:
  This benchmark only exercises the local embedded model adapter.
  It does not call external APIs and does not write JSONL, DB, or log files.`);
};

if (args.help === true) {
  printUsage();
  process.exit(0);
}

const total = toInteger(args.total || args.n, 10);
const groupFilter = args.group ? normalizeEmbeddedModelTask(args.group) : '';
const minConfidence = Number.isFinite(Number(args.minConfidence))
  ? Number(args.minConfidence)
  : 0.6;
const overrideTimeoutMs = toInteger(args.timeoutMs || args.timeout, 0);

const groups = [
  {
    task: EMBEDDED_MODEL_TASKS.ROUTE_DECISION,
    targetP50Ms: 1500,
    samples: [
      { text: '请判断这句话是否能走快速通道。', workflowStage: 'analyze' },
      { text: '资料检索关键词已经明确，只需判断路由。', workflowStage: 'search' },
      { text: '需要写一份完整报告并引用外部证据。', workflowStage: 'script' },
      { text: '信息不足，无法确定下一步。', workflowStage: 'analyze' },
    ],
  },
  {
    task: EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION,
    targetP50Ms: 2500,
    samples: [
      { text: '任务主题是季度复盘，目标是整理风险和下一步动作。', workflowStage: 'analyze' },
      { text: '请从输入中抽取关键词、阶段、目标和交付物。', workflowStage: 'search' },
      { text: '受众是运营团队，需要输出执行计划。', workflowStage: 'script' },
      { text: '只有一句想了解方案，字段不足。', workflowStage: 'analyze' },
    ],
  },
  {
    task: EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM,
    targetP50Ms: 3000,
    samples: [
      { text: '把当前沟通目标归一化成可复用的结构化信号。', workflowStage: 'script' },
      { text: '将用户输入转换为下一步前置处理摘要。', workflowStage: 'analyze' },
      { text: '判断资料检索前需要保留的关键词和信号。', workflowStage: 'search' },
      { text: '复杂请求需要完整分析和长文本生成。', workflowStage: 'script' },
    ],
  },
].filter((group) => !groupFilter || group.task === groupFilter);

const buildSummary = ({ task, targetP50Ms, results }) => {
  const durations = results.map((item) => item.durationMs);
  const successCount = results.filter((item) => item.success).length;
  const errorCount = results.length - successCount;
  const fallbackCount = results.filter((item) => item.fallback).length;
  const p50 = round(percentile(durations, 50));

  return {
    total: results.length,
    successCount,
    errorCount,
    p50,
    p95: round(percentile(durations, 95)),
    max: round(durations.length ? Math.max(...durations) : 0),
    average: round(
      durations.length
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0,
    ),
    fallbackCount,
    targetP50Ms,
    passedTarget: successCount > 0 && p50 < targetP50Ms,
    task,
  };
};

const runGroup = async ({ task, targetP50Ms, samples }, config) => {
  const results = [];
  const timeoutMs = overrideTimeoutMs || resolveTimeoutMsForTask(task, config);
  const maxTokens = resolveMaxTokensForTask(task, config);

  for (let index = 0; index < total; index += 1) {
    const input = samples[index % samples.length];
    const startedAt = Date.now();

    try {
      const result = await runLocalModelPreprocess(
        {
          ...input,
          task,
        },
        {
          task,
          timeoutMs,
          maxTokens,
          minConfidence,
        },
      );

      results.push({
        success: true,
        fallback: isFallbackResult(result),
        durationMs: Date.now() - startedAt,
        routeDecision: result.data?.routeDecision || result.data?.route || '',
      });
    } catch (error) {
      results.push({
        success: false,
        fallback: true,
        durationMs: Date.now() - startedAt,
        errorCode: error.code || 'EMBEDDED_MODEL_ERROR',
        errorMessage: error.message,
      });
    }
  }

  return buildSummary({
    task,
    targetP50Ms,
    results,
  });
};

try {
  const config = getEmbeddedModelConfig();
  const warmupStatus = await warmupLocalModel();
  const groupSummaries = {};

  for (const group of groups) {
    groupSummaries[group.task] = await runGroup(group, config);
  }

  const summaries = Object.values(groupSummaries);
  const summary = {
    total: summaries.reduce((sum, item) => sum + item.total, 0),
    successCount: summaries.reduce((sum, item) => sum + item.successCount, 0),
    errorCount: summaries.reduce((sum, item) => sum + item.errorCount, 0),
    fallbackCount: summaries.reduce((sum, item) => sum + item.fallbackCount, 0),
    groups: groupSummaries,
    targets: {
      route_decision: 'p50 < 1500ms',
      field_extraction: 'p50 < 2500ms',
      structured_transform: 'p50 < 3000ms',
    },
    passedTargets: summaries.every((item) => item.passedTarget),
    config: {
      classificationMaxTokens: config.classificationMaxTokens,
      jsonMaxTokens: config.jsonMaxTokens,
      routeDecisionTimeoutMs: config.routeDecisionTimeoutMs,
      fieldExtractionTimeoutMs: config.fieldExtractionTimeoutMs,
      structuredTransformTimeoutMs: config.structuredTransformTimeoutMs,
      defaultTimeoutMs: config.defaultTimeoutMs,
      minConfidence,
    },
    warmupStatus: {
      status: warmupStatus.status,
      ready: warmupStatus.ready,
      modelPresent: warmupStatus.modelPresent,
      lastError: warmupStatus.lastError,
    },
    finalStatus: {
      status: getLocalModelHealthSnapshot().status,
      ready: getLocalModelHealthSnapshot().ready,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await disposeEmbeddedModel();
}
