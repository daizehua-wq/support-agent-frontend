import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import internalClient from '../lib/internalClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', '..', 'data');
const stateFile = path.join(dataDir, 'evolution-runs.json');

const normalizeText = (value = '') => String(value || '').trim();
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const unwrapInternalData = (payload = {}) => {
  if (payload?.data && isPlainObject(payload.data) && 'data' in payload.data) {
    return payload.data.data;
  }

  if (payload?.data !== undefined) {
    return payload.data;
  }

  return payload;
};

const safeJsonParse = (value = '', fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const extractJsonPayload = (text = '') => {
  const normalizedText = normalizeText(text);
  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || normalizedText;
  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');

  if (objectStart >= 0 && objectEnd > objectStart) {
    return safeJsonParse(candidate.slice(objectStart, objectEnd + 1), null);
  }

  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return safeJsonParse(candidate.slice(arrayStart, arrayEnd + 1), null);
  }

  return null;
};

const ensureStateFile = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ runs: [], pendingActions: [], rejectedActions: [] }, null, 2),
    );
  }
};

const readState = () => {
  try {
    ensureStateFile();
    const parsed = safeJsonParse(fs.readFileSync(stateFile, 'utf8'), null);
    return {
      runs: Array.isArray(parsed?.runs) ? parsed.runs : [],
      pendingActions: Array.isArray(parsed?.pendingActions) ? parsed.pendingActions : [],
      rejectedActions: Array.isArray(parsed?.rejectedActions) ? parsed.rejectedActions : [],
    };
  } catch (error) {
    console.warn('[p5-evolution] failed to read state:', error.message);
    return { runs: [], pendingActions: [], rejectedActions: [] };
  }
};

const writeState = (state = {}) => {
  ensureStateFile();
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        runs: Array.isArray(state.runs) ? state.runs.slice(0, 50) : [],
        pendingActions: Array.isArray(state.pendingActions) ? state.pendingActions : [],
        rejectedActions: Array.isArray(state.rejectedActions) ? state.rejectedActions.slice(0, 200) : [],
      },
      null,
      2,
    ),
  );
};

const safeGet = async (pathValue = '', fallback = []) => {
  try {
    return unwrapInternalData(await internalClient.get(pathValue));
  } catch (error) {
    return {
      unavailable: true,
      path: pathValue,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
      fallback,
    };
  }
};

const safePost = async (pathValue = '', payload = {}) => {
  try {
    return unwrapInternalData(await internalClient.post(pathValue, payload));
  } catch (error) {
    return {
      success: false,
      path: pathValue,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
    };
  }
};

const safePut = async (pathValue = '', payload = {}) => {
  try {
    return unwrapInternalData(await internalClient.put(pathValue, payload));
  } catch (error) {
    return {
      success: false,
      path: pathValue,
      message: normalizeText(error.response?.data?.message) || normalizeText(error.message),
    };
  }
};

const getArraySignal = (value = []) => (Array.isArray(value) ? value : []);

export const collectEvolutionSignals = async () => {
  const [knowledgeGaps, lowRules, lowTemplates] = await Promise.all([
    safeGet('/internal/stats/knowledge-gaps?limit=100', []),
    safeGet('/internal/knowledge/rules/low-performance?min_confidence=0.3&max_days_unused=30', []),
    safeGet('/internal/knowledge/templates/low-performance?min_rating=2&max_usage=5', []),
  ]);

  return {
    knowledgeGaps: getArraySignal(knowledgeGaps),
    lowRules: getArraySignal(lowRules),
    lowTemplates: getArraySignal(lowTemplates),
  };
};

const extractKeywords = (query = '') => {
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery
    .replace(/[，。！？、,.!?;；:：]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return Array.from(new Set([normalizedQuery, ...tokens])).filter(Boolean).slice(0, 8);
};

const groupKnowledgeGaps = (knowledgeGaps = []) => {
  const grouped = new Map();

  getArraySignal(knowledgeGaps).forEach((gap) => {
    const query = normalizeText(gap.userQuery || gap.user_query).slice(0, 120);
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
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((item) => ({
      query: item.query,
      count: item.count,
      appIds: Array.from(item.appIds),
      sessionIds: Array.from(item.sessionIds).slice(0, 5),
    }));
};

const buildHeuristicActions = ({ knowledgeGaps = [], lowRules = [], lowTemplates = [] } = {}) => {
  const actions = [];

  groupKnowledgeGaps(knowledgeGaps).slice(0, 10).forEach((gap) => {
    actions.push({
      id: randomUUID(),
      type: 'create_rule',
      title: `新增知识缺口规则：${gap.query.slice(0, 40)}`,
      reason: 'knowledge_gap_observed',
      source: 'heuristic',
      status: 'pending',
      payload: {
        app_id: gap.appIds[0] || '',
        domain_type: 'general',
        topic: 'knowledge_gap',
        workflow_stage: 'analyze',
        keywords: extractKeywords(gap.query),
        scenario: '知识缺口自动补齐',
        suggestions: {
          summaryTemplate: `针对“${gap.query}”补充判断建议。`,
          followupQuestions: ['需要补充哪些业务字段？', '是否需要接入外部或内部数据源？'],
          nextActions: ['补充规则命中条件', '完善证据来源', '人工复核后提升置信度'],
        },
        risk_notes: ['该规则由 P5 知识演化生成，初始置信度为 0.8，建议人工复核。'],
        created_by: 'p5',
        confidence: 0.8,
        status: 'active',
      },
      evidence: gap,
    });
  });

  getArraySignal(lowRules).slice(0, 20).forEach((rule) => {
    actions.push({
      id: randomUUID(),
      type: 'disable_rule',
      title: `停用低效规则：${rule.id}`,
      reason: 'low_confidence_or_unused_rule',
      source: 'heuristic',
      status: 'pending',
      targetId: rule.id,
      payload: {
        id: rule.id,
        action: 'disable',
      },
      evidence: {
        confidence: rule.confidence,
        hitCount: rule.hitCount ?? rule.hit_count,
        lastHitAt: rule.lastHitAt ?? rule.last_hit_at,
      },
    });
  });

  getArraySignal(lowTemplates).slice(0, 20).forEach((template) => {
    actions.push({
      id: randomUUID(),
      type: 'disable_template',
      title: `停用低效模板：${template.id}`,
      reason: 'low_rating_and_low_usage_template',
      source: 'heuristic',
      status: 'pending',
      targetId: template.id,
      payload: {
        id: template.id,
        action: 'disable',
      },
      evidence: {
        avgRating: template.avgRating ?? template.avg_rating,
        usageCount: template.usageCount ?? template.usage_count,
      },
    });
  });

  return actions;
};

const hasUsableOpenAiKey = () => {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  return Boolean(apiKey && apiKey !== 'sk-your-key-here');
};

const buildEvolutionPrompt = (signals = {}) => {
  return [
    '你是 Agent Platform 2.0 的平台知识管理员。',
    '请根据 P0 反馈生成 P5 可执行的知识演化操作清单。',
    '安全要求：不要删除任何规则或模板；新增规则 confidence 必须小于 1.0；低效规则/模板优先停用。',
    '只输出 JSON，格式：{"actions":[{"type":"create_rule|disable_rule|modify_rule|disable_template|modify_template","targetId":"","title":"","reason":"","payload":{}}]}。',
    '',
    `知识缺口：${JSON.stringify(groupKnowledgeGaps(signals.knowledgeGaps).slice(0, 20))}`,
    `低效规则：${JSON.stringify(getArraySignal(signals.lowRules).slice(0, 20))}`,
    `低效模板：${JSON.stringify(getArraySignal(signals.lowTemplates).slice(0, 20))}`,
  ].join('\n');
};

const callDecisionModel = async (signals = {}) => {
  if (!hasUsableOpenAiKey()) {
    return null;
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.EVOLUTION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: '你是平台知识管理员，只输出 JSON 操作清单。',
        },
        {
          role: 'user',
          content: buildEvolutionPrompt(signals),
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: Number(process.env.EVOLUTION_MODEL_TIMEOUT_MS || 90000),
    },
  );

  return normalizeText(response.data?.choices?.[0]?.message?.content);
};

const normalizeActionType = (value = '') => {
  const normalizedValue = normalizeText(value).toLowerCase();
  const aliases = {
    create_rule: 'create_rule',
    add_rule: 'create_rule',
    new_rule: 'create_rule',
    disable_rule: 'disable_rule',
    stop_rule: 'disable_rule',
    modify_rule: 'modify_rule',
    update_rule: 'modify_rule',
    disable_template: 'disable_template',
    stop_template: 'disable_template',
    modify_template: 'modify_template',
    update_template: 'modify_template',
  };

  return aliases[normalizedValue] || '';
};

const normalizeModelActions = (rawActions = []) => {
  return getArraySignal(rawActions)
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const type = normalizeActionType(item.type || item.actionType || item.action);
      if (!type) {
        return null;
      }

      const payload = isPlainObject(item.payload) ? { ...item.payload } : {};
      if (type === 'create_rule') {
        payload.domain_type = normalizeText(payload.domain_type || payload.domainType) || 'general';
        payload.topic = normalizeText(payload.topic) || 'knowledge_gap';
        payload.workflow_stage = normalizeText(payload.workflow_stage || payload.workflowStage) || 'analyze';
        payload.keywords = Array.isArray(payload.keywords)
          ? payload.keywords.map(normalizeText).filter(Boolean).slice(0, 12)
          : extractKeywords(payload.keyword || item.title || item.reason);
        payload.created_by = 'p5';
        payload.confidence = Math.min(0.9, Math.max(0.1, Number(payload.confidence || 0.8) || 0.8));
        payload.status = 'active';
      }

      if (type === 'disable_rule' || type === 'disable_template') {
        payload.id = normalizeText(payload.id || item.targetId || item.id);
        payload.action = 'disable';
      }

      return {
        id: randomUUID(),
        type,
        targetId: normalizeText(item.targetId || payload.id),
        title: normalizeText(item.title) || type,
        reason: normalizeText(item.reason) || 'model_recommendation',
        source: 'llm',
        status: 'pending',
        payload,
        evidence: item.evidence || null,
      };
    })
    .filter(Boolean);
};

const buildActions = async (signals = {}) => {
  try {
    const modelText = await callDecisionModel(signals);
    const parsed = modelText ? extractJsonPayload(modelText) : null;
    const modelActions = normalizeModelActions(
      Array.isArray(parsed) ? parsed : parsed?.actions || parsed?.operations || [],
    );

    if (modelActions.length > 0) {
      return {
        source: 'llm',
        actions: modelActions,
      };
    }
  } catch (error) {
    console.warn('[p5-evolution] decision model failed, fallback to heuristic:', error.message);
  }

  return {
    source: 'heuristic',
    actions: buildHeuristicActions(signals),
  };
};

export const applyEvolutionAction = async (action = {}, actor = 'p5-evolution-scheduler') => {
  const type = normalizeActionType(action.type);
  const payload = isPlainObject(action.payload) ? action.payload : {};

  if (type === 'create_rule') {
    return safePost('/internal/knowledge/rules', {
      ...payload,
      created_by: 'p5',
      confidence: Math.min(0.9, Math.max(0.1, Number(payload.confidence || 0.8) || 0.8)),
    });
  }

  if (type === 'disable_rule') {
    return safePost('/internal/knowledge/rules/optimize', {
      actor,
      optimizations: [
        {
          id: normalizeText(action.targetId || payload.id),
          action: 'disable',
          reason: action.reason,
        },
      ],
    });
  }

  if (type === 'disable_template') {
    return safePost('/internal/knowledge/templates/optimize', {
      actor,
      optimizations: [
        {
          id: normalizeText(action.targetId || payload.id),
          action: 'disable',
          reason: action.reason,
        },
      ],
    });
  }

  if (type === 'modify_rule') {
    const id = normalizeText(action.targetId || payload.id);
    return id ? safePut(`/internal/knowledge/rules/${encodeURIComponent(id)}`, payload) : { success: false };
  }

  if (type === 'modify_template') {
    const id = normalizeText(action.targetId || payload.id);
    return id ? safePut(`/internal/knowledge/templates/${encodeURIComponent(id)}`, payload) : { success: false };
  }

  return {
    success: false,
    message: `unsupported evolution action type: ${action.type || ''}`,
  };
};

const summarizeActions = (actions = []) => {
  const summary = {
    total: actions.length,
    createRuleCount: 0,
    disabledRuleCount: 0,
    disabledTemplateCount: 0,
    modifiedRuleCount: 0,
    modifiedTemplateCount: 0,
    pendingCount: 0,
    appliedCount: 0,
    failedCount: 0,
    rejectedCount: 0,
  };

  actions.forEach((action) => {
    if (action.type === 'create_rule') summary.createRuleCount += 1;
    if (action.type === 'disable_rule') summary.disabledRuleCount += 1;
    if (action.type === 'disable_template') summary.disabledTemplateCount += 1;
    if (action.type === 'modify_rule') summary.modifiedRuleCount += 1;
    if (action.type === 'modify_template') summary.modifiedTemplateCount += 1;
    if (action.status === 'pending') summary.pendingCount += 1;
    if (action.status === 'applied') summary.appliedCount += 1;
    if (action.status === 'failed') summary.failedCount += 1;
    if (action.status === 'rejected') summary.rejectedCount += 1;
  });

  return summary;
};

export const runEvolutionCycle = async ({
  autoConfirm = normalizeText(process.env.EVOLUTION_AUTO_CONFIRM).toLowerCase() === 'true',
  actor = 'p5-evolution-scheduler',
} = {}) => {
  const state = readState();
  const startedAt = new Date().toISOString();
  const signals = await collectEvolutionSignals();
  const decision = await buildActions(signals);
  const actions = decision.actions.map((action) => ({
    ...action,
    actor,
    createdAt: startedAt,
  }));
  const appliedResults = [];

  if (autoConfirm) {
    for (const action of actions) {
      const result = await applyEvolutionAction(action, actor);
      action.status = result?.success === false ? 'failed' : 'applied';
      action.appliedAt = new Date().toISOString();
      action.result = result;
      appliedResults.push(result);
    }
  }

  const pendingActions = autoConfirm
    ? state.pendingActions
    : [...actions.filter((action) => action.status === 'pending'), ...state.pendingActions];
  const run = {
    id: randomUUID(),
    contractVersion: 'p5-knowledge-evolution/v1',
    startedAt,
    completedAt: new Date().toISOString(),
    mode: autoConfirm ? 'auto-confirm' : 'proposal-only',
    actor,
    decisionSource: decision.source,
    autoConfirm,
    signals: {
      knowledgeGapCount: signals.knowledgeGaps.length,
      lowRuleCount: signals.lowRules.length,
      lowTemplateCount: signals.lowTemplates.length,
    },
    summary: summarizeActions(actions),
    actions,
    appliedResults,
  };

  writeState({
    ...state,
    runs: [run, ...state.runs],
    pendingActions,
  });

  return run;
};

export const getEvolutionStatus = () => {
  const state = readState();
  const lastRun = state.runs[0] || null;

  return {
    contractVersion: 'p5-knowledge-evolution-status/v1',
    enabled: normalizeText(process.env.EVOLUTION_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
    autoConfirm: normalizeText(process.env.EVOLUTION_AUTO_CONFIRM).toLowerCase() === 'true',
    nextRunPolicy: 'daily_at_02_00',
    lastRun,
    pendingActions: state.pendingActions,
    rejectedActions: state.rejectedActions.slice(0, 20),
    summary: lastRun?.summary || summarizeActions(state.pendingActions),
  };
};

export const approveEvolutionAction = async (actionId = '', actor = 'p5-admin') => {
  const normalizedId = normalizeText(actionId);
  const state = readState();
  const action = state.pendingActions.find((item) => item.id === normalizedId);

  if (!action) {
    return null;
  }

  const result = await applyEvolutionAction(action, actor);
  const completedAction = {
    ...action,
    status: result?.success === false ? 'failed' : 'applied',
    appliedAt: new Date().toISOString(),
    actor,
    result,
  };
  const run = {
    id: randomUUID(),
    contractVersion: 'p5-knowledge-evolution/manual-action/v1',
    startedAt: completedAction.appliedAt,
    completedAt: completedAction.appliedAt,
    mode: 'manual-approval',
    actor,
    decisionSource: action.source || 'manual',
    autoConfirm: false,
    signals: {},
    summary: summarizeActions([completedAction]),
    actions: [completedAction],
    appliedResults: [result],
  };

  writeState({
    ...state,
    runs: [run, ...state.runs],
    pendingActions: state.pendingActions.filter((item) => item.id !== normalizedId),
  });

  return completedAction;
};

export const rejectEvolutionAction = (actionId = '', actor = 'p5-admin') => {
  const normalizedId = normalizeText(actionId);
  const state = readState();
  const action = state.pendingActions.find((item) => item.id === normalizedId);

  if (!action) {
    return null;
  }

  const rejectedAction = {
    ...action,
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    actor,
  };

  writeState({
    ...state,
    pendingActions: state.pendingActions.filter((item) => item.id !== normalizedId),
    rejectedActions: [rejectedAction, ...state.rejectedActions],
  });

  return rejectedAction;
};

const msUntilNextTwoAM = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return Math.max(1000, next.getTime() - now.getTime());
};

let evolutionTimer = null;

export const startEvolutionScheduler = () => {
  if (evolutionTimer) {
    return {
      started: false,
      reason: 'already-running',
    };
  }

  if (normalizeText(process.env.EVOLUTION_SCHEDULER_ENABLED || 'true').toLowerCase() === 'false') {
    return {
      started: false,
      reason: 'disabled',
    };
  }

  const scheduleNext = () => {
    evolutionTimer = setTimeout(() => {
      runEvolutionCycle({
        actor: 'p5-evolution-scheduler',
      }).catch((error) => {
        console.warn('[p5-evolution] scheduled cycle failed:', error?.message || error);
      }).finally(scheduleNext);
    }, msUntilNextTwoAM());
    evolutionTimer.unref?.();
  };

  scheduleNext();

  return {
    started: true,
    nextRunPolicy: 'daily_at_02_00',
    autoConfirm: normalizeText(process.env.EVOLUTION_AUTO_CONFIRM).toLowerCase() === 'true',
  };
};

export default {
  approveEvolutionAction,
  collectEvolutionSignals,
  getEvolutionStatus,
  rejectEvolutionAction,
  runEvolutionCycle,
  startEvolutionScheduler,
};
