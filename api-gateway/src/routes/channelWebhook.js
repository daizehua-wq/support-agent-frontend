import express from 'express';
import channelManager from '../lib/channelManager.js';

const router = express.Router();

router.post('/:channelId/webhook', async (req, res, next) => {
  try {
    const result = await channelManager.handleIncomingMessage(req.params.channelId, req.body || {});

    if (result?.challenge) {
      return res.json({
        challenge: result.challenge,
      });
    }

    return res.json(result);
  } catch (error) {
    if (Number(error?.status || 0) === 503) {
      return res.status(503).json({
        success: false,
        message: error.message || 'channel worker overloaded',
        code: error.code || 'p4-channel-overloaded',
      });
    }

    if (/not loaded/i.test(error?.message || '')) {
      return res.status(404).json({
        success: false,
        message: 'channel not loaded',
      });
    }

    return next(error);
  }
});

export default router;
