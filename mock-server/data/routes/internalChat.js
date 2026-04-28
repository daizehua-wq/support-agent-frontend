import express from 'express';
import { randomUUID } from 'crypto';
import {
  appendMessage,
  createSession,
  getSession,
} from '../models/session.js';
import { getPromptByAppId } from '../models/appPrompt.js';
import { recordUsage } from '../models/app.js';
import { handleComposeDocument } from '../../routes/runtimeRoutes.js';
import fastRouter from '../../services/fastRouter.js';

const router = express.Router();

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const normalizeText = (value = '') => String(value || '').trim();

const estimateTokens = (...values) => {
  const text = values.map((value) => normalizeText(value)).join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
};

const extractReply = (composePayload = {}) => {
  const data = composePayload?.data && isPlainObject(composePayload.data)
    ? composePayload.data
    : composePayload;

  return normalizeText(
    data.formalVersion ||
      data.llmVersion ||
      data.content ||
      data.reply ||
      data.script ||
      data.text ||
      data.referenceText,
  );
};

const buildFastRouteReferenceSummary = (baseSummary = '', fastRouteContext = null) => {
  const normalizedBaseSummary = normalizeText(baseSummary);

  if (!fastRouteContext || !isPlainObject(fastRouteContext)) {
    return normalizedBaseSummary;
  }

  const extractedInfo = isPlainObject(fastRouteContext.extractedInfo)
    ? fastRouteContext.extractedInfo
    : {};
  const routeContextText = [
    '[P2.1 快速通道路由上下文]',
    `routeResult: ${normalizeText(fastRouteContext.routeResult) || 'upgraded'}`,
    `reason: ${normalizeText(fastRouteContext.reason) || 'not_handled'}`,
    `routeLatency: ${Math.max(0, Number(fastRouteContext.routeLatency || 0) || 0)}ms`,
    Object.keys(extractedInfo).length
      ? `extractedInfo: ${JSON.stringify(extractedInfo)}`
      : '',
  ].filter(Boolean).join('\n');

  return [normalizedBaseSummary, routeContextText].filter(Boolean).join('\n\n');
};

const runComposeHandler = (req, body = {}) => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fakeReq = {
      ...req,
      body,
      path: '/generate-content',
      originalUrl: '/api/agent/generate-content',
      traceId: req.traceId || randomUUID(),
    };
    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (!settled) {
          settled = true;
          resolve({
            statusCode: this.statusCode || 200,
            payload,
          });
        }

        return payload;
      },
    };

    Promise.resolve(handleComposeDocument(fakeReq, fakeRes, reject))
      .then(() => {
        if (!settled) {
          reject(new Error('compose handler produced no response'));
        }
      })
      .catch(reject);
  });
};

const handleChatRequest = async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const appId = normalizeText(body.app_id || body.appId);
    const message = normalizeText(body.message);
    const requestedSessionId = normalizeText(body.session_id || body.sessionId);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'message is required',
      });
    }

    let session = requestedSessionId ? getSession(requestedSessionId, { appId }) : null;

    if (requestedSessionId && !session) {
      return res.status(404).json({
        success: false,
        message: 'session not found',
      });
    }

    if (!session) {
      session = createSession(appId || 'admin', normalizeText(body.title) || message.slice(0, 32), {
        appId,
      });
    }

    const appSystemPrompt = appId ? getPromptByAppId(appId) || '' : '';

    appendMessage(session.id, {
      role: 'user',
      content: message,
      appId,
      metadata: {
        source: 'api-gateway',
      },
    });

    const fastRouteResult = await fastRouter.routeRequest(message, appId, session.id);

    if (fastRouteResult?.handled) {
      try {
        recordUsage(appId, 1, 0);
      } catch (error) {
        console.warn('[internalChat] failed to record fast route usage:', error.message);
      }

      appendMessage(session.id, {
        role: 'assistant',
        content: fastRouteResult.reply,
        appId,
        metadata: {
          source: 'fast-router',
          handledBy: fastRouteResult.handledBy || 'fast-router',
        },
      });

      return res.json({
        success: true,
        data: {
          session_id: session.id,
          sessionId: session.id,
          reply: fastRouteResult.reply,
          trace_id: req.traceId || '',
          traceId: req.traceId || '',
          tokens_used: 0,
          tokensUsed: 0,
          fast_route: {
            handled: true,
            handledBy: fastRouteResult.handledBy || 'fast-router',
          },
        },
      });
    }

    req.fastRouteContext = fastRouteResult?.context || null;

    const composeInput = {
      sessionId: session.id,
      appId,
      taskInput: message,
      customerText: message,
      taskSubject: normalizeText(body.task_subject || body.taskSubject || body.topic) || '开放 API 对话',
      productDirection:
        normalizeText(body.product_direction || body.productDirection || body.topic) || '开放 API 对话',
      referenceSummary: buildFastRouteReferenceSummary(
        normalizeText(body.context || body.referenceSummary),
        req.fastRouteContext,
      ),
      communicationGoal: normalizeText(body.goal || body.communicationGoal) || 'chat_reply',
      goal: normalizeText(body.goal) || '生成一条可以直接回复用户的内容',
      scene: normalizeText(body.scene) || 'chat',
      outputStyle: normalizeText(body.outputStyle || body.output_style),
      appSystemPrompt,
      sourceModule: 'api-gateway',
      fastRouteContext: req.fastRouteContext,
    };
    const composeResponse = await runComposeHandler(req, composeInput);

    if (composeResponse.statusCode >= 400) {
      return res.status(composeResponse.statusCode).json({
        success: false,
        message: 'chat failed',
      });
    }

    const composePayload = composeResponse.payload || {};
    const composeData = composePayload.data || {};
    const reply = extractReply(composeData) || '已收到，我会基于当前上下文继续处理。';
    const tokensUsed = estimateTokens(message, reply);

    appendMessage(session.id, {
      role: 'assistant',
      content: reply,
      appId,
      metadata: {
        source: 'api-gateway',
        compose: {
          stepId: composeData.stepId || composePayload.meta?.stepId || '',
          llmRoute: composeData.llmRoute || composeData.modelRuntime?.route || '',
        },
        fastRouteContext: req.fastRouteContext,
      },
    });

    return res.json({
      success: true,
      data: {
        session_id: session.id,
        sessionId: session.id,
        reply,
        trace_id: req.traceId || '',
        traceId: req.traceId || '',
        tokens_used: tokensUsed,
        tokensUsed,
        result: composeData,
        fast_route: {
          handled: false,
          context: req.fastRouteContext,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

router.post('/internal/chat', handleChatRequest);
router.post('/api/v1/chat', handleChatRequest);

export default router;
