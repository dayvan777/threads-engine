#!/usr/bin/env node
/**
 * Builds the job-radar dashboard from `page.html` + `jobs.json` into two targets:
 *   index.html     — standalone page deployed as static output (Vercel)
 *   artifact.html  — same page as a fragment for publishing as a Claude Artifact,
 *                    which wraps content in its own <!doctype>/<head>/<body>
 * Both inline the job data, so neither target needs a fetch at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const jobs = JSON.parse(read('jobs.json'));
const asof = process.env.ASOF ?? new Date().toLocaleDateString('ru-RU');

const fragment = read('page.html')
  .replaceAll('{{ASOF}}', asof)
  .replace('{{DATA}}', JSON.stringify(jobs));

const standalone = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Живой дашборд поиска работы: вакансии AI Automation Engineer с зарплатами, прямыми контактами и статусами откликов.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#f2f1ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121316" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2315161a'/%3E%3Ccircle cx='16' cy='9' r='3.4' fill='none' stroke='%23c0102b' stroke-width='2.6'/%3E%3Cpath d='M16 12.4v7.2' stroke='%2300549f' stroke-width='2.6'/%3E%3Ccircle cx='16' cy='23' r='3.4' fill='%231a7238'/%3E%3C/svg%3E">
<style>:root{color-scheme:light dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${fragment}
</body>
</html>
`;

fs.writeFileSync(path.join(dir, 'index.html'), standalone);
fs.writeFileSync(path.join(dir, 'artifact.html'), fragment);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`built ${jobs.length} jobs · index.html ${kb(standalone)} · artifact.html ${kb(fragment)} · as of ${asof}`);
