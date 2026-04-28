import express from 'express';
import channelManager from '../lib/channelManager.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

const isProtectedEnvironment = () => {
  const nodeEnv = normalizeText(process.env.NODE_ENV || 'development').toLowerCase();
  return ['test', 'staging', 'production'].includes(nodeEnv);
};

const isLocalDevelopmentBypassEnabled = () => {
  return (
    !isProtectedEnvironment() &&
    normalizeText(process.env.API_GATEWAY_ALLOW_LOCAL_INTERNAL || '').toLowerCase() === 'true'
  );
};

const isInternalRequest = (req) => {
  const ip = String(req.ip || '').replace('::ffff:', '');
  if (req.get('X-Internal-Call') === 'true') {
    return true;
  }

  return isLocalDevelopmentBypassEnabled() && (ip === '127.0.0.1' || ip === '::1');
};

router.use((req, res, next) => {
  if (isInternalRequest(req)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'internal route forbidden',
  });
});

router.post('/reload', async (req, res, next) => {
  try {
    const result = await channelManager.reload();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/loaded', (req, res) => {
  return res.json({
    success: true,
    data: channelManager.getLoadedChannels(),
  });
});

export default router;
