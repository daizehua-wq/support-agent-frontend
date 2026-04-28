import express from 'express';
import {
  appendMessage,
  createSession,
  deleteSession,
  getSession,
  listSessions,
} from '../models/session.js';
import {
  addConnection,
  deleteConnection,
  getAllConnections,
  testConnectionHealth,
  updateConnectionStatus,
} from '../models/externalConnection.js';
import { compressConversation } from '../../services/contextCompressor.js';

const router = express.Router();

const sendNotFound = (res, message = 'not found') => {
  return res.status(404).json({
    success: false,
    message,
  });
};

router.get('/internal/data/sessions', (req, res) => {
  return res.json({
    success: true,
    data: listSessions(req.query.userId || ''),
  });
});

router.post('/internal/data/sessions', (req, res) => {
  const { userId = 'admin', title = '未命名会话', appId = '' } = req.body || {};
  const session = createSession(userId, title, { appId });

  return res.json({
    success: true,
    data: session,
  });
});

router.get('/internal/data/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return sendNotFound(res, 'session not found');
  }

  return res.json({
    success: true,
    data: session,
  });
});

router.get('/internal/sessions/:id/compressed', async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await compressConversation(req.params.id, {
        appId: req.query?.app_id || req.query?.appId || '',
        maxFullRounds: req.query?.maxFullRounds,
      }),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/internal/data/sessions/:id/messages', (req, res) => {
  const { role = 'system', content = '', metadata = {}, appId = '' } = req.body || {};
  const message = appendMessage(req.params.id, { role, content, metadata, appId });

  return res.json({
    success: true,
    data: message,
  });
});

router.delete('/internal/data/sessions/:id', (req, res) => {
  const deleted = deleteSession(req.params.id);
  if (!deleted) {
    return sendNotFound(res, 'session not found');
  }

  return res.json({
    success: true,
    data: {
      id: req.params.id,
      deleted: true,
    },
  });
});

router.get('/internal/data/external-connections', (req, res) => {
  return res.json({
    success: true,
    data: getAllConnections(),
  });
});

router.post('/internal/data/external-connections', (req, res) => {
  const { provider = '', apiKey = '' } = req.body || {};
  const connection = addConnection(provider, apiKey);

  return res.json({
    success: true,
    data: connection,
  });
});

router.put('/internal/data/external-connections/:id', (req, res) => {
  const connection = updateConnectionStatus(req.params.id, Boolean(req.body?.isActive));
  if (!connection) {
    return sendNotFound(res, 'external connection not found');
  }

  return res.json({
    success: true,
    data: connection,
  });
});

router.post('/internal/data/external-connections/:id/health', (req, res) => {
  const connection = testConnectionHealth(req.params.id);
  if (!connection) {
    return sendNotFound(res, 'external connection not found');
  }

  return res.json({
    success: true,
    data: connection,
  });
});

router.delete('/internal/data/external-connections/:id', (req, res) => {
  const deleted = deleteConnection(req.params.id);
  if (!deleted) {
    return sendNotFound(res, 'external connection not found');
  }

  return res.json({
    success: true,
    data: {
      id: req.params.id,
      deleted: true,
    },
  });
});

export default router;
