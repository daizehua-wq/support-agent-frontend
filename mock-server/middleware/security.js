import { enforceSecurityContext } from '../services/securityMiddlewareService.js';
import { toLocalMinuteKey } from '../utils/localTime.js';

const DEFAULT_RATE_LIMIT_PER_MIN = 600;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const requestBuckets = new Map();

const normalizeText = (value = '') => String(value || '').trim();

const readNumberEnv = (key = '', fallback = 0) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const currentMinute = () => toLocalMinuteKey();

const getClientIp = (req = {}) => {
  return normalizeText(
    req.get?.('x-forwarded-for')?.split(',')?.[0] ||
      req.ip ||
      req.socket?.remoteAddress ||
      '',
  ).replace(/^::ffff:/, '');
};

const cleanupBuckets = () => {
  const activeMinute = currentMinute();

  for (const key of requestBuckets.keys()) {
    if (!key.endsWith(`:${activeMinute}`)) {
      requestBuckets.delete(key);
    }
  }
};

setInterval(cleanupBuckets, 60 * 1000).unref?.();

const getRequestBodySize = (req = {}) => {
  if (!req.body || typeof req.body !== 'object') {
    return 0;
  }

  try {
    return Buffer.byteLength(JSON.stringify(req.body), 'utf8');
  } catch {
    return 0;
  }
};

const collectPromptLikeText = (payload = {}) => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const fields = [
    payload.message,
    payload.userMessage,
    payload.taskInput,
    payload.customerText,
    payload.query,
    payload.prompt,
    payload.content,
  ];

  return fields
    .filter((item) => typeof item === 'string')
    .map(normalizeText)
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
};

const readBlacklist = () => {
  return normalizeText(process.env.P1_IP_BLACKLIST)
    .split(',')
    .map(normalizeText)
    .filter(Boolean);
};

const promptInjectionPatterns = [
  /忽略(?:以上|之前|所有).{0,20}(?:指令|规则|系统提示|system)/i,
  /ignore (?:all|previous|above).{0,40}(?:instructions|system prompt)/i,
  /(?:泄露|输出|打印).{0,20}(?:系统提示|system prompt|developer message)/i,
  /(?:越狱|jailbreak|DAN mode)/i,
];

const shouldBypassPromptInspection = (req = {}) => {
  const path = normalizeText(req.originalUrl || req.url);
  return (
    path === '/' ||
    path.startsWith('/health') ||
    path.startsWith('/api/settings/security/posture')
  );
};

const reject = (res, status, code, message, details = {}) => {
  return res.status(status).json({
    success: false,
    message,
    error: {
      code,
      message,
      details,
    },
  });
};

const runImmuneBoundary = (req, res) => {
  const ip = getClientIp(req);
  const blacklist = readBlacklist();

  if (ip && blacklist.includes(ip)) {
    return reject(res, 403, 'p1-ip-blacklisted', 'request rejected by immune boundary', {
      ip,
    });
  }

  const maxBodyBytes = readNumberEnv('P1_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES);
  const bodyBytes = getRequestBodySize(req);
  if (bodyBytes > maxBodyBytes) {
    return reject(res, 413, 'p1-body-too-large', 'request body exceeds immune boundary limit', {
      bodyBytes,
      maxBodyBytes,
    });
  }

  const limitPerMinute = readNumberEnv('P1_RATE_LIMIT_PER_MIN', DEFAULT_RATE_LIMIT_PER_MIN);
  if (ip && limitPerMinute > 0) {
    cleanupBuckets();
    const key = `${ip}:${currentMinute()}`;
    const currentCount = Number(requestBuckets.get(key) || 0);

    if (currentCount >= limitPerMinute) {
      return reject(res, 429, 'p1-rate-limited', 'request rate limited by immune boundary', {
        ip,
        limitPerMinute,
      });
    }

    requestBuckets.set(key, currentCount + 1);
  }

  if (!shouldBypassPromptInspection(req)) {
    const promptText = collectPromptLikeText(req.body);
    const matchedPattern = promptInjectionPatterns.find((pattern) => pattern.test(promptText));

    if (matchedPattern) {
      return reject(res, 400, 'p1-prompt-injection-detected', 'prompt injection pattern detected', {
        pattern: String(matchedPattern),
      });
    }
  }

  req.immuneContext = {
    layer: 'P1',
    checked: true,
    ip,
    bodyBytes,
    rateLimitPerMinute: limitPerMinute,
  };

  return null;
};

export default function security(req, res, next) {
  const immuneRejection = runImmuneBoundary(req, res);
  if (immuneRejection) {
    return immuneRejection;
  }

  return enforceSecurityContext(req, res, next);
}
