import { nowIso, runs } from '@jobhunter/db';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { analyzeStep } from './analyze';
import { applyStep } from './apply/index';
import { decideStep } from './decide';
import { prepareStep } from './prepare';
import { scanStep } from './scan';

export type StepName = 'scan' | 'analyze' | 'decide' | 'prepare' | 'apply';
const STEP_ORDER: StepName[] = ['scan', 'analyze', 'decide', 'prepare', 'apply'];

export interface OrchestratorStatus {
  running: boolean;
  paused: boolean;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  cycleCount: number;
  lastStats: Record<string, unknown> | null;
}

/**
 * In-process agent scheduler. One cycle = scan → analyze → decide → prepare →
 * apply. The pause flag (settings.paused) is honored between all units of
 * work, so "pause" takes effect within seconds without killing the process.
 */
export class Orchestrator {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastCycleAt: string | null = null;
  private nextCycleAt: string | null = null;
  private cycleCount = 0;
  private lastStats: Record<string, unknown> | null = null;

  constructor(private readonly ctx: AppContext) {}

  start(): void {
    this.ctx.activity({
      actor: 'system',
      type: 'agent',
      message: `agent loop started (every ~${this.ctx.config.agentIntervalMin} min)`,
    });
    this.scheduleNext(5_000); // first cycle shortly after boot
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextCycleAt = null;
  }

  private scheduleNext(delayMs?: number): void {
    if (this.timer) clearTimeout(this.timer);
    const jitter = 0.9 + Math.random() * 0.2;
    const ms = delayMs ?? this.ctx.config.agentIntervalMin * 60_000 * jitter;
    this.nextCycleAt = new Date(Date.now() + ms).toISOString();
    this.timer = setTimeout(() => {
      void this.runCycle('schedule').finally(() => this.scheduleNext());
    }, ms);
    this.timer.unref?.();
  }

  status(): OrchestratorStatus {
    return {
      running: this.running,
      paused: this.ctx.paused(),
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: this.nextCycleAt,
      cycleCount: this.cycleCount,
      lastStats: this.lastStats,
    };
  }

  pause(actor: 'user' | 'system' = 'user'): void {
    this.ctx.store.saveSettings({ paused: true });
    this.ctx.activity({ actor, type: 'agent', message: 'agent paused' });
  }

  resume(actor: 'user' | 'system' = 'user'): void {
    this.ctx.store.saveSettings({ paused: false });
    this.ctx.activity({ actor, type: 'agent', message: 'agent resumed' });
    this.scheduleNext(2_000);
  }

  /** Run one full cycle (or a subset of steps). Serialized: concurrent calls are rejected. */
  async runCycle(trigger: 'schedule' | 'manual', steps: StepName[] = STEP_ORDER): Promise<{ ok: boolean; stats?: Record<string, unknown>; reason?: string }> {
    if (this.running) return { ok: false, reason: 'a cycle is already running' };
    if (this.ctx.paused()) {
      if (trigger === 'manual') return { ok: false, reason: 'agent is paused' };
      return { ok: false, reason: 'paused' };
    }
    this.running = true;
    const runRow = this.ctx.db
      .insert(runs)
      .values({ kind: 'cycle', status: 'running', startedAt: nowIso(), stats: { trigger, steps } })
      .run();
    const runId = Number(runRow.lastInsertRowid);
    const stats: Record<string, unknown> = {};
    let status = 'ok';
    try {
      for (const step of steps) {
        if (this.ctx.paused()) break;
        switch (step) {
          case 'scan':
            stats.scan = await scanStep(this.ctx);
            break;
          case 'analyze':
            stats.analyze = await analyzeStep(this.ctx);
            break;
          case 'decide':
            stats.decide = decideStep(this.ctx);
            break;
          case 'prepare':
            stats.prepare = await prepareStep(this.ctx);
            break;
          case 'apply':
            stats.apply = await applyStep(this.ctx);
            break;
        }
      }
    } catch (err) {
      status = 'error';
      stats.error = (err as Error).message;
      this.ctx.activity({ actor: 'system', type: 'error', message: `agent cycle failed: ${(err as Error).message}` });
    } finally {
      this.running = false;
      this.lastCycleAt = nowIso();
      this.cycleCount++;
      this.lastStats = stats;
      this.ctx.db
        .update(runs)
        .set({ status, finishedAt: nowIso(), stats })
        .where(eq(runs.id, runId))
        .run();
    }
    return { ok: status === 'ok', stats };
  }
}
