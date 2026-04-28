import axios from 'axios';

const client = axios.create({
  baseURL: process.env.MOCK_SERVER_URL || 'http://localhost:3001',
  timeout: 180000,
});

client.interceptors.request.use((config) => {
  config.headers = {
    ...(config.headers || {}),
    'X-Internal-Call': 'true',
  };
  return config;
});

export const get = async (path, params = {}) => {
  const response = await client.get(path, { params });
  return response.data;
};

export const post = async (path, data = {}) => {
  const response = await client.post(path, data);
  return response.data;
};

export const put = async (path, data = {}) => {
  const response = await client.put(path, data);
  return response.data;
};

export const del = async (path) => {
  const response = await client.delete(path);
  return response.data;
};

export default {
  get,
  post,
  put,
  del,
};
