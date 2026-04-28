import express from 'express';
import { getAppByApiKey } from '../models/app.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

router.post('/internal/apps/verify', (req, res) => {
  const apiKey = normalizeText(req.body?.api_key || req.body?.apiKey);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'invalid api key',
    });
  }

  const app = getAppByApiKey(apiKey);
  if (!app) {
    return res.status(401).json({
      success: false,
      message: 'invalid api key',
    });
  }

  if (app.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'app is not active',
    });
  }

  return res.json({
    success: true,
    data: {
      id: app.id,
      name: app.name,
      status: app.status,
      rate_limit_per_min: app.rate_limit_per_min,
      rateLimitPerMin: app.rateLimitPerMin,
      max_tokens_per_day: app.max_tokens_per_day,
      maxTokensPerDay: app.maxTokensPerDay,
      api_key_prefix: app.api_key_prefix,
      apiKeyPrefix: app.apiKeyPrefix,
    },
  });
});

export default router;
