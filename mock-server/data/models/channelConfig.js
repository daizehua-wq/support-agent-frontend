import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safeJsonParse = (value = '', fallback = {}) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeStatus = (value = 'active') => {
  const normalized = normalizeText(value).toLowerCase();
  return ['active', 'disabled'].includes(normalized) ? normalized : 'active';
};

const normalizeCreator = (value = 'human') => {
  return normalizeText(value).toLowerCase() === 'p5' ? 'p5' : 'human';
};

const normalizeChannelType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  const mapping = {
    飞书: 'feishu',
    feishu: 'feishu',
    lark: 'feishu',
    钉钉: 'dingtalk',
    dingtalk: 'dingtalk',
    企业微信: 'wecom',
    企微: 'wecom',
    wecom: 'wecom',
    wechat_work: 'wecom',
  };

  return mapping[normalized] || normalized || 'custom';
};

const maskValue = (value = '') => {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`;
  }

  return `${text.slice(0, 4)}***${text.slice(-3)}`;
};

const buildConfigSummary = (config = {}) => {
  if (!isPlainObject(config)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      const textValue = typeof value === 'string' ? value : JSON.stringify(value);
      const isSecret = /(secret|token|key|password|密钥|令牌)/i.test(key);
      return [key, isSecret ? maskValue(textValue) : textValue];
    }),
  );
};

const mapChannel = (row = null) => {
  if (!row) {
    return null;
  }

  const config = safeJsonParse(row.config_json, {});

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    channel_type: row.channel_type || '',
    channelType: row.channel_type || '',
    channel_name: row.channel_name || '',
    channelName: row.channel_name || '',
    config,
    config_json: row.config_json || '{}',
    configJson: row.config_json || '{}',
    configSummary: buildConfigSummary(config),
    status: row.status || 'active',
    created_by: row.created_by || 'human',
    createdBy: row.created_by || 'human',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const normalizeConfig = (data = {}) => {
  if (isPlainObject(data.config)) {
    return data.config;
  }

  if (isPlainObject(data.config_json)) {
    return data.config_json;
  }

  if (typeof data.config_json === 'string') {
    return safeJsonParse(data.config_json, {});
  }

  return {};
};

const validateRequiredChannelFields = ({
  channelType = '',
  channelName = '',
  appId = '',
  config = {},
} = {}) => {
  const missingFields = [];

  if (!normalizeText(channelType)) {
    missingFields.push('channelType');
  }

  if (!normalizeText(channelName)) {
    missingFields.push('channelName');
  }

  if (!normalizeText(appId)) {
    missingFields.push('appId');
  }

  if (!normalizeText(config.app_id || config.appId)) {
    missingFields.push('config.app_id');
  }

  if (!normalizeText(config.app_secret || config.appSecret)) {
    missingFields.push('config.app_secret');
  }

  if (missingFields.length > 0) {
    throw new Error(`missing required channel fields: ${missingFields.join(', ')}`);
  }
};

export const createChannel = (data = {}) => {
  const channelType = normalizeChannelType(data.channelType || data.channel_type);
  const channelName = normalizeText(data.channelName || data.channel_name);
  const config = normalizeConfig(data);
  const appId = normalizeText(data.appId || data.app_id);

  validateRequiredChannelFields({
    channelType,
    channelName,
    appId,
    config,
  });

  getDb()
    .prepare(
      `
      INSERT INTO channel_configs (
        app_id,
        channel_type,
        channel_name,
        config_json,
        status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      appId,
      channelType,
      channelName,
      JSON.stringify(config),
      normalizeStatus(data.status || 'active'),
      normalizeCreator(data.createdBy || data.created_by || 'human'),
    );

  return mapChannel(
    getDb().prepare('SELECT * FROM channel_configs WHERE id = last_insert_rowid()').get(),
  );
};

export const getChannel = (id = '') => {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId)) {
    return null;
  }

  return mapChannel(getDb().prepare('SELECT * FROM channel_configs WHERE id = ?').get(normalizedId));
};

export const listChannels = (appId = '', options = {}) => {
  const normalizedAppId = normalizeText(appId);
  const includeDisabled =
    options.includeDisabled === true ||
    options.includeDisabled === 'true' ||
    options.status === 'all';
  const status = normalizeStatus(options.status || 'active');
  const clauses = [];
  const params = [];

  if (normalizedAppId) {
    clauses.push('app_id = ?');
    params.push(normalizedAppId);
  }

  if (!includeDisabled) {
    clauses.push('status = ?');
    params.push(status);
  }

  return getDb()
    .prepare(
      `
      SELECT *
      FROM channel_configs
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all(...params)
    .map(mapChannel);
};

export const updateChannel = (id = '', data = {}) => {
  const existing = getChannel(id);
  if (!existing) {
    return null;
  }

  const nextConfig = {
    ...(isPlainObject(existing.config) ? existing.config : {}),
    ...normalizeConfig(data),
  };
  const nextAppId = normalizeText(data.appId ?? data.app_id ?? existing.appId);
  const nextChannelType = normalizeChannelType(data.channelType ?? data.channel_type ?? existing.channelType);
  const nextChannelName = normalizeText(data.channelName ?? data.channel_name ?? existing.channelName);

  validateRequiredChannelFields({
    channelType: nextChannelType,
    channelName: nextChannelName,
    appId: nextAppId,
    config: nextConfig,
  });

  getDb()
    .prepare(
      `
      UPDATE channel_configs
      SET app_id = ?,
          channel_type = ?,
          channel_name = ?,
          config_json = ?,
          status = ?,
          created_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    )
    .run(
      nextAppId,
      nextChannelType,
      nextChannelName,
      JSON.stringify(nextConfig),
      normalizeStatus(data.status ?? existing.status),
      normalizeCreator(data.createdBy ?? data.created_by ?? existing.createdBy),
      existing.id,
    );

  return getChannel(existing.id);
};

export const deleteChannel = (id = '') => {
  const existing = getChannel(id);
  if (!existing) {
    return false;
  }

  const result = getDb()
    .prepare(
      `
      UPDATE channel_configs
      SET status = 'disabled',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    )
    .run(existing.id);

  return result.changes > 0;
};

export default {
  createChannel,
  getChannel,
  listChannels,
  updateChannel,
  deleteChannel,
};
