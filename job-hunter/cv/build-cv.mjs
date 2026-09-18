#!/usr/bin/env node
/**
 * Renders cv-template.html into a one-page A4 PDF.
 *
 * The template is plain HTML with four placeholders the build fills in, so the
 * fonts and the photo end up embedded in the file and the PDF is self-contained:
 *   {{F400}} {{F600}} {{F700}} {{F800}}  Manrope weights, base64 woff2
 *   {{PHOTO}}                            photo.jpg, base64
 *
 * Two checks run after rendering:
 *   - page overflow: anything past one A4 page is reported, since a CV that
 *     silently spills onto page two is worse than one that is a line shorter
 *   - fact-guard: every claim in the rendered text is verified against
 *     ../data/profile.seed.json when that file is present (it is gitignored,
 *     so the check is skipped outside the author's own machine)
 *
 * Usage:  node build-cv.mjs [template.html] [-o out.pdf]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const A4_PX = 1123; // 297mm at 96dpi

const args = process.argv.slice(2);
const outFlag = args.indexOf('-o');
const outPath = outFlag !== -1 ? args[outFlag + 1] : path.join(dir, 'out', 'CV.pdf');
const templatePath = path.resolve(dir, args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o') ?? 'cv-template.html');
const photoPath = path.join(dir, 'photo.jpg');

for (const [label, p] of [['template', templatePath], ['photo', photoPath]]) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${label}: ${p}`);
    process.exit(1);
  }
}

/** Resolve a Manrope weight from @fontsource, preferring the latin-ext subset. */
function font(weight) {
  const base = path.join(dir, 'node_modules', '@fontsource', 'manrope', 'files');
  for (const subset of ['latin-ext', 'latin']) {
    const f = path.join(base, `manrope-${subset}-${weight}-normal.woff2`);
    if (fs.existsSync(f)) return fs.readFileSync(f).toString('base64');
  }
  throw new Error(`Manrope ${weight} not found — run: npm install`);
}

const html = fs
  .readFileSync(templatePath, 'utf8')
  .replaceAll('{{F400}}', font(400))
  .replaceAll('{{F600}}', font(600))
  .replaceAll('{{F700}}', font(700))
  .replaceAll('{{F800}}', font(800))
  .replaceAll('{{PHOTO}}', fs.readFileSync(photoPath).toString('base64'));

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const browser = await chromium.launch({
  // The sandboxed environment ships a Chromium that Playwright's own download
  // would not match; JH_CHROMIUM_PATH points at it. Elsewhere this is unset and
  // Playwright uses the browser it installed.
  executablePath: process.env.JH_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });

const overflow = await page.evaluate((limit) => document.body.scrollHeight - limit, A4_PX);
const text = await page.evaluate(() => document.body.innerText);

await page.pdf({ path: outPath, width: '210mm', height: '297mm', printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' } });
await browser.close();

console.log(`written ${outPath}`);
console.log(overflow > 0
  ? `⚠ overflows A4 by ${overflow}px — tighten the template, the PDF will run onto a second page`
  : `✓ fits on one A4 page (${Math.abs(overflow)}px to spare)`);

// ---- fact-guard ----------------------------------------------------------
const profilePath = path.join(dir, '..', 'data', 'profile.seed.json');
if (!fs.existsSync(profilePath)) {
  console.log('· fact-guard skipped — ../data/profile.seed.json not present');
} else {
  try {
    const { factGuard } = await import('@jobhunter/core');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const report = factGuard(profile, text, 'letter');
    if (report.ok) {
      console.log('✓ fact-guard passed — every claim traces back to the profile');
    } else {
      console.log('⚠ fact-guard found claims not backed by the profile:');
      for (const v of report.violations) console.log(`   · [${v.type}] ${v.detail}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(`· fact-guard unavailable (${err.message}) — run from the job-hunter workspace to enable it`);
  }
}
