import { Llm } from '@jobhunter/core';
import { activityLog, nowIso, openDb, type Db } from '@jobhunter/db';
import type Database from 'better-sqlite3';
import { loadConfig, type AppConfig } from './env';
import { Store } from './store';

export type Actor = 'agent' | 'user' | 'system';

export interface ActivityEntry {
  actor: Actor;
  type: string;
  message: string;
  jobId?: number | null;
  applicationId?: number | null;
  data?: unknown;
}

export interface AppContext {
  config: AppConfig;
  db: Db;
  sqlite: Database.Database;
  store: Store;
  /** Lazily constructed LLM client; null when ANTHROPIC_API_KEY is missing. */
  llm: () => Llm | null;
  paused: () => boolean;
  activity: (e: ActivityEntry) => void;
}

export function createContext(): AppContext {
  const config = loadConfig();
  const { db, sqlite } = openDb(config.dbPath);
  const store = new Store(db);
  store.getSettings();
  store.getProfile();
  store.seedDefaultSources();

  let llmInstance: Llm | null | undefined;

  const ctx: AppContext = {
    config,
    db,
    sqlite,
    store,
    llm: () => {
      if (llmInstance === undefined) llmInstance = Llm.fromEnv();
      return llmInstance;
    },
    paused: () => store.getSettings().paused,
    activity: (e) => {
      db.insert(activityLog)
        .values({
          ts: nowIso(),
          actor: e.actor,
          type: e.type,
          message: e.message,
          jobId: e.jobId ?? null,
          applicationId: e.applicationId ?? null,
          data: e.data ?? null,
        })
        .run();
      // eslint-disable-next-line no-console
      console.log(`[${new Date().toISOString().slice(11, 19)}] ${e.actor}/${e.type}: ${e.message}`);
    },
  };
  return ctx;
}
