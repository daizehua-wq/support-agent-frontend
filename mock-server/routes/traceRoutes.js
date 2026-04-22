

import { Router } from 'express';
import {
  listRecentSessions,
  getSessionDetail,
  getSessionEvidenceById,
} from '../services/sessionService.js';

const router = Router();

// =========================
// 留痕接口｜Trace Routes
// 当前只承接：
// - session 列表
// - session 详情
// - step / asset / trace summary 回看
// 不承接：
// - 治理态当前发布版对象
// - 运行态完整业务结果扩写
// =========================

const buildTraceInterfaceContract = (primary = []) => ({
  primary,
  compatibility: ['executionContext'],
  frozenLegacy: ['executionContext'],
  retirementPlanned: ['executionContext'],
});

const sendSuccess = (res, payload = {}) => {
  return res.json({
    success: true,
    ...payload,
  });
};

router.get('/sessions', async (req, res) => {
  const limit = Number(req.query.limit || 10);
  const sessions = listRecentSessions(Number.isNaN(limit) ? 10 : limit);

  return sendSuccess(res, {
    message: '会话列表获取成功',
    data: sessions,
    meta: {
      responseContract: buildTraceInterfaceContract(['sessionPreview', 'traceSummary']),
      deprecatedFields: {
        executionContext: 'legacy-trace-field-frozen',
      },
    },
  });
});

router.get('/sessions/:id', async (req, res) => {
  const sessionId = req.params.id || '';
  const detail = getSessionDetail(sessionId);

  return sendSuccess(res, {
    message: detail ? '会话详情获取成功' : '未找到会话',
    data: detail,
    meta: {
      responseContract: buildTraceInterfaceContract(['sessionDetail', 'traceSummary']),
      deprecatedFields: {
        executionContext: 'legacy-trace-field-frozen',
      },
    },
  });
});

router.get('/sessions/:id/evidences/:evidenceId', async (req, res) => {
  const sessionId = req.params.id || '';
  const evidenceId = req.params.evidenceId || '';
  const evidence = getSessionEvidenceById(sessionId, evidenceId);

  return sendSuccess(res, {
    message: evidence ? '会话证据获取成功' : '未找到证据',
    data: evidence,
    meta: {
      responseContract: buildTraceInterfaceContract(['sessionEvidence', 'traceSummary']),
      deprecatedFields: {
        executionContext: 'legacy-trace-field-frozen',
      },
    },
  });
});

export { buildTraceInterfaceContract };

export default router;
