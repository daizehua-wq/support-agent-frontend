import axios, { AxiosHeaders } from 'axios';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const rawPlatformManagerBaseUrl = import.meta.env.VITE_PLATFORM_MANAGER_BASE_URL;
const normalizedApiBaseUrl =
  typeof rawApiBaseUrl === 'string' ? rawApiBaseUrl.trim().replace(/\/+$/, '') : '';
const normalizedPlatformManagerBaseUrl =
  typeof rawPlatformManagerBaseUrl === 'string'
    ? rawPlatformManagerBaseUrl.trim().replace(/\/+$/, '')
    : '';

const request = axios.create({
  // 默认走同源（配合 vite /api 代理），也允许通过 VITE_API_BASE_URL 显式覆盖。
  baseURL: normalizedApiBaseUrl || undefined,
  timeout: 180000,
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    return Promise.reject(error);
  },
);

request.interceptors.request.use((config) => {
  const requestUrl = String(config.url || '');

  if (requestUrl.startsWith('/internal/management') && normalizedPlatformManagerBaseUrl) {
    config.baseURL = normalizedPlatformManagerBaseUrl;
    config.url = requestUrl.replace(/^\/internal\/management/, '/management');
  }

  if (requestUrl.startsWith('/internal')) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('X-Internal-Call', 'true');
    config.headers = headers;
  }

  return config;
});

export default request;
