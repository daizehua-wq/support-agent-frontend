import internalClient from '../lib/internalClient.js';

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const unwrapInternalData = (payload = {}) => {
  if (payload?.data && isPlainObject(payload.data) && 'data' in payload.data) {
    return payload.data.data;
  }

  if (payload?.data !== undefined) {
    return payload.data;
  }

  return payload;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeGet = async (path = '', fallback = null) => {
  try {
    return unwrapInternalData(await internalClient.get(path));
  } catch (error) {
    return {
      unavailable: true,
      path,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
      fallback,
    };
  }
};

const safePost = async (path = '', payload = {}) => {
  try {
    return unwrapInternalData(await internalClient.post(path, payload));
  } catch (error) {
    return {
      success: false,
      path,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
    };
  }
};

let lastOptimizationRun = null;
let loopTimer = null;

const buildRuleOptimizations = (rules = []) => {
  return (Array.isArray(rules) ? rules : [])
    .map((rule) => {
      const confidence = toNumber(rule.confidence, 1);
      const hitCount = toNumber(rule.hitCount ?? rule.hit_count, 0);

      if (confidence < 0.25 && hitCount === 0) {
        return {
          id: rule.id,
          action: 'disable',
          reason: 'confidence_below_0_25_and_no_hits',
          confidence,
          hitCount,
        };
      }

      if (confidence < 0.5) {
        return {
          id: rule.id,
          action: 'set_confidence',
          value: 0.5,
          reason: 'confidence_below_baseline',
          confidence,
          hitCount,
        };
      }

      return null;
    })
    .filter(Boolean);
};

const buildTemplateOptimizations = (templates = []) => {
  return (Array.isArray(templates) ? templates : [])
    .map((template) => {
      const avgRating = toNumber(template.avgRating ?? template.avg_rating, 0);
      const usageCount = toNumber(template.usageCount ?? template.usage_count, 0);

      if (avgRating < 1 && usageCount <= 2) {
        return {
          id: template.id,
          action: 'deprecate',
          reason: 'very_low_rating_and_low_usage',
          avgRating,
          usageCount,
        };
      }

      if (avgRating < 2 && usageCount <= 5) {
        return {
          id: template.id,
          action: 'disable',
          reason: 'low_rating_and_low_usage',
          avgRating,
          usageCount,
        };
      }

      return null;
    })
    .filter(Boolean);
};

const buildModelRecommendations = (modelPerformance = []) => {
  return (Array.isArray(modelPerformance) ? modelPerformance : [])
    .filter((item) => toNumber(item.calls, 0) >= 5)
    .filter((item) => toNumber(item.successRate, 1) < 0.8 || toNumber(item.p95LatencyMs, 0) > 30000)
    .map((item) => ({
      type: 'model_runtime_guard',
      model: item.model,
      reason:
        toNumber(item.successRate, 1) < 0.8
          ? 'success_rate_below_0_8'
          : 'p95_latency_above_30000ms',
      evidence: {
        calls: item.calls,
        successRate: item.successRate,
        p95LatencyMs: item.p95LatencyMs,
        avgLatencyMs: item.avgLatencyMs,
      },
      action: 'recommend_route_guard_or_fallback_review',
      applied: false,
    }));
};

const buildKnowledgeGapRecommendations = (knowledgeGaps = []) => {
  const grouped = new Map();

  (Array.isArray(knowledgeGaps) ? knowledgeGaps : []).forEach((gap) => {
    const query = normalizeText(gap.userQuery || gap.user_query).slice(0, 80);
    if (!query) {
      return;
    }

    const current = grouped.get(query) || {
      query,
      count: 0,
      appIds: new Set(),
      sessionIds: new Set(),
    };

    current.count += 1;
    if (gap.appId || gap.app_id) current.appIds.add(gap.appId || gap.app_id);
    if (gap.sessionId || gap.session_id) current.sessionIds.add(gap.sessionId || gap.session_id);
    grouped.set(query, current);
  });

  return Array.from(grouped.values())
    .filter((item) => item.count >= 1)
    .slice(0, 10)
    .map((item) => ({
      type: 'knowledge_gap_candidate',
      query: item.query,
      reason: 'unmatched_or_low_match_query_observed',
      evidence: {
        count: item.count,
        appIds: Array.from(item.appIds),
        sessionIds: Array.from(item.sessionIds).slice(0, 5),
      },
      action: 'recommend_rule_or_resource_authoring',
      applied: false,
    }));
};

const buildAlertRecommendations = (opsDashboard = {}) => {
  const alerts = Array.isArray(opsDashboard?.alerts?.items) ? opsDashboard.alerts.items : [];

  return alerts
    .filter((alert) => alert.status === 'open')
    .filter((alert) => ['critical', 'warning'].includes(alert.level))
    .slice(0, 10)
    .map((alert) => ({
      type: 'ops_alert_review',
      alertId: alert.alertId,
      level: alert.level,
      category: alert.category,
      reason: normalizeText(alert.message) || alert.title,
      action: 'recommend_operator_review',
      applied: false,
    }));
};

const buildDecisionSummary = ({
  stats = {},
  ruleOptimizations = [],
  templateOptimizations = [],
  modelRecommendations = [],
  knowledgeGapRecommendations = [],
  alertRecommendations = [],
} = {}) => {
  const totalActions =
    ruleOptimizations.length +
    templateOptimizations.length +
    modelRecommendations.length +
    knowledgeGapRecommendations.length +
    alertRecommendations.length;
  const errorRateHint =
    toNumber(stats.todayApiCalls, 0) > 0 && toNumber(stats.totalTokensUsedToday, 0) === 0
      ? 'local_or_rule_path_dominant'
      : 'normal';

  return {
    totalActions,
    decisionLevel:
      alertRecommendations.some((item) => item.level === 'critical') || modelRecommendations.length > 0
        ? 'needs_attention'
        : totalActions > 0
          ? 'optimizable'
          : 'healthy',
    errorRateHint,
  };
};

export const collectOptimizationSignals = async () => {
  const [stats, modelPerformance, knowledgeGaps, lowRules, lowTemplates, opsDashboard] =
    await Promise.all([
      safeGet('/internal/stats', {}),
      safeGet('/internal/stats/model-performance', []),
      safeGet('/internal/stats/knowledge-gaps?limit=50', []),
      safeGet('/internal/knowledge/rules/low-performance?min_confidence=0.5&max_days_unused=30', []),
      safeGet('/internal/knowledge/templates/low-performance?min_rating=2&max_usage=5', []),
      safeGet('/api/settings/ops-dashboard', {}),
    ]);

  return {
    stats,
    modelPerformance,
    knowledgeGaps,
    lowRules,
    lowTemplates,
    opsDashboard,
  };
};

export const runOptimizationCycle = async ({
  apply = false,
  actor = 'p5-optimization-agent',
} = {}) => {
  const startedAt = new Date().toISOString();
  const signals = await collectOptimizationSignals();
  const ruleOptimizations = buildRuleOptimizations(signals.lowRules);
  const templateOptimizations = buildTemplateOptimizations(signals.lowTemplates);
  const modelRecommendations = buildModelRecommendations(signals.modelPerformance);
  const knowledgeGapRecommendations = buildKnowledgeGapRecommendations(signals.knowledgeGaps);
  const alertRecommendations = buildAlertRecommendations(signals.opsDashboard);
  const applications = {};

  if (apply && ruleOptimizations.length > 0) {
    applications.rules = await safePost('/internal/knowledge/rules/optimize', {
      optimizations: ruleOptimizations,
      actor,
    });
  }

  if (apply && templateOptimizations.length > 0) {
    applications.templates = await safePost('/internal/knowledge/templates/optimize', {
      optimizations: templateOptimizations,
      actor,
    });
  }

  const result = {
    contractVersion: 'p5-optimization-cycle/v1',
    startedAt,
    completedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    actor,
    summary: buildDecisionSummary({
      stats: signals.stats,
      ruleOptimizations,
      templateOptimizations,
      modelRecommendations,
      knowledgeGapRecommendations,
      alertRecommendations,
    }),
    signals: {
      stats: signals.stats,
      modelPerformanceCount: Array.isArray(signals.modelPerformance)
        ? signals.modelPerformance.length
        : 0,
      knowledgeGapCount: Array.isArray(signals.knowledgeGaps) ? signals.knowledgeGaps.length : 0,
      lowRuleCount: Array.isArray(signals.lowRules) ? signals.lowRules.length : 0,
      lowTemplateCount: Array.isArray(signals.lowTemplates) ? signals.lowTemplates.length : 0,
      openAlertCount: Array.isArray(signals.opsDashboard?.alerts?.items)
        ? signals.opsDashboard.alerts.items.filter((item) => item.status === 'open').length
        : 0,
    },
    decisions: {
      ruleOptimizations,
      templateOptimizations,
      modelRecommendations,
      knowledgeGapRecommendations,
      alertRecommendations,
    },
    applications,
  };

  lastOptimizationRun = result;
  return result;
};

export const getOptimizationStatus = () => ({
  contractVersion: 'p5-optimization-status/v1',
  loopActive: Boolean(loopTimer),
  lastRun: lastOptimizationRun,
  policy: {
    dryRunByDefault: true,
    autoApplyEnvVar: 'P5_OPTIMIZATION_AUTO_APPLY',
    autoRunEnvVar: 'P5_OPTIMIZATION_AUTO_RUN',
    intervalMsEnvVar: 'P5_OPTIMIZATION_INTERVAL_MS',
  },
});

export const startOptimizationLoop = () => {
  if (loopTimer) {
    return {
      started: false,
      reason: 'already-running',
    };
  }

  if (normalizeText(process.env.P5_OPTIMIZATION_AUTO_RUN).toLowerCase() !== 'true') {
    return {
      started: false,
      reason: 'disabled',
    };
  }

  const intervalMs = Math.max(60000, Number(process.env.P5_OPTIMIZATION_INTERVAL_MS || 300000) || 300000);
  const apply = normalizeText(process.env.P5_OPTIMIZATION_AUTO_APPLY).toLowerCase() === 'true';

  loopTimer = setInterval(() => {
    runOptimizationCycle({
      apply,
      actor: 'p5-optimization-loop',
    }).catch((error) => {
      console.warn('[p5-optimization] loop failed:', error?.message || error);
    });
  }, intervalMs);
  loopTimer.unref?.();

  runOptimizationCycle({
    apply: false,
    actor: 'p5-optimization-loop-bootstrap',
  }).catch((error) => {
    console.warn('[p5-optimization] bootstrap dry-run failed:', error?.message || error);
  });

  return {
    started: true,
    intervalMs,
    apply,
  };
};

export default {
  collectOptimizationSignals,
  getOptimizationStatus,
  runOptimizationCycle,
  startOptimizationLoop,
};
