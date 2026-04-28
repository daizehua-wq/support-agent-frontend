import axios, { AxiosHeaders } from 'axios';
import defaultConfig from '../../config/default.json' with { type: 'json' };

const baseURL =
  String(process.env.MOCK_SERVER_URL || '').trim() ||
  defaultConfig.mockServerUrl ||
  'http://localhost:3001';

const client = axios.create({
  baseURL,
  timeout: Number(process.env.MOCK_SERVER_TIMEOUT_MS || 180000),
});

client.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('X-Internal-Call', 'true');
  config.headers = headers;
  return config;
});

const unwrap = (response) => response.data;

export const get = async (path, config = {}) => unwrap(await client.get(path, config));
export const post = async (path, payload = {}, config = {}) => unwrap(await client.post(path, payload, config));
export const put = async (path, payload = {}, config = {}) => unwrap(await client.put(path, payload, config));
export const del = async (path, config = {}) => unwrap(await client.delete(path, config));

export default {
  get,
  post,
  put,
  delete: del,
};
