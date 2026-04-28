import express from 'express';
import { getModelPerformance, safeRecordCall } from '../models/modelCallLog.js';
import { appendTestRecord } from '../../services/logService.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

router.get('/internal/stats/model-performance', (req, res) => {
  return res.json({
    success: true,
    data: getModelPerformance({
      start: req.query?.start,
      end: req.query?.end,
    }),
  });
});

router.post('/internal/model-calls/log', (req, res) => {
  const body = req.body || {};
  const appId = normalizeText(body.app_id || body.appId);
  const routeResult = normalizeText(body.route_result || body.routeResult) || 'unknown';
  const latencyMs = Math.max(0, Number(body.latency_ms ?? body.latencyMs ?? 0) || 0);
  const localModelUsed = body.local_model_used === true || body.localModelUsed === true;

  const record = {
    type: 'fast-router-decision',
    app_id: appId,
    session_id: normalizeText(body.session_id || body.sessionId),
    user_message: normalizeText(body.user_message || body.userMessage),
    route_result: routeResult,
    latency_ms: latencyMs,
    local_model_used: localModelUsed,
  };

  appendTestRecord(record);
  const modelCall = safeRecordCall({
    appId,
    model: `fast-router:${routeResult}`,
    success: routeResult !== 'upgraded',
    latencyMs,
    tokensUsed: 0,
  });

  return res.json({
    success: true,
    data: {
      logged: true,
      modelCall,
    },
  });
});

export default router;
