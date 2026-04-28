import httpClient from '../lib/httpClient.js';

const normalizeText = (value = '') => String(value || '').trim();

const sendAuthError = (res, status, message) => {
  return res.status(status).json({
    success: false,
    message,
  });
};

export default async function apiAuth(req, res, next) {
  const apiKey = normalizeText(req.get('x-api-key'));

  if (!apiKey) {
    return sendAuthError(res, 401, 'invalid api key');
  }

  try {
    const response = await httpClient.post('/internal/apps/verify', {
      api_key: apiKey,
    });

    if (!response?.success || !response.data) {
      return sendAuthError(res, 401, 'invalid api key');
    }

    req.appInfo = response.data;
    return next();
  } catch (error) {
    const status = Number(error?.response?.status || 500);

    if (status === 401 || status === 403) {
      return sendAuthError(res, status, error?.response?.data?.message || 'invalid api key');
    }

    console.error('[api-gateway] app verify failed:', error?.message || error);
    return res.status(502).json({
      success: false,
      message: 'gateway auth unavailable',
    });
  }
}
