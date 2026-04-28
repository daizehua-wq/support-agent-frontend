import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { normalizeDatabaseType } from './databaseService.js';
import {
  DEFAULT_SETTINGS,
  normalizeSearchSettings,
} from './settingsService.js';
import { CONNECTOR_SPEC_VERSION } from '../contracts/platformContracts.js';

const { Client: PgClient } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const SEARCH_SOURCE_TYPES = {
  KNOWLEDGE: 'local-document',
  FILE_SYSTEM: 'local-file',
  ENTERPRISE_DB: 'enterprise-database',
};
const SEARCH_CONNECTOR_REGISTRY_CONTRACT_VERSION = 'search-connectors/v2';

const DOC_TYPE_FILTER_MAP = {
  spec: ['spec', '规格书', '规范资料', '制度规范'],
  faq: ['faq', 'FAQ', '常见问题', '流程 SOP', '流程SOP'],
  case: ['case', '案例资料', '案例', '复盘材料', '复盘纪要'],
  project: ['project', '项目资料', '项目文档', '数据库记录'],
  制度规范: ['spec', '规格书', '规范资料', '制度规范'],
  '流程 SOP': ['faq', 'FAQ', '常见问题', '流程 SOP', '流程SOP'],
  复盘纪要: ['case', '案例资料', '案例', '复盘材料', '复盘纪要'],
  项目文档: ['project', '项目资料', '项目文档', '数据库记录'],
};

const normalizeText = (value = '') => String(value || '').trim();

const normalizeDocType = (value = '') => normalizeText(value).toLowerCase();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toRelativePath = (targetPath = '') => {
  if (!targetPath) {
    return '';
  }

  return path.relative(projectRoot, targetPath) || targetPath;
};

const buildSearchTokens = ({ keyword = '', industryType = 'other' } = {}) => {
  const rawKeyword = normalizeText(keyword);
  const rawIndustryType = normalizeText(industryType);
  const tokenSet = new Set();

  if (rawKeyword) {
    tokenSet.add(rawKeyword);
  }

  rawKeyword
    .split(/[\s,，、/|]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2)
    .forEach((item) => tokenSet.add(item));

  if (rawIndustryType && rawIndustryType !== 'other') {
    tokenSet.add(rawIndustryType);
  }

  return Array.from(tokenSet);
};

const scoreTextAgainstTokens = ({ text = '', tokens = [] } = {}) => {
  const normalizedText = normalizeText(text);

  if (!normalizedText || tokens.length === 0) {
    return 0;
  }

  let score = 0;

  tokens.forEach((token) => {
    if (!token) {
      return;
    }

    if (normalizedText.includes(token)) {
      score += token.length >= 4 ? 3 : 2;
    }
  });

  return score;
};

const getExcerptAroundKeyword = ({ content = '', keyword = '' } = {}) => {
  const normalizedContent = String(content || '').replace(/\s+/g, ' ').trim();

  if (!normalizedContent) {
    return '';
  }

  const normalizedKeyword = normalizeText(keyword);
  const matchIndex = normalizedKeyword ? normalizedContent.indexOf(normalizedKeyword) : -1;

  if (matchIndex === -1) {
    return normalizedContent.slice(0, 180);
  }

  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedKeyword.length + 110);
  return normalizedContent.slice(start, end);
};

const matchesDocTypeFilter = (docType = '', docTypeFilter = undefined) => {
  if (!docTypeFilter) {
    return true;
  }

  const normalizedDocType = normalizeDocType(docType);
  const candidates = DOC_TYPE_FILTER_MAP[docTypeFilter] || [docTypeFilter];

  return candidates.some((item) => normalizedDocType.includes(normalizeDocType(item)));
};

const matchesWhitelistItem = (value = '', candidates = []) => {
  const normalizedValue = normalizeText(value).toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  return (Array.isArray(candidates) ? candidates : [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .some((item) => normalizedValue === item || normalizedValue.includes(item));
};

const matchesPathWhitelist = (relativePath = '', prefixes = []) => {
  const normalizedPath = normalizeText(relativePath);

  if (!normalizedPath) {
    return false;
  }

  return (Array.isArray(prefixes) ? prefixes : [])
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .some((item) => normalizedPath === item || normalizedPath.startsWith(item));
};

const mapDocTypeByExtension = (extension = '') => {
  if (extension === '.md' || extension === '.txt') {
    return '知识文件';
  }

  if (extension === '.json') {
    return '知识数据';
  }

  return '资料';
};

const walkSearchFiles = (rootPath, collected = [], maxScanCount = 120) => {
  if (!fs.existsSync(rootPath) || collected.length >= maxScanCount) {
    return collected;
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });

  entries.forEach((entry) => {
    if (collected.length >= maxScanCount) {
      return;
    }

    const fullPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      walkSearchFiles(fullPath, collected, maxScanCount);
      return;
    }

    collected.push(fullPath);
  });

  return collected;
};

const openSqliteDatabase = (dbFile) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });

const allSqlite = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Array.isArray(rows) ? rows : []);
    });
  });

const closeSqlite = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const resolveSqlitePath = (databaseConfig = {}) => {
  const configuredPath =
    databaseConfig.path || databaseConfig.databaseFile || databaseConfig.filename || '';

  if (configuredPath) {
    return path.isAbsolute(configuredPath) ? configuredPath : path.join(projectRoot, configuredPath);
  }

  const databaseName = normalizeText(databaseConfig.databaseName) || 'sales_support_agent';
  return path.join(projectRoot, 'data', `${databaseName}.db`);
};

const quoteMysqlIdentifier = (identifier = '') => `\`${String(identifier).replace(/`/g, '``')}\``;

const quotePostgresIdentifier = (identifier = '') =>
  `"${String(identifier).replace(/"/g, '""')}"`;

const normalizeConnectorList = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => isPlainObject(item));
};

const normalizeAdapterType = (value = '') => {
  const normalizedValue = normalizeText(value).toLowerCase();

  if (!normalizedValue) {
    return '';
  }

  if (
    normalizedValue === 'knowledge' ||
    normalizedValue === 'local-document' ||
    normalizedValue === 'knowledge-base'
  ) {
    return 'knowledge';
  }

  if (
    normalizedValue === 'file-system' ||
    normalizedValue === 'filesystem' ||
    normalizedValue === 'file'
  ) {
    return 'file-system';
  }

  if (
    normalizedValue === 'database' ||
    normalizedValue === 'db' ||
    normalizedValue === 'mysql' ||
    normalizedValue === 'postgres' ||
    normalizedValue === 'postgresql' ||
    normalizedValue === 'sqlite' ||
    normalizedValue === 'sqlite3'
  ) {
    return 'database';
  }

  return normalizedValue;
};

const matchesSourceRefWhitelist = (sourceRef = '', candidates = []) => {
  return matchesPathWhitelist(sourceRef, candidates) || matchesWhitelistItem(sourceRef, candidates);
};

const normalizePermissionIsolation = (permissionIsolation = {}) => {
  const normalizedPermissionIsolation = isPlainObject(permissionIsolation) ? permissionIsolation : {};

  return {
    enabled: normalizedPermissionIsolation.enabled !== false,
    readIsolationEnabled: normalizedPermissionIsolation.readIsolationEnabled === true,
    outboundIsolationEnabled: normalizedPermissionIsolation.outboundIsolationEnabled !== false,
    sourceRefs: Array.isArray(normalizedPermissionIsolation.sourceRefs)
      ? normalizedPermissionIsolation.sourceRefs
      : [],
    outboundSourceRefs: Array.isArray(normalizedPermissionIsolation.outboundSourceRefs)
      ? normalizedPermissionIsolation.outboundSourceRefs
      : [],
  };
};

const applyConnectorCandidatePolicies = ({ connector = {}, candidates = [] } = {}) => {
  const whitelist = isPlainObject(connector.whitelist) ? connector.whitelist : {};
  const searchableSourceRefs = Array.isArray(whitelist.sourceRefs) ? whitelist.sourceRefs : [];
  const outboundSourceRefs = Array.isArray(whitelist.outboundSourceRefs)
    ? whitelist.outboundSourceRefs
    : [];
  const permissionIsolation = normalizePermissionIsolation(connector.permissionIsolation);

  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const sourceRef = normalizeText(candidate?.sourceRef);

      if (searchableSourceRefs.length > 0 && !matchesSourceRefWhitelist(sourceRef, searchableSourceRefs)) {
        return null;
      }

      if (
        permissionIsolation.enabled &&
        permissionIsolation.readIsolationEnabled &&
        permissionIsolation.sourceRefs.length > 0 &&
        !matchesSourceRefWhitelist(sourceRef, permissionIsolation.sourceRefs)
      ) {
        return null;
      }

      let outboundMatched =
        candidate?.outboundWhitelistMatched === true || candidate?.whitelistMatched === true;
      let outboundStatus =
        normalizeText(candidate?.outboundStatus).toLowerCase() === 'allowed' ? 'allowed' : 'internal-only';
      let outboundReason = normalizeText(candidate?.outboundReason);
      let outboundSourceWhitelistBlocked = false;
      let outboundPermissionBlocked = false;

      if (outboundSourceRefs.length > 0 && !matchesSourceRefWhitelist(sourceRef, outboundSourceRefs)) {
        outboundMatched = false;
        outboundSourceWhitelistBlocked = true;
      }

      if (
        permissionIsolation.enabled &&
        permissionIsolation.outboundIsolationEnabled &&
        permissionIsolation.outboundSourceRefs.length > 0 &&
        !matchesSourceRefWhitelist(sourceRef, permissionIsolation.outboundSourceRefs)
      ) {
        outboundMatched = false;
        outboundPermissionBlocked = true;
      }

      if (outboundMatched) {
        outboundStatus = 'allowed';

        if (!outboundReason || outboundReason.includes('internal-only')) {
          outboundReason = 'connector-outbound-whitelist-allowed';
        }
      } else {
        outboundStatus = 'internal-only';

        if (outboundPermissionBlocked) {
          outboundReason = 'connector-permission-isolation-outbound-denied';
        } else if (outboundSourceWhitelistBlocked) {
          outboundReason = 'connector-outbound-source-ref-not-whitelisted';
        } else if (!outboundReason) {
          outboundReason = 'connector-internal-only';
        }
      }

      return {
        ...candidate,
        connectorId: candidate?.connectorId || connector.id || '',
        connectorType: candidate?.connectorType || connector.adapterType || connector.connectorType || '',
        whitelist,
        permissionIsolation,
        whitelistMatched: outboundMatched,
        outboundWhitelistMatched: outboundMatched,
        outboundStatus,
        outboundReason,
      };
    })
    .filter(Boolean);
};

const buildKnowledgeCandidates = ({
  documents = [],
  docTypeFilter = undefined,
  connector = {},
} = {}) => {
  const whitelist = connector.whitelist || {};
  const searchableDocTypes = Array.isArray(whitelist.docTypes) ? whitelist.docTypes : [];
  const outboundDocTypes = Array.isArray(whitelist.outboundDocTypes) ? whitelist.outboundDocTypes : [];

  return documents
    .filter((item) => matchesDocTypeFilter(item.docType, docTypeFilter))
    .filter((item) => {
      if (searchableDocTypes.length === 0) {
        return true;
      }

      return matchesWhitelistItem(item.docType, searchableDocTypes);
    })
    .map((item) => ({
      connectorId: connector.id || 'knowledge-default',
      connectorType: 'knowledge',
      sourceType: SEARCH_SOURCE_TYPES.KNOWLEDGE,
      sourceRef: item.id,
      title: item.docName,
      docType: item.docType,
      summary: item.summaryText,
      applicableScene: item.applicableScene,
      outboundStatus: item.externalAvailable ? 'allowed' : 'internal-only',
      outboundReason: item.externalAvailable ? 'knowledge-doc-external-available' : 'knowledge-doc-internal-only',
      whitelist: connector.whitelist || {},
      whitelistMatched: item.externalAvailable === true && matchesWhitelistItem(item.docType, outboundDocTypes),
      confidenceBase: 0.72,
      productId: item.productId || '',
      productName: item.productName || '',
    }));
};

const buildFileSystemCandidates = ({
  keyword = '',
  industryType = 'other',
  docTypeFilter = undefined,
  connector = {},
} = {}) => {
  const tokens = buildSearchTokens({ keyword, industryType });

  if (tokens.length === 0) {
    return [];
  }

  const limits = connector.limits || {};
  const whitelist = connector.whitelist || {};
  const maxScanCount = Number(limits.maxScanCount || 120);
  const maxMatchCount = Number(limits.maxMatchCount || 8);
  const roots = Array.isArray(connector.roots) ? connector.roots : [];
  const allowedExtensions = new Set(
    (Array.isArray(whitelist.extensions) ? whitelist.extensions : []).map((item) =>
      normalizeText(item).toLowerCase(),
    ),
  );
  const outboundPathPrefixes = Array.isArray(whitelist.outboundPathPrefixes)
    ? whitelist.outboundPathPrefixes
    : [];
  const fieldMapping = connector.fieldMapping || {};

  const matchedCandidates = [];
  const filePaths = roots
    .flatMap((root) => walkSearchFiles(path.join(projectRoot, root), [], maxScanCount))
    .slice(0, maxScanCount);

  filePaths.forEach((filePath) => {
    if (matchedCandidates.length >= maxMatchCount) {
      return;
    }

    const extension = path.extname(filePath).toLowerCase();

    if (allowedExtensions.size > 0 && !allowedExtensions.has(extension)) {
      return;
    }

    const relativePath = toRelativePath(filePath);
    const docType = mapDocTypeByExtension(extension);

    if (!matchesDocTypeFilter(docType, docTypeFilter)) {
      return;
    }

    if (
      Array.isArray(whitelist.pathPrefixes) &&
      whitelist.pathPrefixes.length > 0 &&
      !matchesPathWhitelist(relativePath, whitelist.pathPrefixes)
    ) {
      return;
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const searchableText = `${relativePath} ${rawContent}`;
    const score = scoreTextAgainstTokens({ text: searchableText, tokens });

    if (score <= 0) {
      return;
    }

    matchedCandidates.push({
      connectorId: connector.id || 'filesystem-default',
      connectorType: 'file-system',
      sourceType: SEARCH_SOURCE_TYPES.FILE_SYSTEM,
      sourceRef: relativePath,
      title: fieldMapping.title === 'relativePath' ? relativePath : path.basename(filePath),
      docType,
      summary: getExcerptAroundKeyword({ content: rawContent, keyword }),
      applicableScene:
        fieldMapping.applicableScene === 'relativePath'
          ? relativePath
          : `文件系统资料 / ${path.dirname(relativePath)}`,
      outboundStatus: matchesPathWhitelist(relativePath, outboundPathPrefixes) ? 'allowed' : 'internal-only',
      outboundReason: matchesPathWhitelist(relativePath, outboundPathPrefixes)
        ? 'filesystem-outbound-path-whitelisted'
        : 'filesystem-internal-only',
      whitelist: connector.whitelist || {},
      whitelistMatched: matchesPathWhitelist(relativePath, outboundPathPrefixes),
      confidenceBase: Math.min(0.55 + score * 0.04, 0.82),
      productId: '',
      productName: '',
    });
  });

  return matchedCandidates;
};

const createMysqlConnectionConfig = (databaseConfig = {}) => ({
  host: databaseConfig.host || '127.0.0.1',
  port: Number(databaseConfig.port || 3306),
  user: databaseConfig.username || databaseConfig.user || '',
  password: databaseConfig.password || '',
  database: databaseConfig.databaseName || undefined,
  connectTimeout: Number(databaseConfig.connectionTimeoutMs || 5000),
});

const createPostgresConnectionConfig = (databaseConfig = {}) => ({
  host: databaseConfig.host || '127.0.0.1',
  port: Number(databaseConfig.port || 5432),
  user: databaseConfig.username || databaseConfig.user || '',
  password: databaseConfig.password || '',
  database: databaseConfig.databaseName || undefined,
  connectionTimeoutMillis: Number(databaseConfig.connectionTimeoutMs || 5000),
});

const buildDatabaseRowTitle = (databaseName = '', tableName = '', row = {}, index = 0, fieldMapping = {}) => {
  const titleFields = Array.isArray(fieldMapping.titleFields) ? fieldMapping.titleFields : [];
  const rowIdentity =
    titleFields
      .map((field) => row?.[field])
      .find((value) => value !== undefined && value !== null && String(value).trim()) ||
    row?.id ||
    row?.ID ||
    row?.__rowid__ ||
    index + 1;

  return `${databaseName} / ${tableName} / ${rowIdentity}`;
};

const buildDatabaseRowSummary = ({ row = {}, keyword = '', fieldMapping = {} } = {}) => {
  const summaryFields = Array.isArray(fieldMapping.summaryFields) ? fieldMapping.summaryFields : [];
  const summaryText = summaryFields
    .map((field) => {
      const value = row?.[field];
      return value === undefined || value === null ? '' : `${field}: ${String(value)}`;
    })
    .filter(Boolean)
    .join('；');

  if (summaryText) {
    return getExcerptAroundKeyword({ content: summaryText, keyword });
  }

  return getExcerptAroundKeyword({ content: JSON.stringify(row), keyword });
};

const buildDatabaseScene = ({ connector = {}, databaseName = '', tableName = '', row = {} } = {}) => {
  const sceneFields = Array.isArray(connector.fieldMapping?.sceneFields)
    ? connector.fieldMapping.sceneFields
    : [];
  const sceneText = sceneFields
    .map((field) => row?.[field])
    .find((value) => value !== undefined && value !== null && String(value).trim());

  return sceneText
    ? `企业本地数据库 / ${databaseName} / ${String(sceneText)}`
    : `企业本地数据库 / ${databaseName} / ${tableName}`;
};

const collectSqliteCandidates = async ({
  connector = {},
  tokens = [],
  keyword = '',
  docTypeFilter = undefined,
} = {}) => {
  if (tokens.length === 0 || (docTypeFilter && docTypeFilter !== 'project')) {
    return [];
  }

  const dbFile = resolveSqlitePath(connector.connection || {});

  if (!fs.existsSync(dbFile)) {
    return [];
  }

  const limits = connector.limits || {};
  const whitelist = connector.whitelist || {};
  const fieldMapping = connector.fieldMapping || {};
  const maxTableCount = Number(limits.maxTableCount || 12);
  const maxRowCountPerTable = Number(limits.maxRowCountPerTable || 20);
  const maxMatchCount = Number(limits.maxMatchCount || 8);
  const searchableTables = Array.isArray(whitelist.tables) ? whitelist.tables : [];
  const outboundTables = Array.isArray(whitelist.outboundTables) ? whitelist.outboundTables : [];
  const searchableSchemas = Array.isArray(whitelist.schemas) ? whitelist.schemas : [];
  const outboundSchemas = Array.isArray(whitelist.outboundSchemas) ? whitelist.outboundSchemas : [];
  const candidates = [];
  let db;

  try {
    db = await openSqliteDatabase(dbFile);
    const tables = await allSqlite(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'system_settings' LIMIT ?",
      [maxTableCount],
    );

    for (const tableRow of tables) {
      if (candidates.length >= maxMatchCount) {
        break;
      }

      const tableName = normalizeText(tableRow?.name);

      if (!tableName) {
        continue;
      }

      if (searchableTables.length > 0 && !matchesWhitelistItem(tableName, searchableTables)) {
        continue;
      }

      const rows = await allSqlite(
        db,
        `SELECT rowid as __rowid__, * FROM "${tableName.replace(/"/g, '""')}" LIMIT ${maxRowCountPerTable}`,
      );

      rows.forEach((row, index) => {
        if (candidates.length >= maxMatchCount) {
          return;
        }

        const serializedRow = JSON.stringify(row);
        const score = scoreTextAgainstTokens({
          text: `${tableName} ${serializedRow}`,
          tokens,
        });

        if (score <= 0) {
          return;
        }

        const databaseName = normalizeText(connector.connection?.databaseName) || path.basename(dbFile);

        candidates.push({
          connectorId: connector.id || 'database-default',
          connectorType: 'database',
          sourceType: SEARCH_SOURCE_TYPES.ENTERPRISE_DB,
          sourceRef: `${databaseName}:${tableName}:${row?.id || row?.ID || row?.__rowid__ || index + 1}`,
          title: buildDatabaseRowTitle(databaseName, tableName, row, index, fieldMapping),
          docType: '数据库记录',
          summary: buildDatabaseRowSummary({ row, keyword, fieldMapping }),
          applicableScene: buildDatabaseScene({ connector, databaseName, tableName, row }),
          outboundStatus:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem('main', outboundSchemas)
              ? 'allowed'
              : 'internal-only',
          outboundReason:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem('main', outboundSchemas)
              ? 'database-outbound-whitelist-allowed'
              : 'database-internal-only',
          whitelist: connector.whitelist || {},
          whitelistMatched:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem('main', outboundSchemas),
          confidenceBase: Math.min(0.52 + score * 0.03, 0.8),
          productId: '',
          productName: '',
        });
      });
    }
  } finally {
    if (db) {
      await closeSqlite(db);
    }
  }

  return candidates;
};

const collectMysqlCandidates = async ({
  connector = {},
  tokens = [],
  keyword = '',
  docTypeFilter = undefined,
} = {}) => {
  if (tokens.length === 0 || (docTypeFilter && docTypeFilter !== 'project')) {
    return [];
  }

  const connection = await mysql.createConnection(createMysqlConnectionConfig(connector.connection || {}));
  const limits = connector.limits || {};
  const whitelist = connector.whitelist || {};
  const fieldMapping = connector.fieldMapping || {};
  const maxTableCount = Number(limits.maxTableCount || 12);
  const maxRowCountPerTable = Number(limits.maxRowCountPerTable || 20);
  const maxMatchCount = Number(limits.maxMatchCount || 8);
  const searchableTables = Array.isArray(whitelist.tables) ? whitelist.tables : [];
  const outboundTables = Array.isArray(whitelist.outboundTables) ? whitelist.outboundTables : [];
  const candidates = [];

  try {
    const [tables] = await connection.execute(
      `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        LIMIT ?
      `,
      [maxTableCount],
    );

    for (const tableRow of Array.isArray(tables) ? tables : []) {
      if (candidates.length >= maxMatchCount) {
        break;
      }

      const tableName = normalizeText(tableRow?.TABLE_NAME || tableRow?.table_name);

      if (!tableName) {
        continue;
      }

      if (searchableTables.length > 0 && !matchesWhitelistItem(tableName, searchableTables)) {
        continue;
      }

      const [rows] = await connection.execute(
        `SELECT * FROM ${quoteMysqlIdentifier(tableName)} LIMIT ${maxRowCountPerTable}`,
      );

      (Array.isArray(rows) ? rows : []).forEach((row, index) => {
        if (candidates.length >= maxMatchCount) {
          return;
        }

        const serializedRow = JSON.stringify(row);
        const score = scoreTextAgainstTokens({
          text: `${tableName} ${serializedRow}`,
          tokens,
        });

        if (score <= 0) {
          return;
        }

        const databaseName = normalizeText(connector.connection?.databaseName) || 'mysql';

        candidates.push({
          connectorId: connector.id || 'database-default',
          connectorType: 'database',
          sourceType: SEARCH_SOURCE_TYPES.ENTERPRISE_DB,
          sourceRef: `${databaseName}:${tableName}:${row?.id || row?.ID || index + 1}`,
          title: buildDatabaseRowTitle(databaseName, tableName, row, index, fieldMapping),
          docType: '数据库记录',
          summary: buildDatabaseRowSummary({ row, keyword, fieldMapping }),
          applicableScene: buildDatabaseScene({ connector, databaseName, tableName, row }),
          outboundStatus: matchesWhitelistItem(tableName, outboundTables) ? 'allowed' : 'internal-only',
          outboundReason: matchesWhitelistItem(tableName, outboundTables)
            ? 'database-outbound-whitelist-allowed'
            : 'database-internal-only',
          whitelist: connector.whitelist || {},
          whitelistMatched: matchesWhitelistItem(tableName, outboundTables),
          confidenceBase: Math.min(0.52 + score * 0.03, 0.8),
          productId: '',
          productName: '',
        });
      });
    }
  } finally {
    await connection.end();
  }

  return candidates;
};

const collectPostgresCandidates = async ({
  connector = {},
  tokens = [],
  keyword = '',
  docTypeFilter = undefined,
} = {}) => {
  if (tokens.length === 0 || (docTypeFilter && docTypeFilter !== 'project')) {
    return [];
  }

  const client = new PgClient(createPostgresConnectionConfig(connector.connection || {}));
  const limits = connector.limits || {};
  const whitelist = connector.whitelist || {};
  const fieldMapping = connector.fieldMapping || {};
  const maxTableCount = Number(limits.maxTableCount || 12);
  const maxRowCountPerTable = Number(limits.maxRowCountPerTable || 20);
  const maxMatchCount = Number(limits.maxMatchCount || 8);
  const searchableTables = Array.isArray(whitelist.tables) ? whitelist.tables : [];
  const searchableSchemas = Array.isArray(whitelist.schemas) ? whitelist.schemas : [];
  const outboundTables = Array.isArray(whitelist.outboundTables) ? whitelist.outboundTables : [];
  const outboundSchemas = Array.isArray(whitelist.outboundSchemas) ? whitelist.outboundSchemas : [];
  const candidates = [];

  try {
    await client.connect();

    const tableResult = await client.query(
      `
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        LIMIT $1
      `,
      [maxTableCount],
    );

    for (const tableRow of Array.isArray(tableResult.rows) ? tableResult.rows : []) {
      if (candidates.length >= maxMatchCount) {
        break;
      }

      const tableName = normalizeText(tableRow?.table_name);
      const schemaName = normalizeText(tableRow?.table_schema || 'public');

      if (!tableName) {
        continue;
      }

      if (searchableSchemas.length > 0 && !matchesWhitelistItem(schemaName, searchableSchemas)) {
        continue;
      }

      if (searchableTables.length > 0 && !matchesWhitelistItem(tableName, searchableTables)) {
        continue;
      }

      const rowResult = await client.query(
        `SELECT * FROM ${quotePostgresIdentifier(schemaName)}.${quotePostgresIdentifier(tableName)} LIMIT ${maxRowCountPerTable}`,
      );

      (Array.isArray(rowResult.rows) ? rowResult.rows : []).forEach((row, index) => {
        if (candidates.length >= maxMatchCount) {
          return;
        }

        const serializedRow = JSON.stringify(row);
        const score = scoreTextAgainstTokens({
          text: `${schemaName} ${tableName} ${serializedRow}`,
          tokens,
        });

        if (score <= 0) {
          return;
        }

        const databaseName = normalizeText(connector.connection?.databaseName) || 'postgres';

        candidates.push({
          connectorId: connector.id || 'database-default',
          connectorType: 'database',
          sourceType: SEARCH_SOURCE_TYPES.ENTERPRISE_DB,
          sourceRef: `${databaseName}:${schemaName}.${tableName}:${row?.id || row?.ID || index + 1}`,
          title: buildDatabaseRowTitle(databaseName, `${schemaName}.${tableName}`, row, index, fieldMapping),
          docType: '数据库记录',
          summary: buildDatabaseRowSummary({ row, keyword, fieldMapping }),
          applicableScene: buildDatabaseScene({
            connector,
            databaseName,
            tableName: `${schemaName}.${tableName}`,
            row,
          }),
          outboundStatus:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem(schemaName, outboundSchemas)
              ? 'allowed'
              : 'internal-only',
          outboundReason:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem(schemaName, outboundSchemas)
              ? 'database-outbound-whitelist-allowed'
              : 'database-internal-only',
          whitelist: connector.whitelist || {},
          whitelistMatched:
            matchesWhitelistItem(tableName, outboundTables) ||
            matchesWhitelistItem(schemaName, outboundSchemas),
          confidenceBase: Math.min(0.52 + score * 0.03, 0.8),
          productId: '',
          productName: '',
        });
      });
    }
  } finally {
    await client.end().catch(() => {});
  }

  return candidates;
};

const buildAdapterHandlerForConnector = (connector = {}) => {
  const adapterType = normalizeAdapterType(
    connector.adapterType || connector.connectorType || connector.kind,
  );

  if (adapterType === 'knowledge') {
    return async (context) => buildKnowledgeCandidates(context);
  }

  if (adapterType === 'file-system') {
    return async (context) => buildFileSystemCandidates(context);
  }

  if (adapterType === 'database') {
    return async (context) => {
      const databaseType = normalizeDatabaseType(context.connector?.databaseType || 'sqlite');

      if (databaseType === 'mysql') {
        return collectMysqlCandidates(context);
      }

      if (databaseType === 'postgres') {
        return collectPostgresCandidates(context);
      }

      return collectSqliteCandidates(context);
    };
  }

  return null;
};

const normalizeRegistryConnector = (connector = {}, index = 0) => {
  const adapterType = normalizeAdapterType(
    connector.adapterType || connector.connectorType || connector.kind,
  );
  const normalizedAdapterType = adapterType || 'knowledge';
  const fallbackId = `${normalizedAdapterType}-connector-${index + 1}`;

  return {
    ...connector,
    id: connector.id || fallbackId,
    adapterType: normalizedAdapterType,
    connectorType: connector.connectorType || normalizedAdapterType,
    databaseType:
      normalizedAdapterType === 'database'
        ? normalizeDatabaseType(connector.databaseType || connector.connection?.databaseType || 'sqlite')
        : '',
    permissionIsolation: isPlainObject(connector.permissionIsolation)
      ? connector.permissionIsolation
      : {},
  };
};

export const registerSearchConnector = ({ registrations = [], connector = {} } = {}) => {
  const handler = buildAdapterHandlerForConnector(connector);

  if (typeof handler !== 'function') {
    return registrations;
  }

  registrations.push({
    connector,
    handler,
  });

  return registrations;
};

export const resolveSearchConnectorRegistry = (settings = {}) => {
  const normalizedSearchSettings = normalizeSearchSettings(
    settings.search || DEFAULT_SETTINGS.search,
    settings.databases || [],
    settings.database || {},
  );
  const connectors = normalizedSearchSettings.connectors || {};
  const registrySeed =
    normalizeConnectorList(connectors.registry).length > 0
      ? normalizeConnectorList(connectors.registry)
      : [
          ...normalizeConnectorList(connectors.knowledge).map((item) => ({
            ...item,
            adapterType: 'knowledge',
          })),
          ...normalizeConnectorList(connectors.fileSystems).map((item) => ({
            ...item,
            adapterType: 'file-system',
          })),
          ...normalizeConnectorList(connectors.databases).map((item) => ({
            ...item,
            adapterType: 'database',
          })),
        ];
  const registry = registrySeed
    .map((item, index) => normalizeRegistryConnector(item, index))
    .filter((item) => item.enabled !== false);

  return {
    contractVersion: SEARCH_CONNECTOR_REGISTRY_CONTRACT_VERSION,
    settingsContractVersion: normalizedSearchSettings.contractVersion,
    connectorContractVersion: normalizedSearchSettings.connectorContractVersion || '',
    connectorSpecVersion: CONNECTOR_SPEC_VERSION,
    summaryPolicy: normalizedSearchSettings.summaryPolicy,
    registry,
  };
};

export const collectSearchEvidenceCandidates = async ({
  keyword = '',
  industryType = 'other',
  docTypeFilter = undefined,
  settings = {},
  documents = [],
} = {}) => {
  const connectorRegistry = resolveSearchConnectorRegistry(settings);
  const candidates = [];
  const tokens = buildSearchTokens({ keyword, industryType });
  const registrations = connectorRegistry.registry.reduce((accumulator, connector) => {
    return registerSearchConnector({
      registrations: accumulator,
      connector,
    });
  }, []);

  for (const registration of registrations) {
    const connector = registration.connector || {};
    const handler = registration.handler;
    try {
      const collected = await handler({
        keyword,
        industryType,
        docTypeFilter,
        settings,
        documents,
        tokens,
        connector,
      });
      const policyAppliedCandidates = applyConnectorCandidatePolicies({
        connector,
        candidates: Array.isArray(collected) ? collected : [],
      });

      candidates.push(...policyAppliedCandidates);
    } catch (error) {
      console.warn('[searchAdapterRegistry] adapter failed:', connector.id || connector.adapterType, error.message);
    }
  }

  return {
    connectorRegistry,
    candidates,
  };
};

export const dedupeSearchEvidenceCandidates = (candidates = []) => {
  const seen = new Set();

  return candidates.filter((item) => {
    const key = `${item.sourceType}__${item.sourceRef}__${item.title}__${item.docType}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const sortSearchEvidenceCandidates = (candidates = []) => {
  const sourcePriorityMap = {
    [SEARCH_SOURCE_TYPES.KNOWLEDGE]: 3,
    [SEARCH_SOURCE_TYPES.FILE_SYSTEM]: 2,
    [SEARCH_SOURCE_TYPES.ENTERPRISE_DB]: 1,
  };

  return [...candidates].sort((a, b) => {
    const confidenceDiff = Number(b.confidenceBase || 0) - Number(a.confidenceBase || 0);

    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }

    const sourceDiff =
      (sourcePriorityMap[b.sourceType] || 0) - (sourcePriorityMap[a.sourceType] || 0);

    if (sourceDiff !== 0) {
      return sourceDiff;
    }

    return String(a.title || '').localeCompare(String(b.title || ''));
  });
};

export const summarizeSearchEvidenceSources = (candidates = []) => {
  return candidates.reduce(
    (acc, item) => {
      if (item.sourceType === SEARCH_SOURCE_TYPES.KNOWLEDGE) {
        acc.knowledgeCount += 1;
      } else if (item.sourceType === SEARCH_SOURCE_TYPES.FILE_SYSTEM) {
        acc.fileSystemCount += 1;
      } else if (item.sourceType === SEARCH_SOURCE_TYPES.ENTERPRISE_DB) {
        acc.enterpriseDatabaseCount += 1;
      }

      return acc;
    },
    {
      knowledgeCount: 0,
      fileSystemCount: 0,
      enterpriseDatabaseCount: 0,
    },
  );
};

export const buildSearchConnectorRegistrySummary = (connectorRegistry = null) => {
  const registry = Array.isArray(connectorRegistry?.registry) ? connectorRegistry.registry : [];

  return {
    contractVersion: connectorRegistry?.contractVersion || SEARCH_CONNECTOR_REGISTRY_CONTRACT_VERSION,
    settingsContractVersion: connectorRegistry?.settingsContractVersion || '',
    connectorContractVersion: connectorRegistry?.connectorContractVersion || '',
    connectorSpecVersion: connectorRegistry?.connectorSpecVersion || CONNECTOR_SPEC_VERSION,
    summaryPolicy: connectorRegistry?.summaryPolicy || null,
    connectorCount: registry.length,
    connectors: registry.map((item) => ({
      id: item.id,
      adapterType: item.adapterType,
      databaseType: item.databaseType || '',
      enabled: item.enabled !== false,
      permissionIsolation: item.permissionIsolation || {},
    })),
  };
};
