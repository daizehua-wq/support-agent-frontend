import express from 'express';
import {
  createApp,
  deleteApp,
  getAppById,
  getAppUsage,
  listApps,
  updateApp,
} from '../models/app.js';

const router = express.Router();

const sendNotFound = (res, message = 'app not found') => {
  return res.status(404).json({
    success: false,
    message,
  });
};

router.post('/internal/apps', (req, res) => {
  const app = createApp({
    ...(req.body || {}),
    idempotencyKey:
      req.body?.idempotencyKey ||
      req.body?.idempotency_key ||
      req.get('Idempotency-Key') ||
      req.get('X-Idempotency-Key') ||
      '',
  });

  return res.json({
    success: true,
    message: app.idempotentReplay
      ? '应用创建请求已幂等处理'
      : '应用创建成功，请立即保存 API Key',
    data: app,
  });
});

router.get('/internal/apps', (req, res) => {
  return res.json({
    success: true,
    data: listApps(),
  });
});

router.get('/internal/apps/:id', (req, res) => {
  const app = getAppById(req.params.id);
  if (!app) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: app,
  });
});

router.put('/internal/apps/:id', (req, res) => {
  const app = updateApp(req.params.id, req.body || {});
  if (!app) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: app,
  });
});

router.delete('/internal/apps/:id', (req, res) => {
  const deleted = deleteApp(req.params.id);
  if (!deleted) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: {
      id: req.params.id,
      deleted: true,
    },
  });
});

router.get('/internal/apps/:id/usage', (req, res) => {
  const app = getAppById(req.params.id);
  if (!app) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: getAppUsage(req.params.id, req.query.start, req.query.end),
  });
});

export default router;
