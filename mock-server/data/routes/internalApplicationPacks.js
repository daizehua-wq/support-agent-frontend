import express from 'express';
import {
  compileApplicationPackFromRequirement,
  createApplicationPack,
  deleteApplicationPack,
  getApplicationPack,
  listApplicationPacks,
  publishApplicationPack,
  updateApplicationPack,
} from '../models/applicationPack.js';

const router = express.Router();

const routeHandler = (handler) => {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (error) {
      console.error('[internalApplicationPacks] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'application pack request failed',
      });
    }
  };
};

const sendOk = (res, data, message = '') => {
  return res.json({
    success: true,
    message,
    data,
  });
};

const sendNotFound = (res, message = 'application pack not found') => {
  return res.status(404).json({
    success: false,
    message,
  });
};

router.get('/internal/application-packs', routeHandler((req, res) => {
  return sendOk(res, listApplicationPacks(req.query || {}));
}));

router.post('/internal/application-packs', routeHandler((req, res) => {
  return sendOk(res, createApplicationPack(req.body || {}), 'application pack created');
}));

router.post('/internal/application-packs/compile', routeHandler((req, res) => {
  return sendOk(
    res,
    compileApplicationPackFromRequirement(req.body || {}),
    'application pack compiled from requirement',
  );
}));

router.get('/internal/application-packs/:id', routeHandler((req, res) => {
  const pack = getApplicationPack(req.params.id);
  return pack ? sendOk(res, pack) : sendNotFound(res);
}));

router.put('/internal/application-packs/:id', routeHandler((req, res) => {
  const pack = updateApplicationPack(req.params.id, req.body || {});
  return pack ? sendOk(res, pack, 'application pack updated') : sendNotFound(res);
}));

router.post('/internal/application-packs/:id/publish', routeHandler((req, res) => {
  const pack = publishApplicationPack(req.params.id);
  return pack ? sendOk(res, pack, 'application pack published') : sendNotFound(res);
}));

router.delete('/internal/application-packs/:id', routeHandler((req, res) => {
  const deleted = deleteApplicationPack(req.params.id);
  return deleted
    ? sendOk(res, { id: req.params.id, deleted: true }, 'application pack deleted')
    : sendNotFound(res);
}));

export default router;
