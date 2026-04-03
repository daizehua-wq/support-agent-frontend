import axios from 'axios';

const request = axios.create({
  baseURL: 'http://localhost:3001',
  timeout: 180000,
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    return Promise.reject(error);
  },
);

export default request;