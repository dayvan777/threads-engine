# Job radar — dashboard

Static page listing the vacancies the search has turned up: score, salary, direct
contacts, apply link, and a per-vacancy "tailor my CV" prompt. It also talks to a
running Job Hunter agent to show its state and trigger a scan.

## What it is made of

| File | Role |
| --- | --- |
| `page.html` | the page itself — markup, styles, logic. Placeholders: `{{ASOF}}`, `{{DATA}}` |
| `jobs.json` | the vacancy data (hand-curated from the research runs) |
| `build.mjs` | inlines the data and writes the two outputs below |
| `index.html` | generated — standalone page, what Vercel serves |
| `artifact.html` | generated — same page as a fragment, for publishing as a Claude Artifact |

Both outputs inline the data, so the page never fetches it at runtime and works
offline. Edit `page.html` or `jobs.json`, never the generated files.

```sh
node build.mjs                 # today's date as "updated"
ASOF=17.09.2026 node build.mjs # pin the date
```

## Deploying to Vercel

The page is plain static output — no framework, no server.

1. On [vercel.com/new](https://vercel.com/new) import the GitHub repository.
2. Set **Root Directory** to `job-hunter/apps/dashboard`. This is the only setting
   that matters; the repo is a monorepo and Vercel defaults to its root.
3. Framework preset **Other**. `vercel.json` already supplies the build command
   (`node build.mjs`) and the output directory.
4. Deploy.

Every push to the branch redeploys. To refresh the vacancies, update `jobs.json`
and push.

The page sends `noindex` (both as a meta tag and an `X-Robots-Tag` header), so it
stays out of search engines — but anyone with the URL can still open it. It lists
which companies you are approaching; if that should not be readable by anyone who
guesses the link, turn on Vercel's Deployment Protection for the project.

## Connecting the agent

The agent (SQLite + Playwright + a long-running scan loop) **cannot run on Vercel** —
serverless functions have no persistent disk and no browser. It runs wherever it has
a real process: your machine, or a small VPS / Railway / Fly.io instance.

The dashboard connects to it over HTTP:

- Press **Подключить агента** and enter its address, or open the page with
  `?api=https://your-agent-host` once — it is remembered in `localStorage`.
- Default is `http://localhost:8787`, which is what `npm run dev` in `job-hunter/`
  serves.

Once connected the strip at the top shows the agent's state (running / paused,
last cycle, today's counts, whether the LLM key is set) and offers **Запустить скан**
and **Пауза**. It polls `/api/overview` every 30 seconds and degrades to an
"офлайн" state when the agent is unreachable.

A browser on `https://` will not call a remote agent over plain `http://` (mixed
content), so an agent on a server needs TLS. `http://localhost` is a special case:
Chrome and Firefox treat it as a trustworthy origin and allow the call from the
deployed page; Safari blocks it, so there either open `index.html` locally or put
the agent behind a tunnel with TLS.

CORS is already handled — the agent's Fastify server reflects the request origin,
so the deployed page may call it directly.
