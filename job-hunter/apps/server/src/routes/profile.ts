import { CONNECTORS, extractProfileFromCv, SettingsSchema } from '@jobhunter/core';
import { nowIso, profileAnswers, sources } from '@jobhunter/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { scanStep } from '../agent/scan';
import type { AppContext } from '../context';

export function profileRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/profile', async () => ({
    profile: ctx.store.getProfile(),
    answers: ctx.db.select().from(profileAnswers).all(),
  }));

  app.put('/profile', async (req, reply) => {
    try {
      const saved = ctx.store.saveProfile(req.body);
      ctx.activity({ actor: 'user', type: 'profile', message: 'Master Profile updated' });
      return { profile: saved };
    } catch (err) {
      return reply.code(400).send({ error: `invalid profile: ${(err as Error).message}` });
    }
  });

  /** Parse pasted CV text into a profile draft (NOT saved — the user reviews it first). */
  app.post('/profile/parse-cv', async (req, reply) => {
    const body = z.object({ text: z.string().min(50) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'paste at least a few lines of CV text' });
    const llm = ctx.llm();
    if (!llm) return reply.code(422).send({ error: 'ANTHROPIC_API_KEY is not configured' });
    const { profile } = await extractProfileFromCv(llm, body.data.text);
    ctx.activity({ actor: 'agent', type: 'profile', message: 'parsed CV text into a profile draft' });
    return { draft: profile };
  });

  app.delete('/profile/answers/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    ctx.db.delete(profileAnswers).where(eq(profileAnswers.id, id)).run();
    return { ok: true };
  });

  // ---- Settings ----

  app.get('/settings', async () => ({ settings: ctx.store.getSettings() }));

  app.put('/settings', async (req, reply) => {
    const parsed = SettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid settings' });
    }
    const saved = ctx.store.saveSettings(parsed.data);
    ctx.activity({ actor: 'user', type: 'settings', message: `settings updated (${Object.keys(parsed.data).join(', ')})` });
    return { settings: saved };
  });

  // ---- Sources ----

  app.get('/sources', async () => ({
    items: ctx.db.select().from(sources).all(),
    kinds: Object.values(CONNECTORS).map((c) => ({
      kind: c.kind,
      displayName: c.displayName,
      requiredConfig: c.requiredConfig,
    })),
  }));

  app.post('/sources', async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(['arbeitnow', 'remoteok', 'remotive', 'greenhouse', 'lever']),
        name: z.string().default(''),
        config: z.record(z.string(), z.unknown()).default({}),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid source' });
    const connector = CONNECTORS[body.data.kind];
    for (const key of connector.requiredConfig) {
      if (!body.data.config[key]) return reply.code(400).send({ error: `config.${key} is required for ${body.data.kind}` });
    }
    const inserted = ctx.db
      .insert(sources)
      .values({
        kind: body.data.kind,
        name: body.data.name || connector.displayName,
        config: body.data.config,
        enabled: true,
        createdAt: nowIso(),
      })
      .run();
    ctx.activity({ actor: 'user', type: 'settings', message: `added source ${body.data.name || connector.displayName}` });
    return { id: Number(inserted.lastInsertRowid) };
  });

  app.patch('/sources/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({ enabled: z.boolean().optional(), name: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid patch' });
    const patch: Record<string, unknown> = {};
    if (body.data.enabled !== undefined) patch.enabled = body.data.enabled;
    if (body.data.name !== undefined) patch.name = body.data.name;
    if (body.data.config !== undefined) patch.config = body.data.config;
    const res = ctx.db.update(sources).set(patch).where(eq(sources.id, id)).run();
    if (res.changes === 0) return reply.code(404).send({ error: 'source not found' });
    return { ok: true };
  });

  app.delete('/sources/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = ctx.db.delete(sources).where(eq(sources.id, id)).run();
    if (res.changes === 0) return reply.code(404).send({ error: 'source not found' });
    return { ok: true };
  });

  app.post('/sources/:id/scan', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const source = ctx.db.select().from(sources).where(eq(sources.id, id)).get();
    if (!source) return reply.code(404).send({ error: 'source not found' });
    const stats = await scanStep(ctx, { sourceId: id, force: true });
    return { stats };
  });
}
