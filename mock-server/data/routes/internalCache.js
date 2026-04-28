import express from 'express';
import {
  deleteCachedCompany,
  getCachedCompany,
  isCacheValid,
} from '../models/cachedCompanyData.js';

const router = express.Router();

const normalizeText = (value = '') => String(value || '').trim();

const routeHandler = (handler) => {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (error) {
      console.error('[internalCache] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'cache request failed',
      });
    }
  };
};

router.get('/internal/cache/company', routeHandler((req, res) => {
  const name = normalizeText(req.query?.name || req.query?.companyName || req.query?.creditCode);
  const cachedCompany = getCachedCompany(name);

  return res.json({
    success: true,
    data: cachedCompany
      ? {
          ...cachedCompany,
          cacheValidity: {
            basic: isCacheValid(cachedCompany, 'basic'),
            risk: isCacheValid(cachedCompany, 'risk'),
            operation: isCacheValid(cachedCompany, 'operation'),
          },
        }
      : null,
  });
}));

router.delete('/internal/cache/company/:id', routeHandler((req, res) => {
  const deleted = deleteCachedCompany(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'cached company not found',
    });
  }

  return res.json({
    success: true,
    data: {
      id: Number(req.params.id),
      deleted: true,
    },
  });
}));

export default router;
