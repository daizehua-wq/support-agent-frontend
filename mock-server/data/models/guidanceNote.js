import { randomUUID } from 'crypto';
import { getDb } from '../database.js';

const normalizeText = (value = '') => String(value || '').trim();

const mapNote = (row = null) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    scene: row.scene || '',
    note_type: row.note_type || 'info',
    noteType: row.note_type || 'info',
    content: row.content || '',
    created_at: row.created_at || '',
    createdAt: row.created_at || '',
    updated_at: row.updated_at || '',
    updatedAt: row.updated_at || '',
  };
};

const buildNoteParams = (data = {}) => {
  return {
    id: normalizeText(data.id) || randomUUID(),
    scene: normalizeText(data.scene) || 'general',
    noteType: normalizeText(data.noteType || data.note_type) || 'info',
    content: normalizeText(data.content),
  };
};

export const listNotes = (filters = {}) => {
  const scene = normalizeText(filters.scene);

  if (scene) {
    return getDb()
      .prepare(
        `
        SELECT * FROM guidance_notes
        WHERE scene = ? OR scene LIKE ? OR scene = 'general'
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        `,
      )
      .all(scene, `%${scene}%`)
      .map(mapNote);
  }

  return getDb()
    .prepare(
      `
      SELECT * FROM guidance_notes
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      `,
    )
    .all()
    .map(mapNote);
};

export const getNotesByScene = (scene = '') => listNotes({ scene });

export const createNote = (data = {}) => {
  const note = buildNoteParams(data);

  if (!note.content) {
    throw new Error('content is required');
  }

  getDb().prepare(
    `
    INSERT INTO guidance_notes (
      id,
      scene,
      note_type,
      content
    )
    VALUES (?, ?, ?, ?)
    `,
  ).run(note.id, note.scene, note.noteType, note.content);

  return mapNote(getDb().prepare('SELECT * FROM guidance_notes WHERE id = ?').get(note.id));
};

export const updateNote = (id = '', data = {}) => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return null;
  }

  const existing = mapNote(
    getDb().prepare('SELECT * FROM guidance_notes WHERE id = ?').get(normalizedId),
  );

  if (!existing) {
    return null;
  }

  const next = buildNoteParams({
    ...existing,
    ...data,
    id: normalizedId,
    noteType: data.noteType ?? data.note_type ?? existing.noteType,
  });

  if (!next.content) {
    throw new Error('content is required');
  }

  getDb().prepare(
    `
    UPDATE guidance_notes
    SET scene = ?,
        note_type = ?,
        content = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(next.scene, next.noteType, next.content, normalizedId);

  return mapNote(getDb().prepare('SELECT * FROM guidance_notes WHERE id = ?').get(normalizedId));
};

export const deleteNote = (id = '') => {
  const normalizedId = normalizeText(id);
  if (!normalizedId) {
    return false;
  }

  const result = getDb().prepare('DELETE FROM guidance_notes WHERE id = ?').run(normalizedId);
  return result.changes > 0;
};
