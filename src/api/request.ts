import axios from 'axios';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const normalizedApiBaseUrl =
  typeof rawApiBaseUrl === 'string' ? rawApiBaseUrl.trim().replace(/\/+$/, '') : '';

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

export default request;
