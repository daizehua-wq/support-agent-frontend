import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const mapPrompt = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    system_prompt: row.system_prompt || '',
    systemPrompt: row.system_prompt || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

export const getAppPrompt = (appId = '') => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId) {
    return null;
  }

  return mapPrompt(
    getDb().prepare('SELECT * FROM app_prompts WHERE app_id = ?').get(normalizedAppId),
  );
};

export const getPromptByAppId = (appId = '') => {
  const prompt = getAppPrompt(appId);
  return prompt?.systemPrompt || null;
};

export const upsertPrompt = (appId = '', systemPrompt = '') => {
  const normalizedAppId = normalizeText(appId);
  const normalizedPrompt = normalizeText(systemPrompt);

  if (!normalizedAppId) {
    throw new Error('app_id is required');
  }

  getDb()
    .prepare(
      `
      INSERT INTO app_prompts (app_id, system_prompt, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(app_id) DO UPDATE SET
        system_prompt = excluded.system_prompt,
        updated_at = CURRENT_TIMESTAMP
      `,
    )
    .run(normalizedAppId, normalizedPrompt);

  return getAppPrompt(normalizedAppId);
};
