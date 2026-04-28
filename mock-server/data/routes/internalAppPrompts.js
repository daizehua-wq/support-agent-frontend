import express from 'express';
import { getAppById } from '../models/app.js';
import { getAppPrompt, upsertPrompt } from '../models/appPrompt.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

const sendNotFound = (res, message = 'app not found') => {
  return res.status(404).json({
    success: false,
    message,
  });
};

const routeHandler = (handler) => {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (error) {
      console.error('[internalAppPrompts] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'app prompt request failed',
      });
    }
  };
};

router.get('/internal/apps/:id/prompt', routeHandler((req, res) => {
  const app = getAppById(req.params.id);
  if (!app) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: getAppPrompt(req.params.id) || {
      app_id: req.params.id,
      appId: req.params.id,
      system_prompt: '',
      systemPrompt: '',
    },
  });
}));

router.put('/internal/apps/:id/prompt', routeHandler((req, res) => {
  const app = getAppById(req.params.id);
  if (!app) {
    return sendNotFound(res);
  }

  const body = req.body || {};
  const prompt = upsertPrompt(
    req.params.id,
    normalizeText(body.systemPrompt ?? body.system_prompt ?? body.prompt),
  );

  return res.json({
    success: true,
    message: 'app prompt updated',
    data: prompt,
  });
}));

export default router;
