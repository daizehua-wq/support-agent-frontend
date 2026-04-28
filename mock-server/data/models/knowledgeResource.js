import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

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

const stringifyField = (value = '') => {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value);
  }

  return normalizeText(value);
};

const normalizeBoolean = (value = false) => {
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  return Boolean(value);
};

const parseApplicableScenarios = (value = '') => {
  const parsed = safeJsonParse(value, null);
  return parsed ?? normalizeText(value);
};

const getScenarioList = (applicableScenarios = '') => {
  if (Array.isArray(applicableScenarios)) {
    return applicableScenarios;
  }

  if (applicableScenarios && typeof applicableScenarios === 'object') {
    return applicableScenarios.scenes || applicableScenarios.applicableScenes || [];
  }

  return normalizeText(applicableScenarios)
    .split(/[,，/]+/)
    .map(normalizeText)
    .filter(Boolean);
};

const CATEGORY_ALIAS_DEFINITIONS = [
  {
    value: 'spec',
    label: '制度规范',
    aliases: ['spec', '规格书', '规范资料', '制度规范'],
  },
  {
    value: 'faq',
    label: '流程 SOP',
    aliases: ['faq', 'FAQ', '常见问题', '流程 SOP', '流程SOP'],
  },
  {
    value: 'case',
    label: '复盘纪要',
    aliases: ['case', '案例资料', '案例', '复盘材料', '复盘纪要'],
  },
  {
    value: 'project',
    label: '项目文档',
    aliases: ['project', '项目资料', '项目文档', '数据库记录'],
  },
];

const normalizeCategoryKey = (value = '') => normalizeText(value).toLowerCase();

const resolveDocumentCategory = (rawCategory = '') => {
  const normalizedCategory = normalizeCategoryKey(rawCategory);
  const matchedDefinition = CATEGORY_ALIAS_DEFINITIONS.find((definition) =>
    definition.aliases.some((alias) => normalizeCategoryKey(alias) === normalizedCategory),
  );

  if (matchedDefinition) {
    return {
      value: matchedDefinition.value,
      label: matchedDefinition.label,
    };
  }

  const fallbackCategory = normalizeText(rawCategory);

  return {
    value: fallbackCategory,
    label: fallbackCategory,
  };
};

const mapResource = (row = null) => {
  if (!row) {
    return null;
  }

  const applicableScenarios = parseApplicableScenarios(row.applicable_scenarios);
  const legacyProduct =
    applicableScenarios &&
    typeof applicableScenarios === 'object' &&
    !Array.isArray(applicableScenarios)
      ? applicableScenarios.legacyProduct || null
      : null;
  const legacyDocument =
    applicableScenarios &&
    typeof applicableScenarios === 'object' &&
    !Array.isArray(applicableScenarios)
      ? applicableScenarios.legacyDocument || null
      : null;

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    domain_type: row.domain_type || '',
    domainType: row.domain_type || '',
    title: row.title || '',
    summary: row.summary || '',
    applicable_scenarios: applicableScenarios,
    applicableScenarios: getScenarioList(applicableScenarios),
    is_shareable: Number(row.is_shareable || 0),
    isShareable: Boolean(row.is_shareable),
    content_type: row.content_type || '',
    contentType: row.content_type || '',
    link: row.link || '',
    legacyProduct,
    legacyDocument,
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const collectSearchText = (resource = {}) => {
  return [
    resource.domainType,
    resource.title,
    resource.summary,
    resource.contentType,
    resource.link,
    JSON.stringify(resource.applicable_scenarios || ''),
    JSON.stringify(resource.legacyProduct || {}),
    JSON.stringify(resource.legacyDocument || {}),
  ]
    .join(' ')
    .toLowerCase();
};

const matchesKeyword = (resource = {}, keyword = '') => {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  const legacyKeywords = Array.isArray(resource.legacyProduct?.keywords)
    ? resource.legacyProduct.keywords
    : [];
  const keywordHit = legacyKeywords.some((item) => {
    const normalizedItem = normalizeText(item).toLowerCase();
    return normalizedKeyword.includes(normalizedItem) || normalizedItem.includes(normalizedKeyword);
  });

  return keywordHit || collectSearchText(resource).includes(normalizedKeyword);
};

const buildResourceParams = (data = {}) => {
  return {
    id: normalizeText(data.id) || randomUUID(),
    appId: normalizeText(data.appId || data.app_id),
    domainType:
      normalizeText(data.domainType || data.domain_type || data.domain) || 'general',
    title: normalizeText(data.title),
    summary: normalizeText(data.summary),
    applicableScenarios: stringifyField(
      data.applicableScenarios ?? data.applicable_scenarios ?? [],
    ),
    isShareable: normalizeBoolean(data.isShareable ?? data.is_shareable),
    contentType: normalizeText(data.contentType || data.content_type),
    link: normalizeText(data.link),
  };
};

const queryResources = (filters = {}, options = {}) => {
  const clauses = ['1 = 1'];
  const params = [];
  const normalizedAppId = normalizeText(filters.appId || filters.app_id);
  const normalizedDomain = normalizeText(filters.domainType || filters.domain_type || filters.domain);
  const normalizedContentType = normalizeText(filters.contentType || filters.content_type);

  if (options.includeAllApps !== true) {
    if (normalizedAppId) {
      clauses.push('(app_id IS NULL OR app_id = ?)');
      params.push(normalizedAppId);
    } else {
      clauses.push('app_id IS NULL');
    }
  }

  if (normalizedDomain && !options.relaxDomain) {
    clauses.push('(domain_type = ? OR domain_type LIKE ?)');
    params.push(normalizedDomain, `%${normalizedDomain}%`);
  }

  if (normalizedContentType) {
    clauses.push('(content_type = ? OR content_type LIKE ?)');
    params.push(normalizedContentType, `%${normalizedContentType}%`);
  }

  if (normalizeBoolean(filters.onlyShareable)) {
    clauses.push('is_shareable = 1');
  }

  const orderParams = [];
  const appPriorityOrder =
    normalizedAppId && options.includeAllApps !== true
      ? 'CASE WHEN app_id = ? THEN 0 ELSE 1 END,'
      : '';
  if (appPriorityOrder) {
    orderParams.push(normalizedAppId);
  }

  return getDb()
    .prepare(
      `
      SELECT * FROM knowledge_resources
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${appPriorityOrder} datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all(...params, ...orderParams)
    .map(mapResource);
};

export const listResources = (filters = {}) =>
  queryResources(filters, {
    includeAllApps: filters.includeAllApps === true || filters.includeAllApps === 'true',
  });

export const searchResources = (filters = {}) => {
  const keyword = normalizeText(filters.keyword || filters.text || filters.query);
  let resources = queryResources(filters).filter((resource) => matchesKeyword(resource, keyword));

  if (resources.length === 0 && normalizeText(filters.domainType || filters.domain_type || filters.domain)) {
    resources = queryResources(filters, { relaxDomain: true }).filter((resource) =>
      matchesKeyword(resource, keyword),
    );
  }

  return resources;
};

export const listResourceCategories = (filters = {}) => {
  const resources = queryResources(filters, {
    includeAllApps: filters.includeAllApps === true || filters.includeAllApps === 'true',
  });
  const categoryMap = new Map();

  resources.forEach((resource) => {
    if (resource.legacyProduct && !resource.legacyDocument) {
      return;
    }

    const rawCategory = normalizeText(resource.legacyDocument?.docType || resource.contentType);

    if (!rawCategory) {
      return;
    }

    const resolvedCategory = resolveDocumentCategory(rawCategory);

    if (!resolvedCategory.value) {
      return;
    }

    const existing = categoryMap.get(resolvedCategory.value) || {
      value: resolvedCategory.value,
      label: resolvedCategory.label,
      count: 0,
      sourceValues: [],
    };

    existing.count += 1;

    if (!existing.sourceValues.includes(rawCategory)) {
      existing.sourceValues.push(rawCategory);
    }

    categoryMap.set(resolvedCategory.value, existing);
  });

  return Array.from(categoryMap.values()).sort((a, b) => {
    const countDiff = Number(b.count || 0) - Number(a.count || 0);

    if (countDiff !== 0) {
      return countDiff;
    }

    return String(a.label || '').localeCompare(String(b.label || ''), 'zh-Hans-CN');
  });
};

export const createResource = (data = {}) => {
  const resource = buildResourceParams(data);

  if (!resource.title) {
    throw new Error('title is required');
  }

  getDb().prepare(
    `
    INSERT INTO knowledge_resources (
      id,
      app_id,
      domain_type,
      title,
      summary,
      applicable_scenarios,
      is_shareable,
      content_type,
      link
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    resource.id,
    resource.appId || null,
    resource.domainType,
    resource.title,
    resource.summary,
    resource.applicableScenarios,
    resource.isShareable ? 1 : 0,
    resource.contentType,
    resource.link,
  );

  return mapResource(
    getDb().prepare('SELECT * FROM knowledge_resources WHERE id = ?').get(resource.id),
  );
};

export const updateResource = (id = '', data = {}) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = mapResource(
    getDb().prepare('SELECT * FROM knowledge_resources WHERE id = ?').get(normalizedId),
  );

  if (!existing) {
    return null;
  }

  const next = buildResourceParams({
    ...existing,
    ...data,
    id: normalizedId,
    appId: data.appId ?? data.app_id ?? existing.appId,
    domainType: data.domainType ?? data.domain_type ?? existing.domainType,
    applicableScenarios:
      data.applicableScenarios ?? data.applicable_scenarios ?? existing.applicable_scenarios,
    isShareable: data.isShareable ?? data.is_shareable ?? existing.isShareable,
    contentType: data.contentType ?? data.content_type ?? existing.contentType,
  });

  if (!next.title) {
    throw new Error('title is required');
  }

  getDb().prepare(
    `
    UPDATE knowledge_resources
    SET app_id = ?,
        domain_type = ?,
        title = ?,
        summary = ?,
        applicable_scenarios = ?,
        is_shareable = ?,
        content_type = ?,
        link = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(
    next.appId || null,
    next.domainType,
    next.title,
    next.summary,
    next.applicableScenarios,
    next.isShareable ? 1 : 0,
    next.contentType,
    next.link,
    normalizedId,
  );

  return mapResource(
    getDb().prepare('SELECT * FROM knowledge_resources WHERE id = ?').get(normalizedId),
  );
};

export const deleteResource = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM knowledge_resources WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};
