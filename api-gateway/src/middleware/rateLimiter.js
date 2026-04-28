import defaultConfig from '../../config/default.json' with { type: 'json' };

const requestBuckets = new Map();

const currentMinute = () => new Date().toISOString().slice(0, 16);

const readRateLimit = (appInfo = {}) => {
  const configuredLimit = Number(
    appInfo.rateLimitPerMin ||
      appInfo.rate_limit_per_min ||
      defaultConfig.defaultRateLimitPerMin ||
      60,
  );

  return Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 60;
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

export default function rateLimiter(req, res, next) {
  const appId = req.appInfo?.id;

  if (!appId) {
    return res.status(401).json({
      success: false,
      message: 'invalid api key',
    });
  }

  cleanupBuckets();

  const limit = readRateLimit(req.appInfo);
  const key = `${appId}:${currentMinute()}`;
  const currentCount = Number(requestBuckets.get(key) || 0);

  if (currentCount >= limit) {
    res.setHeader('X-RateLimit-Remaining', '0');
    return res.status(429).json({
      success: false,
      message: 'quota exceeded',
    });
  }

  requestBuckets.set(key, currentCount + 1);
  req.rateLimitRemaining = Math.max(0, limit - currentCount - 1);
  res.setHeader('X-RateLimit-Remaining', String(req.rateLimitRemaining));

  return next();
}
