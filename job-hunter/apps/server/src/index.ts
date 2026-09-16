import fs from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { closeApplyBrowser } from './agent/apply/browser';
import { closeRenderBrowser } from '@jobhunter/core';
import Fastify, { type FastifyError } from 'fastify';
import { Orchestrator } from './agent/orchestrator';
import { createContext } from './context';
import { ROOT } from './env';
import { applicationRoutes } from './routes/applications';
import { jobRoutes } from './routes/jobs';
import { profileRoutes } from './routes/profile';
import { systemRoutes } from './routes/system';

async function main(): Promise<void> {
  const ctx = createContext();
  const orchestrator = new Orchestrator(ctx);

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    // eslint-disable-next-line no-console
    console.error('[api]', err);
    void reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  await app.register(
    async (api) => {
      jobRoutes(api, ctx);
      applicationRoutes(api, ctx);
      profileRoutes(api, ctx);
      systemRoutes(api, ctx, orchestrator);
      api.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/api' },
  );

  // Serve the built dashboard when it exists (production mode).
  const webDist = path.join(ROOT, 'apps', 'web', 'dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.type('text/html').send(fs.createReadStream(path.join(webDist, 'index.html')));
    });
  }

  await app.listen({ port: ctx.config.port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`AI Job Hunter server on http://localhost:${ctx.config.port}`);
  ctx.activity({ actor: 'system', type: 'server', message: `server started on port ${ctx.config.port}` });

  if (ctx.config.agentAutostart) orchestrator.start();
  else ctx.activity({ actor: 'system', type: 'agent', message: 'agent autostart disabled (JH_AGENT_AUTOSTART=false)' });

  const shutdown = async (): Promise<void> => {
    orchestrator.stop();
    await Promise.allSettled([closeApplyBrowser(), closeRenderBrowser(), app.close()]);
    ctx.sqlite.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
