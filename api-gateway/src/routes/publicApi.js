import express from 'express';
import apiAuth from '../middleware/apiAuth.js';
import rateLimiter from '../middleware/rateLimiter.js';
import httpClient from '../lib/httpClient.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

const readChatData = (response = {}) => {
  return response?.data && typeof response.data === 'object' ? response.data : {};
};

router.use(apiAuth);
router.use(rateLimiter);

router.post('/chat', async (req, res, next) => {
  try {
    const message = normalizeText(req.body?.message);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'message is required',
      });
    }

    const internalChatResponse = await httpClient.post('/internal/chat', {
      ...req.body,
      session_id: req.body?.session_id || req.body?.sessionId || '',
      message,
      app_id: req.appInfo.id,
    });
    const chatData = readChatData(internalChatResponse);
    const tokensUsed = Number(chatData.tokens_used ?? chatData.tokensUsed ?? 0);

    await httpClient.post('/internal/usage', {
      app_id: req.appInfo.id,
      api_calls: 1,
      tokens_used: Number.isFinite(tokensUsed) ? tokensUsed : 0,
    });

    res.setHeader('X-RateLimit-Remaining', String(req.rateLimitRemaining ?? 0));
    res.setHeader('X-Tokens-Used', String(Number.isFinite(tokensUsed) ? tokensUsed : 0));

    return res.json({
      success: true,
      data: {
        reply: chatData.reply || '',
        session_id: chatData.session_id || chatData.sessionId || '',
        sessionId: chatData.sessionId || chatData.session_id || '',
        trace_id: chatData.trace_id || chatData.traceId || '',
        traceId: chatData.traceId || chatData.trace_id || '',
        tokens_used: Number.isFinite(tokensUsed) ? tokensUsed : 0,
        tokensUsed: Number.isFinite(tokensUsed) ? tokensUsed : 0,
        result: chatData.result || null,
      },
    });
  } catch (error) {
    const status = Number(error?.response?.status || 500);

    if (status >= 400 && status < 500) {
      return res.status(status).json({
        success: false,
        message: error?.response?.data?.message || 'request failed',
      });
    }

    return next(error);
  }
});

export default router;
