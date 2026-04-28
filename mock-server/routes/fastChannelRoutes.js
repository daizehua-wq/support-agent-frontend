import { Router } from 'express';
import { runFastChannelRouteTestFlow } from '../flows/fastChannelFlow.js';
import {
  getLocalModelHealthSnapshot,
  warmupLocalModel,
} from '../services/localModelHealthService.js';

const router = Router();

const sendOk = (res, data, message = 'ok') => {
  return res.json({
    success: true,
    message,
    data,
  });
};

const sendFailure = (res, error, status = 500) => {
  return res.status(status).json({
    success: false,
    message: error?.message || 'fast channel request failed',
    error: {
      code: error?.code || 'FAST_CHANNEL_ERROR',
      message: error?.message || 'fast channel request failed',
    },
  });
};

const asyncRoute = (handler) => {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('[fastChannelRoutes] request failed:', error.message);
      return sendFailure(res, error);
    });
  };
};

const isSensitiveResultKey = (key = '') => {
  const normalizedKey = String(key || '').toLowerCase();

  return (
    normalizedKey === 'text' ||
    normalizedKey === 'normalizedtext' ||
    normalizedKey === 'prompt' ||
    /api[_-]?key|secret|token/i.test(key)
  );
};

const redactRouteTestResult = (value) => {
  if (Array.isArray(value)) {
    return value.map(redactRouteTestResult);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((result, [key, item]) => {
    if (!isSensitiveResultKey(key)) {
      result[key] = redactRouteTestResult(item);
    }

    return result;
  }, {});
};

router.get('/internal/embedded-model/status', asyncRoute(async (req, res) => {
  return sendOk(res, getLocalModelHealthSnapshot(), 'embedded model status');
}));

router.post('/internal/embedded-model/warmup', asyncRoute(async (req, res) => {
  const status = await warmupLocalModel({
    force: req.body?.force === true,
  });

  return sendOk(res, status, 'embedded model warmup completed');
}));

router.post('/internal/fast-channel/route-test', asyncRoute(async (req, res) => {
  const result = redactRouteTestResult(await runFastChannelRouteTestFlow(req.body || {}));

  return sendOk(res, result, 'fast channel route test completed');
}));

export default router;
