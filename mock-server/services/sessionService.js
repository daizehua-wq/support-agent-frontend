import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  appendMessage as appendSqliteMessage,
  createSession as createSqliteSession,
} from '../data/models/session.js';
import { getDbPath } from '../data/database.js';
import { nowLocalIso } from '../utils/localTime.js';

// =========================
// 上下文缓存层
// 负责 Redis / 内存双通道的 30 分钟短期上下文缓存。
// 不替代下方 session-store 的留痕职责。
// =========================

const SESSION_CONTEXT_TTL_SECONDS = 30 * 60;
const SESSION_CONTEXT_TTL_MS = SESSION_CONTEXT_TTL_SECONDS * 1000;
const SESSION_CONTEXT_REDIS_PREFIX = 'mock-server:session-context:';

const contextMemoryStore = new Map();
let contextStorePromise = null;
const contextStoreState = {
  activeStore: 'unknown',
  initializedAt: '',
  fallbackActive: false,
  fallbackReason: '',
  redisUrl: '',
};

const nowTimestamp = nowLocalIso;
const normalizeText = (value = '') => String(value || '').trim();

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeContextRecord = (record = {}) => {
  const normalizedRecord =
    record && typeof record === 'object' && !Array.isArray(record) ? cloneValue(record) : {};

  return {
    ...normalizedRecord,
    history: Array.isArray(normalizedRecord.history) ? normalizedRecord.history : [],
    updatedAt:
      typeof normalizedRecord.updatedAt === 'string' && normalizedRecord.updatedAt.trim()
        ? normalizedRecord.updatedAt
        : nowTimestamp(),
  };
};

const cleanupExpiredContextEntries = () => {
  const currentTime = Date.now();

  for (const [key, value] of contextMemoryStore.entries()) {
    if (!value?.expiresAt || value.expiresAt <= currentTime) {
      contextMemoryStore.delete(key);
    }
  }
};

const getMemoryContextRecord = (sessionId = '') => {
  cleanupExpiredContextEntries();

  const storedRecord = contextMemoryStore.get(sessionId);
  if (!storedRecord?.value) {
    return null;
  }

  return normalizeContextRecord(storedRecord.value);
};

const setMemoryContextRecord = (sessionId = '', record = {}) => {
  cleanupExpiredContextEntries();
  contextMemoryStore.set(sessionId, {
    value: normalizeContextRecord(record),
    expiresAt: Date.now() + SESSION_CONTEXT_TTL_MS,
  });
};

const initializeContextStore = async () => {
  const redisUrl = String(
    process.env.REDIS_URL || process.env.MOCK_SERVER_REDIS_URL || 'redis://127.0.0.1:6379',
  ).trim();
  let client = null;
  contextStoreState.redisUrl = redisUrl;

  try {
    const redisModule = await import('redis');
    client = redisModule.createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: false,
      },
    });

    client.on('error', (error) => {
      console.warn('[sessionService] redis context store error:', error.message);
    });

    await client.connect();

    console.log('[sessionService] using redis context store:', redisUrl);
    contextStoreState.activeStore = 'redis';
    contextStoreState.initializedAt = nowTimestamp();
    contextStoreState.fallbackActive = false;
    contextStoreState.fallbackReason = '';

    return {
      type: 'redis',
      client,
    };
  } catch (error) {
    try {
      client?.destroy?.();
    } catch {
      // noop
    }
    console.warn(
      '[sessionService] redis unavailable, falling back to memory context store:',
      error.message,
    );
    contextStoreState.activeStore = 'memory';
    contextStoreState.initializedAt = nowTimestamp();
    contextStoreState.fallbackActive = true;
    contextStoreState.fallbackReason = normalizeText(error?.message || 'redis-unavailable');

    return {
      type: 'memory',
      client: null,
    };
  }
};

const getContextStore = async () => {
  if (!contextStorePromise) {
    contextStorePromise = initializeContextStore().catch((error) => {
      contextStorePromise = Promise.resolve({
        type: 'memory',
        client: null,
      });
      console.warn(
        '[sessionService] context store initialization failed, using memory fallback:',
        error.message,
      );
      contextStoreState.activeStore = 'memory';
      contextStoreState.initializedAt = nowTimestamp();
      contextStoreState.fallbackActive = true;
      contextStoreState.fallbackReason = normalizeText(
        error?.message || 'context-store-initialization-failed',
      );
      return {
        type: 'memory',
        client: null,
      };
    });
  }

  return contextStorePromise;
};

const getContextStoreKey = (sessionId = '') => {
  return `${SESSION_CONTEXT_REDIS_PREFIX}${sessionId}`;
};

const readContextRecord = async (sessionId = '') => {
  if (!sessionId) {
    return null;
  }

  const store = await getContextStore();

  if (store.type === 'redis' && store.client) {
    try {
      const rawValue = await store.client.get(getContextStoreKey(sessionId));
      if (!rawValue) {
        return null;
      }

      try {
        return normalizeContextRecord(JSON.parse(rawValue));
      } catch (error) {
        console.warn(
          '[sessionService] failed to parse redis context record, clearing corrupted entry:',
          error.message,
        );
        await store.client.del(getContextStoreKey(sessionId));
        return null;
      }
    } catch (error) {
      console.warn(
        '[sessionService] redis read failed, falling back to memory context store:',
        error.message,
      );
      contextStorePromise = Promise.resolve({
        type: 'memory',
        client: null,
      });
      contextStoreState.activeStore = 'memory';
      contextStoreState.fallbackActive = true;
      contextStoreState.fallbackReason = normalizeText(error?.message || 'redis-read-failed');
      return null;
    }
  }

  return getMemoryContextRecord(sessionId);
};

const writeContextRecord = async (sessionId = '', record = {}) => {
  if (!sessionId) {
    return null;
  }

  const normalizedRecord = normalizeContextRecord(record);
  const store = await getContextStore();

  if (store.type === 'redis' && store.client) {
    try {
      await store.client.setEx(
        getContextStoreKey(sessionId),
        SESSION_CONTEXT_TTL_SECONDS,
        JSON.stringify(normalizedRecord),
      );
      return normalizedRecord;
    } catch (error) {
      console.warn(
        '[sessionService] redis write failed, falling back to memory context store:',
        error.message,
      );
      contextStorePromise = Promise.resolve({
        type: 'memory',
        client: null,
      });
      contextStoreState.activeStore = 'memory';
      contextStoreState.fallbackActive = true;
      contextStoreState.fallbackReason = normalizeText(error?.message || 'redis-write-failed');
    }
  }

  setMemoryContextRecord(sessionId, normalizedRecord);
  return normalizedRecord;
};

const writeSqliteSessionSafely = ({
  sessionId = '',
  userId = 'admin',
  title = '',
  appId = '',
} = {}) => {
  if (!sessionId) {
    return null;
  }

  try {
    return createSqliteSession(userId || 'admin', title || sessionId, {
      id: sessionId,
      appId,
    });
  } catch (error) {
    console.warn('[sessionService] sqlite session write failed, keeping legacy flow alive:', error.message);
    return null;
  }
};

const appendSqliteMessageSafely = (sessionId = '', message = {}) => {
  if (!sessionId) {
    return null;
  }

  try {
    return appendSqliteMessage(sessionId, message);
  } catch (error) {
    console.warn('[sessionService] sqlite message write failed, keeping legacy flow alive:', error.message);
    return null;
  }
};

export const saveContext = async (sessionId, contextData = {}) => {
  if (!sessionId) {
    return null;
  }

  const existingRecord = (await getContext(sessionId)) || {};
  const normalizedPatch =
    contextData && typeof contextData === 'object' && !Array.isArray(contextData)
      ? cloneValue(contextData)
      : {};
  const history = Array.isArray(normalizedPatch.history)
    ? normalizedPatch.history
    : Array.isArray(existingRecord.history)
      ? existingRecord.history
      : [];

  const nextRecord = normalizeContextRecord({
    ...existingRecord,
    ...normalizedPatch,
    history,
    updatedAt: nowTimestamp(),
  });

  const storedRecord = await writeContextRecord(sessionId, nextRecord);
  writeSqliteSessionSafely({
    sessionId,
    title: nextRecord.title || sessionId,
    appId: nextRecord.appId || nextRecord.app_id || '',
  });
  appendSqliteMessageSafely(sessionId, {
    role: 'system',
    content: 'context:update',
    metadata: {
      kind: 'context',
      context: nextRecord,
    },
  });

  return storedRecord;
};

export const getContext = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  return readContextRecord(sessionId);
};

export const getContextStoreSummary = async () => {
  const store = await getContextStore();
  const activeStore = store?.type === 'redis' ? 'redis' : 'memory';
  const fallbackActive = activeStore !== 'redis';

  return {
    activeStore,
    status: fallbackActive ? 'memory-fallback' : 'redis-ready',
    fallbackActive,
    fallbackReason: fallbackActive
      ? contextStoreState.fallbackReason || 'redis-unavailable'
      : '',
    initializedAt: contextStoreState.initializedAt || '',
    redisUrl: contextStoreState.redisUrl || '',
    ttlSeconds: SESSION_CONTEXT_TTL_SECONDS,
    sqlite: {
      active: true,
      database: getDbPath(),
    },
  };
};

export const appendToHistory = async (sessionId, step, data = {}) => {
  if (!sessionId || !step) {
    return null;
  }

  const existingRecord = (await getContext(sessionId)) || {};
  const history = Array.isArray(existingRecord.history) ? existingRecord.history : [];

  const nextRecord = normalizeContextRecord({
    ...existingRecord,
    history: [
      ...history,
      {
        step,
        data: cloneValue(data),
        createdAt: nowTimestamp(),
      },
    ],
    updatedAt: nowTimestamp(),
  });

  const storedRecord = await writeContextRecord(sessionId, nextRecord);
  writeSqliteSessionSafely({
    sessionId,
    title: sessionId,
    appId: data.appId || data.app_id || existingRecord.appId || existingRecord.app_id || '',
  });
  appendSqliteMessageSafely(sessionId, {
    role: 'system',
    content: `history:${step}`,
    metadata: {
      kind: 'history',
      step,
      data: cloneValue(data),
    },
  });

  return storedRecord;
};

// =========================
// 存储层
// 负责 session-store 文件读写，不承接对象解释语义。
// =========================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(projectRoot, 'runtime');
const sessionStorePath = path.join(runtimeDir, 'session-store.json');

const ensureRuntimeDir = () => {
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
};

const createEmptyStore = () => ({
  sessions: [],
  sessionSteps: [],
  sessionEvidences: [],
  sessionAssets: [],
});

const ensureSessionStoreFile = () => {
  ensureRuntimeDir();

  if (!fs.existsSync(sessionStorePath)) {
    fs.writeFileSync(sessionStorePath, JSON.stringify(createEmptyStore(), null, 2), 'utf-8');
  }
};

const readSessionStore = () => {
  ensureSessionStoreFile();

  try {
    const raw = fs.readFileSync(sessionStorePath, 'utf-8');
    const parsed = JSON.parse(raw);

    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      sessionSteps: Array.isArray(parsed.sessionSteps) ? parsed.sessionSteps : [],
      sessionEvidences: Array.isArray(parsed.sessionEvidences) ? parsed.sessionEvidences : [],
      sessionAssets: Array.isArray(parsed.sessionAssets) ? parsed.sessionAssets : [],
    };
  } catch (error) {
    console.warn('[sessionService] failed to read session store, recreate empty store:', error.message);
    const emptyStore = createEmptyStore();
    fs.writeFileSync(sessionStorePath, JSON.stringify(emptyStore, null, 2), 'utf-8');
    return emptyStore;
  }
};

const writeSessionStore = (store) => {
  ensureSessionStoreFile();
  fs.writeFileSync(sessionStorePath, JSON.stringify(store, null, 2), 'utf-8');
};


// =========================
// 留痕摘要提取层
// 负责把运行态对象收成 session / step 可长期维护的留痕摘要。
// =========================

const now = nowLocalIso;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const pickExecutionContextSummary = (executionContext = null) => {
  if (!executionContext || typeof executionContext !== 'object') {
    return null;
  }

  const resolvedAssistant = isPlainObject(executionContext.resolvedAssistant)
    ? executionContext.resolvedAssistant
    : null;
  const resolvedPrompt = isPlainObject(executionContext.resolvedPrompt)
    ? executionContext.resolvedPrompt
    : null;
  const resolvedStrategy = isPlainObject(executionContext.strategy)
    ? executionContext.strategy
    : null;
  const source = isPlainObject(executionContext.source) ? executionContext.source : null;
  const fallbackReason = isPlainObject(executionContext.fallbackReason)
    ? executionContext.fallbackReason
    : null;
  const strategyId =
    resolvedStrategy?.id ||
    executionContext.strategyId ||
    executionContext.analyzeStrategy ||
    executionContext.searchStrategy ||
    executionContext.scriptStrategy ||
    '';

  return {
    assistantId: resolvedAssistant?.assistantId || executionContext.assistantId || '',
    assistantVersion: resolvedAssistant?.assistantVersion || executionContext.assistantVersion || '',
    promptId: resolvedPrompt?.promptId || executionContext.promptId || '',
    promptVersion: resolvedPrompt?.promptVersion || executionContext.promptVersion || '',
    strategyId,
    strategy: resolvedStrategy || (strategyId ? { id: strategyId, label: strategyId } : null),
    source,
    fallbackReason,
    rulesScope: Array.isArray(executionContext.rulesScope) ? executionContext.rulesScope : [],
    productScope: Array.isArray(executionContext.productScope) ? executionContext.productScope : [],
    docScope: Array.isArray(executionContext.docScope) ? executionContext.docScope : [],
    analyzeStrategy: executionContext.analyzeStrategy || '',
    searchStrategy: executionContext.searchStrategy || '',
    scriptStrategy: executionContext.scriptStrategy || '',
  };
};

const pickDatabaseSummary = (databaseSummary = null) => {
  if (!databaseSummary || typeof databaseSummary !== 'object') {
    return null;
  }

  return {
    databaseId: databaseSummary.databaseId || '',
    databaseName: databaseSummary.databaseName || '',
    relationType: databaseSummary.relationType || '',
    bindingSource: databaseSummary.bindingSource || '',
  };
};

const normalizeStepPayload = (payload = null) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const normalizedExecutionContextSummary =
    pickExecutionContextSummary(payload.executionContextSummary) ||
    pickExecutionContextSummary(payload.executionContext);
  const normalizedDatabaseSummary =
    pickDatabaseSummary(payload.databaseSummary) || pickDatabaseSummary(payload.database);

  return {
    ...payload,
    executionContextSummary: normalizedExecutionContextSummary,
    executionContext: pickExecutionContextSummary(payload.executionContext),
    databaseSummary: normalizedDatabaseSummary,
  };
};

const shortenText = (text = '', limit = 80) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit)}...`;
};

const buildStepSummary = ({ stepType = '', summary = '', outputPayload = null }) => {
  if (stepType === 'analyze') {
    const analyzeData = outputPayload?.finalAnalyzeData || outputPayload || {};
    return (
      shortenText(analyzeData.summary) ||
      shortenText(analyzeData.sceneJudgement) ||
      shortenText(summary) ||
      '已完成一次分析判断'
    );
  }

  if (stepType === 'search') {
    const searchSummary = outputPayload?.searchSummary || '';
    const evidenceItems = outputPayload?.evidenceItems || [];
    const firstEvidenceSummary = evidenceItems[0]?.summary || '';

    return (
      shortenText(searchSummary) ||
      shortenText(firstEvidenceSummary) ||
      (Array.isArray(evidenceItems) && evidenceItems.length > 0
        ? `已完成资料检索，共返回 ${evidenceItems.length} 条证据`
        : '已完成一次资料检索')
    );
  }

  if (stepType === 'script') {
    const outputType = outputPayload?.outputType || '';
    const conciseVersion = outputPayload?.conciseVersion || '';
    const formalVersion = outputPayload?.formalVersion || '';

    return (
      (outputType ? `已生成 ${outputType}` : '') ||
      shortenText(conciseVersion, 60) ||
      shortenText(formalVersion, 60) ||
      shortenText(summary) ||
      '已生成一轮输出内容'
    );
  }

  return shortenText(summary) || `已完成 ${stepType || '当前'} 步骤`;
};

const buildSessionTraceSummary = ({
  session = null,
  latestStep = null,
  steps = [],
  evidences = [],
  assets = [],
} = {}) => ({
  sessionId: session?.id || '',
  assistantId:
    session?.assistantId ||
    latestStep?.inputPayload?.assistantId ||
    latestStep?.outputPayload?.assistantId ||
    '',
  currentStepType: session?.currentStepType || latestStep?.stepType || '',
  executionContextSummary:
    session?.executionContextSummary ||
    latestStep?.inputPayload?.executionContextSummary ||
    latestStep?.outputPayload?.executionContextSummary ||
    null,
  databaseSummary:
    session?.databaseSummary ||
    latestStep?.inputPayload?.databaseSummary ||
    latestStep?.outputPayload?.databaseSummary ||
    null,
  stepCount: Array.isArray(steps) ? steps.length : 0,
  evidenceCount: Array.isArray(evidences) ? evidences.length : 0,
  assetCount: Array.isArray(assets) ? assets.length : 0,
  latestStepId: latestStep?.id || '',
  updatedAt: session?.updatedAt || '',
});

const normalizeStoredEvidence = (evidence = null) => {
  if (!evidence || typeof evidence !== 'object') {
    return evidence;
  }

  const outboundStatus = evidence.outboundStatus || 'unknown';

  return {
    ...evidence,
    outboundPolicy:
      evidence.outboundPolicy && typeof evidence.outboundPolicy === 'object'
        ? evidence.outboundPolicy
        : {
            decision: outboundStatus,
            reason: outboundStatus === 'allowed' ? 'legacy-evidence-allowed' : 'legacy-evidence-internal-only',
            whitelistMatched: outboundStatus === 'allowed',
            summaryAllowed: outboundStatus === 'allowed',
            policySource: 'session-store-compat',
          },
  };
};

const buildTraceCompatibilityContract = () => ({
  primary: ['traceSummary', 'executionContextSummary', 'databaseSummary'],
  compatibility: ['executionContext'],
  frozenLegacy: ['executionContext'],
  retirementPlanned: ['executionContext'],
});

const buildSessionPreview = (session, store) => {
  const steps = store.sessionSteps.filter((item) => item.sessionId === session.id);
  const evidences = store.sessionEvidences.filter((item) => item.sessionId === session.id);
  const assets = store.sessionAssets.filter((item) => item.sessionId === session.id);
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;

  return {
    ...session,
    latestStep,
    latestEvidence:
      normalizeStoredEvidence(evidences.find((item) => item.isPrimaryEvidence)) ||
      normalizeStoredEvidence(evidences[0]) ||
      null,
    ...buildSessionTraceSummary({
      session,
      latestStep,
      steps,
      evidences,
      assets,
    }),
    traceContract: buildTraceCompatibilityContract(),
    deprecatedFields: {
      executionContext: 'legacy-trace-field-frozen',
    },
  };
};

const buildSessionTitle = ({
  taskInput = '',
  goal = '',
  deliverable = '',
  taskObject = '',
  audience = '',
  taskSubject = '',
  customerName = '',
  customerType = '',
  productDirection = '',
  keyword = '',
  sourceModule = 'manual',
}) => {
  const primaryText =
    taskInput ||
    taskSubject ||
    deliverable ||
    goal ||
    taskObject ||
    audience ||
    customerName ||
    productDirection ||
    keyword ||
    customerType ||
    '未命名会话';
  return `${sourceModule}｜${primaryText}`;
};

// =========================
// 留痕写入层
// 负责 session / step / asset 的创建、更新与归档。
// =========================

export const createSession = ({
  title,
  id = '',
  taskInput = '',
  context = '',
  goal = '',
  deliverable = '',
  variables = {},
  attachments = [],
  taskObject = '',
  audience = '',
  taskSubject = '',
  customerName = '',
  customerType = '',
  industryType = 'other',
  sourceModule = 'manual',
  currentStage = 'other',
  currentGoal = '',
  currentStepType = '',
  status = 'active',
  tags = [],
  productDirection = '',
  keyword = '',
  assistantId = '',
  executionContext = null,
  databaseSummary = null,
  appId = '',
} = {}) => {
  const store = readSessionStore();
  const timestamp = now();

  const session = {
    id: id || randomUUID(),
    title:
      title ||
      buildSessionTitle({
        taskInput,
        goal,
        deliverable,
        taskObject,
        audience,
        taskSubject,
        customerName,
        customerType,
        productDirection,
        keyword,
        sourceModule,
      }),
    taskObject: taskObject || customerName,
    audience: audience || customerType,
    taskSubject: taskSubject || productDirection,
    customerName,
    customerType,
    industryType,
    taskInput,
    taskContext: context,
    deliverable,
    variables: isPlainObject(variables) ? variables : {},
    attachments: Array.isArray(attachments) ? attachments : [],
    status,
    sourceModule,
    currentStage,
    currentGoal,
    currentStepType: currentStepType || (sourceModule !== 'manual' ? sourceModule : ''),
    tags: Array.isArray(tags) ? tags : [],
    appId,
    assistantId,
    executionContextSummary: pickExecutionContextSummary(executionContext),
    databaseSummary: pickDatabaseSummary(databaseSummary),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.sessions.unshift(session);
  writeSessionStore(store);
  writeSqliteSessionSafely({
    sessionId: session.id,
    userId: appId || 'admin',
    title: session.title,
    appId,
  });
  return session;
};

export const getSessionById = (sessionId) => {
  const store = readSessionStore();
  return store.sessions.find((item) => item.id === sessionId) || null;
};

export const updateSession = (sessionId, patch = {}) => {
  const store = readSessionStore();
  const sessionIndex = store.sessions.findIndex((item) => item.id === sessionId);

  if (sessionIndex === -1) {
    return null;
  }

  const updatedSession = {
    ...store.sessions[sessionIndex],
    ...patch,
    updatedAt: now(),
  };

  store.sessions[sessionIndex] = updatedSession;
  writeSessionStore(store);
  return updatedSession;
};

export const getOrCreateSession = ({ sessionId, ...payload } = {}) => {
  if (sessionId) {
    const existingSession = getSessionById(sessionId);
    if (existingSession) {
      return existingSession;
    }

    return createSession({
      id: sessionId,
      ...payload,
    });
  }

  return createSession(payload);
};

export const appendSessionStep = ({
  id = '',
  sessionId,
  stepType,
  inputPayload = null,
  outputPayload = null,
  summary = '',
  route = '',
  strategy = '',
  executionStrategy = '',
  outboundAllowed = false,
  outboundReason = '',
  modelName = '',
} = {}) => {
  if (!sessionId || !stepType) {
    throw new Error('appendSessionStep requires sessionId and stepType');
  }

  const store = readSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  const normalizedInputPayload = normalizeStepPayload(inputPayload);
  const normalizedOutputPayload = normalizeStepPayload(outputPayload);
  const stepAppId =
    normalizedInputPayload?.appId ||
    normalizedInputPayload?.app_id ||
    normalizedOutputPayload?.appId ||
    normalizedOutputPayload?.app_id ||
    session.appId ||
    session.app_id ||
    '';
  const stepSummary = buildStepSummary({ stepType, summary, outputPayload: normalizedOutputPayload });

  const step = {
    id: id || randomUUID(),
    sessionId,
    stepType,
    inputPayload: normalizedInputPayload,
    outputPayload: normalizedOutputPayload,
    summary,
    stepSummary,
    route,
    strategy,
    executionStrategy,
    outboundAllowed: Boolean(outboundAllowed),
    outboundReason,
    modelName,
    createdAt: now(),
  };

  store.sessionSteps.push(step);

  const sessionIndex = store.sessions.findIndex((item) => item.id === sessionId);
  const latestAssistantId =
    normalizedInputPayload?.assistantId ||
    normalizedOutputPayload?.assistantId ||
    store.sessions[sessionIndex]?.assistantId ||
    '';
  const latestExecutionContext =
    normalizedInputPayload?.executionContextSummary ||
    normalizedInputPayload?.executionContext ||
    normalizedOutputPayload?.executionContextSummary ||
    normalizedOutputPayload?.executionContext ||
    store.sessions[sessionIndex]?.executionContextSummary ||
    null;
  const latestDatabaseSummary =
    normalizedInputPayload?.databaseSummary ||
    normalizedOutputPayload?.databaseSummary ||
    store.sessions[sessionIndex]?.databaseSummary ||
    null;

  store.sessions[sessionIndex] = {
    ...store.sessions[sessionIndex],
    assistantId: latestAssistantId,
    executionContextSummary: latestExecutionContext,
    databaseSummary: latestDatabaseSummary,
    currentStepType: stepType,
    updatedAt: now(),
  };

  writeSessionStore(store);
  writeSqliteSessionSafely({
    sessionId,
    userId: session.userId || 'admin',
    title: session.title || sessionId,
    appId: stepAppId,
  });
  appendSqliteMessageSafely(sessionId, {
    role: 'system',
    content: stepSummary,
    appId: stepAppId,
    metadata: {
      kind: 'workflow-step',
      stepId: step.id,
      stepType,
      summary,
      route,
      strategy,
      executionStrategy,
      outboundAllowed: Boolean(outboundAllowed),
      outboundReason,
      modelName,
      inputPayload: normalizedInputPayload,
      outputPayload: normalizedOutputPayload,
    },
  });
  return step;
};

export const attachSessionAsset = ({
  sessionId,
  sourceModule = 'manual',
  docId = '',
  docName = '',
  docType = '',
  applicableScene = '',
  externalAvailable = false,
} = {}) => {
  if (!sessionId || !docName) {
    throw new Error('attachSessionAsset requires sessionId and docName');
  }

  const store = readSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  const existingAsset = store.sessionAssets.find(
    (item) =>
      item.sessionId === sessionId &&
      item.docId === docId &&
      item.docName === docName &&
      item.sourceModule === sourceModule,
  );

  if (existingAsset) {
    return existingAsset;
  }

  const asset = {
    id: randomUUID(),
    sessionId,
    sourceModule,
    docId,
    docName,
    docType,
    applicableScene,
    externalAvailable: Boolean(externalAvailable),
    attachedAt: now(),
  };

  store.sessionAssets.push(asset);

  const sessionIndex = store.sessions.findIndex((item) => item.id === sessionId);
  store.sessions[sessionIndex] = {
    ...store.sessions[sessionIndex],
    updatedAt: now(),
  };

  writeSessionStore(store);
  return asset;
};

export const upsertSessionEvidence = ({
  sessionId,
  sourceModule = 'search',
  evidenceId = '',
  level = 'support',
  sourceType = 'local-document',
  sourceRef = '',
  title = '',
  docType = '',
  summary = '',
  applicableScene = '',
  outboundStatus = 'unknown',
  outboundPolicy = null,
  confidence = 0,
  relatedAssistantId = '',
  relatedSessionId = '',
  productId = '',
  productName = '',
  isPrimaryEvidence = false,
} = {}) => {
  if (!sessionId || !evidenceId || !title) {
    throw new Error('upsertSessionEvidence requires sessionId, evidenceId and title');
  }

  const store = readSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  const existingIndex = store.sessionEvidences.findIndex(
    (item) => item.sessionId === sessionId && item.evidenceId === evidenceId,
  );
  const timestamp = now();
  const nextEvidence = {
    id:
      existingIndex >= 0
        ? store.sessionEvidences[existingIndex].id
        : randomUUID(),
    sessionId,
    sourceModule,
    evidenceId,
    level,
    sourceType,
    sourceRef,
    title,
    docType,
    summary,
    applicableScene,
    outboundStatus,
    outboundPolicy:
      outboundPolicy && typeof outboundPolicy === 'object' && !Array.isArray(outboundPolicy)
        ? outboundPolicy
        : null,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    relatedAssistantId,
    relatedSessionId: relatedSessionId || sessionId,
    productId,
    productName,
    isPrimaryEvidence: Boolean(isPrimaryEvidence),
    attachedAt:
      existingIndex >= 0
        ? store.sessionEvidences[existingIndex].attachedAt
        : timestamp,
    updatedAt: timestamp,
  };

  if (existingIndex >= 0) {
    store.sessionEvidences[existingIndex] = nextEvidence;
  } else {
    store.sessionEvidences.push(nextEvidence);
  }

  const sessionIndex = store.sessions.findIndex((item) => item.id === sessionId);
  store.sessions[sessionIndex] = {
    ...store.sessions[sessionIndex],
    updatedAt: timestamp,
  };

  writeSessionStore(store);
  return nextEvidence;
};

// =========================
// 留痕查询层
// 负责 session 列表、详情与 store 读取，不承接治理态定义。
// =========================

export const listSessionSteps = (sessionId) => {
  const store = readSessionStore();
  return store.sessionSteps.filter((item) => item.sessionId === sessionId);
};

export const listSessionAssets = (sessionId) => {
  const store = readSessionStore();
  return store.sessionAssets.filter((item) => item.sessionId === sessionId);
};

export const listSessionEvidences = (sessionId) => {
  const store = readSessionStore();
  return store.sessionEvidences
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => {
      if (Boolean(b.isPrimaryEvidence) !== Boolean(a.isPrimaryEvidence)) {
        return Number(Boolean(b.isPrimaryEvidence)) - Number(Boolean(a.isPrimaryEvidence));
      }

      return new Date(b.updatedAt || b.attachedAt || 0).getTime()
        - new Date(a.updatedAt || a.attachedAt || 0).getTime();
    })
    .map((item) => normalizeStoredEvidence(item));
};

export const getSessionEvidenceById = (sessionId, evidenceId) => {
  if (!sessionId || !evidenceId) {
    return null;
  }

  const store = readSessionStore();
  return (
    normalizeStoredEvidence(
      store.sessionEvidences.find(
        (item) => item.sessionId === sessionId && item.evidenceId === evidenceId,
      ),
    ) || null
  );
};

export const listSessions = () => {
  const store = readSessionStore();
  return [...store.sessions]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((session) => buildSessionPreview(session, store));
};

export const listRecentSessions = (limit = 10) => {
  return listSessions().slice(0, limit);
};

export const getSessionDetail = (sessionId) => {
  const store = readSessionStore();
  const session = store.sessions.find((item) => item.id === sessionId) || null;

  if (!session) {
    return null;
  }

  const steps = store.sessionSteps.filter((item) => item.sessionId === sessionId);
  const evidences = listSessionEvidences(sessionId);
  const assets = store.sessionAssets.filter((item) => item.sessionId === sessionId);
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;

  return {
    session: buildSessionPreview(session, store),
    steps,
    evidences,
    assets,
    latestStep,
    stepCount: steps.length,
    evidenceCount: evidences.length,
    assetCount: assets.length,
    traceSummary: buildSessionTraceSummary({
      session,
      latestStep,
      steps,
      evidences,
      assets,
    }),
    traceContract: buildTraceCompatibilityContract(),
    deprecatedFields: {
      executionContext: 'legacy-trace-field-frozen',
    },
  };
};

export const clearSessionStore = () => {
  const emptyStore = createEmptyStore();
  writeSessionStore(emptyStore);
  return emptyStore;
};

export const getSessionStorePath = () => sessionStorePath;
