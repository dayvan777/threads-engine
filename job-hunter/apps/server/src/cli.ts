/**
 * CLI for running agent steps manually:
 *   npm run agent -- cycle | scan | analyze | decide | prepare | apply | status
 */
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
