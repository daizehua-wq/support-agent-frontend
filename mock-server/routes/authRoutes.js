import { Router } from 'express';
import { getUserInfo } from '../services/authService.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/auth/me
//    Returns minimal user permission summary
//    Query ?role=system_admin to test different roles
// ---------------------------------------------------------------------------

router.get('/me', (req, res) => {
  const { role } = req.query || {};
  const userInfo = getUserInfo(role);

  res.json({
    success: true,
    message: '获取用户权限成功',
    data: userInfo,
  });
});

export default router;
