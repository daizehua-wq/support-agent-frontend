import fs from 'fs';
import { randomUUID } from 'crypto';
import { resolveMockDataPath } from './jsonDataService.js';
import { nowLocalIso } from '../utils/localTime.js';

const CALL_LOG_FILENAME = 'externalProviderCallLog.jsonl';

const normalizeText = (value = '') => String(value || '').trim();

const readJsonLines = () => {
  const filePath = resolveMockDataPath(CALL_LOG_FILENAME);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

const countProviderCalls = ({ provider = '', sourceType = '' } = {}) =>
  readJsonLines().filter(
    (item) =>
      normalizeText(item.provider) === normalizeText(provider) &&
      normalizeText(item.sourceType) === normalizeText(sourceType),
  ).length;

const buildResultPreview = (items = []) =>
  (Array.isArray(items) ? items : []).slice(0, 5).map((item) => ({
    title: item.title || '',
    url: item.url || null,
    snippet: item.summary || item.snippet || '',
    retrievedAt: item.retrievedAt || '',
  }));

export const appendExternalProviderCallLog = ({
  provider = '',
  sourceType = '',
  keyword = '',
  status = '',
  reason = '',
  resultCount = 0,
  startedAt = '',
  finishedAt = '',
  durationMs = 0,
  httpStatus = null,
  endpointHost = '',
  hasApiKey = false,
  cacheHit = false,
  items = [],
} = {}) => {
  const normalizedProvider = normalizeText(provider) || 'unknown_provider';
  const normalizedSourceType = normalizeText(sourceType) || 'unknown';
  const filePath = resolveMockDataPath(CALL_LOG_FILENAME);
  const record = {
    callId: `provider_call_${randomUUID().slice(0, 12)}`,
    callCount: countProviderCalls({
      provider: normalizedProvider,
      sourceType: normalizedSourceType,
    }) + 1,
    provider: normalizedProvider,
    sourceType: normalizedSourceType,
    keyword: normalizeText(keyword),
    status: normalizeText(status) || 'unknown',
    reason: normalizeText(reason),
    resultCount: Number.isFinite(Number(resultCount)) ? Number(resultCount) : 0,
    startedAt: normalizeText(startedAt),
    finishedAt: normalizeText(finishedAt) || nowLocalIso(),
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0,
    httpStatus,
    endpointHost: normalizeText(endpointHost),
    hasApiKey: hasApiKey === true,
    cacheHit: cacheHit === true,
    resultPreview: buildResultPreview(items),
  };

  fs.mkdirSync(resolveMockDataPath('.'), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
};

export const listExternalProviderCallLogs = ({
  provider = '',
  sourceType = '',
  limit = 50,
} = {}) => {
  let records = readJsonLines();

  if (normalizeText(provider)) {
    records = records.filter((item) => normalizeText(item.provider) === normalizeText(provider));
  }

  if (normalizeText(sourceType)) {
    records = records.filter((item) => normalizeText(item.sourceType) === normalizeText(sourceType));
  }

  return records.slice(-Math.max(1, Number(limit) || 50));
};
