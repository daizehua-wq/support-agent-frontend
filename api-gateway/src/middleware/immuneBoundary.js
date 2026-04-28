const DEFAULT_RATE_LIMIT_PER_MIN = 1200;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const requestBuckets = new Map();

const normalizeText = (value = '') => String(value || '').trim();

const currentMinute = () => new Date().toISOString().slice(0, 16);

const readNumberEnv = (key = '', fallback = 0) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

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

const getBodyBytes = (req = {}) => {
  try {
    return req.body ? Buffer.byteLength(JSON.stringify(req.body), 'utf8') : 0;
  } catch {
    return 0;
  }
};

const isLocalIp = (ip = '') => ['127.0.0.1', '::1', ''].includes(normalizeText(ip));

const reject = (res, status, code, message, details = {}) => {
  return res.status(status).json({
    success: false,
    message,
    error: {
      code,
      details,
    },
  });
};

const promptInjectionPatterns = [
  /忽略(?:以上|之前|所有).{0,20}(?:指令|规则|系统提示|system)/i,
  /ignore (?:all|previous|above).{0,40}(?:instructions|system prompt)/i,
  /(?:泄露|输出|打印).{0,20}(?:系统提示|system prompt|developer message)/i,
  /(?:越狱|jailbreak|DAN mode)/i,
];

const collectText = (payload = {}) => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  return [
    payload.message,
    payload.text,
    payload.content,
    payload?.message?.text,
    payload?.message?.content,
    payload?.event?.message?.text,
    payload?.event?.message?.content,
    payload?.text?.content,
  ]
    .filter((item) => typeof item === 'string')
    .map(normalizeText)
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
};

export default function immuneBoundary(req, res, next) {
  const ip = getClientIp(req);
  const requestPath = normalizeText(req.originalUrl || req.url);

  if (requestPath.startsWith('/internal') && req.get('X-Internal-Call') !== 'true' && !isLocalIp(ip)) {
    return reject(res, 403, 'p4-internal-forbidden', 'internal gateway route forbidden', {
      ip,
    });
  }

  const blacklist = normalizeText(process.env.P4_IP_BLACKLIST)
    .split(',')
    .map(normalizeText)
    .filter(Boolean);

  if (ip && blacklist.includes(ip)) {
    return reject(res, 403, 'p4-ip-blacklisted', 'request rejected by gateway boundary', {
      ip,
    });
  }

  const maxBodyBytes = readNumberEnv('P4_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES);
  const bodyBytes = getBodyBytes(req);
  if (bodyBytes > maxBodyBytes) {
    return reject(res, 413, 'p4-body-too-large', 'request body exceeds gateway limit', {
      bodyBytes,
      maxBodyBytes,
    });
  }

  const rateLimit = readNumberEnv('P4_RATE_LIMIT_PER_MIN', DEFAULT_RATE_LIMIT_PER_MIN);
  if (ip && rateLimit > 0) {
    cleanupBuckets();
    const key = `${ip}:${currentMinute()}`;
    const currentCount = Number(requestBuckets.get(key) || 0);

    if (currentCount >= rateLimit) {
      return reject(res, 429, 'p4-rate-limited', 'gateway rate limit exceeded', {
        ip,
        rateLimit,
      });
    }

    requestBuckets.set(key, currentCount + 1);
  }

  const text = collectText(req.body);
  const matchedPattern = promptInjectionPatterns.find((pattern) => pattern.test(text));
  if (matchedPattern) {
    return reject(res, 400, 'p4-prompt-injection-detected', 'prompt injection pattern detected', {
      pattern: String(matchedPattern),
    });
  }

  req.gatewayBoundary = {
    layer: 'P4',
    checked: true,
    ip,
    bodyBytes,
  };

  return next();
}
