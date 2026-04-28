import path from 'path';
import { createHash } from 'crypto';
import { nowLocalIso } from '../utils/localTime.js';
import {
  getReferenceLibraryDb,
  getReferenceLibraryDirectories,
  toLibraryRelativePath,
  writeLibraryText,
} from './referenceLibraryService.js';

const normalizeText = (value = '') => String(value || '').trim();

export const hashContent = (value = '') =>
  createHash('sha256').update(String(value || ''), 'utf-8').digest('hex');

const markdownEscape = (value = '') => normalizeText(value).replace(/\|/g, '\\|');

export const buildNormalizedSourceMarkdown = (source = {}) => {
  const title = normalizeText(source.title) || '未命名资料';
  const content = normalizeText(source.content) || normalizeText(source.summary) || '无正文。';
  const rows = [
    ['来源类型', source.sourceType || 'unknown'],
    ['来源名称', source.sourceName || source.provider || 'unknown'],
    ['Provider', source.provider || 'unknown'],
    ['URL', source.url || ''],
    ['检索时间', source.retrievedAt || ''],
    ['发布时间', source.publishedAt || ''],
    ['更新时间', source.updatedAt || ''],
  ]
    .filter(([, value]) => normalizeText(value))
    .map(([key, value]) => `| ${key} | ${markdownEscape(value)} |`)
    .join('\n');

  return [
    `# ${title}`,
    '',
    '| 字段 | 内容 |',
    '| --- | --- |',
    rows,
    '',
    '## 摘要',
    '',
    normalizeText(source.summary) || '无摘要。',
    '',
    '## 正文',
    '',
    content,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
};

export const writeNormalizedSourceFile = (source = {}) => {
  const directories = getReferenceLibraryDirectories();
  const contentHash = source.contentHash || hashContent(source.content || source.summary || source.title);
  const fileId = source.fileId || `file_${contentHash.slice(0, 16)}`;
  const filePath = path.join(directories.normalizedSources, `${fileId}.md`);
  const markdown = buildNormalizedSourceMarkdown(source);

  writeLibraryText(filePath, markdown);

  return {
    fileId,
    contentHash,
    filePath,
    localFilePath: toLibraryRelativePath(filePath),
    fileFormat: 'markdown',
  };
};

export const upsertExternalSourceFile = ({
  fileId = '',
  sourceType = '',
  provider = '',
  originalUrl = '',
  localFilePath = '',
  fileFormat = 'markdown',
  contentHash = '',
  createdAt = '',
  retrievedAt = '',
  cacheStatus = '',
  cachePath = '',
  promotedAt = '',
  cacheDeletedAt = '',
  retainRaw = false,
  taskId = '',
  sessionId = '',
  appId = '',
} = {}) => {
  const db = getReferenceLibraryDb();
  const now = nowLocalIso();

  db.prepare(
    `
    INSERT INTO external_source_files (
      file_id, source_type, provider, original_url, local_file_path, file_format,
      content_hash, created_at, retrieved_at, cache_status, cache_path,
      promoted_at, cache_deleted_at, retain_raw, task_id, session_id, app_id
    )
    VALUES (
      @fileId, @sourceType, @provider, @originalUrl, @localFilePath, @fileFormat,
      @contentHash, @createdAt, @retrievedAt, @cacheStatus, @cachePath,
      @promotedAt, @cacheDeletedAt, @retainRaw, @taskId, @sessionId, @appId
    )
    ON CONFLICT(file_id) DO UPDATE SET
      source_type = excluded.source_type,
      provider = excluded.provider,
      original_url = excluded.original_url,
      local_file_path = excluded.local_file_path,
      file_format = excluded.file_format,
      content_hash = excluded.content_hash,
      retrieved_at = excluded.retrieved_at,
      cache_status = excluded.cache_status,
      cache_path = excluded.cache_path,
      promoted_at = excluded.promoted_at,
      cache_deleted_at = excluded.cache_deleted_at,
      retain_raw = excluded.retain_raw,
      task_id = excluded.task_id,
      session_id = excluded.session_id,
      app_id = excluded.app_id
    `,
  ).run({
    fileId,
    sourceType,
    provider,
    originalUrl,
    localFilePath,
    fileFormat,
    contentHash,
    createdAt: createdAt || now,
    retrievedAt: retrievedAt || now,
    cacheStatus,
    cachePath,
    promotedAt: promotedAt || now,
    cacheDeletedAt,
    retainRaw: retainRaw ? 1 : 0,
    taskId,
    sessionId,
    appId,
  });
};
