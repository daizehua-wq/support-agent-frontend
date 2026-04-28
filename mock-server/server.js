import './config/loadEnv.js';
import './tracing.js';
import './data/database.js';
import './data/seed.js';
import express from 'express';
import cors from 'cors';
import { sendSuccess } from './services/responseService.js';
import internalDataRoutes from './data/routes/internalData.js';
import internalAppsRoutes from './data/routes/internalApps.js';
import internalAppPromptsRoutes from './data/routes/internalAppPrompts.js';
import internalAppsVerifyRoutes from './data/routes/internalAppsVerify.js';
import internalApplicationPacksRoutes from './data/routes/internalApplicationPacks.js';
import internalCacheRoutes from './data/routes/internalCache.js';
import internalChatRoutes from './data/routes/internalChat.js';
import internalChannelsRoutes from './data/routes/internalChannels.js';
import internalKnowledgeOptimizeRoutes from './data/routes/internalKnowledgeOptimize.js';
import internalKnowledgeRoutes from './data/routes/internalKnowledge.js';
import internalModelStatsRoutes from './data/routes/internalModelStats.js';
import internalRulesRoutes from './data/routes/internalRules.js';
import internalStatsRoutes from './data/routes/internalStats.js';
import internalStorageRoutes from './data/routes/internalStorage.js';
import internalUsageRoutes from './data/routes/internalUsage.js';
import assistantCenterRoutes from './routes/assistantCenterRoutes.js';
import runtimeRoutes, {
  handleAnalyzeContext,
  handleComposeDocument,
  handleSearchReferences,
} from './routes/runtimeRoutes.js';
import traceRoutes from './routes/traceRoutes.js';
import databaseRoutes from './routes/databaseRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import modelCenterRoutes from './routes/modelCenterRoutes.js';
import fastChannelRoutes from './routes/fastChannelRoutes.js';
import referencePackRoutes from './routes/referencePackRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import { getDbPath } from './data/database.js';
import { getAllConnections } from './data/models/externalConnection.js';
import { recordOpsProcessEvent } from './services/opsObservabilityService.js';
import { getPythonRuntimeHealthSnapshot } from './services/pythonRuntimeAdapterService.js';
import {
  getLocalModelHealthSnapshot,
  startLocalModelPreload,
} from './services/localModelHealthService.js';
import { getContextStoreSummary } from './services/sessionService.js';
import { getStorageHealthSnapshot } from './services/storageHealthService.js';
import { ensureReferenceLibrary } from './services/referenceLibraryService.js';
import logger from './middleware/logger.js';
import security from './middleware/security.js';
import errorHandler from './middleware/errorHandler.js';
import { formatReplyForClient, resolveClientType } from './adapters/index.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER || 'local').toLowerCase();
const MODEL_MODE = (process.env.MODEL_MODE || 'strict-local').toLowerCase();
const ALLOW_API_MODEL = (process.env.ALLOW_API_MODEL || 'false').toLowerCase() === 'true';

const useLocalLLM =
  MODEL_PROVIDER === 'local' ||
  MODEL_PROVIDER === 'hybrid' ||
  MODEL_MODE === 'strict-local' ||
  MODEL_MODE === 'local-first';

const useApiLLM =
  ALLOW_API_MODEL &&
  (MODEL_PROVIDER === 'api' ||
    MODEL_PROVIDER === 'hybrid' ||
    MODEL_MODE === 'api-only' ||
    MODEL_MODE === 'local-first');

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const isSuccessStatusCode = (statusCode) => {
  return statusCode >= 200 && statusCode < 400;
};

const DIRECT_WEB_ENVELOPE_PREFIXES = ['/api/settings', '/api/agent'];

const shouldUseDirectWebEnvelope = (req, clientType) => {
  return (
    clientType === 'web' &&
    typeof req.originalUrl === 'string' &&
    DIRECT_WEB_ENVELOPE_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))
  );
};

const responseEnvelopeMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    const statusCode = res.statusCode || 200;
    const clientType = resolveClientType(req);
    const directWebEnvelope = shouldUseDirectWebEnvelope(req, clientType);

    if (directWebEnvelope && isPlainObject(payload)) {
      return originalJson({
        ...payload,
        code: typeof payload.code === 'number' ? payload.code : statusCode,
        traceId: 'traceId' in payload ? payload.traceId : req.traceId || '',
      });
    }

    if (isSuccessStatusCode(statusCode)) {
      return originalJson(
        formatReplyForClient({
          clientType,
          payload: {
            code: statusCode,
            data: payload,
            traceId: req.traceId || '',
          },
        }),
      );
    }

    if (isPlainObject(payload)) {
      return originalJson(
        formatReplyForClient({
          clientType,
          payload: {
            ...payload,
            code: typeof payload.code === 'number' ? payload.code : statusCode,
            traceId: 'traceId' in payload ? payload.traceId : req.traceId || '',
          },
        }),
      );
    }

    return originalJson(
      formatReplyForClient({
        clientType,
        payload: {
          code: statusCode,
          data: payload,
          traceId: req.traceId || '',
        },
      }),
    );
  };

  next();
};

const asyncWrapper = (handler) => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

let referenceLibraryStartup = null;
try {
  referenceLibraryStartup = ensureReferenceLibrary();
} catch (error) {
  console.warn('[reference-library] startup initialization failed:', error.message);
}

const normalizeText = (value = '') => String(value || '').trim();

const isProtectedEnvironment = () => {
  const nodeEnv = normalizeText(process.env.NODE_ENV || 'development').toLowerCase();
  return ['test', 'staging', 'production'].includes(nodeEnv);
};

const isLocalDevelopmentBypassEnabled = () => {
  return (
    !isProtectedEnvironment() &&
    normalizeText(process.env.MOCK_SERVER_ALLOW_LOCAL_INTERNAL || '').toLowerCase() === 'true'
  );
};

const isInternalRequest = (req) => {
  const ip = String(req.ip || '').replace('::ffff:', '');
  if (req.get('X-Internal-Call') === 'true') {
    return true;
  }

  return isLocalDevelopmentBypassEnabled() && (ip === '127.0.0.1' || ip === '::1');
};

const internalOnlyMiddleware = (req, res, next) => {
  if (isInternalRequest(req)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'internal route forbidden',
  });
};

app.use(cors());
app.use(express.json());
app.use(logger);
app.use(security);
app.use('/internal', internalOnlyMiddleware);
app.use(internalDataRoutes);
app.use(internalAppsRoutes);
app.use(internalAppPromptsRoutes);
app.use(internalAppsVerifyRoutes);
app.use(internalApplicationPacksRoutes);
app.use(internalCacheRoutes);
app.use(internalChatRoutes);
app.use(internalChannelsRoutes);
app.use(internalKnowledgeRoutes);
app.use(internalKnowledgeOptimizeRoutes);
app.use(internalModelStatsRoutes);
app.use(internalRulesRoutes);
app.use(internalStatsRoutes);
app.use(internalStorageRoutes);
app.use(internalUsageRoutes);
app.use(fastChannelRoutes);
app.use(responseEnvelopeMiddleware);


console.log('[runtime] config:', {
  port: PORT,
  host: HOST,
  modelProvider: MODEL_PROVIDER,
  modelMode: MODEL_MODE,
  allowApiModel: ALLOW_API_MODEL,
  useLocalLLM,
  useApiLLM,
  internalDataLayer: getDbPath(),
  referenceLibrary: referenceLibraryStartup?.libraryPath || 'initialization-failed',
});




app.get('/', (req, res) => {
  return sendSuccess(res, {
    message: 'mock server is running',
  });
});

app.get('/health', asyncWrapper(async (req, res) => {
  const sessionContextStore = await getContextStoreSummary();
  const storage = await getStorageHealthSnapshot({ probeExternal: false });

  return sendSuccess(res, {
    message: 'service is healthy',
    data: {
      service: 'sales-support-agent',
      status: 'ok',
      dependencies: {
        dataLayer: {
          active: true,
          activeStore: 'sqlite',
          mode: 'internal',
          database: getDbPath(),
          externalConnectionCount: getAllConnections().length,
        },
        pythonRuntime: getPythonRuntimeHealthSnapshot(),
        embeddedModel: getLocalModelHealthSnapshot(),
        sessionContextStore,
        storage,
      },
    },
  });
}));

app.use('/api/settings', settingsRoutes);
app.use('/api/reference-packs', referencePackRoutes);
app.use('/api/agent/governance/model-center', modelCenterRoutes);
app.post('/api/agent/analyze-context', asyncWrapper(handleAnalyzeContext));
app.post('/api/agent/search-references', asyncWrapper(handleSearchReferences));
app.post('/api/agent/generate-content', asyncWrapper(handleComposeDocument));
app.use('/api/agent', assistantCenterRoutes);
app.use('/api/agent', runtimeRoutes);
app.use('/api/agent', traceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/database-manager', databaseRoutes);
app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  console.log(`mock server is running at http://${HOST}:${PORT}`);
  console.log(`local access: http://127.0.0.1:${PORT}`);
  const embeddedModelPreload = startLocalModelPreload();
  console.log('[embedded-model] preload:', {
    started: embeddedModelPreload.started,
    reason: embeddedModelPreload.reason,
    status: embeddedModelPreload.status.status,
    modelPresent: embeddedModelPreload.status.modelPresent,
  });
  try {
    recordOpsProcessEvent({
      processName: 'mock-server',
      eventType: 'started',
      message: `mock server started at http://${HOST}:${PORT}`,
      metadata: {
        host: HOST,
        port: PORT,
        modelProvider: MODEL_PROVIDER,
        modelMode: MODEL_MODE,
      },
    });
  } catch (error) {
    console.warn('[ops] failed to record startup event:', error.message);
  }
});
server.ref?.();

export { server };
