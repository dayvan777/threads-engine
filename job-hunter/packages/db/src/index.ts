import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export * from './schema';
export { schema };

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/** Applies all pending SQL migrations. Idempotent; tracked in `_migrations`. */
export function migrate(sqlite: Database.Database): string[] {
  sqlite
    .prepare(
      'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
    )
    .run();
  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => (r as { name: string }).name),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const tx = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
        .run(file, new Date().toISOString());
    });
    tx();
    ran.push(file);
  }
  return ran;
}

export interface OpenDbResult {
  db: Db;
  sqlite: Database.Database;
}

export function openDb(dbPath: string): OpenDbResult {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  migrate(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function nowIso(): string {
  return new Date().toISOString();
}
