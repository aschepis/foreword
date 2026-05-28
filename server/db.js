import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const dataDir = process.env.LOCAL_REVIEW_DATA_DIR || path.join(os.homedir(), '.local-review');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'data.sqlite');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    default_branch TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS worktrees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    branch TEXT,
    is_main INTEGER NOT NULL DEFAULT 0,
    UNIQUE(repo_id, path)
  );`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    worktree_path TEXT NOT NULL,
    base_ref TEXT NOT NULL,
    head_ref TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS file_reviewed (
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    reviewed_sha TEXT NOT NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_by TEXT NOT NULL DEFAULT 'me',
    PRIMARY KEY (review_id, path)
  );`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    path TEXT,
    line INTEGER,
    side TEXT,
    body TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'me',
    source TEXT NOT NULL DEFAULT 'human',
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS agent_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    include_goals INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `ALTER TABLE agent_configs ADD COLUMN include_goals INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    agent_config_id INTEGER NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    command TEXT,
    prompt TEXT,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    duration_ms INTEGER,
    finding_count INTEGER NOT NULL DEFAULT 0
  );`,
  /* additive migrations for older DBs */
  `ALTER TABLE agent_runs ADD COLUMN command TEXT`,
  `ALTER TABLE agent_runs ADD COLUMN prompt TEXT`,
  `ALTER TABLE agent_runs ADD COLUMN exit_code INTEGER`,
  `ALTER TABLE agent_runs ADD COLUMN duration_ms INTEGER`,
  `CREATE TABLE IF NOT EXISTS agent_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    file TEXT,
    line INTEGER,
    severity TEXT,
    message TEXT NOT NULL,
    mapped INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
];

for (const sql of MIGRATIONS) {
  try {
    db.exec(sql);
  } catch (e) {
    // Tolerate idempotent ALTER TABLE re-runs (column already exists)
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}

const defaultAgent = db.prepare('SELECT COUNT(*) AS c FROM agent_configs').get();
if (defaultAgent.c === 0) {
  db.prepare(
    `INSERT INTO agent_configs (name, command, prompt_template, enabled)
     VALUES (?, ?, ?, 0)`
  ).run(
    'Claude (example)',
    'claude -p --output-format json',
    `You are a code reviewer. Review the following unified diff and respond ONLY with a JSON array of findings. Each finding must have: {"file": "path/relative/to/repo", "line": <line number in NEW file or null>, "severity": "info|warn|error", "message": "..."}.\n\nDiff:\n{{diff}}`
  );
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, v);
}
