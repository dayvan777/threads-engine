import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** job-hunter/ project root (apps/server/src → ../../..). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

dotenv.config({ path: path.join(ROOT, '.env') });

export interface AppConfig {
  port: number;
  dbPath: string;
  dataDir: string;
  agentAutostart: boolean;
  agentIntervalMin: number;
  applyEnabled: boolean;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.JH_PORT || 8790),
    dbPath: path.resolve(ROOT, process.env.JH_DB_PATH || 'data/jobhunter.db'),
    dataDir: path.resolve(ROOT, process.env.JH_DATA_DIR || 'data'),
    agentAutostart: process.env.JH_AGENT_AUTOSTART !== 'false',
    agentIntervalMin: Math.max(5, Number(process.env.JH_AGENT_INTERVAL_MIN || 45)),
    applyEnabled: process.env.JH_APPLY_ENABLED !== 'false',
  };
}
