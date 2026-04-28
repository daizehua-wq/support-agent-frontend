import express from 'express';
import { runChannelConversation } from '../agents/channelAgent.js';
import {
  createAgentFromRequirement,
  runFactoryConversation,
} from '../agents/factoryAgent.js';
import {
  getOptimizationStatus,
  runOptimizationCycle,
} from '../agents/optimizationAgent.js';
import {
  approveEvolutionAction,
  getEvolutionStatus,
  rejectEvolutionAction,
  runEvolutionCycle,
} from '../schedulers/evolutionScheduler.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

const isAuthorized = (req) => {
  const adminToken = normalizeText(process.env.ADMIN_TOKEN);
  const providedToken = normalizeText(req.get('X-Admin-Token'));

  return req.get('X-Internal-Call') === 'true' || (adminToken && providedToken === adminToken);
};

router.use((req, res, next) => {
  if (isAuthorized(req)) {
    return next();
  }

  return res.status(403).json({
    error: 'platform manager route forbidden',
  });
});

router.post('/factory/chat', async (req, res) => {
  try {
    const { session_id: sessionId = '', message = '', history = [] } = req.body || {};
    const result = await runFactoryConversation(sessionId, message, history);

    if (result?.error) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: normalizeText(error.message) || 'factory chat failed',
    });
  }
});

router.post('/factory/create-agent', async (req, res) => {
  try {
    const result = await createAgentFromRequirement({
      requirement: req.body?.requirement || req.body?.message || '',
      sessionId: req.body?.session_id || req.body?.sessionId || '',
      plan: req.body?.plan || null,
    });

    if (result?.error) {
      return res.status(400).json(result);
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: normalizeText(error.message) || 'create agent failed',
    });
  }
});

router.post('/channel/configure', async (req, res) => {
  try {
    const { session_id: sessionId = '', message = '', history = [] } = req.body || {};
    const result = await runChannelConversation(sessionId, message, history);

    if (result?.error) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: normalizeText(error.message) || 'channel configure failed',
    });
  }
});

router.get('/optimization/status', (req, res) => {
  return res.json({
    success: true,
    data: getOptimizationStatus(),
  });
});

router.post('/optimization/run', async (req, res) => {
  try {
    const result = await runOptimizationCycle({
      apply: req.body?.apply === true,
      actor: normalizeText(req.body?.actor) || 'p5-management-api',
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: normalizeText(error.message) || 'optimization cycle failed',
    });
  }
});

router.get('/optimization/evolution', (req, res) => {
  return res.json({
    success: true,
    data: getEvolutionStatus(),
  });
});

router.post('/optimization/evolution/run', async (req, res) => {
  try {
    const result = await runEvolutionCycle({
      autoConfirm: req.body?.autoConfirm === true || req.body?.apply === true,
      actor: normalizeText(req.body?.actor) || 'p5-management-api',
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: normalizeText(error.message) || 'evolution cycle failed',
    });
  }
});

router.post('/optimization/evolution/actions/:id/approve', async (req, res) => {
  try {
    const result = await approveEvolutionAction(
      req.params.id,
      normalizeText(req.body?.actor) || 'p5-admin',
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'evolution action not found',
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: normalizeText(error.message) || 'approve evolution action failed',
    });
  }
});

router.post('/optimization/evolution/actions/:id/reject', (req, res) => {
  const result = rejectEvolutionAction(
    req.params.id,
    normalizeText(req.body?.actor) || 'p5-admin',
  );

  if (!result) {
    return res.status(404).json({
      success: false,
      error: 'evolution action not found',
    });
  }

  return res.json({
    success: true,
    data: result,
  });
});

export default router;
