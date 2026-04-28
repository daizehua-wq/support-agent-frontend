import express from 'express';
import {
  buildStorageMigrationPlan,
  getStorageHealthSnapshot,
} from '../../services/storageHealthService.js';

const router = express.Router();

const routeHandler = (handler) => {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error('[internalStorage] request failed:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'storage request failed',
      });
    }
  };
};

router.get('/internal/storage/status', routeHandler(async (req, res) => {
  const probeExternal = req.query?.probe === 'true';

  return res.json({
    success: true,
    data: await getStorageHealthSnapshot({ probeExternal }),
  });
}));

router.post('/internal/storage/preflight', routeHandler(async (req, res) => {
  return res.json({
    success: true,
    data: await getStorageHealthSnapshot({
      probeExternal: req.body?.probeExternal !== false,
    }),
  });
}));

router.post('/internal/storage/migration-plan', routeHandler(async (req, res) => {
  return res.json({
    success: true,
    data: await buildStorageMigrationPlan(),
  });
}));

export default router;
