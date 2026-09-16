import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './index';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dbPath = process.env.JH_DB_PATH
  ? path.resolve(root, process.env.JH_DB_PATH)
  : path.join(root, 'data', 'jobhunter.db');

const { sqlite } = openDb(dbPath);
console.log(`Database ready at ${dbPath}`);
sqlite.close();
