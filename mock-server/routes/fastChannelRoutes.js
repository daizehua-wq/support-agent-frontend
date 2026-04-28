import { Router } from 'express';
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
    message: error?.message || 'embedded model request failed',
    error: {
      code: error?.code || 'EMBEDDED_MODEL_ERROR',
      message: error?.message || 'embedded model request failed',
    },
  });
};

const asyncRoute = (handler) => {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('[fastChannelRoutes] embedded model request failed:', error.message);
      return sendFailure(res, error);
    });
  };
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

export default router;
