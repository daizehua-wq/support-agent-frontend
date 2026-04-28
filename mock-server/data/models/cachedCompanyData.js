import { getDb } from '../database.js';
import { toLocalIso } from '../../utils/localTime.js';

const normalizeText = (value = '') => String(value || '').trim();

const safeJsonParse = (value = '', fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stringifyField = (value = null) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
};

const addDays = (date = new Date(), days = 0) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const endOfToday = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const toSqliteDateTime = (date = new Date()) => {
  return toLocalIso(date);
};

const mapCachedCompany = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    company_name: row.company_name || '',
    companyName: row.company_name || '',
    credit_code: row.credit_code || '',
    creditCode: row.credit_code || '',
    basic_info_json: row.basic_info_json || '',
    basicInfo: safeJsonParse(row.basic_info_json, {}),
    risk_info_json: row.risk_info_json || '',
    riskInfo: safeJsonParse(row.risk_info_json, {}),
    operation_info_json: row.operation_info_json || '',
    operationInfo: safeJsonParse(row.operation_info_json, {}),
    raw_response_json: row.raw_response_json || '',
    rawResponse: safeJsonParse(row.raw_response_json, {}),
    data_source: row.data_source || 'qichacha',
    dataSource: row.data_source || 'qichacha',
    fetched_at: row.fetched_at || '',
    fetchedAt: row.fetched_at || '',
    basic_expires_at: row.basic_expires_at || '',
    basicExpiresAt: row.basic_expires_at || '',
    risk_expires_at: row.risk_expires_at || '',
    riskExpiresAt: row.risk_expires_at || '',
    operation_expires_at: row.operation_expires_at || '',
    operationExpiresAt: row.operation_expires_at || '',
  };
};

const findExistingRecord = ({ companyName = '', creditCode = '' } = {}) => {
  const normalizedCompanyName = normalizeText(companyName);
  const normalizedCreditCode = normalizeText(creditCode);

  if (normalizedCreditCode) {
    const byCreditCode = getDb()
      .prepare('SELECT * FROM cached_company_data WHERE credit_code = ?')
      .get(normalizedCreditCode);
    if (byCreditCode) {
      return mapCachedCompany(byCreditCode);
    }
  }

  if (normalizedCompanyName) {
    return mapCachedCompany(
      getDb()
        .prepare(
          `
          SELECT * FROM cached_company_data
          WHERE company_name = ?
          ORDER BY datetime(fetched_at) DESC, id DESC
          LIMIT 1
          `,
        )
        .get(normalizedCompanyName),
    );
  }

  return null;
};

export const getCachedCompany = (companyName = '') => {
  const query = normalizeText(companyName);
  if (!query) {
    return null;
  }

  return mapCachedCompany(
    getDb()
      .prepare(
        `
        SELECT * FROM cached_company_data
        WHERE company_name = ?
           OR credit_code = ?
        ORDER BY datetime(fetched_at) DESC, id DESC
        LIMIT 1
        `,
      )
      .get(query, query),
  );
};

export const saveCompanyData = (companyName = '', creditCode = '', data = {}) => {
  const normalizedCompanyName = normalizeText(companyName);
  const normalizedCreditCode = normalizeText(creditCode);

  if (!normalizedCompanyName) {
    throw new Error('companyName is required');
  }

  const now = new Date();
  const payload = {
    companyName: normalizedCompanyName,
    creditCode: normalizedCreditCode || null,
    basicInfo: stringifyField(data.basicInfo || {}),
    riskInfo: stringifyField(data.riskInfo || {}),
    operationInfo: stringifyField(data.operationInfo || {}),
    rawResponse: stringifyField(data.rawResponse || {}),
    dataSource: normalizeText(data.dataSource) || 'qichacha',
    fetchedAt: toSqliteDateTime(now),
    basicExpiresAt: toSqliteDateTime(addDays(now, 30)),
    riskExpiresAt: toSqliteDateTime(endOfToday(now)),
    operationExpiresAt: toSqliteDateTime(addDays(now, 7)),
  };
  const existing = findExistingRecord({
    companyName: payload.companyName,
    creditCode: payload.creditCode,
  });

  if (existing) {
    return updateCompanyData(existing.id, {
      companyName: payload.companyName,
      creditCode: payload.creditCode,
      basicInfo: data.basicInfo || {},
      riskInfo: data.riskInfo || {},
      operationInfo: data.operationInfo || {},
      rawResponse: data.rawResponse || {},
      dataSource: payload.dataSource,
      fetchedAt: payload.fetchedAt,
      basicExpiresAt: payload.basicExpiresAt,
      riskExpiresAt: payload.riskExpiresAt,
      operationExpiresAt: payload.operationExpiresAt,
    });
  }

  const result = getDb()
    .prepare(
      `
      INSERT INTO cached_company_data (
        company_name,
        credit_code,
        basic_info_json,
        risk_info_json,
        operation_info_json,
        raw_response_json,
        data_source,
        fetched_at,
        basic_expires_at,
        risk_expires_at,
        operation_expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      payload.companyName,
      payload.creditCode,
      payload.basicInfo,
      payload.riskInfo,
      payload.operationInfo,
      payload.rawResponse,
      payload.dataSource,
      payload.fetchedAt,
      payload.basicExpiresAt,
      payload.riskExpiresAt,
      payload.operationExpiresAt,
    );

  return mapCachedCompany(
    getDb().prepare('SELECT * FROM cached_company_data WHERE id = ?').get(result.lastInsertRowid),
  );
};

export const isCacheValid = (cachedRecord = null, dataType = 'basic') => {
  if (!cachedRecord) {
    return false;
  }

  const normalizedType = normalizeText(dataType).toLowerCase();
  const expiresAt =
    normalizedType === 'risk'
      ? cachedRecord.riskExpiresAt || cachedRecord.risk_expires_at
      : normalizedType === 'operation'
        ? cachedRecord.operationExpiresAt || cachedRecord.operation_expires_at
        : cachedRecord.basicExpiresAt || cachedRecord.basic_expires_at;
  const expiresAtTime = Date.parse(expiresAt || '');

  return Number.isFinite(expiresAtTime) && expiresAtTime > Date.now();
};

export const updateCompanyData = (id = '', data = {}) => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const existing = mapCachedCompany(
    getDb().prepare('SELECT * FROM cached_company_data WHERE id = ?').get(normalizedId),
  );
  if (!existing) {
    return null;
  }

  const next = {
    companyName: normalizeText(data.companyName || data.company_name) || existing.companyName,
    creditCode: normalizeText(data.creditCode || data.credit_code) || existing.creditCode || null,
    basicInfo: 'basicInfo' in data || 'basic_info_json' in data
      ? stringifyField(data.basicInfo ?? data.basic_info_json)
      : existing.basic_info_json,
    riskInfo: 'riskInfo' in data || 'risk_info_json' in data
      ? stringifyField(data.riskInfo ?? data.risk_info_json)
      : existing.risk_info_json,
    operationInfo: 'operationInfo' in data || 'operation_info_json' in data
      ? stringifyField(data.operationInfo ?? data.operation_info_json)
      : existing.operation_info_json,
    rawResponse: 'rawResponse' in data || 'raw_response_json' in data
      ? stringifyField(data.rawResponse ?? data.raw_response_json)
      : existing.raw_response_json,
    dataSource: normalizeText(data.dataSource || data.data_source) || existing.dataSource,
    fetchedAt: normalizeText(data.fetchedAt || data.fetched_at) || existing.fetchedAt,
    basicExpiresAt:
      normalizeText(data.basicExpiresAt || data.basic_expires_at) || existing.basicExpiresAt,
    riskExpiresAt:
      normalizeText(data.riskExpiresAt || data.risk_expires_at) || existing.riskExpiresAt,
    operationExpiresAt:
      normalizeText(data.operationExpiresAt || data.operation_expires_at) ||
      existing.operationExpiresAt,
  };

  getDb()
    .prepare(
      `
      UPDATE cached_company_data
      SET company_name = ?,
          credit_code = ?,
          basic_info_json = ?,
          risk_info_json = ?,
          operation_info_json = ?,
          raw_response_json = ?,
          data_source = ?,
          fetched_at = ?,
          basic_expires_at = ?,
          risk_expires_at = ?,
          operation_expires_at = ?
      WHERE id = ?
      `,
    )
    .run(
      next.companyName,
      next.creditCode,
      next.basicInfo,
      next.riskInfo,
      next.operationInfo,
      next.rawResponse,
      next.dataSource,
      next.fetchedAt,
      next.basicExpiresAt,
      next.riskExpiresAt,
      next.operationExpiresAt,
      normalizedId,
    );

  return mapCachedCompany(
    getDb().prepare('SELECT * FROM cached_company_data WHERE id = ?').get(normalizedId),
  );
};

export const deleteCachedCompany = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return false;
  }

  return getDb().prepare('DELETE FROM cached_company_data WHERE id = ?').run(normalizedId).changes > 0;
};

export default {
  deleteCachedCompany,
  getCachedCompany,
  isCacheValid,
  saveCompanyData,
  updateCompanyData,
};
