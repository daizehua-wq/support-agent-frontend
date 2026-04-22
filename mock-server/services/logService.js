

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testResultPath = path.join(projectRoot, 'test-results', 'manual-test-log.jsonl');

const SENSITIVE_KEYS = ['apiKey', 'password', 'authorization', 'token', 'secret', 'username', 'adminUsername'];

export const redactSecretValue = (value = '') => {
  const text = String(value || '');

  if (!text) {
    return '';
  }

  if (text.length <= 8) {
    return '***';
  }

  return `${text.slice(0, 4)}***${text.slice(-4)}`;
};

export const sanitizeLogPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeLogPayload(item));
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (SENSITIVE_KEYS.includes(String(key))) {
      acc[key] = redactSecretValue(value);
      return acc;
    }

    acc[key] = sanitizeLogPayload(value);
    return acc;
  }, {});
};

export const appendTestRecord = (record = {}) => {
  const dir = path.dirname(testResultPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = {
    timestamp: new Date().toISOString(),
    ...record,
  };

  fs.appendFileSync(testResultPath, `${JSON.stringify(payload)}\n`, 'utf-8');
};

export const logInfo = (scope, payload) => {
  console.log(`[${scope}]`, sanitizeLogPayload(payload));
};

export const logWarn = (scope, payload) => {
  console.warn(`[${scope}]`, sanitizeLogPayload(payload));
};

export const logError = (scope, payload) => {
  console.error(`[${scope}]`, sanitizeLogPayload(payload));
};
