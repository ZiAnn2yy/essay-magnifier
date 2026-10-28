import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(currentDir, '../../data');

// 建表语句集中在此，便于一眼看全数据形状。
// 全部 IF NOT EXISTS，保证服务重启可重复执行。
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS learners (
    id             TEXT PRIMARY KEY,
    created_at     TEXT NOT NULL,
    last_active_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(id),
    started_at TEXT NOT NULL,
    ended_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

  CREATE TABLE IF NOT EXISTS mastery (
    learner_id      TEXT NOT NULL REFERENCES learners(id),
    knowledge_point TEXT NOT NULL,
    level           INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (learner_id, knowledge_point)
  );
`;

let db = null;

/**
 * 惰性打开数据库。
 *
 * 注意：库文件落在容器文件系统里，DevCloud 重新部署后会重置。
 * 本期是单机演示场景，可接受；对外表述应为"会话状态在容器生命周期内持久化"，
 * 不要说成跨部署持久化。若要跨部署保留，只需替换本文件实现，store.js 接口不用动。
 */
export function getDb() {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'edu-agent.sqlite'));
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
