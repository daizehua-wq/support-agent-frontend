import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { addDaysLocalIso, nowLocalIso } from '../utils/localTime.js';
import {
  buildEvidenceJson,
  buildEvidenceMarkdown,
  buildGovernedEvidenceItems,
  upsertEvidenceItem,
} from './evidenceService.js';
import {
  hashContent,
  upsertExternalSourceFile,
  writeNormalizedSourceFile,
} from './externalSourceFileService.js';
import {
  cleanupExpiredExternalSourceCache,
  cleanupExternalSourceCache,
  createExternalSourceCacheTask,
  markExternalSourceCacheTaskFailed,
  writeExternalSourceCacheRecord,
} from './externalSourceCacheService.js';
import {
  ensureReferenceLibrary,
  getReferenceLibraryDb,
  getReferenceLibraryDirectories,
  readLibraryJson,
  resolveLibraryPath,
  toLibraryRelativePath,
  writeLibraryJson,
  writeLibraryText,
} from './referenceLibraryService.js';

const normalizeText = (value = '') => String(value || '').trim();

const sanitizeId = (value = '') =>
  normalizeText(value)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || randomUUID().slice(0, 12);

const buildTimestampId = (prefix = 'rp') => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `${prefix}_${stamp}_${randomUUID().slice(0, 8)}`;
};

const getUseTypeItems = (items = [], useType = '') =>
  items.filter((item) => item.useType === useType);

const buildReferenceEntry = (item = {}) => ({
  evidenceId: item.evidenceId,
  content: item.summary || item.title,
  source: item.sourceName || item.provider,
  sourceType: item.sourceType,
  category: item.category,
  trustLevel: item.trustLevel,
  priority: item.priority,
  finalScore: item.finalScore,
  retrievedAt: item.retrievedAt,
  url: item.url || null,
  reason: item.useReason,
});

const buildRiskNotes = (items = [], conflicts = []) => {
  const lowTrustNotes = items
    .filter((item) => item.trustLevel === 'low' || item.useType === 'doNotUse')
    .map((item) => ({
      evidenceId: item.evidenceId,
      content: item.useReason || `${item.title} 可信度较低`,
      source: item.sourceName || item.provider,
      trustLevel: item.trustLevel,
      priority: item.priority,
    }));
  const conflictNotes = conflicts.map((conflict) => ({
    conflictId: conflict.conflictId,
    content: conflict.description,
    suggestedResolution: conflict.suggestedResolution,
    needHumanConfirmation: conflict.needHumanConfirmation,
  }));

  return [...conflictNotes, ...lowTrustNotes];
};

const buildReferencePackMarkdown = (pack = {}) => {
  const renderEntries = (items = [], fallback = '暂无。') =>
    items.length
      ? items
          .map(
            (item) =>
              `- ${item.content || item.summary || item.title}\n  - 来源：${item.source || item.sourceName || item.provider || '未返回'}\n  - 可信度：${item.trustLevel || '未返回'}\n  - 检索时间：${item.retrievedAt || '未返回'}`,
          )
          .join('\n')
      : fallback;
  const renderConflicts = (items = []) =>
    items.length
      ? items
          .map(
            (item) =>
              `- ${item.description || item.content}\n  - 处理建议：${item.suggestedResolution || '需人工确认'}`,
          )
          .join('\n')
      : '暂无。';
  const renderDoNotUse = (items = []) =>
    items.length
      ? items
          .map(
            (item) =>
              `- ${item.content || item.summary || item.title}\n  - 原因：${item.reason || item.useReason || '低可信 / 过期 / 与权威数据冲突'}`,
          )
          .join('\n')
      : '暂无。';

  return [
    `# 参考资料包：${pack.title}`,
    '',
    `创建时间：${pack.createdAt}`,
    `有效期：${pack.validUntil}`,
    `状态：${pack.status}`,
    `检索问题：${pack.query}`,
    '',
    Number(pack.sourceCount || 0) === 0
      ? pack.emptyReason || '本次未检索到可用资料。'
      : '',
    Number(pack.sourceCount || 0) === 0 ? '' : '',
    '## 一、核心事实',
    '',
    renderEntries(pack.facts || []),
    '',
    '## 二、背景资料',
    '',
    renderEntries(pack.background || []),
    '',
    '## 三、风险提醒',
    '',
    renderEntries(pack.riskNotes || []),
    '',
    '## 四、冲突资料',
    '',
    renderConflicts(pack.conflicts || []),
    '',
    '## 五、不建议使用的资料',
    '',
    renderDoNotUse(pack.doNotUse || []),
  ].join('\n');
};

const writeEvidenceFiles = ({
  referencePackDir = '',
  item = {},
} = {}) => {
  const evidenceJson = buildEvidenceJson(item);
  const evidenceMarkdown = buildEvidenceMarkdown(item);
  const directories = getReferenceLibraryDirectories();
  const canonicalDir = path.join(directories.evidenceByHash, item.contentHash);
  const packEvidenceDir = path.join(referencePackDir, 'evidence');
  const canonicalJsonPath = path.join(canonicalDir, 'evidence.json');
  const canonicalMarkdownPath = path.join(canonicalDir, 'evidence.md');
  const packJsonPath = path.join(packEvidenceDir, `${item.evidenceId}.json`);
  const packMarkdownPath = path.join(packEvidenceDir, `${item.evidenceId}.md`);

  writeLibraryJson(canonicalJsonPath, evidenceJson);
  writeLibraryText(canonicalMarkdownPath, evidenceMarkdown);
  writeLibraryJson(packJsonPath, evidenceJson);
  writeLibraryText(packMarkdownPath, evidenceMarkdown);

  return {
    canonicalJsonPath,
    canonicalMarkdownPath,
    packJsonPath,
    packMarkdownPath,
    canonicalJsonRelativePath: toLibraryRelativePath(canonicalJsonPath),
    canonicalMarkdownRelativePath: toLibraryRelativePath(canonicalMarkdownPath),
    packJsonRelativePath: toLibraryRelativePath(packJsonPath),
    packMarkdownRelativePath: toLibraryRelativePath(packMarkdownPath),
  };
};

const buildReferencePack = ({
  referencePackId = '',
  title = '',
  query = '',
  sessionId = '',
  appId = '',
  evidenceItems = [],
  conflicts = [],
  createdAt = '',
  validUntil = '',
} = {}) => {
  const facts = getUseTypeItems(evidenceItems, 'fact').map(buildReferenceEntry);
  const background = getUseTypeItems(evidenceItems, 'background').map(buildReferenceEntry);
  const doNotUse = getUseTypeItems(evidenceItems, 'doNotUse').map(buildReferenceEntry);
  const conflictItems = conflicts.map((conflict) => ({
    conflictId: conflict.conflictId,
    evidenceIdA: conflict.evidenceIdA,
    evidenceIdB: conflict.evidenceIdB,
    conflictType: conflict.conflictType,
    description: conflict.description,
    suggestedResolution: conflict.suggestedResolution,
    needHumanConfirmation: conflict.needHumanConfirmation,
  }));
  const riskNotes = buildRiskNotes(evidenceItems, conflictItems);
  const highTrustCount = evidenceItems.filter((item) => item.trustLevel === 'high').length;
  const isEmpty = evidenceItems.length === 0;

  return {
    referencePackId,
    title,
    query,
    sessionId,
    appId,
    createdAt,
    updatedAt: createdAt,
    status: isEmpty ? 'empty' : 'active',
    validUntil,
    emptyReason: isEmpty ? '本次未检索到可用资料。' : '',
    summary: isEmpty
      ? '本次未检索到可用资料。已记录本次检索。'
      : `本资料包整理了 ${evidenceItems.length} 条内部资料、权威数据和网页补充信息。`,
    facts,
    background,
    riskNotes,
    conflicts: conflictItems,
    doNotUse,
    evidenceIds: evidenceItems.map((item) => item.evidenceId),
    sourceCount: evidenceItems.length,
    highTrustCount,
    riskCount: riskNotes.length + conflictItems.length + doNotUse.length,
    reuseCount: 0,
  };
};

const upsertReferencePackRows = ({
  referencePack = {},
  evidenceItems = [],
  conflicts = [],
  jsonPath = '',
  mdPath = '',
  taskId = '',
} = {}) => {
  const db = getReferenceLibraryDb();
  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO reference_packs (
        reference_pack_id, title, query, session_id, app_id, summary,
        created_at, updated_at, status, valid_until, source_count,
        high_trust_count, risk_count, reuse_count, json_path, md_path, task_id
      )
      VALUES (
        @referencePackId, @title, @query, @sessionId, @appId, @summary,
        @createdAt, @updatedAt, @status, @validUntil, @sourceCount,
        @highTrustCount, @riskCount, @reuseCount, @jsonPath, @mdPath, @taskId
      )
      ON CONFLICT(reference_pack_id) DO UPDATE SET
        title = excluded.title,
        query = excluded.query,
        session_id = excluded.session_id,
        app_id = excluded.app_id,
        summary = excluded.summary,
        updated_at = excluded.updated_at,
        status = excluded.status,
        valid_until = excluded.valid_until,
        source_count = excluded.source_count,
        high_trust_count = excluded.high_trust_count,
        risk_count = excluded.risk_count,
        reuse_count = excluded.reuse_count,
        json_path = excluded.json_path,
        md_path = excluded.md_path,
        task_id = excluded.task_id
      `,
    ).run({
      ...referencePack,
      jsonPath,
      mdPath,
      taskId,
    });

    db.prepare('DELETE FROM reference_pack_items WHERE reference_pack_id = ?').run(
      referencePack.referencePackId,
    );
    db.prepare('DELETE FROM evidence_conflicts WHERE reference_pack_id = ?').run(
      referencePack.referencePackId,
    );

    evidenceItems.forEach((item, index) => {
      upsertEvidenceItem(db, item);
      db.prepare(
        `
        INSERT INTO reference_pack_items (
          reference_pack_id, evidence_id, use_type, sort_order, reason
        )
        VALUES (?, ?, ?, ?, ?)
        `,
      ).run(
        referencePack.referencePackId,
        item.evidenceId,
        item.useType,
        index + 1,
        item.useReason || '',
      );
    });

    conflicts.forEach((conflict) => {
      db.prepare(
        `
        INSERT INTO evidence_conflicts (
          conflict_id, reference_pack_id, evidence_id_a, evidence_id_b,
          conflict_type, description, suggested_resolution,
          need_human_confirmation, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        conflict.conflictId,
        referencePack.referencePackId,
        conflict.evidenceIdA,
        conflict.evidenceIdB,
        conflict.conflictType,
        conflict.description,
        conflict.suggestedResolution,
        conflict.needHumanConfirmation ? 1 : 0,
        referencePack.createdAt,
      );
    });
  });

  transaction();
};

const markTaskCacheDeletedInIndex = ({ taskId = '', deletedAt = '' } = {}) => {
  getReferenceLibraryDb()
    .prepare(
      `
      UPDATE external_source_files
      SET cache_status = 'deleted', cache_deleted_at = ?
      WHERE task_id = ?
      `,
    )
    .run(deletedAt || nowLocalIso(), taskId);
};

const writeRetainedRawIfNeeded = ({ source = {}, item = {}, retainRaw = false } = {}) => {
  if (!retainRaw || item.category === 'internal_data') {
    return '';
  }

  const directories = getReferenceLibraryDirectories();
  const rawPath = path.join(directories.retainedRawSources, `${item.fileId}.json`);
  writeLibraryJson(rawPath, {
    retainedAt: nowLocalIso(),
    reason: 'retainRaw=true',
    source,
  });

  return toLibraryRelativePath(rawPath);
};

export const createReferencePackFromSearch = ({
  query = '',
  title = '',
  sessionId = '',
  appId = '',
  taskId = '',
  internalEvidenceItems = [],
  externalSources = [],
  retainRaw = false,
} = {}) => {
  ensureReferenceLibrary();
  cleanupExpiredExternalSourceCache();

  const referencePackId = buildTimestampId('rp');
  const normalizedTaskId = sanitizeId(taskId || `task_${referencePackId}`);
  const cacheTask = createExternalSourceCacheTask({ taskId: normalizedTaskId });

  try {
    const createdAt = nowLocalIso();
    const validUntil = addDaysLocalIso(30);
    const cacheRecords = new Map();

    externalSources.forEach((source, index) => {
      const cacheRecord = writeExternalSourceCacheRecord({
        taskId: cacheTask.taskId,
        sourceId: source.rawId || source.id || `external_${index + 1}`,
        payload: source,
      });
      cacheRecords.set(source.rawId || source.id || `external_${index + 1}`, cacheRecord);
    });

    const { evidenceItems, conflicts } = buildGovernedEvidenceItems({
      internalEvidenceItems,
      externalSources,
      query,
      sessionId,
      appId,
      taskId: cacheTask.taskId,
      now: new Date(createdAt),
    });
    const directories = getReferenceLibraryDirectories();
    const referencePackDir = path.join(directories.referencePacks, referencePackId);
    const attachmentsDir = path.join(referencePackDir, 'attachments');

    fs.mkdirSync(attachmentsDir, { recursive: true });

    evidenceItems.forEach((item) => {
      const originalSource = item.originalSource || {};
      const sourceFile = writeNormalizedSourceFile({
        ...item,
        ...originalSource,
        fileId: item.fileId,
        contentHash: item.contentHash || hashContent(item.content || item.summary || item.title),
      });
      const cacheRecord = cacheRecords.get(originalSource.rawId || originalSource.id || item.rawId);
      item.fileId = sourceFile.fileId;
      item.contentHash = sourceFile.contentHash;
      item.localFilePath = sourceFile.localFilePath;
      writeRetainedRawIfNeeded({
        source: originalSource,
        item,
        retainRaw: retainRaw || originalSource.retainRaw === true,
      });
      upsertExternalSourceFile({
        fileId: item.fileId,
        sourceType: item.sourceType,
        provider: item.provider,
        originalUrl: item.url || '',
        localFilePath: item.localFilePath,
        fileFormat: sourceFile.fileFormat,
        contentHash: item.contentHash,
        createdAt,
        retrievedAt: item.retrievedAt,
        cacheStatus: item.category === 'internal_data' ? 'not_applicable' : 'promoted',
        cachePath: cacheRecord?.relativeCachePath || '',
        promotedAt: createdAt,
        retainRaw: retainRaw || originalSource.retainRaw === true,
        taskId: cacheTask.taskId,
        sessionId,
        appId,
      });
      writeEvidenceFiles({ referencePackDir, item });
    });

    const referencePack = buildReferencePack({
      referencePackId,
      title: title || `参考资料包：${query || referencePackId}`,
      query,
      sessionId,
      appId,
      evidenceItems,
      conflicts,
      createdAt,
      validUntil,
    });
    const jsonPath = path.join(referencePackDir, 'reference-pack.json');
    const mdPath = path.join(referencePackDir, 'reference-pack.md');

    writeLibraryJson(jsonPath, referencePack);
    writeLibraryText(mdPath, buildReferencePackMarkdown(referencePack));
    upsertReferencePackRows({
      referencePack,
      evidenceItems,
      conflicts,
      jsonPath: toLibraryRelativePath(jsonPath),
      mdPath: toLibraryRelativePath(mdPath),
      taskId: cacheTask.taskId,
    });

    const cacheCleanup = cleanupExternalSourceCache(cacheTask.taskId);
    markTaskCacheDeletedInIndex({
      taskId: cacheTask.taskId,
      deletedAt: cacheCleanup.deletedAt,
    });

    return {
      referencePack,
      evidenceItems,
      conflicts,
      cacheCleanup,
      library: {
        libraryPath: directories.root,
        sqlitePath: directories.sqlite,
        referencePackPath: toLibraryRelativePath(referencePackDir),
        jsonPath: toLibraryRelativePath(jsonPath),
        mdPath: toLibraryRelativePath(mdPath),
      },
    };
  } catch (error) {
    markExternalSourceCacheTaskFailed({
      taskId: cacheTask.taskId,
      error,
    });
    throw error;
  }
};

export const getReferencePackJsonPath = (referencePackId = '') =>
  resolveLibraryPath(
    'reference-packs',
    sanitizeId(referencePackId),
    'reference-pack.json',
  );

export const getReferencePackById = (referencePackId = '') => {
  const normalizedId = sanitizeId(referencePackId);
  const jsonPath = getReferencePackJsonPath(normalizedId);

  return readLibraryJson(jsonPath, null);
};

export const getReferencePackScriptInput = (referencePackId = '') => {
  const referencePack = getReferencePackById(referencePackId);
  if (!referencePack) {
    return null;
  }

  getReferenceLibraryDb()
    .prepare(
      `
      UPDATE reference_packs
      SET reuse_count = reuse_count + 1, updated_at = ?
      WHERE reference_pack_id = ?
      `,
    )
    .run(nowLocalIso(), referencePack.referencePackId);

  return {
    referencePackId: referencePack.referencePackId,
    title: referencePack.title,
    summary: referencePack.summary,
    facts: Array.isArray(referencePack.facts) ? referencePack.facts : [],
    background: Array.isArray(referencePack.background) ? referencePack.background : [],
    riskNotes: Array.isArray(referencePack.riskNotes) ? referencePack.riskNotes : [],
    conflicts: Array.isArray(referencePack.conflicts) ? referencePack.conflicts : [],
    doNotUse: Array.isArray(referencePack.doNotUse) ? referencePack.doNotUse : [],
    evidenceIds: Array.isArray(referencePack.evidenceIds) ? referencePack.evidenceIds : [],
    validUntil: referencePack.validUntil,
    status: referencePack.status,
  };
};

export const buildReferencePackSummaryText = (scriptInput = null) => {
  if (!scriptInput) {
    return '';
  }

  const render = (label = '', items = []) => {
    if (!items.length) {
      return '';
    }

    return `${label}：${items.map((item) => item.content || item.description || '').filter(Boolean).join('；')}`;
  };

  return [
    `参考资料包 ${scriptInput.referencePackId}：${scriptInput.summary || scriptInput.title}`,
    render('核心事实', scriptInput.facts),
    render('背景资料', scriptInput.background),
    render('风险提醒', scriptInput.riskNotes),
    render('冲突资料', scriptInput.conflicts),
    render('不建议使用', scriptInput.doNotUse),
  ]
    .filter(Boolean)
    .join('\n');
};

const buildCrc32Table = () => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};

const CRC32_TABLE = buildCrc32Table();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return {
    dosTime,
    dosDate,
  };
};

const writeUInt16 = (buffer, value, offset) => buffer.writeUInt16LE(value & 0xffff, offset);
const writeUInt32 = (buffer, value, offset) => buffer.writeUInt32LE(value >>> 0, offset);

const createStoreZipBuffer = (files = []) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime(new Date());

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name, 'utf-8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'utf-8');
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30 + nameBuffer.length);

    writeUInt32(localHeader, 0x04034b50, 0);
    writeUInt16(localHeader, 20, 4);
    writeUInt16(localHeader, 0x0800, 6);
    writeUInt16(localHeader, 0, 8);
    writeUInt16(localHeader, dosTime, 10);
    writeUInt16(localHeader, dosDate, 12);
    writeUInt32(localHeader, checksum, 14);
    writeUInt32(localHeader, data.length, 18);
    writeUInt32(localHeader, data.length, 22);
    writeUInt16(localHeader, nameBuffer.length, 26);
    writeUInt16(localHeader, 0, 28);
    nameBuffer.copy(localHeader, 30);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    writeUInt32(centralHeader, 0x02014b50, 0);
    writeUInt16(centralHeader, 20, 4);
    writeUInt16(centralHeader, 20, 6);
    writeUInt16(centralHeader, 0x0800, 8);
    writeUInt16(centralHeader, 0, 10);
    writeUInt16(centralHeader, dosTime, 12);
    writeUInt16(centralHeader, dosDate, 14);
    writeUInt32(centralHeader, checksum, 16);
    writeUInt32(centralHeader, data.length, 20);
    writeUInt32(centralHeader, data.length, 24);
    writeUInt16(centralHeader, nameBuffer.length, 28);
    writeUInt16(centralHeader, 0, 30);
    writeUInt16(centralHeader, 0, 32);
    writeUInt16(centralHeader, 0, 34);
    writeUInt16(centralHeader, 0, 36);
    writeUInt32(centralHeader, 0, 38);
    writeUInt32(centralHeader, offset, 42);
    nameBuffer.copy(centralHeader, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  writeUInt32(endRecord, 0x06054b50, 0);
  writeUInt16(endRecord, 0, 4);
  writeUInt16(endRecord, 0, 6);
  writeUInt16(endRecord, files.length, 8);
  writeUInt16(endRecord, files.length, 10);
  writeUInt32(endRecord, centralDirectory.length, 12);
  writeUInt32(endRecord, offset, 16);
  writeUInt16(endRecord, 0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
};

const walkFiles = (directoryPath = '', basePath = directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(entryPath, basePath);
    }

    return [
      {
        absolutePath: entryPath,
        name: path.relative(basePath, entryPath).split(path.sep).join('/'),
      },
    ];
  });
};

export const exportReferencePackZip = (referencePackId = '') => {
  const referencePack = getReferencePackById(referencePackId);
  if (!referencePack) {
    return null;
  }

  const directories = getReferenceLibraryDirectories();
  const packDir = path.join(directories.referencePacks, referencePack.referencePackId);
  const files = new Map();

  walkFiles(packDir).forEach((file) => {
    files.set(file.name, fs.readFileSync(file.absolutePath));
  });

  (referencePack.evidenceIds || []).forEach((evidenceId) => {
    const evidencePath = path.join(packDir, 'evidence', `${evidenceId}.json`);
    if (!fs.existsSync(evidencePath)) {
      return;
    }

    const evidence = readLibraryJson(evidencePath, null);
    if (!evidence?.localFilePath) {
      return;
    }

    const sourcePath = resolveLibraryPath(evidence.localFilePath);
    if (fs.existsSync(sourcePath)) {
      files.set(evidence.localFilePath, fs.readFileSync(sourcePath));
    }
  });

  const zipPath = path.join(directories.exports, `${referencePack.referencePackId}.zip`);
  const zipBuffer = createStoreZipBuffer(
    [...files.entries()].map(([name, data]) => ({
      name,
      data,
    })),
  );

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, zipBuffer);

  return {
    referencePackId: referencePack.referencePackId,
    zipPath,
    relativeZipPath: toLibraryRelativePath(zipPath),
    fileCount: files.size,
  };
};
