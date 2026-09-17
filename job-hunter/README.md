# AI Job Hunter

An autonomous job-search agent with a control dashboard. You configure **who
you are, what you want, and what conditions are acceptable** once — the agent
then runs `SEARCH → FILTER → ANALYZE → SCORE → PERSONALIZE → APPLY → TRACK →
LEARN` in the background, while the dashboard gives you observability,
analytics, and intervention points.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design (schema, workers,
browser-automation safety, roadmap, non-goals).

## What works in this MVP

- **Job ingestion** from free public APIs — Arbeitnow (Germany/EU), Remotive,
  RemoteOK, plus per-company **Greenhouse** and **Lever** boards — with URL
  canonicalization and company/title/location deduplication. Anything else
  (LinkedIn, StepStone, Indeed…) is added via **manual import** and flows
  through the same pipeline.
- **Deterministic prefilter** (blacklist, excluded keywords, work mode,
  location, salary-below-minimum, keyword gate) that discards junk before any
  LLM cost.
- **LLM match scoring** (0–100) against your Master Profile with pros/cons,
  hard/soft dealbreakers, language/salary/location/seniority fit, and a
  human-readable explanation.
- **Decision engine**: auto-apply ≥ 90, review band ≥ 75 (defaults, both
  configurable), hard dealbreakers always route to human review, daily
  application cap, company black/whitelists, three autonomy modes
  (manual / assisted / autonomous).
- **Tailored documents**: per-job CV (reordered, re-emphasized — never
  fabricated) and a non-templated cover letter, both validated by a
  deterministic **fact-guard** against the Master Profile, rendered to PDF.
- **Automated submission** on Greenhouse- and Lever-hosted application forms:
  standard fields, CV upload, cover letter, screener questions answered from
  profile facts only. Unanswerable required questions → **Needs Input** (you
  answer in the dashboard, the agent resumes). CAPTCHA / unsupported sites →
  **Needs Action** with prepared documents. Screenshots stored for audit.
- **Dashboard** (8 sections): Dashboard, Jobs, Applications, Analytics,
  Documents, Activity, Profile, Settings — with pause/resume and "run now".
- **Analytics**: funnel, response/interview/offer rates, breakdowns by
  source/score/work-mode/city, 30-day timeline, deterministic insights
  (suggestions only — the agent never changes your constraints itself).

## Requirements

- Node.js ≥ 20
- An Anthropic API key (for analysis, documents, and screener answers —
  without it the agent still scans, dedupes and prefilters)

## Quick start

```bash
cd job-hunter
npm install
npx playwright install chromium   # for PDF rendering + auto-apply
cp .env.example .env              # then put your ANTHROPIC_API_KEY in .env

npm run dev                       # server on :8790, dashboard on :5173
```

Open http://localhost:5173 and:

1. **Profile** → paste your CV text (“Import from CV text”), review the
   extracted draft, fill the application-answer fields, save.
2. **Settings** → desired titles, keywords, cities, work modes, minimum
   salary, autonomy mode (start with *Assisted*), thresholds, sources.
3. Press **Run now** (top right) — or let the background loop do its thing.
4. Watch **Dashboard / Activity**; approve prepared applications under
   **Applications** (in Assisted mode) and answer any *Needs Input* questions.

### Production-ish run (single process, serves the built UI)

```bash
npm run build     # typecheck + vite build
npm start         # serves API + dashboard on :8790
```

### CLI

```bash
npm run agent -- status    # config sanity check
npm run agent -- scan      # force-scan all enabled sources
npm run agent -- cycle     # one full pipeline cycle
```

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for all LLM steps |
| `JH_MODEL_PRIMARY` | `claude-sonnet-5` | analysis + documents |
| `JH_MODEL_FAST` | `claude-haiku-4-5-20251001` | cheap classification |
| `JH_PORT` | `8790` | API/dashboard port |
| `JH_DB_PATH` | `data/jobhunter.db` | SQLite file |
| `JH_AGENT_AUTOSTART` | `true` | run the loop with the server |
| `JH_AGENT_INTERVAL_MIN` | `45` | minutes between agent cycles |
| `JH_APPLY_ENABLED` | `true` | master switch for auto-submission |
| `JH_CHROMIUM_PATH` | — | use a specific Chromium binary |

## Safety model

- **No fabrication**: every generated CV/letter is machine-verified against
  the Master Profile (employers, titles, degrees, certifications, language
  levels, numbers). Violations → regenerate once → fall back to the plain
  master CV.
- **No CAPTCHA bypass, no anti-bot evasion** — detection aborts the attempt
  and hands off to you.
- **No guessed screener answers**: anything not clearly derivable from your
  profile becomes a dashboard question; your answer can be saved for reuse.
- **Instant pause**: the pause flag is checked between every unit of work,
  including between form-fill and submit.
- **Audit trail**: full activity log + before/after screenshots per
  submission under `data/artifacts/`.
- **Secrets** only in `.env`; the DB stores no credentials.
- Applies only through **allowlisted ATS adapters** (Greenhouse, Lever) at a
  throttled, human-like rate; everything else stays manual by design.

## Tests

```bash
npm test          # vitest — deterministic core (45 tests)
npm run typecheck
```

## Repository layout

```
packages/db      SQLite schema (Drizzle) + migrations
packages/core    pure domain logic: connectors, dedupe, prefilter, scoring,
                 decision engine, documents, fact-guard, Q&A  (+ tests)
apps/server      Fastify API + agent orchestrator + Playwright appliers
apps/web         React dashboard (Vite + Tailwind), served by apps/server
apps/dashboard   static job radar deployed to Vercel; connects to a running
                 agent over HTTP to show its state and trigger scans
data/            SQLite DB, generated documents, submission artifacts (gitignored)
```

## The two dashboards

`apps/web` is the full control panel and needs the agent process next to it — it
is what `apps/server` serves on `localhost:8787`.

`apps/dashboard` is a static page that stays online without any backend: the
shortlisted vacancies with salaries, direct contacts, apply links and per-vacancy
CV-tailoring prompts. It optionally points at a running agent to show its state
and start a scan. See `apps/dashboard/README.md` for deployment — the agent
itself cannot run on serverless hosting (SQLite, Playwright, a long-running loop)
and needs a real process.
