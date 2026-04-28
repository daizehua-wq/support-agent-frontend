import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { nowLocalIso } from '../utils/localTime.js';
import {
  ensureReferenceLibrary,
  getReferenceLibraryDirectories,
  toLibraryRelativePath,
  writeLibraryJson,
} from './referenceLibraryService.js';

const DEFAULT_FAILED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeText = (value = '') => String(value || '').trim();

const sanitizeTaskId = (value = '') =>
  normalizeText(value)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `task_${Date.now()}_${randomUUID().slice(0, 8)}`;

export const createExternalSourceCacheTask = ({ taskId = '' } = {}) => {
  ensureReferenceLibrary();
  const directories = getReferenceLibraryDirectories();
  const normalizedTaskId = sanitizeTaskId(taskId);
  const taskCachePath = path.join(directories.cache, normalizedTaskId);

  fs.mkdirSync(taskCachePath, { recursive: true });
  writeLibraryJson(path.join(taskCachePath, 'manifest.json'), {
    taskId: normalizedTaskId,
    status: 'processing',
    createdAt: nowLocalIso(),
  });

  return {
    taskId: normalizedTaskId,
    cachePath: taskCachePath,
    relativeCachePath: toLibraryRelativePath(taskCachePath),
  };
};

export const writeExternalSourceCacheRecord = ({
  taskId = '',
  sourceId = '',
  payload = {},
} = {}) => {
  const cacheTask = createExternalSourceCacheTask({ taskId });
  const safeSourceId =
    normalizeText(sourceId).replace(/[^\w.-]+/g, '-') || `source_${Date.now()}`;
  const cacheFilePath = path.join(cacheTask.cachePath, `${safeSourceId}.json`);

  writeLibraryJson(cacheFilePath, {
    taskId: cacheTask.taskId,
    sourceId: safeSourceId,
    cachedAt: nowLocalIso(),
    payload,
  });

  return {
    taskId: cacheTask.taskId,
    cachePath: cacheFilePath,
    relativeCachePath: toLibraryRelativePath(cacheFilePath),
  };
};

export const markExternalSourceCacheTaskFailed = ({
  taskId = '',
  error = null,
} = {}) => {
  const normalizedTaskId = sanitizeTaskId(taskId);
  const directories = getReferenceLibraryDirectories();
  const taskCachePath = path.join(directories.cache, normalizedTaskId);

  if (!fs.existsSync(taskCachePath)) {
    return null;
  }

  const failedAt = nowLocalIso();
  writeLibraryJson(path.join(taskCachePath, 'manifest.json'), {
    taskId: normalizedTaskId,
    status: 'failed',
    failedAt,
    error: error?.message || String(error || ''),
  });

  return {
    taskId: normalizedTaskId,
    status: 'failed',
    failedAt,
    cachePath: taskCachePath,
    relativeCachePath: toLibraryRelativePath(taskCachePath),
  };
};

export const cleanupExternalSourceCache = (taskId = '') => {
  const normalizedTaskId = sanitizeTaskId(taskId);
  const directories = getReferenceLibraryDirectories();
  const taskCachePath = path.join(directories.cache, normalizedTaskId);
  const existed = fs.existsSync(taskCachePath);

  if (existed) {
    fs.rmSync(taskCachePath, { recursive: true, force: true });
  }

  return {
    taskId: normalizedTaskId,
    deleted: existed,
    cachePath: taskCachePath,
    relativeCachePath: toLibraryRelativePath(taskCachePath),
    deletedAt: nowLocalIso(),
  };
};

export const cleanupExpiredExternalSourceCache = ({
  ttlMs = DEFAULT_FAILED_CACHE_TTL_MS,
} = {}) => {
  ensureReferenceLibrary();
  const directories = getReferenceLibraryDirectories();
  const now = Date.now();
  const deleted = [];

  if (!fs.existsSync(directories.cache)) {
    return {
      deleted,
      ttlMs,
    };
  }

  for (const entry of fs.readdirSync(directories.cache, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const taskCachePath = path.join(directories.cache, entry.name);
    const stats = fs.statSync(taskCachePath);
    const ageMs = now - stats.mtimeMs;

    if (ageMs < ttlMs) {
      continue;
    }

    fs.rmSync(taskCachePath, { recursive: true, force: true });
    deleted.push({
      taskId: entry.name,
      ageMs: Math.round(ageMs),
      relativeCachePath: toLibraryRelativePath(taskCachePath),
    });
  }

  return {
    deleted,
    ttlMs,
  };
};
