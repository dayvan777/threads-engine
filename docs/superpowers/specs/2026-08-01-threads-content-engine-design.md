# Threads Content Engine — Design Spec

**Date:** 2026-08-01
**Owner:** Vlad (@realvladd on Threads, @dayvanxd on X)
**Status:** Approved design, pending spec review

## Goal

Automate the daily content routine for the Threads account @realvladd (AI/Tech niche, posts in English): analyze the account's existing posts for viral patterns, generate 3–4 fresh news-driven posts per day, present them in a private online dashboard for one-click copy-and-post, and funnel traffic to the owner's X account (@dayvanxd). Success = growing followers (baseline: 66) and consistent daily posting with minimal manual effort.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Publishing | Semi-automatic: dashboard generates drafts, Vlad reviews, copies, and posts manually. No Threads API, no Meta developer app. |
| Architecture | Claude Code generates content on a schedule; dashboard is a private Claude Artifact (online URL, works on phone). No external API keys or hosting. |
| Cadence | 2 waves per day: ~08:00 and ~18:00 Europe/Kyiv. Each wave: 2 main posts + 1 backup. News no older than ~12 hours at generation time. |
| Language | Posts in English (matches existing account style). Working conversation language: Russian. |

## Components

### 1. Viral pattern analysis
- **Initial deep dive (once):** analyze all ~20 existing posts. The public (logged-out) view shows only 4 posts; full access requires Vlad opening the profile via the Claude in Chrome extension, or pasting post texts/screenshots.
- **Known signal already:** the SpaceX IPO / Fidelity post (866 likes, 147 replies) massively outperforms Claude-feature recaps (2–5 likes). Working hypothesis: "ordinary people gaining access to money/technology + concrete numbers" beats product-feature recaps.
- **Output:** `viral-patterns.md` in the project folder — working hooks, post structure (first-line hook + "→" bullets, no hashtag spam), magnet topics, anti-patterns.
- **Weekly refresh:** once a week, re-check metrics on recent posts (public like counts via browser; view counts only if Vlad shares insights) and update `viral-patterns.md`.

### 2. Scheduled generation (2 waves/day)
Cloud scheduled task at ~08:00 and ~18:00 Kyiv time. Each run:
1. Web-search the hottest AI/tech news from the last 12 hours. Priority: money/access/conflict/hard-numbers angles over press-release recaps.
2. Select 5–6 candidate stories; score against `viral-patterns.md`.
3. Write 2 main posts + 1 backup in the account voice: English, hook as first line, "→" bullets, ≤500 chars, no hashtags.
4. Republish the dashboard artifact with the new batch.
- **Error handling:** if a wave fails (search/publish error), the run reports the failure visibly on the dashboard status line and the next wave proceeds independently.

### 3. Dashboard (private Artifact)
- Post cards: final text, copy button, source link, viral-potential score, which pattern was applied.
- "Your patterns" section: current contents of viral-patterns.md in readable form.
- Status line: last update time, next wave time, any errors.
- Stays private by default; single stable URL, updated in place each wave.

### 4. X traffic funnel
- Bio link to x.com/dayvanxd already in place (base layer).
- ~Every third post carries an organic CTA ("full breakdown on my X" / thread continuation on X). Not every post — Threads suppresses reach on link-heavy accounts.

## Data flow

Web search (fresh news) → candidate selection → scoring vs viral-patterns.md → post generation → artifact republish → Vlad reviews on phone/desktop → manual post to Threads.

Local state in project folder: `viral-patterns.md`, `posts-history.md` (log of generated posts to avoid repeats and enable weekly review).

## Build order

1. Deep post analysis → `viral-patterns.md` (needs Vlad's Chrome or pasted posts; falls back to the 4 public posts + niche best practices if unavailable).
2. Dashboard v1 with the first generated batch (same day).
3. Scheduled task setup for the 2 daily waves.
4. After ~1 week: first pattern revision based on real metrics.

## Out of scope (YAGNI)

- Auto-posting via Threads API (may revisit later if manual posting becomes the bottleneck).
- Image/video generation for posts.
- Twitter auto-posting.
- Multi-account support.
- Analytics beyond weekly pattern review.
