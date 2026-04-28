import express from 'express';
import { getDb } from '../database.js';
import { countGaps, deleteGap, getGaps } from '../models/knowledgeGap.js';
import { toLocalDateKey } from '../../utils/localTime.js';
import {
  getModelUsageRank,
  getTotalTokensUsed,
} from '../models/modelCallLog.js';

const router = express.Router();

router.get('/internal/stats', (req, res) => {
  const db = getDb();
  const today = toLocalDateKey();
  const connectionStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_connections,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_connections
    FROM external_connections
    `,
  ).get();
  const sessionStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_sessions,
      SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END) AS today_sessions
    FROM sessions
    WHERE status != 'deleted'
    `,
  ).get(today);
  const messageStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_messages,
      SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END) AS today_messages
    FROM messages
    `,
  ).get(today);
  const appStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_apps,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_apps
    FROM apps
    WHERE status != 'deleted'
    `,
  ).get();
  const usageStats = db.prepare(
    `
    SELECT
      COALESCE(SUM(api_calls), 0) AS today_api_calls,
      COALESCE(SUM(tokens_used), 0) AS today_tokens_used
    FROM app_usage
    WHERE date = ?
    `,
  ).get(today);
  const ruleStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_rules,
      SUM(CASE WHEN date(last_hit_at) = ? THEN 1 ELSE 0 END) AS today_hit_rules
    FROM knowledge_rules
    `,
  ).get(today);
  const activeSessionStats = db.prepare(
    `
    SELECT COUNT(*) AS today_active_sessions
    FROM sessions
    WHERE status != 'deleted'
      AND date(updated_at) = ?
    `,
  ).get(today);
  const applicationPackStats = db.prepare(
    `
    SELECT
      COUNT(*) AS total_application_packs,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_application_packs
    FROM application_packs
    `,
  ).get();
  const todayTokensUsed = Number(usageStats?.today_tokens_used || 0);
  const modelTokensUsedToday = getTotalTokensUsed({
    start: today,
    end: today,
  });
  const totalRules = Number(ruleStats?.total_rules || 0);
  const todayHitRules = Number(ruleStats?.today_hit_rules || 0);

  return res.json({
    success: true,
    data: {
      totalConnections: Number(connectionStats?.total_connections || 0),
      activeConnections: Number(connectionStats?.active_connections || 0),
      totalSessions: Number(sessionStats?.total_sessions || 0),
      todaySessions: Number(sessionStats?.today_sessions || 0),
      totalMessages: Number(messageStats?.total_messages || 0),
      todayMessages: Number(messageStats?.today_messages || 0),
      totalApps: Number(appStats?.total_apps || 0),
      activeApps: Number(appStats?.active_apps || 0),
      totalApplicationPacks: Number(applicationPackStats?.total_application_packs || 0),
      publishedApplicationPacks: Number(
        applicationPackStats?.published_application_packs || 0,
      ),
      todayApiCalls: Number(usageStats?.today_api_calls || 0),
      todayTokensUsed,
      modelUsageRank: getModelUsageRank({
        start: today,
        end: today,
        limit: 5,
      }),
      ruleHitRate: totalRules > 0 ? Number((todayHitRules / totalRules).toFixed(4)) : 0,
      knowledgeGapCount: countGaps({
        start: today,
        end: today,
      }),
      todayActiveSessions: Number(activeSessionStats?.today_active_sessions || 0),
      totalTokensUsedToday: modelTokensUsedToday || todayTokensUsed,
    },
  });
});

router.get('/internal/stats/knowledge-gaps', (req, res) => {
  return res.json({
    success: true,
    data: getGaps({
      start: req.query?.start,
      end: req.query?.end,
      limit: req.query?.limit,
    }),
  });
});

router.delete('/internal/stats/knowledge-gaps/:id', (req, res) => {
  const deleted = deleteGap(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'knowledge gap not found',
    });
  }

  return res.json({
    success: true,
    data: {
      id: Number(req.params.id),
      deleted: true,
    },
  });
});

export default router;
