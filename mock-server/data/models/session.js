import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

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

const mapSession = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id || '',
    userId: row.user_id || '',
    app_id: row.app_id || '',
    appId: row.app_id || '',
    title: row.title || '',
    status: row.status || 'active',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const mapMessage = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    session_id: row.session_id,
    sessionId: row.session_id,
    app_id: row.app_id || '',
    appId: row.app_id || '',
    role: row.role,
    content: row.content || '',
    metadata: safeJsonParse(row.metadata, {}),
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
  };
};

export const createSession = (userId = 'admin', title = '未命名会话', options = {}) => {
  const db = getDb();
  const sessionId = normalizeText(options.id) || randomUUID();
  const normalizedUserId = normalizeText(userId) || 'admin';
  const normalizedTitle = normalizeText(title) || '未命名会话';
  const normalizedAppId = normalizeText(options.appId || options.app_id);

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (existing) {
    db.prepare(
      `
      UPDATE sessions
      SET user_id = COALESCE(NULLIF(?, ''), user_id),
          app_id = COALESCE(NULLIF(?, ''), app_id),
          title = COALESCE(NULLIF(?, ''), title),
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(normalizedUserId, normalizedAppId, normalizedTitle, sessionId);

    return mapSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId));
  }

  db.prepare(
    `
    INSERT INTO sessions (id, user_id, app_id, title, status)
    VALUES (?, ?, ?, ?, 'active')
    `,
  ).run(sessionId, normalizedUserId, normalizedAppId, normalizedTitle);

  return mapSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId));
};

export const getSession = (sessionId = '', options = {}) => {
  const db = getDb();
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedAppId = normalizeText(options.appId || options.app_id);
  if (!normalizedSessionId) {
    return null;
  }

  const session = mapSession(normalizedAppId
    ? db.prepare(
        `
        SELECT * FROM sessions
        WHERE id = ?
          AND app_id = ?
          AND status != ?
        `,
      ).get(normalizedSessionId, normalizedAppId, 'deleted')
    : db.prepare('SELECT * FROM sessions WHERE id = ? AND status != ?').get(
        normalizedSessionId,
        'deleted',
      ));

  if (!session) {
    return null;
  }

  const messages = db.prepare(
    `
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY datetime(created_at) ASC, id ASC
    `,
  ).all(normalizedSessionId).map(mapMessage);

  return {
    ...session,
    messages,
  };
};

export const appendMessage = (
  sessionId = '',
  { role = 'system', content = '', metadata = {}, appId = '', app_id = '' } = {},
) => {
  const db = getDb();
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedRole = normalizeText(role);
  let normalizedAppId = normalizeText(appId || app_id);

  if (!normalizedSessionId) {
    throw new Error('appendMessage requires sessionId');
  }

  if (!['user', 'assistant', 'system'].includes(normalizedRole)) {
    throw new Error(`invalid message role: ${normalizedRole}`);
  }

  const existing = db.prepare('SELECT id, app_id FROM sessions WHERE id = ?').get(normalizedSessionId);
  if (!existing) {
    createSession('admin', normalizedSessionId, { id: normalizedSessionId, appId: normalizedAppId });
  } else if (!normalizedAppId) {
    normalizedAppId = normalizeText(existing.app_id);
  }

  const transaction = db.transaction(() => {
    const result = db.prepare(
      `
      INSERT INTO messages (session_id, app_id, role, content, metadata)
      VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      normalizedSessionId,
      normalizedAppId,
      normalizedRole,
      String(content || ''),
      JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
    );

    db.prepare(
      `
      UPDATE sessions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(normalizedSessionId);

    return result.lastInsertRowid;
  });

  const messageId = transaction();
  return mapMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId));
};

export const listSessions = (userId = '') => {
  const db = getDb();
  const normalizedUserId = normalizeText(userId);

  const rows = normalizedUserId
    ? db.prepare(
        `
        SELECT * FROM sessions
        WHERE user_id = ? AND status != 'deleted'
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        `,
      ).all(normalizedUserId)
    : db.prepare(
        `
        SELECT * FROM sessions
        WHERE status != 'deleted'
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        `,
      ).all();

  return rows.map(mapSession);
};

export const listSessionsByApp = (appId = '') => {
  const normalizedAppId = normalizeText(appId);
  if (!normalizedAppId) {
    return [];
  }

  return getDb()
    .prepare(
      `
      SELECT * FROM sessions
      WHERE app_id = ?
        AND status != 'deleted'
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all(normalizedAppId)
    .map(mapSession);
};

export const deleteSession = (sessionId = '', options = {}) => {
  const db = getDb();
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedAppId = normalizeText(options.appId || options.app_id);
  if (!normalizedSessionId) {
    return false;
  }

  const result = normalizedAppId
    ? db.prepare(
        `
        UPDATE sessions
        SET status = 'deleted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND app_id = ?
        `,
      ).run(normalizedSessionId, normalizedAppId)
    : db.prepare(
        `
        UPDATE sessions
        SET status = 'deleted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      ).run(normalizedSessionId);

  return result.changes > 0;
};
