import axios from 'axios';
import { getConnection } from '../../../data/models/externalConnection.js';
import {
  getCachedCompany,
  isCacheValid,
  saveCompanyData,
} from '../../../data/models/cachedCompanyData.js';

const QICHACHA_PROVIDER = 'qichacha';
const QICHACHA_API_URL = 'https://api.qichacha.com/Company/GetCompanyDetail';
const DEFAULT_TIMEOUT_MS = 15000;

const normalizeText = (value = '') => String(value || '').trim();

const compactObject = (value = {}) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (Array.isArray(item)) {
        return item.length > 0;
      }

      return item !== undefined && item !== null && item !== '';
    }),
  );
};

const readFirstValue = (source = {}, keys = []) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
};

const normalizeArray = (value = []) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
};

const normalizeShareholder = (item = {}) => {
  return compactObject({
    name: readFirstValue(item, ['StockName', 'Name', 'PartnerName', 'ShareholderName']),
    type: readFirstValue(item, ['StockType', 'Type', 'PartnerType']),
    subscribedCapital: readFirstValue(item, [
      'ShouldCapi',
      'SubscribedCapital',
      'SubscriptedCapital',
    ]),
    paidInCapital: readFirstValue(item, ['RealCapi', 'PaidInCapital', 'ActualCapital']),
    ratio: readFirstValue(item, ['StockPercent', 'ShareRatio', 'Percent', 'Ratio']),
  });
};

const normalizeExecutionRecord = (item = {}) => {
  return compactObject({
    caseNo: readFirstValue(item, ['CaseCode', 'CaseNo', 'No']),
    court: readFirstValue(item, ['Court', 'ExecuteCourtName', 'CourtName']),
    amount: readFirstValue(item, ['ExecMoney', 'ExecutionAmount', 'Amount']),
    filingDate: readFirstValue(item, ['Liandate', 'FilingDate', 'CaseCreateTime']),
    status: readFirstValue(item, ['Status', 'State']),
  });
};

const normalizeDishonestRecord = (item = {}) => {
  return compactObject({
    caseNo: readFirstValue(item, ['CaseCode', 'CaseNo', 'No']),
    court: readFirstValue(item, ['Court', 'CourtName', 'ExecuteCourtName']),
    publishDate: readFirstValue(item, ['PublishDate', 'PublishTime', 'PostDate']),
    performanceStatus: readFirstValue(item, ['Performance', 'PerformanceStatus', 'Executestatus']),
    obligation: readFirstValue(item, ['Yiwu', 'Obligation', 'Duty']),
  });
};

const extractCompanyDetail = (payload = {}) => {
  const result = payload.Result || payload.result || payload.Data || payload.data || payload;
  const shareholders = normalizeArray(
    readFirstValue(result, ['Partners', 'PartnerList', 'Shareholders', 'ShareholderList']),
  ).map(normalizeShareholder);
  const executionRecords = normalizeArray(
    readFirstValue(result, [
      'ExecutionRecords',
      'ExecuteInfo',
      'ZhixingList',
      'ExecutedPersonList',
      'Beizhixingren',
    ]),
  ).map(normalizeExecutionRecord);
  const dishonestRecords = normalizeArray(
    readFirstValue(result, [
      'DishonestRecords',
      'ShixinList',
      'DishonestInfo',
      'ShiXinRenList',
      'LostCreditList',
    ]),
  ).map(normalizeDishonestRecord);

  return compactObject({
    companyName: readFirstValue(result, ['Name', 'CompanyName', 'EntName']),
    enterpriseStatus: readFirstValue(result, ['Status', 'RegStatus', 'EnterpriseStatus']),
    legalRepresentative: readFirstValue(result, ['OperName', 'LegalPerson', 'LegalRepresentative']),
    registeredCapital: readFirstValue(result, ['RegistCapi', 'RegisteredCapital', 'RegCapital']),
    paidInCapital: readFirstValue(result, ['RecCap', 'PaidInCapital', 'ActualCapital']),
    registrationNo: readFirstValue(result, ['No', 'RegNo', 'RegistrationNo']),
    unifiedSocialCreditCode: readFirstValue(result, ['CreditCode', 'SocialCreditCode']),
    organizationCode: readFirstValue(result, ['OrgNo', 'OrganizationCode']),
    startDate: readFirstValue(result, ['StartDate', 'TermStart']),
    approvedDate: readFirstValue(result, ['CheckDate', 'ApprovedDate']),
    registrationAuthority: readFirstValue(result, ['BelongOrg', 'RegistrationAuthority']),
    companyType: readFirstValue(result, ['EconKind', 'CompanyType']),
    address: readFirstValue(result, ['Address']),
    businessScope: readFirstValue(result, ['Scope', 'BusinessScope']),
    shareholders,
    executionRecords,
    dishonestRecords,
  });
};

const trimCompanyData = (rawData = {}) => {
  const detail = rawData?.data && typeof rawData.data === 'object' ? rawData.data : rawData;

  return compactObject({
    companyName: readFirstValue(detail, ['companyName', 'CompanyName', 'Name', 'EntName']),
    creditCode: readFirstValue(detail, [
      'creditCode',
      'unifiedSocialCreditCode',
      'CreditCode',
      'SocialCreditCode',
    ]),
    registeredCapital: readFirstValue(detail, [
      'registeredCapital',
      'RegisteredCapital',
      'RegistCapi',
      'RegCapital',
    ]),
    paidCapital: readFirstValue(detail, ['paidCapital', 'paidInCapital', 'PaidCapital', 'RecCap']),
    companyStatus: readFirstValue(detail, [
      'companyStatus',
      'enterpriseStatus',
      'CompanyStatus',
      'Status',
      'RegStatus',
    ]),
    legalRepresentative: readFirstValue(detail, [
      'legalRepresentative',
      'LegalRepresentative',
      'OperName',
      'LegalPerson',
    ]),
    riskInfo: {
      executionRecords: normalizeArray(
        readFirstValue(detail, ['executionRecords', 'ExecutionRecords']),
      ).map((item) =>
        compactObject({
          amount: readFirstValue(item, ['amount', 'Amount', 'ExecMoney']),
          date: readFirstValue(item, ['date', 'Date', 'filingDate', 'Liandate']),
          reason: readFirstValue(item, ['reason', 'Reason', 'caseNo', 'CaseCode']),
          court: readFirstValue(item, ['court', 'Court', 'ExecuteCourtName']),
          status: readFirstValue(item, ['status', 'Status', 'State']),
        }),
      ),
      dishonestyRecords: normalizeArray(
        readFirstValue(detail, ['dishonestRecords', 'dishonestyRecords', 'DishonestyRecords']),
      ).map((item) =>
        compactObject({
          date: readFirstValue(item, ['date', 'Date', 'publishDate', 'PublishDate']),
          description: readFirstValue(item, [
            'description',
            'Description',
            'obligation',
            'Obligation',
          ]),
          court: readFirstValue(item, ['court', 'Court', 'CourtName']),
          performanceStatus: readFirstValue(item, [
            'performanceStatus',
            'PerformanceStatus',
            'Performance',
          ]),
        }),
      ),
    },
    operationInfo: {
      shareholders: normalizeArray(readFirstValue(detail, ['shareholders', 'Shareholders'])).map(
        (item) =>
          compactObject({
            name: readFirstValue(item, ['name', 'Name', 'StockName']),
            ratio: readFirstValue(item, ['ratio', 'Ratio', 'StockPercent']),
            subscribedCapital: readFirstValue(item, ['subscribedCapital', 'ShouldCapi']),
            paidInCapital: readFirstValue(item, ['paidInCapital', 'RealCapi']),
          }),
      ),
      businessScope: readFirstValue(detail, ['businessScope', 'BusinessScope', 'Scope']),
      registrationAuthority: readFirstValue(detail, [
        'registrationAuthority',
        'RegistrationAuthority',
        'BelongOrg',
      ]),
    },
  });
};

const buildCacheDataPayload = (trimmedData = {}, rawResponse = {}) => ({
  basicInfo: compactObject({
    companyName: trimmedData.companyName,
    creditCode: trimmedData.creditCode,
    registeredCapital: trimmedData.registeredCapital,
    paidCapital: trimmedData.paidCapital,
    companyStatus: trimmedData.companyStatus,
    legalRepresentative: trimmedData.legalRepresentative,
  }),
  riskInfo: trimmedData.riskInfo || {},
  operationInfo: trimmedData.operationInfo || {},
  rawResponse,
});

const mergeCachedCompanyData = (cachedRecord = {}) => {
  return compactObject({
    ...(cachedRecord.basicInfo || {}),
    riskInfo: cachedRecord.riskInfo || {},
    operationInfo: cachedRecord.operationInfo || {},
  });
};

const readCacheSafely = (companyName = '') => {
  try {
    return getCachedCompany(companyName);
  } catch (error) {
    console.warn('[qichacha] cache lookup failed, falling back to API:', error.message);
    return null;
  }
};

const saveCacheSafely = ({ companyName = '', creditCode = '', trimmedData = {}, rawResponse = {} } = {}) => {
  try {
    return saveCompanyData(
      companyName,
      creditCode || trimmedData.creditCode || '',
      buildCacheDataPayload(trimmedData, rawResponse),
    );
  } catch (error) {
    console.warn('[qichacha] cache save failed:', error.message);
    return null;
  }
};

export const query_qichacha_company = async (company_name = '') => {
  const companyName =
    company_name && typeof company_name === 'object' ? company_name.company_name : company_name;
  const normalizedCompanyName = normalizeText(companyName);
  if (!normalizedCompanyName) {
    return {
      error: 'company_name is required',
    };
  }

  const cachedRecord = readCacheSafely(normalizedCompanyName);
  const cacheValidity = cachedRecord
    ? {
        basic: isCacheValid(cachedRecord, 'basic'),
        risk: isCacheValid(cachedRecord, 'risk'),
        operation: isCacheValid(cachedRecord, 'operation'),
      }
    : null;

  if (cachedRecord && cacheValidity.basic && cacheValidity.risk && cacheValidity.operation) {
    return {
      provider: QICHACHA_PROVIDER,
      api_key_ref: cachedRecord.dataSource,
      company_name: normalizedCompanyName,
      data: mergeCachedCompanyData(cachedRecord),
      cache_hit: true,
      cacheHit: true,
      cache_validity: cacheValidity,
      fetched_at: cachedRecord.fetchedAt,
    };
  }

  const connection = getConnection(QICHACHA_PROVIDER);
  if (!connection) {
    if (cachedRecord) {
      return {
        provider: QICHACHA_PROVIDER,
        company_name: normalizedCompanyName,
        data: mergeCachedCompanyData(cachedRecord),
        cache_hit: true,
        cache_stale: true,
        cache_validity: cacheValidity,
        warning: 'qichacha external connection is not configured; returned stale cache',
      };
    }

    return {
      error: 'qichacha external connection is not configured',
      provider: QICHACHA_PROVIDER,
    };
  }

  if (!connection.isActive) {
    if (cachedRecord) {
      return {
        provider: QICHACHA_PROVIDER,
        company_name: normalizedCompanyName,
        data: mergeCachedCompanyData(cachedRecord),
        cache_hit: true,
        cache_stale: true,
        cache_validity: cacheValidity,
        warning: 'qichacha external connection is disabled; returned stale cache',
      };
    }

    return {
      error: 'qichacha external connection is disabled',
      provider: QICHACHA_PROVIDER,
      api_key_ref: connection.api_key_ref,
    };
  }

  const apiKey = normalizeText(process.env.KEY_QICHACHA);
  if (!apiKey) {
    if (cachedRecord) {
      return {
        provider: QICHACHA_PROVIDER,
        company_name: normalizedCompanyName,
        data: mergeCachedCompanyData(cachedRecord),
        cache_hit: true,
        cache_stale: true,
        cache_validity: cacheValidity,
        warning: 'KEY_QICHACHA is not configured; returned stale cache',
      };
    }

    return {
      error: 'KEY_QICHACHA is not configured',
      provider: QICHACHA_PROVIDER,
      api_key_ref: connection.api_key_ref,
    };
  }

  try {
    const response = await axios.get(QICHACHA_API_URL, {
      params: {
        key: apiKey,
        companyName: normalizedCompanyName,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const payload = response.data || {};
    const status = normalizeText(payload.Status || payload.status || payload.Code || payload.code);
    const message = normalizeText(payload.Message || payload.message || payload.Msg || payload.msg);

    if (status && !['200', 'Success', 'success', 'OK', 'ok'].includes(status)) {
      return {
        error: message || `qichacha api returned status ${status}`,
        provider: QICHACHA_PROVIDER,
        api_key_ref: connection.api_key_ref,
        status,
      };
    }

    const extractedDetail = extractCompanyDetail(payload);
    const trimmedData = trimCompanyData(extractedDetail);
    const savedCache = saveCacheSafely({
      companyName: trimmedData.companyName || normalizedCompanyName,
      creditCode: trimmedData.creditCode || extractedDetail.unifiedSocialCreditCode || '',
      trimmedData,
      rawResponse: payload,
    });

    return {
      provider: QICHACHA_PROVIDER,
      api_key_ref: connection.api_key_ref,
      company_name: normalizedCompanyName,
      data: trimmedData,
      raw_status: status || 'unknown',
      raw_message: message,
      cache_hit: false,
      cacheHit: false,
      cache_updated: Boolean(savedCache),
      cacheUpdated: Boolean(savedCache),
    };
  } catch (error) {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;
    const responseMessage =
      responseData?.Message || responseData?.message || responseData?.Msg || responseData?.msg;

    if (cachedRecord) {
      return {
        provider: QICHACHA_PROVIDER,
        api_key_ref: connection.api_key_ref,
        company_name: normalizedCompanyName,
        data: mergeCachedCompanyData(cachedRecord),
        cache_hit: true,
        cache_stale: true,
        cache_validity: cacheValidity,
        warning:
          normalizeText(responseMessage) ||
          normalizeText(error.message) ||
          'qichacha api request failed; returned stale cache',
        status_code: statusCode || 0,
      };
    }

    return {
      error:
        normalizeText(responseMessage) ||
        normalizeText(error.message) ||
        'qichacha api request failed',
      provider: QICHACHA_PROVIDER,
      api_key_ref: connection.api_key_ref,
      status_code: statusCode || 0,
    };
  }
};

const qichachaCompanyTool = {
  name: 'query_qichacha_company',
  description:
    '查询企查查企业基础信息，返回企业状态、注册资本、实缴资本、股东、被执行人和失信记录等结构化结果。',
  parameters: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: '需要查询的企业全称或关键词。',
      },
    },
    required: ['company_name'],
    additionalProperties: false,
  },
  function: query_qichacha_company,
};

export default qichachaCompanyTool;
