# AI Job Hunter — MVP Architecture

An autonomous job-search agent with a control dashboard. The user configures
**who they are, what they want, and what conditions are acceptable** once; the
agent then runs the loop `SEARCH → FILTER → ANALYZE → SCORE → PERSONALIZE →
APPLY → TRACK → LEARN` in the background while the dashboard provides
observability, analytics, and intervention points.

---

## 1. MVP architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  apps/web  — React SPA (Vite + Tailwind)                            │
│  Dashboard · Jobs · Applications · Analytics · Documents ·          │
│  Activity · Profile · Settings                                      │
└───────────────▲─────────────────────────────────────────────────────┘
                │ REST (JSON)
┌───────────────┴─────────────────────────────────────────────────────┐
│  apps/server — Fastify API + Agent runtime (single Node process)    │
│                                                                     │
│  ┌───────────────────────── Agent orchestrator ─────────────────┐   │
│  │ cycle loop (interval + manual trigger, pause-aware):         │   │
│  │  1 Scout    — scan due sources, normalize, dedupe, store     │   │
│  │  2 Analyst  — hard prefilter → LLM match scoring             │   │
│  │  3 Decider  — thresholds/dealbreakers/caps → application     │   │
│  │  4 Preparer — tailored CV + cover letter + fact-guard        │   │
│  │  5 Applier  — Playwright ATS adapters (Greenhouse/Lever)     │   │
│  │  every step → activity_log                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  packages/core — pure domain logic (connectors, dedupe, prefilter,  │
│                  scoring, decision engine, documents, fact-guard,   │
│                  question answering)                                │
│  packages/db   — Drizzle ORM schema + SQLite + migrations           │
└───────────────┬─────────────────────────────────────────────────────┘
                │
   ┌────────────┼──────────────────────┬────────────────────────┐
   │ SQLite     │ Anthropic API        │ Playwright (Chromium)  │
   │ (file DB)  │ (scoring, documents, │ (ATS application flow, │
   │            │  Q&A, CV parsing)    │  PDF rendering)        │
   └────────────┴──────────────────────┴────────────────────────┘
```

**Key decisions**

- **One deployable process** (API + agent). The agent runs as an in-process
  scheduler, which makes the "pause instantly" requirement trivial (a flag
  checked between every step), avoids a message broker, and keeps local
  setup to `npm install && npm run dev`. The module boundary
  (`packages/core` is pure, the orchestrator only wires steps to the DB) is
  the seam for extracting workers to a queue later.
- **Master Candidate Profile is the single source of truth.** Every LLM call
  that produces user-facing text receives the profile and an explicit
  no-fabrication contract; a deterministic **fact-guard** additionally
  verifies that employers, institutions, certifications and language levels
  appearing in generated documents exist in the profile before anything can
  be submitted.
- **Job ingestion is API-first.** MVP connectors use public/official JSON
  APIs (Arbeitnow, RemoteOK, Remotive, Greenhouse boards, Lever postings)
  plus manual URL import. No LinkedIn/Indeed/StepStone scraping in MVP —
  those require ToS-sensitive scraping and login automation (see §6).
- **Autonomy is a mode, not a rewrite**: `manual` (find only), `assisted`
  (prepare, human approves), `autonomous` (submit within thresholds and
  daily caps). The pipeline is identical; only the gate before submission
  changes.

## 2. Database schema (SQLite via Drizzle; scale path → Postgres)

Documents-as-JSON where the shape is owned by the app (profile, settings),
relational tables where we query/aggregate.

| Table | Purpose | Notable columns |
|---|---|---|
| `profile` | Master Candidate Profile (single row, zod-validated JSON) | `data`, `updated_at` |
| `settings` | Search prefs, thresholds, autonomy, caps, lists (single row JSON) | `data`, `updated_at` |
| `sources` | Configured job sources | `kind`, `config`, `enabled`, `last_scan_at`, `last_status`, `last_error` |
| `jobs` | Deduplicated postings | `canonical_url` UNIQUE, `dedupe_hash` UNIQUE, `title`, `company`, `location`, `remote_mode`, `salary_*`, `description`, `posted_at`, `status` (`found·skipped_prefilter·analyzed·qualified·archived`), `skip_reason`, `raw` |
| `job_analyses` | LLM scoring results (re-analysis keeps history) | `job_id`, `score` 0–100, `verdict`, `data` (pros/cons/dealbreakers/requirements/fit), `model`, `prompt_version`, tokens |
| `applications` | One per job we decided to pursue | `job_id`, `status` (see state machine), `method`, `cv_document_id`, `cover_letter_document_id`, `answers`, `decision`, `submitted_at`, `failure_reason`, `artifacts_dir` |
| `application_events` | Append-only status timeline | `application_id`, `type`, `message`, `data` |
| `documents` | Master/tailored CVs, cover letters | `kind`, `job_id`, `application_id`, `content_md`, `pdf_path`, `meta` (emphasis, fact-guard report, model) |
| `pending_questions` | Needs-Input queue | `application_id`, `question`, `field_key`, `field_type`, `options`, `required`, `status`, `answer`, `save_to_profile` |
| `profile_answers` | Learned Q&A bank (reused before asking the LLM/user) | `question`, `answer`, `source_application_id` |
| `activity_log` | Everything the agent does | `ts`, `actor` (`agent·user·system`), `type`, `message`, `job_id`, `application_id`, `data` |
| `runs` | Agent cycle bookkeeping | `kind`, `started_at`, `finished_at`, `status`, `stats` |

**Application state machine**

```
queued → preparing → ready_for_review → approved → applying → submitted
                          │                          │   ├─→ needs_input  (answer in dashboard → applying)
                          │ (autonomous skips review)│   └─→ needs_action (CAPTCHA / unsupported ATS / error)
                          └─→ discarded              └─→ failed
submitted → response → interview → offer | rejected | withdrawn
```

Analytics are computed with SQL over `jobs`/`applications`/`application_events`
— no denormalized metrics tables in MVP.

## 3. Background workers / agents

All cooperatively scheduled by one **orchestrator** (interval loop with
jitter + manual triggers via API). Every worker: checks the pause flag,
logs to `activity_log`, records a `runs` row, and is individually cappable.

| Worker | Trigger | Responsibility |
|---|---|---|
| **Scout** | every N h per source (config), manual | Fetch source APIs, normalize to `NormalizedJob`, canonicalize URL, dedupe (URL + company/title/location hash), insert `found` jobs |
| **Analyst** | after scout / continuous drain | Deterministic prefilter (blacklist, excluded keywords, location/mode impossibility, salary-below-min, zero keyword overlap) → skip cheaply; survivors → LLM Job Match Score with structured pros/cons/dealbreakers; mark `qualified`/`analyzed` |
| **Decider** | after analyst | Apply thresholds (auto ≥ 90, review band ≥ 75 by default), hard-dealbreaker rules, white/blacklists, daily application cap, autonomy mode → create `applications` or leave `qualified` |
| **Preparer** | applications in `queued` | Tailored CV (emphasis, reorder, rephrase — never invent), cover letter (company-specific, anti-template), **fact-guard** validation with one retry, render PDF; → `ready_for_review` (assisted) or `approved` (autonomous) |
| **Applier** | applications in `approved` | Playwright ATS adapters; map form fields, answer screener questions from profile/answer-bank (LLM with `needs_user` escape hatch); required-but-unanswerable → `needs_input`; CAPTCHA/unsupported → `needs_action`; submit, capture confirmation screenshot |
| **Analyst (learning)** | on dashboard request | Funnel + response/interview rates by source, score bucket, work mode, city; deterministic insight rules. Read-only: surfaces suggestions, never mutates settings (per requirement 11) |

Future (post-MVP): **Mail Clerk** (classify inbound email → update application
status) — schema already supports it via `application_events`.

## 4. Safe browser automation

- **Allowlisted adapters only.** The applier acts only on ATS platforms it has
  an adapter for (MVP: Greenhouse hosted boards, Lever postings). Anything
  else → `needs_action` with prepared documents and a deep link for manual
  submission. No generic "click anything that looks like Apply" heuristics.
- **No credentialed sites in MVP.** Adapters cover public application forms;
  no stored job-board logins, so no password vault problem yet. (Design for
  later: OS keychain / encrypted secrets file, never DB plaintext.)
- **CAPTCHA and anti-bot: detect, stop, hand off.** reCAPTCHA/hCaptcha/
  Cloudflare challenge detection aborts the attempt, screenshots the state,
  sets `needs_action`. No solving, no evasion, no user-agent spoofing.
- **Rate limiting & pacing.** Global browser concurrency = 1, per-domain
  minimum interval with jitter, daily application cap enforced upstream.
- **Kill switch.** Pause flag is checked between navigation/fill/submit
  steps; pausing aborts before the point of no return.
- **Audit trail.** Screenshot before submit + confirmation screenshot/text
  after submit stored under `data/artifacts/app_<id>/`; every step in
  `activity_log`.
- **Dry-run by design.** Assisted mode runs the full fill flow without
  clicking submit; the user reviews the filled-form screenshot and answers.
- **No fabricated answers.** Screener answers must trace to profile/settings
  facts; the LLM must return `needs_user` when it cannot — that becomes a
  dashboard question, and answered questions can be saved to the profile
  answer bank for reuse.

## 5. Development stages

1. **Scaffold + DB** — monorepo, schema, migrations, seed-free bootstrap.
2. **Core domain** — types, settings/profile stores, dedupe, prefilter,
   decision engine (+ unit tests; all deterministic, no LLM needed).
3. **Connectors** — Arbeitnow, RemoteOK, Remotive, Greenhouse, Lever,
   manual import; normalization tests on fixtures.
4. **LLM layer** — Anthropic client with forced-tool JSON outputs; job
   analysis; CV parsing (paste → structured profile); question answering.
5. **Documents** — CV tailoring, cover letters, fact-guard, Markdown→PDF.
6. **Agent runtime** — orchestrator, workers, activity log, caps, pause.
7. **Applier** — browser session + safety rails, Greenhouse + Lever adapters.
8. **API** — REST endpoints for all dashboard sections + agent control.
9. **Dashboard** — 8 sections, minimal SaaS UI.
10. **Analytics + insights** — funnel, rates, breakdowns, deterministic
    suggestions.
11. **Hardening** — E2E pass, README, deployment notes.

## 6. Explicitly NOT in MVP

- **LinkedIn / Indeed / StepStone / XING scraping or login automation** —
  ToS-restricted, anti-bot-protected, brittle. Mitigation: manual URL/text
  import (jobs pasted into the dashboard flow through the same
  analyze→prepare pipeline), plus ATS/public-API coverage.
- **Email integration (IMAP/Gmail classification)** — statuses are updated
  manually in MVP; schema and state machine are already shaped for it.
- **Multi-user, auth, billing** — single-user, local/self-hosted.
- **Embeddings / vector search / RAG** — at MVP volume, SQL + LLM scoring is
  simpler and better.
- **Redis / BullMQ / distributed workers** — in-process scheduler; module
  seams preserved for extraction.
- **Self-modifying learning loop** — insights are surfaced, never applied
  automatically (explicit requirement).
- **Pixel-perfect CV template gallery** — one clean typographic template.
- **CAPTCHA solving / anti-bot evasion / headful farming** — never.
- **Push/email notifications, mobile app** — dashboard badges only.

## 7. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (ESM, strict) | one language across agent/API/UI, shared domain types |
| Runtime | Node.js ≥ 20 | Playwright + SDK ecosystem |
| Monorepo | npm workspaces | zero extra tooling |
| DB | SQLite (`better-sqlite3`) + Drizzle ORM | zero-config local file DB, typed queries, hand-written idempotent SQL migrations; Drizzle keeps the Postgres upgrade path |
| API | Fastify | fast, typed, tiny |
| Agent scheduling | in-process orchestrator (interval + jitter) | instant pause, no broker |
| LLM | Anthropic API (`@anthropic-ai/sdk`), `claude-sonnet-5` primary, `claude-haiku-4-5` for cheap classification | forced tool-use for guaranteed-JSON outputs, zod-validated |
| Browser automation | Playwright (Chromium) | ATS adapters + Markdown→PDF rendering |
| Frontend | Vite + React 18 + Tailwind CSS v4 + Recharts | minimal modern SaaS dashboard |
| Validation | zod at every boundary (API input, LLM output, DB JSON docs) | |
| Tests | Vitest on `packages/core` | deterministic domain logic fully covered without network/LLM |
| Secrets | `.env` only (`ANTHROPIC_API_KEY`), never in DB or repo | |

**Scale path (documented, not built):** SQLite→Postgres via Drizzle,
orchestrator→BullMQ workers, artifacts→S3, add Gmail Mail Clerk, add
per-user auth.
