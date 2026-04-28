import { Router } from 'express';
import {
  exportReferencePackZip,
  getReferencePackById,
  getReferencePackScriptInput,
} from '../services/referencePackService.js';
import { getReferenceLibrarySummary } from '../services/referenceLibraryService.js';
import {
  cleanupExpiredExternalSourceCache,
  cleanupExternalSourceCache,
} from '../services/externalSourceCacheService.js';

const router = Router();

const sendSuccess = (res, payload) =>
  res.json({
    success: true,
    ...payload,
  });

router.get('/library/summary', (_req, res) =>
  sendSuccess(res, {
    message: '资料库摘要获取成功',
    data: getReferenceLibrarySummary(),
  }),
);

router.post('/cache/:taskId/cleanup', (req, res) =>
  sendSuccess(res, {
    message: '外部资料临时缓存已清理',
    data: cleanupExternalSourceCache(req.params.taskId || ''),
  }),
);

router.post('/cache/cleanup-expired', (_req, res) =>
  sendSuccess(res, {
    message: '过期外部资料临时缓存已清理',
    data: cleanupExpiredExternalSourceCache(),
  }),
);

router.get('/:referencePackId', (req, res) => {
  const referencePack = getReferencePackById(req.params.referencePackId || '');

  if (!referencePack) {
    return res.status(404).json({
      success: false,
      message: 'reference pack not found',
    });
  }

  return sendSuccess(res, {
    message: '参考资料包获取成功',
    data: referencePack,
  });
});

router.get('/:referencePackId/script-input', (req, res) => {
  const scriptInput = getReferencePackScriptInput(req.params.referencePackId || '');

  if (!scriptInput) {
    return res.status(404).json({
      success: false,
      message: 'reference pack not found',
    });
  }

  return sendSuccess(res, {
    message: '参考资料包写作输入获取成功',
    data: scriptInput,
  });
});

router.get('/:referencePackId/export', (req, res) => {
  const exported = exportReferencePackZip(req.params.referencePackId || '');

  if (!exported) {
    return res.status(404).json({
      success: false,
      message: 'reference pack not found',
    });
  }

  return res.download(exported.zipPath, `${exported.referencePackId}.zip`);
});

export default router;
