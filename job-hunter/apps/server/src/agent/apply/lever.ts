import type { Page } from 'playwright';
import { detectCaptcha, fillIfPresent, getApplyBrowser, rateLimit, saveScreenshot } from './browser';
import { discoverContainerFields } from './domfields';
import { resolveAndFill, type ApplyDeps, type ApplyResult } from './form';

const STANDARD_KEYS = new Set(['name', 'email', 'phone', 'org', 'resume', 'comments', 'location']);

export function matchesLever(url: string): boolean {
  return /jobs\.(eu\.)?lever\.co\//i.test(url);
}

function applyUrlFor(jobUrl: string): string {
  const clean = jobUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return clean.endsWith('/apply') ? clean : `${clean}/apply`;
}

/** Strip markdown decorations for plain-text textareas. */
export function mdToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

async function uploadResume(page: Page, cvPdfPath: string): Promise<boolean> {
  for (const sel of ['input[name="resume"]', '#resume-upload-input', 'input[type="file"]']) {
    const el = await page.$(sel).catch(() => null);
    if (!el) continue;
    try {
      await el.setInputFiles(cvPdfPath);
      await page.waitForTimeout(4000); // Lever parses the resume asynchronously
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** Apply on a Lever hosted posting (jobs.lever.co/{org}/{id}/apply). */
export async function applyLever(jobUrl: string, deps: ApplyDeps): Promise<ApplyResult> {
  const browser = await getApplyBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const target = applyUrlFor(jobUrl);
    await rateLimit(target);
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1500);

    const captcha = await detectCaptcha(page);
    if (captcha) {
      await saveScreenshot(page, deps.artifactsDir, 'captcha');
      return { kind: 'needs_action', reason: `${captcha} — automated submission stopped; apply manually` };
    }
    if (!(await page.$('input[name="name"]').catch(() => null))) {
      await saveScreenshot(page, deps.artifactsDir, 'no-form');
      return { kind: 'needs_action', reason: 'application form not found on the page' };
    }

    await fillIfPresent(page, 'input[name="name"]', deps.profile.fullName);
    await fillIfPresent(page, 'input[name="email"]', deps.profile.email);
    await fillIfPresent(page, 'input[name="phone"]', deps.profile.phone);
    await fillIfPresent(page, 'input[name="location"]', deps.profile.location);
    const currentCompany = deps.profile.workExperience.find((w) => w.current)?.company ?? '';
    await fillIfPresent(page, 'input[name="org"]', currentCompany);
    await fillIfPresent(page, 'input[name="urls[LinkedIn]"]', deps.profile.links.linkedin);
    await fillIfPresent(page, 'input[name="urls[GitHub]"]', deps.profile.links.github);
    await fillIfPresent(page, 'input[name="urls[Portfolio]"]', deps.profile.links.portfolio);
    await fillIfPresent(page, 'input[name="urls[Other]"]', deps.profile.links.portfolio);

    if (!(await uploadResume(page, deps.cvPdfPath))) {
      await saveScreenshot(page, deps.artifactsDir, 'resume-upload-failed');
      return { kind: 'needs_action', reason: 'could not upload the CV file' };
    }
    if (deps.coverLetterMd) {
      await fillIfPresent(page, 'textarea[name="comments"]', mdToPlain(deps.coverLetterMd));
    }

    const discovered = await discoverContainerFields(page, '.application-question, li.application-question', STANDARD_KEYS);
    const fields = discovered.fields.filter((f) => !(f.q.fieldKey ?? '').startsWith('urls['));
    if (discovered.blockers.length > 0) {
      await saveScreenshot(page, deps.artifactsDir, 'blocked');
      return { kind: 'needs_action', reason: discovered.blockers.join('; ') };
    }
    const { answers, pending } = await resolveAndFill(deps, fields);
    if (pending.length > 0) {
      await saveScreenshot(page, deps.artifactsDir, 'needs-input');
      return { kind: 'needs_input', questions: pending, answers };
    }

    if (deps.ctx.paused()) return { kind: 'paused' };
    await saveScreenshot(page, deps.artifactsDir, 'before-submit');
    if (deps.dryRun) return { kind: 'dry_run', answers };

    const submit = await page.$('button[data-qa="btn-submit"], #btn-submit, button[type="submit"]');
    if (!submit) return { kind: 'needs_action', reason: 'submit button not found' };
    await submit.click();

    let confirmation = '';
    try {
      await page.waitForURL(/\/thanks/i, { timeout: 20_000 });
      confirmation = 'Application received (Lever thank-you page)';
    } catch {
      await page.waitForTimeout(4000);
      const body = (await page.textContent('body').catch(() => '')) ?? '';
      const m = body.match(/[^.\n]*?(thank you|application (?:was )?(?:received|submitted))[^.\n]*/i);
      if (m) confirmation = m[0].trim();
    }
    if (!confirmation) {
      await saveScreenshot(page, deps.artifactsDir, 'after-submit-unclear');
      return { kind: 'needs_action', reason: 'submission result could not be confirmed — verify manually' };
    }
    await saveScreenshot(page, deps.artifactsDir, 'confirmation');
    return { kind: 'submitted', confirmation: confirmation.slice(0, 300), answers };
  } catch (err) {
    await saveScreenshot(page, deps.artifactsDir, 'error').catch(() => {});
    return { kind: 'failed', reason: (err as Error).message };
  } finally {
    await context.close().catch(() => {});
  }
}
