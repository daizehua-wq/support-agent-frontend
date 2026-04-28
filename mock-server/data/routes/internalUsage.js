import express from 'express';
import { getAppById, recordUsage } from '../models/app.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

router.post('/internal/usage', (req, res) => {
  const appId = normalizeText(req.body?.app_id || req.body?.appId);
  const apiCalls = Math.max(0, Number(req.body?.api_calls ?? req.body?.apiCalls ?? 1) || 0);
  const tokensUsed = Math.max(0, Number(req.body?.tokens_used ?? req.body?.tokensUsed ?? 0) || 0);

  if (!appId || !getAppById(appId)) {
    return res.status(404).json({
      success: false,
      message: 'app not found',
    });
  }

  const usage = recordUsage(appId, apiCalls, tokensUsed);

  return res.json({
    success: true,
    data: usage,
  });
});

export default router;
