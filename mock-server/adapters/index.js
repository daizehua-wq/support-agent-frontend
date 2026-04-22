import WebAdapter from './web.js';
import LarkAdapter from './lark.js';

const ADAPTER_REGISTRY = {
  web: WebAdapter,
  lark: LarkAdapter,
};

const normalizeClientType = (clientType = '') => {
  return String(clientType || '')
    .trim()
    .toLowerCase();
};

export const resolveClientType = (req) => {
  return (
    req.get('x-client-type') ||
    req.query?.clientType ||
    req.body?.clientType ||
    'web'
  );
};

export const createAdapter = (clientType = 'web') => {
  const normalizedClientType = normalizeClientType(clientType);
  const AdapterClass = ADAPTER_REGISTRY[normalizedClientType] || WebAdapter;
  return new AdapterClass();
};

export const formatReplyForClient = ({ clientType = 'web', payload = {} } = {}) => {
  return createAdapter(clientType).formatReply(payload);
};
