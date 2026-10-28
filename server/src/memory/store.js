import crypto from 'node:crypto';
import { getDb } from './db.js';

function now() {
  return new Date().toISOString();
}

// 学习者标识由服务端随机生成。
// 规范§〇红线一：不收集与功能无关的个人信息，也不给用户填姓名/学校的地方。
export function createLearner() {
  const id = crypto.randomUUID();
  const timestamp = now();
  getDb()
    .prepare('INSERT INTO learners (id, created_at, last_active_at) VALUES (?, ?, ?)')
    .run(id, timestamp, timestamp);
  return id;
}

export function getLearner(id) {
  const row = getDb()
    .prepare('SELECT id, created_at, last_active_at FROM learners WHERE id = ?')
    .get(id);
  return row ?? null;
}

export function touchLearner(id) {
  getDb()
    .prepare('UPDATE learners SET last_active_at = ? WHERE id = ?')
    .run(now(), id);
}

export function createSession(learnerId) {
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO sessions (id, learner_id, started_at) VALUES (?, ?, ?)')
    .run(id, learnerId, now());
  return id;
}

export function getSession(sessionId) {
  const row = getDb()
    .prepare('SELECT id, learner_id, started_at, ended_at FROM sessions WHERE id = ?')
    .get(sessionId);
  return row ?? null;
}

export function endSession(sessionId) {
  getDb()
    .prepare('UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL')
    .run(now(), sessionId);
}

export function appendMessage(sessionId, role, content) {
  getDb()
    .prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, role, content, now());
}

/** 取最近若干条，按时间正序返回，方便直接拼进 messages 数组 */
export function getRecentMessages(sessionId, limit) {
  const rows = getDb()
    .prepare(
      `SELECT role, content FROM messages
       WHERE session_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(sessionId, limit);
  return rows.reverse();
}

export function listMastery(learnerId) {
  return getDb()
    .prepare(
      'SELECT knowledge_point, level, updated_at FROM mastery WHERE learner_id = ? ORDER BY knowledge_point',
    )
    .all(learnerId);
}

export function upsertMastery(learnerId, knowledgePoint, level) {
  getDb()
    .prepare(
      `INSERT INTO mastery (learner_id, knowledge_point, level, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (learner_id, knowledge_point)
       DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`,
    )
    .run(learnerId, knowledgePoint, level, now());
}
