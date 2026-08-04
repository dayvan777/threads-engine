# Wave Runbook — Threads Engine

Self-contained instructions for one generation wave.
Repo: https://github.com/dayvan777/threads-engine (public). Local checkout: `C:\Users\vdomo\threads poster`.
Dashboard: `docs/index.html`, served at **https://dayvan777.github.io/threads-engine/** via GitHub Pages (master, /docs). Pushing to master IS the deploy.
Waves: **morning** (~08:00 Kyiv = 05:00 UTC) and **evening** (~18:00 Kyiv = 15:00 UTC). Cloud runs execute in a fresh clone; local runs must `git pull` first.

## Steps

1. **Sync.** `git pull` (local) or work in the fresh clone (cloud). Read `viral-patterns.md` (formula + scoring rubric) and `posts-history.md` (skip stories already used; check the Rejected list — a rejected story returns only on a major new development).

2. **Hunt news.** WebSearch 4-6 queries for AI/tech news from the last 12 hours. Query mix: "AI news today <date>", "OpenAI OR Anthropic OR Nvidia OR DeepSeek announcement", "tech IPO OR funding OR price change today", "AI layoffs OR jobs news", plus one query chasing yesterday's biggest story. Priority per patterns: money/access for regular people, job displacement, company conflict/drama, leaks & quiet changes — NOT press-release feature recaps. Collect 5-6 candidates with source URLs and dates. Discard anything older than ~24h unless it's a major escalation.

3. **Score and select.** Score candidates with the rubric in `viral-patterns.md`. Keep top 3 (2 main + 1 backup). At least one post per wave targets a broad audience (money/jobs), at most one niche dev topic.

4. **Write posts** in the account voice (Post formula in `viral-patterns.md`): English, hook line with a number or named conflict, then 2-3 punchy sentences OR ≤6 "→" bullets, quotable punchline, ≤500 chars, no hashtags, no threads. Exactly one post in every 3 (track across waves) gets the X CTA: `I track this stuff daily on my X → x.com/dayvanxd` or an organic variant.

5. **Find media for each post** — 1-2 direct-download image links Vlad can attach. **PNG or JPG only — Threads does not accept SVG attachments.** In order of preference:
   - Wikimedia Commons logo/photo of the companies involved via `https://commons.wikimedia.org/wiki/Special:FilePath/<File_Name>.svg?width=1200` — the `?width=` parameter makes Commons render a PNG even for SVG files (verify the file exists via search before using).
   - The news article's og:image (extract via WebFetch) if it's a direct PNG/JPG URL.
   Never link a raw `.svg` file (e.g. raw.githubusercontent.com icons). Every link must open as a PNG/JPG image, not a webpage. Verify with WebFetch if unsure.

6. **Queue for auto-posting.** Append the 2 MAIN posts (never the backup) to `queue.json` in repo root as objects `{"id": "<date>-<wave>-<n>", "wave": "<date> <wave>", "text": "<exact post text>", "image_url": null, "status": "queued"}`. GitHub Actions publishes queued items to Threads at 09:00, 12:00, 19:00, 21:30 Kyiv — oldest queued first. Before appending, set any still-`queued` items from waves older than 24h to `"status": "skipped"` (stale news must not get posted). Set `image_url` only when a genuinely strong direct PNG/JPG exists (a bare company logo does NOT qualify — leave null).

7. **Update `posts-history.md`.** Append the new wave section (same format: score, patterns, status draft/backup, source, media links, text). Mark previous wave posts `[status: expired]` unless `[status: posted]`. Record rejected candidates with one-line reasons.

8. **Update `docs/index.html`.** Replace the three post cards with the new wave (keep markup: score badge s-high ≥8 / s-mid otherwise, pattern tags, CTA tag if applicable, media row with download links, source link host + date, copy button). Update the status line (date + wave name + next wave time). Move the previous wave into "Прошлые волны" (keep only the most recent previous wave there). If `viral-patterns.md` changed, refresh "Твои viral-паттерны".

9. **Commit and push.** `git add -A && git commit -m "wave: <date> <morning|evening>" && git push`. The push deploys GitHub Pages automatically (may take 1-2 min).

10. **On failure** (search down, push rejected): put the error into the dashboard status line (`● error: <short text>` instead of `● ok`), still commit and push whatever state changed. On push conflict: `git pull --rebase` then push again. Never leave posts-history.md half-written.

## Deprecated
The old Claude Artifact dashboard (see `dashboard/artifact-url.md`) is no longer updated — GitHub Pages is canonical.
