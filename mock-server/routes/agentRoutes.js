import { Router } from 'express';

const router = Router();

// Deprecated:
// agentRoutes.js 已不再作为正式挂载入口。
// 当前治理接口已迁到 assistantCenterRoutes.js
// 当前运行接口已迁到 runtimeRoutes.js
// 当前留痕接口已迁到 traceRoutes.js
// server.js 现已直接挂载上述 3 个 route 文件。
// 本文件临时保留，仅作为过渡占位，后续确认无残余引用后删除。

export default router;