import express from 'express';
import {
  createChannel,
  deleteChannel,
  getChannel,
  listChannels,
  updateChannel,
} from '../models/channelConfig.js';

const router = express.Router();

const sendNotFound = (res, message = 'channel not found') => {
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
      console.error('[internalChannels] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'channel request failed',
      });
    }
  };
};

router.get('/internal/channels', routeHandler((req, res) => {
  return res.json({
    success: true,
    data: listChannels(req.query?.app_id || req.query?.appId || '', {
      includeDisabled: req.query?.includeDisabled,
      status: req.query?.status,
    }),
  });
}));

router.get('/internal/channels/:id', routeHandler((req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    data: channel,
  });
}));

router.post('/internal/channels', routeHandler((req, res) => {
  const channel = createChannel(req.body || {});

  return res.json({
    success: true,
    message: 'channel created',
    data: channel,
  });
}));

router.put('/internal/channels/:id', routeHandler((req, res) => {
  const channel = updateChannel(req.params.id, req.body || {});
  if (!channel) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    message: 'channel updated',
    data: channel,
  });
}));

router.delete('/internal/channels/:id', routeHandler((req, res) => {
  const deleted = deleteChannel(req.params.id);
  if (!deleted) {
    return sendNotFound(res);
  }

  return res.json({
    success: true,
    message: 'channel disabled',
    data: {
      id: Number(req.params.id),
      disabled: true,
    },
  });
}));

export default router;
