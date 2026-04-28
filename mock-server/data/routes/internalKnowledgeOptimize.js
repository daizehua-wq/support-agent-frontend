import express from 'express';
import {
  getLowPerformanceRules,
  optimizeRules,
} from '../models/knowledgeRule.js';
import {
  getLowPerformanceTemplates,
  optimizeTemplates,
} from '../models/generationTemplate.js';

const router = express.Router();

const normalizeOptimizations = (body = {}) => {
  return Array.isArray(body.optimizations) ? body.optimizations : [];
};

const sendOk = (res, data, message = '') => {
  return res.json({
    success: true,
    message,
    ...data,
  });
};

const routeHandler = (handler) => {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (error) {
      console.error('[internalKnowledgeOptimize] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'knowledge optimize request failed',
      });
    }
  };
};

router.post('/internal/knowledge/rules/optimize', routeHandler((req, res) => {
  const result = optimizeRules(normalizeOptimizations(req.body || {}));
  return sendOk(res, result, 'knowledge rules optimized');
}));

router.post('/internal/knowledge/templates/optimize', routeHandler((req, res) => {
  const result = optimizeTemplates(normalizeOptimizations(req.body || {}));
  return sendOk(res, result, 'generation templates optimized');
}));

router.get('/internal/knowledge/rules/low-performance', routeHandler((req, res) => {
  const rules = getLowPerformanceRules(
    req.query?.min_confidence ?? req.query?.minConfidence ?? 0.3,
    req.query?.max_days_unused ?? req.query?.maxDaysUnused ?? 30,
  );

  return res.json({
    success: true,
    data: rules,
  });
}));

router.get('/internal/knowledge/templates/low-performance', routeHandler((req, res) => {
  const templates = getLowPerformanceTemplates(
    req.query?.min_rating ?? req.query?.minRating ?? 2,
    req.query?.max_usage ?? req.query?.maxUsage ?? 5,
  );

  return res.json({
    success: true,
    data: templates,
  });
}));

export default router;
