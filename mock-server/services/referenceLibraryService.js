import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const LIBRARY_DIR_NAME = 'AP 2.0 资料库';
const SQLITE_FILE_NAME = 'library.sqlite';

let libraryDb = null;
let libraryDbPath = '';

const normalizeText = (value = '') => String(value || '').trim();

const normalizePathSegment = (value = '') =>
  normalizeText(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 160) || 'untitled';

const getDefaultDocumentsDirectory = () => {
  if (process.platform === 'linux') {
    return os.homedir();
  }

  return path.join(os.homedir(), 'Documents');
};

export const getDefaultReferenceLibraryRoot = () => {
  if (process.platform === 'linux') {
    return path.join(os.homedir(), LIBRARY_DIR_NAME);
  }

  return path.join(getDefaultDocumentsDirectory(), LIBRARY_DIR_NAME);
};

export const getReferenceLibraryRoot = () => {
  const configuredPath =
    normalizeText(process.env.AP_REFERENCE_LIBRARY_PATH) ||
    normalizeText(process.env.AP_MATERIAL_LIBRARY_PATH) ||
    normalizeText(process.env.AP_LIBRARY_PATH);

  return configuredPath ? path.resolve(configuredPath) : getDefaultReferenceLibraryRoot();
};

export const getReferenceLibrarySqlitePath = () =>
  path.join(getReferenceLibraryRoot(), SQLITE_FILE_NAME);

const ensureDirectory = (directoryPath = '') => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  return directoryPath;
};

export const getReferenceLibraryDirectories = () => {
  const root = getReferenceLibraryRoot();

  return {
    root,
    sqlite: getReferenceLibrarySqlitePath(),
    referencePacks: path.join(root, 'reference-packs'),
    evidence: path.join(root, 'evidence'),
    evidenceByHash: path.join(root, 'evidence', 'by-hash'),
    sources: path.join(root, 'sources'),
    normalizedSources: path.join(root, 'sources', 'normalized'),
    retainedRawSources: path.join(root, 'sources', 'raw', 'retained'),
    exports: path.join(root, 'exports'),
    cache: path.join(root, 'cache'),
  };
};

const ensureBaseDirectories = () => {
  const directories = getReferenceLibraryDirectories();

  [
    directories.root,
    directories.referencePacks,
    directories.evidence,
    directories.evidenceByHash,
    directories.sources,
    directories.normalizedSources,
    directories.retainedRawSources,
    directories.exports,
    directories.cache,
  ].forEach(ensureDirectory);

  return directories;
};

const initializeLibrarySchema = (database) => {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS external_source_files (
      file_id TEXT PRIMARY KEY,
      source_type TEXT,
      provider TEXT,
      original_url TEXT,
      local_file_path TEXT,
      file_format TEXT,
      content_hash TEXT,
      created_at TEXT,
      retrieved_at TEXT,
      cache_status TEXT,
      cache_path TEXT,
      promoted_at TEXT,
      cache_deleted_at TEXT,
      retain_raw INTEGER DEFAULT 0,
      task_id TEXT,
      session_id TEXT,
      app_id TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence_items (
      evidence_id TEXT PRIMARY KEY,
      file_id TEXT,
      source_type TEXT,
      provider TEXT,
      category TEXT,
      title TEXT,
      summary TEXT,
      local_file_path TEXT,
      url TEXT,
      content_hash TEXT,
      trust_level TEXT,
      priority TEXT,
      source_priority REAL,
      relevance_score REAL,
      freshness_score REAL,
      final_score REAL,
      is_duplicate INTEGER DEFAULT 0,
      duplicate_of TEXT,
      external_available INTEGER DEFAULT 0,
      can_use_as_fact INTEGER DEFAULT 0,
      can_use_as_background INTEGER DEFAULT 1,
      can_use_in_external_output INTEGER DEFAULT 0,
      requires_citation INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      valid_until TEXT,
      refresh_policy TEXT,
      last_verified_at TEXT,
      reuse_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      retrieved_at TEXT,
      task_id TEXT,
      session_id TEXT,
      app_id TEXT
    );

    CREATE TABLE IF NOT EXISTS reference_packs (
      reference_pack_id TEXT PRIMARY KEY,
      title TEXT,
      query TEXT,
      session_id TEXT,
      app_id TEXT,
      summary TEXT,
      created_at TEXT,
      updated_at TEXT,
      status TEXT DEFAULT 'active',
      valid_until TEXT,
      source_count INTEGER DEFAULT 0,
      high_trust_count INTEGER DEFAULT 0,
      risk_count INTEGER DEFAULT 0,
      reuse_count INTEGER DEFAULT 0,
      json_path TEXT,
      md_path TEXT,
      task_id TEXT
    );

    CREATE TABLE IF NOT EXISTS reference_pack_items (
      reference_pack_id TEXT,
      evidence_id TEXT,
      use_type TEXT,
      sort_order INTEGER DEFAULT 0,
      reason TEXT,
      PRIMARY KEY (reference_pack_id, evidence_id, use_type)
    );

    CREATE TABLE IF NOT EXISTS evidence_conflicts (
      conflict_id TEXT PRIMARY KEY,
      reference_pack_id TEXT,
      evidence_id_a TEXT,
      evidence_id_b TEXT,
      conflict_type TEXT,
      description TEXT,
      suggested_resolution TEXT,
      need_human_confirmation INTEGER DEFAULT 1,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_external_source_files_hash
      ON external_source_files(content_hash);
    CREATE INDEX IF NOT EXISTS idx_external_source_files_task
      ON external_source_files(task_id, session_id, app_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_hash
      ON evidence_items(content_hash);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_source_rank
      ON evidence_items(source_type, category, trust_level, priority, final_score);
    CREATE INDEX IF NOT EXISTS idx_evidence_items_valid_status
      ON evidence_items(status, valid_until);
    CREATE INDEX IF NOT EXISTS idx_reference_packs_session_app
      ON reference_packs(session_id, app_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reference_pack_items_pack
      ON reference_pack_items(reference_pack_id, use_type, sort_order);
    CREATE INDEX IF NOT EXISTS idx_evidence_conflicts_pack
      ON evidence_conflicts(reference_pack_id);
  `);
};

export const getReferenceLibraryDb = () => {
  const sqlitePath = getReferenceLibrarySqlitePath();

  if (!libraryDb || libraryDbPath !== sqlitePath) {
    ensureBaseDirectories();
    libraryDb = new Database(sqlitePath);
    libraryDbPath = sqlitePath;
    initializeLibrarySchema(libraryDb);
  }

  return libraryDb;
};

export const ensureReferenceLibrary = () => {
  const directories = ensureBaseDirectories();
  getReferenceLibraryDb();

  return {
    ...directories,
    libraryPath: directories.root,
    sqlitePath: directories.sqlite,
  };
};

export const toLibraryRelativePath = (targetPath = '') => {
  const root = getReferenceLibraryRoot();
  const relativePath = path.relative(root, targetPath);

  return relativePath.split(path.sep).join('/');
};

export const resolveLibraryPath = (...segments) =>
  path.join(getReferenceLibraryRoot(), ...segments.filter(Boolean));

export const resolveSafeLibraryPath = (...segments) => {
  const root = getReferenceLibraryRoot();
  const targetPath = path.resolve(root, ...segments.map(normalizePathSegment));
  const relativePath = path.relative(root, targetPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('resolved library path escapes reference library root');
  }

  return targetPath;
};

export const writeLibraryJson = (targetPath = '', payload = {}) => {
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return targetPath;
};

export const writeLibraryText = (targetPath = '', content = '') => {
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${content}\n`, 'utf-8');
  return targetPath;
};

export const readLibraryJson = (relativeOrAbsolutePath = '', fallbackValue = null) => {
  const targetPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : resolveLibraryPath(relativeOrAbsolutePath);

  if (!fs.existsSync(targetPath)) {
    return fallbackValue;
  }

  const rawText = fs.readFileSync(targetPath, 'utf-8');
  if (!rawText.trim()) {
    return fallbackValue;
  }

  return JSON.parse(rawText);
};

export const getReferenceLibrarySummary = () => {
  const directories = ensureReferenceLibrary();
  const database = getReferenceLibraryDb();
  const tableCounts = Object.fromEntries(
    [
      'external_source_files',
      'evidence_items',
      'reference_packs',
      'reference_pack_items',
      'evidence_conflicts',
    ].map((tableName) => [
      tableName,
      database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count,
    ]),
  );

  return {
    libraryPath: directories.libraryPath,
    sqlitePath: directories.sqlitePath,
    tableCounts,
    directories: {
      referencePacks: toLibraryRelativePath(directories.referencePacks),
      evidence: toLibraryRelativePath(directories.evidence),
      normalizedSources: toLibraryRelativePath(directories.normalizedSources),
      retainedRawSources: toLibraryRelativePath(directories.retainedRawSources),
      exports: toLibraryRelativePath(directories.exports),
      cache: toLibraryRelativePath(directories.cache),
    },
  };
};

export const closeReferenceLibraryDb = () => {
  if (libraryDb) {
    libraryDb.close();
    libraryDb = null;
    libraryDbPath = '';
  }
};
