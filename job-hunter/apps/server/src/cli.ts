/**
 * CLI for running agent steps manually:
 *   npm run agent -- cycle | scan | analyze | decide | prepare | apply | status | seed [dir]
 *
 * `seed` loads data/profile.seed.json and data/settings.seed.json (or the same
 * files from [dir]) into the database — useful for restoring a profile without
 * ever committing personal data to the repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeStep } from './agent/analyze';
import { applyStep } from './agent/apply/index';
import { closeApplyBrowser } from './agent/apply/browser';
import { closeRenderBrowser } from '@jobhunter/core';
import { decideStep } from './agent/decide';
import { prepareStep } from './agent/prepare';
import { scanStep } from './agent/scan';
import { createContext } from './context';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'cycle';
  const ctx = createContext();
  const out = (label: string, stats: unknown): void => {
    // eslint-disable-next-line no-console
    console.log(`${label}:`, JSON.stringify(stats, null, 2));
  };

  switch (cmd) {
    case 'scan':
      out('scan', await scanStep(ctx, { force: true }));
      break;
    case 'analyze':
      out('analyze', await analyzeStep(ctx));
      break;
    case 'decide':
      out('decide', decideStep(ctx));
      break;
    case 'prepare':
      out('prepare', await prepareStep(ctx));
      break;
    case 'apply':
      out('apply', await applyStep(ctx));
      break;
    case 'cycle': {
      out('scan', await scanStep(ctx));
      out('analyze', await analyzeStep(ctx));
      out('decide', decideStep(ctx));
      out('prepare', await prepareStep(ctx));
      out('apply', await applyStep(ctx));
      break;
    }
    case 'seed': {
      const dir = process.argv[3] ? path.resolve(process.argv[3]) : ctx.config.dataDir;
      const loaded: string[] = [];
      const profilePath = path.join(dir, 'profile.seed.json');
      if (fs.existsSync(profilePath)) {
        ctx.store.saveProfile(JSON.parse(fs.readFileSync(profilePath, 'utf8')));
        loaded.push('profile');
      }
      const settingsPath = path.join(dir, 'settings.seed.json');
      if (fs.existsSync(settingsPath)) {
        ctx.store.saveSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
        loaded.push('settings');
      }
      if (loaded.length === 0) {
        // eslint-disable-next-line no-console
        console.error(`no profile.seed.json / settings.seed.json found in ${dir}`);
        process.exitCode = 1;
      } else {
        ctx.activity({ actor: 'system', type: 'seed', message: `seeded ${loaded.join(' + ')} from ${dir}` });
        out('seed', { dir, loaded });
      }
      break;
    }
    case 'status': {
      const settings = ctx.store.getSettings();
      out('status', {
        paused: settings.paused,
        autonomy: settings.autonomy,
        llmConfigured: ctx.llm() !== null,
        dbPath: ctx.config.dbPath,
      });
      break;
    }
    default:
      // eslint-disable-next-line no-console
      console.error(`unknown command "${cmd}" (use: cycle|scan|analyze|decide|prepare|apply|status)`);
      process.exitCode = 1;
  }
  await Promise.allSettled([closeApplyBrowser(), closeRenderBrowser()]);
  ctx.sqlite.close();
}

void main();
