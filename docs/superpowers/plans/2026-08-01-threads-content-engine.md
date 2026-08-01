# Threads Content Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a private artifact dashboard that serves Vlad 2×/day batches of viral-pattern-scored Threads posts generated from fresh AI/tech news.

**Architecture:** Claude Code is the engine: it analyzes @realvladd's posts into `viral-patterns.md`, generates posts from ≤12h-old news via WebSearch, and republishes a single private Artifact dashboard. Two cloud scheduled tasks (08:00 / 18:00 Europe/Kyiv) drive the waves. State lives as markdown files in the project folder.

**Tech Stack:** Claude Code (WebSearch, Artifact, scheduled tasks, Claude in Chrome), plain HTML/CSS/JS artifact, markdown state files. No external APIs, no build system, no test framework — verification is manual per step.

---

### Task 1: Collect full post corpus from @realvladd

**Files:**
- Create: `data/posts-raw.md`

- [ ] **Step 1: Try full profile via user's Chrome.** Ask Vlad to open https://www.threads.com/@realvladd in his logged-in Chrome. Then load `mcp__claude-in-chrome__*` tools via ToolSearch (one call: tabs_context_mcp, navigate, get_page_text, read_page, computer), read the profile, scroll until all ~20 posts are captured.
- [ ] **Step 2: Fallback if Chrome unavailable.** If Vlad can't/won't connect Chrome now, use the 4 publicly visible posts already captured in this session (SpaceX IPO, Fable 5 prompting guide, Claude Science, Fable 5 launch/export-control) and note in the file: `<!-- partial corpus: 4/20 posts; re-run Task 1 when Chrome available -->`.
- [ ] **Step 3: Write `data/posts-raw.md`.** One section per post:

```markdown
## Post YYYY-MM-DD — <short slug>
**Metrics:** likes=N replies=N reposts=N shares=N (views=N if available)
**Text:**
<verbatim post text>
```

- [ ] **Step 4: Commit.**

```bash
git add data/posts-raw.md
git commit -m "data: capture @realvladd post corpus"
```

### Task 2: Viral pattern analysis → viral-patterns.md

**Files:**
- Create: `viral-patterns.md`
- Read: `data/posts-raw.md`

- [ ] **Step 1: Score and rank posts.** Rank corpus by likes. Compute median; posts >3× median = hits, <median = duds. (With the 4-post fallback corpus: SpaceX IPO post = hit at 866 likes; the 2–5-like feature recaps = duds.)
- [ ] **Step 2: Extract patterns.** For hits and duds, identify: topic category, first-line hook type, structure, numbers density, emotional trigger (access/money/fear/outrage/curiosity), CTA presence. Cross-check against known Threads engagement drivers via WebSearch ("what makes posts go viral on Threads 2026") — but weight Vlad's own data over generic advice.
- [ ] **Step 3: Write `viral-patterns.md`** with exactly these sections:

```markdown
# Viral Patterns — @realvladd
_Last updated: YYYY-MM-DD (corpus: N posts)_

## Hits (what works)
- <pattern>: <evidence post + metric>

## Duds (what doesn't)
- <anti-pattern>: <evidence>

## Post formula
1. Hook line: <rules derived from hits, e.g. concrete number + access/money angle>
2. Body: → bullets, ≤6, each a hard fact
3. Length ≤500 chars, no hashtags
4. Punchline: one-sentence "why this matters to YOU"

## Magnet topics (ranked)
1. ...

## Scoring rubric (0-10)
+3 money/access angle, +2 hard numbers in hook, +2 conflict/stakes, +1 urgency/deadline, +1 "regular people" relevance, +1 contrarian take; -3 press-release recap, -2 no numbers
```

- [ ] **Step 4: Commit.**

```bash
git add viral-patterns.md
git commit -m "feat: viral pattern analysis from post corpus"
```

### Task 3: Generate first post batch

**Files:**
- Create: `posts-history.md`
- Read: `viral-patterns.md`

- [ ] **Step 1: Hunt news.** WebSearch 4-6 queries for AI/tech news from the last 12h (e.g. "AI news today", "OpenAI OR Anthropic OR Nvidia announcement", "tech IPO OR funding today", "AI regulation news"). Collect 5-6 candidate stories with source URLs.
- [ ] **Step 2: Score candidates** with the rubric from `viral-patterns.md`. Keep top 3.
- [ ] **Step 3: Write 3 posts** (2 main + 1 backup) following the Post formula. English, ≤500 chars. Exactly one of the 3 gets an X CTA line (e.g. "Full breakdown on my X → x.com/dayvanxd").
- [ ] **Step 4: Write `posts-history.md`:**

```markdown
# Posts History

## Wave 2026-08-01 <morning|evening>
### Post 1 [score 8/10, pattern: money-access] [status: draft]
Source: <url>
<post text>
...
```

- [ ] **Step 5: Commit.**

```bash
git add posts-history.md
git commit -m "feat: first generated post batch"
```

### Task 4: Dashboard artifact v1

**Files:**
- Create: `dashboard/dashboard.html`
- Create: `dashboard/artifact-url.md`

- [ ] **Step 1: Load the `artifact-design` skill** (mandatory before writing the artifact page).
- [ ] **Step 2: Write `dashboard/dashboard.html`.** Single self-contained page (no external resources, light+dark theme via `prefers-color-scheme` + `:root[data-theme]` overrides), `<title>Threads Engine</title>`. Layout:
  - Header: "Threads Engine" + status line (last update, wave name, next wave time, error text if any).
  - Post cards from the current wave: post text in a `<pre>`-style block, "📋 Copy" button (`navigator.clipboard.writeText`, button flips to "✓ Copied"), meta row: score badge, pattern tag, source link, CTA badge if post carries the X CTA.
  - Collapsible "Patterns" `<details>` section rendering the current viral-patterns.md content.
  - Collapsible "Previous waves" `<details>` with the prior batch.
- [ ] **Step 3: Publish artifact.** `Artifact(file_path: dashboard/dashboard.html, favicon: "🧵", title: "Threads Engine", description: "Daily Threads post generator for @realvladd")`. Save the returned URL into `dashboard/artifact-url.md` (plain: `URL: <url>` + `Favicon: 🧵` + rule: always republish same file path / pass this URL from other sessions).
- [ ] **Step 4: Verify on phone-size viewport.** Open the artifact URL in the Browser pane, `resize_window` preset mobile, screenshot: cards readable, copy button works (click it, verify "✓ Copied" state). Fix and republish if broken.
- [ ] **Step 5: Commit.**

```bash
git add dashboard/
git commit -m "feat: dashboard artifact v1"
```

### Task 5: Scheduled waves + weekly pattern review

**Files:**
- Create: `wave-runbook.md`
- Modify: `dashboard/artifact-url.md` (no changes expected — read for URL)

- [ ] **Step 1: Write `wave-runbook.md`** — the self-contained instruction a scheduled run follows. Content: (1) read `viral-patterns.md` + `posts-history.md` (skip stories already posted); (2) Task 3 steps 1-3 verbatim (news hunt → score → 2+1 posts, X CTA in ~1 of 3); (3) append wave to `posts-history.md`, mark previous wave posts `[status: expired]` unless marked `[status: posted]`; (4) update `dashboard/dashboard.html` cards + status line, republish artifact using URL from `dashboard/artifact-url.md`; (5) on failure: write error into dashboard status line and republish; commit all file changes.
- [ ] **Step 2: Create the two daily schedules.** Load the `schedule` skill; create runs at 08:00 and 18:00 Europe/Kyiv with prompt: "Open C:\Users\vdomo\threads poster\wave-runbook.md and execute it for the <morning|evening> wave." If cloud agents can't reach local files, fall back to `mcp__scheduled-tasks__create_scheduled_task` with the full runbook text inlined in the prompt.
- [ ] **Step 3: Create weekly review schedule.** Sunday 12:00 Kyiv: "Re-read @realvladd's recent Threads posts metrics (browser), compare against predictions in posts-history.md, update viral-patterns.md Hits/Duds/rubric, republish dashboard Patterns section."
- [ ] **Step 4: Verify schedules.** List scheduled tasks, confirm all 3 exist with correct cron times.
- [ ] **Step 5: Commit.**

```bash
git add wave-runbook.md
git commit -m "feat: wave runbook + 2 daily schedules + weekly review"
```

### Task 6: End-to-end dry run

- [ ] **Step 1: Execute `wave-runbook.md` manually once** in this session (as the evening wave) — proves the runbook is unambiguous and the artifact updates in place at the same URL.
- [ ] **Step 2: Confirm with Vlad** — send him the artifact URL, ask him to open it on his phone, copy a post, and post it to Threads.
- [ ] **Step 3: Commit any runbook fixes.**

```bash
git add -A
git commit -m "fix: runbook adjustments from dry run"
```
