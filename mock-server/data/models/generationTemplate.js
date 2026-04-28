import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeCreator = (value = 'human') => {
  return normalizeText(value).toLowerCase() === 'p5' ? 'p5' : 'human';
};

const normalizeTemplateStatus = (value = 'active', fallback = 'active') => {
  const normalized = normalizeText(value || fallback).toLowerCase();
  return ['active', 'disabled', 'deprecated'].includes(normalized) ? normalized : fallback;
};

const clampRating = (value = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.min(5, Math.max(0, numberValue));
};

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

export const extractTemplateVariables = (templateContent = '') => {
  const variables = new Set();
  const templateText = String(templateContent || '');
  const placeholderPattern = /\{([a-zA-Z0-9_.-]+)\}/g;
  let match = placeholderPattern.exec(templateText);

  while (match) {
    if (match[1]) {
      variables.add(match[1]);
    }
    match = placeholderPattern.exec(templateText);
  }

  return Array.from(variables);
};

const hasVariableValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return normalizeText(value) !== '';
};

const resolveVariableValue = (variables = {}, key = '') => {
  if (!key) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(variables, key)) {
    return variables[key];
  }

  return key.split('.').reduce((cursor, segment) => {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }

    return cursor[segment];
  }, variables);
};

export const allVariablesAvailable = (templateContent = '', variables = {}) => {
  return extractTemplateVariables(templateContent).every((key) =>
    hasVariableValue(resolveVariableValue(variables, key)),
  );
};

export const renderTemplate = (templateContent = '', variables = {}) => {
  return String(templateContent || '').replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    const value = resolveVariableValue(variables, key);

    if (!hasVariableValue(value)) {
      return match;
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizeText(item)).filter(Boolean).join('、');
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
};

const mapTemplate = (row = null) => {
  if (!row) {
    return null;
  }

  const variables = safeJsonParse(row.variables, row.variables || {});

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    scene: row.scene || '',
    output_target: row.output_target || '',
    outputTarget: row.output_target || '',
    toneStyle:
      variables && typeof variables === 'object' && !Array.isArray(variables)
        ? variables.toneStyle || variables.legacyTemplate?.toneStyle || ''
        : '',
    keywords:
      variables && typeof variables === 'object' && Array.isArray(variables.keywords)
        ? variables.keywords
        : variables?.legacyTemplate?.keywords || [],
    template_content: row.template_content || '',
    templateContent: row.template_content || '',
    template: row.template_content || '',
    variables,
    legacyTemplate:
      variables && typeof variables === 'object' && variables.legacyTemplate
        ? variables.legacyTemplate
        : null,
    created_by: row.created_by || 'human',
    createdBy: row.created_by || 'human',
    usage_count: Number(row.usage_count || 0),
    usageCount: Number(row.usage_count || 0),
    avg_rating: Number(row.avg_rating || 0),
    avgRating: Number(row.avg_rating || 0),
    status: row.status || 'active',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const buildTemplateParams = (data = {}) => {
  return {
    id: normalizeText(data.id) || randomUUID(),
    appId: normalizeText(data.appId || data.app_id),
    scene: normalizeText(data.scene) || 'general',
    outputTarget: normalizeText(data.outputTarget || data.output_target || data.toneStyle),
    templateContent: normalizeText(
      data.templateContent || data.template_content || data.template,
    ),
    variables: stringifyField(data.variables || {}),
    createdBy: normalizeCreator(data.createdBy || data.created_by || 'human'),
    usageCount: Math.max(0, Number(data.usageCount ?? data.usage_count ?? 0) || 0),
    avgRating: clampRating(data.avgRating ?? data.avg_rating ?? 0),
    status: normalizeTemplateStatus(data.status || 'active'),
  };
};

export const listTemplates = (filters = {}) => {
  const scene = normalizeText(filters.scene);
  const includeInactive = filters.includeInactive === true || filters.includeInactive === 'true';
  const status = normalizeText(filters.status);
  const appId = normalizeText(filters.appId || filters.app_id);
  const clauses = [];
  const params = [];

  if (filters.includeAllApps !== true && filters.includeAllApps !== 'true') {
    if (appId) {
      clauses.push('(app_id IS NULL OR app_id = ?)');
      params.push(appId);
    } else {
      clauses.push('app_id IS NULL');
    }
  }

  if (!includeInactive) {
    clauses.push("status = 'active'");
  } else if (status && status !== 'all') {
    clauses.push('status = ?');
    params.push(normalizeTemplateStatus(status, 'active'));
  }

  const orderParams = [];
  const appPriorityOrder =
    appId && filters.includeAllApps !== true && filters.includeAllApps !== 'true'
      ? 'CASE WHEN app_id = ? THEN 0 ELSE 1 END,'
      : '';
  if (appPriorityOrder) {
    orderParams.push(appId);
  }

  if (scene) {
    clauses.push('(scene = ? OR scene LIKE ?)');
    params.push(scene, `%${scene}%`);

    return getDb()
      .prepare(
        `
        SELECT * FROM generation_templates
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${appPriorityOrder} datetime(updated_at) DESC, datetime(created_at) DESC
        `,
      )
      .all(...params, ...orderParams)
      .map(mapTemplate);
  }

  return getDb()
    .prepare(
      `
      SELECT * FROM generation_templates
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ${appPriorityOrder} datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all(...params, ...orderParams)
    .map(mapTemplate);
};

export const getTemplateByScene = (scene = '', filters = {}) => {
  const normalizedScene = normalizeText(scene) || 'first_reply';
  return (
    listTemplates({ ...filters, scene: normalizedScene })[0] ||
    listTemplates({ ...filters, scene: 'first_reply' })[0] ||
    null
  );
};

export const createTemplate = (data = {}) => {
  const template = buildTemplateParams(data);

  if (!template.templateContent) {
    throw new Error('template_content is required');
  }

  getDb().prepare(
    `
    INSERT INTO generation_templates (
      id,
      app_id,
      scene,
      output_target,
      template_content,
      variables,
      created_by,
      usage_count,
      avg_rating,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    template.id,
    template.appId || null,
    template.scene,
    template.outputTarget,
    template.templateContent,
    template.variables,
    template.createdBy,
    template.usageCount,
    template.avgRating,
    template.status,
  );

  return mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(template.id),
  );
};

export const updateTemplate = (id = '', data = {}) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(normalizedId),
  );

  if (!existing) {
    return null;
  }

  const next = buildTemplateParams({
    ...existing,
    ...data,
    id: normalizedId,
    appId: data.appId ?? data.app_id ?? existing.appId,
    outputTarget: data.outputTarget ?? data.output_target ?? existing.outputTarget,
    templateContent:
      data.templateContent ?? data.template_content ?? data.template ?? existing.templateContent,
    variables: data.variables ?? existing.variables,
    createdBy: data.createdBy ?? data.created_by ?? existing.createdBy,
    usageCount: data.usageCount ?? data.usage_count ?? existing.usageCount,
    avgRating: data.avgRating ?? data.avg_rating ?? existing.avgRating,
    status: data.status ?? existing.status,
  });

  if (!next.templateContent) {
    throw new Error('template_content is required');
  }

  getDb().prepare(
    `
    UPDATE generation_templates
    SET app_id = ?,
        scene = ?,
        output_target = ?,
        template_content = ?,
        variables = ?,
        created_by = ?,
        usage_count = ?,
        avg_rating = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(
    next.appId || null,
    next.scene,
    next.outputTarget,
    next.templateContent,
    next.variables,
    next.createdBy,
    next.usageCount,
    next.avgRating,
    next.status,
    normalizedId,
  );

  return mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(normalizedId),
  );
};

export const deleteTemplate = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM generation_templates WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};

export const optimizeTemplates = (optimizations = []) => {
  const db = getDb();
  const updateStatus = db.prepare(
    `
    UPDATE generation_templates
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  );
  const apply = db.transaction((items) => {
    let affected = 0;

    items.forEach((item = {}) => {
      const id = normalizeText(item.id);
      const action = normalizeText(item.action);

      if (!id) {
        return;
      }

      if (action === 'enable') {
        affected += updateStatus.run('active', id).changes;
      } else if (action === 'disable') {
        affected += updateStatus.run('disabled', id).changes;
      } else if (action === 'deprecate') {
        affected += updateStatus.run('deprecated', id).changes;
      }
    });

    return affected;
  });

  return {
    affected: apply(Array.isArray(optimizations) ? optimizations : []),
  };
};

export const incrementUsage = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  getDb().prepare(
    `
    UPDATE generation_templates
    SET usage_count = COALESCE(usage_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(normalizedId);

  return mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(normalizedId),
  );
};

export const rateTemplate = (id = '', rating = 0) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(normalizedId),
  );

  if (!existing) {
    return null;
  }

  const nextRating = existing.avgRating
    ? Number((existing.avgRating * 0.8 + clampRating(rating) * 0.2).toFixed(2))
    : clampRating(rating);

  getDb().prepare(
    `
    UPDATE generation_templates
    SET avg_rating = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(nextRating, normalizedId);

  return mapTemplate(
    getDb().prepare('SELECT * FROM generation_templates WHERE id = ?').get(normalizedId),
  );
};

export const getLowPerformanceTemplates = (minRating = 2, maxUsage = 5) => {
  const normalizedRating = clampRating(minRating);
  const normalizedMaxUsage = Math.max(0, Number(maxUsage) || 5);

  return getDb()
    .prepare(
      `
      SELECT *
      FROM generation_templates
      WHERE status = 'active'
        AND COALESCE(avg_rating, 0) < ?
        AND COALESCE(usage_count, 0) <= ?
      ORDER BY COALESCE(avg_rating, 0) ASC,
               COALESCE(usage_count, 0) ASC,
               datetime(updated_at) ASC
      `,
    )
    .all(normalizedRating, normalizedMaxUsage)
    .map(mapTemplate);
};
