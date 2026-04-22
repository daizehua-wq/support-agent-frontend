import './config/loadEnv.js';
import './tracing.js';
import express from 'express';
import cors from 'cors';
import { sendSuccess } from './services/responseService.js';
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
import { recordOpsProcessEvent } from './services/opsObservabilityService.js';
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

const responseEnvelopeMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    const statusCode = res.statusCode || 200;
    const clientType = resolveClientType(req);

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

app.use(cors());
app.use(express.json());
app.use(logger);
app.use(security);
app.use(responseEnvelopeMiddleware);


console.log('[runtime] config:', {
  port: PORT,
  host: HOST,
  modelProvider: MODEL_PROVIDER,
  modelMode: MODEL_MODE,
  allowApiModel: ALLOW_API_MODEL,
  useLocalLLM,
  useApiLLM,
});




app.get('/', (req, res) => {
  return sendSuccess(res, {
    message: 'mock server is running',
  });
});

app.get('/health', (req, res) => {
  return sendSuccess(res, {
    message: 'service is healthy',
    data: {
      service: 'sales-support-agent',
      status: 'ok',
    },
  });
});

app.use('/api/settings', settingsRoutes);
app.use('/api/agent/governance/model-center', modelCenterRoutes);
app.post('/api/agent/analyze-context', asyncWrapper(handleAnalyzeContext));
app.post('/api/agent/search-references', asyncWrapper(handleSearchReferences));
app.post('/api/agent/generate-content', asyncWrapper(handleComposeDocument));
app.use('/api/agent', assistantCenterRoutes);
app.use('/api/agent', runtimeRoutes);
app.use('/api/agent', traceRoutes);
app.use('/api/database-manager', databaseRoutes);
app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`mock server is running at http://${HOST}:${PORT}`);
  console.log(`local access: http://127.0.0.1:${PORT}`);
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
