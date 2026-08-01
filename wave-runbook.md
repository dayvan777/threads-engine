# Wave Runbook — Threads Engine

Self-contained instructions for one generation wave. Project folder: `C:\Users\vdomo\threads poster`.
Waves: **morning** (~08:00 Kyiv) and **evening** (~18:00 Kyiv). Also used for manual runs.

## Steps

1. **Read state.** Read `viral-patterns.md` (formula + scoring rubric) and `posts-history.md` (skip stories already used in any previous wave; check the Rejected list too — a rejected story may return only if there is a major new development).

2. **Hunt news.** WebSearch 4-6 queries for AI/tech news from the last 12 hours. Query mix: "AI news today <date>", "OpenAI OR Anthropic OR Nvidia OR DeepSeek announcement", "tech IPO OR funding OR price change today", "AI layoffs OR jobs news", plus one query chasing whatever yesterday's biggest story was. Priority per patterns: money/access for regular people, job displacement, company conflict/drama, leaks & quiet changes — NOT press-release feature recaps. Collect 5-6 candidates with source URLs and publication dates. Verify freshness: discard anything older than ~24h unless it's a major escalation.

3. **Score and select.** Score each candidate with the rubric in `viral-patterns.md`. Keep top 3 (2 main + 1 backup). At least one post per wave should target a broad audience (money/jobs), at most one niche dev topic.

4. **Write posts** in the account voice (see Post formula in `viral-patterns.md`): English, hook line with a number or named conflict, then 2-3 punchy sentences OR ≤6 "→" bullets, quotable punchline, ≤500 chars, no hashtags, no threads. Exactly one post in every 3 (track across waves in posts-history.md) gets the X CTA line: `I track this stuff daily on my X → x.com/dayvanxd` or an organic variant.

5. **Update `posts-history.md`.** Append the new wave section (same format as existing entries: score, pattern, status draft/backup, source, text). Mark all posts of the previous wave `[status: expired]` unless already marked `[status: posted]`. Record rejected candidates with one-line reasons.

6. **Update the dashboard.** Edit `dashboard/dashboard.html`: replace the three post cards with the new wave (keep card markup: score badge s-high ≥8 / s-mid otherwise, pattern tags, CTA tag if applicable, source link with host + date, copy button). Update the status line (date + wave name + next wave time). Move the previous wave's posts into the "Прошлые волны" details section (keep only the most recent previous wave there). If viral-patterns.md changed, refresh the "Твои viral-паттерны" section.

7. **Republish the artifact.** Read `dashboard/artifact-url.md` and follow its rules: same-session republish by file path, cross-session republish MUST pass the `url` parameter. Keep favicon 🧵.

8. **On failure** (search down, publish error): write the error into the dashboard status line (`● error: <short text>` instead of `● ok`), republish if possible, and still commit whatever state changed. Never leave posts-history.md half-written.

9. **Commit.** `git add -A && git commit -m "wave: <date> <morning|evening>"`.
