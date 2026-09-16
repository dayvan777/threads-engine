import type { Page } from 'playwright';
import { detectCaptcha, fillIfPresent, getApplyBrowser, rateLimit, saveScreenshot, splitName } from './browser';
import { discoverContainerFields } from './domfields';
import { resolveAndFill, type ApplyDeps, type ApplyResult } from './form';

const STANDARD_KEYS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'resume', 'resume_text',
  'cover_letter', 'cover_letter_text', 'security_code', 'g-recaptcha-response',
  'job_application[first_name]', 'job_application[last_name]', 'job_application[email]',
  'job_application[phone]', 'job_application[location]', 'auto_complete_input', 'location',
]);

export function matchesGreenhouse(url: string): boolean {
  return /(?:^|\.)greenhouse\.io\//i.test(url) || /job-boards\.greenhouse\.io/i.test(url);
}

async function findForm(page: Page): Promise<boolean> {
  for (const sel of ['#application_form', 'form#application-form', '#application-form form', 'form[action*="greenhouse"]']) {
    if (await page.$(sel).catch(() => null)) return true;
  }
  return false;
}

async function uploadResume(page: Page, cvPdfPath: string): Promise<boolean> {
  const candidates = [
    'input[type="file"]#resume',
    'input[type="file"][name*="resume"]',
    '#resume_fieldset input[type="file"]',
    'input[type="file"]',
  ];
  for (const sel of candidates) {
    const el = await page.$(sel).catch(() => null);
    if (!el) continue;
    try {
      await el.setInputFiles(cvPdfPath);
      await page.waitForTimeout(3500); // async upload to storage
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function fillCoverLetter(page: Page, text: string): Promise<boolean> {
  const direct = await page.$('#cover_letter_text, textarea[name*="cover_letter"]').catch(() => null);
  if (direct && (await direct.isVisible().catch(() => false))) {
    await direct.fill(text).catch(() => {});
    return true;
  }
  // Classic boards hide the textarea behind a "paste" toggle.
  const toggle = await page
    .$('#cover_letter a[data-source="paste"], [id*="cover_letter"] a[data-source="paste"]')
    .catch(() => null);
  if (toggle) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(400);
    const after = await page.$('#cover_letter_text, textarea[name*="cover_letter"]').catch(() => null);
    if (after) {
      await after.fill(text).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Apply on a Greenhouse-hosted job board (classic boards.greenhouse.io layout). */
export async function applyGreenhouse(jobUrl: string, deps: ApplyDeps): Promise<ApplyResult> {
  const browser = await getApplyBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await rateLimit(jobUrl);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1500);

    const captcha = await detectCaptcha(page);
    if (captcha) {
      await saveScreenshot(page, deps.artifactsDir, 'captcha');
      return { kind: 'needs_action', reason: `${captcha} — automated submission stopped; apply manually` };
    }
    if (!(await findForm(page))) {
      await saveScreenshot(page, deps.artifactsDir, 'no-form');
      return { kind: 'needs_action', reason: 'application form not found on the page' };
    }

    const { first, last } = splitName(deps.profile.fullName);
    await fillIfPresent(page, '#first_name, input[name="job_application[first_name]"], input[name="first_name"]', first);
    await fillIfPresent(page, '#last_name, input[name="job_application[last_name]"], input[name="last_name"]', last);
    await fillIfPresent(page, '#email, input[name="job_application[email]"], input[name="email"]', deps.profile.email);
    await fillIfPresent(page, '#phone, input[name="job_application[phone]"], input[name="phone"]', deps.profile.phone);
    await fillIfPresent(page, '#auto_complete_input, input[name="job_application[location]"]', deps.profile.location);

    if (!(await uploadResume(page, deps.cvPdfPath))) {
      await saveScreenshot(page, deps.artifactsDir, 'resume-upload-failed');
      return { kind: 'needs_action', reason: 'could not upload the CV file' };
    }
    if (deps.coverLetterMd) await fillCoverLetter(page, deps.coverLetterMd);

    const discovered = await discoverContainerFields(
      page,
      '#custom_fields .field, #eeoc_fields .field, #demographic_questions .field, #demographic_questions .demographic_question',
      STANDARD_KEYS,
    );
    if (discovered.blockers.length > 0) {
      await saveScreenshot(page, deps.artifactsDir, 'blocked');
      return { kind: 'needs_action', reason: discovered.blockers.join('; ') };
    }
    const { answers, pending } = await resolveAndFill(deps, discovered.fields);
    if (pending.length > 0) {
      await saveScreenshot(page, deps.artifactsDir, 'needs-input');
      return { kind: 'needs_input', questions: pending, answers };
    }

    if (deps.ctx.paused()) return { kind: 'paused' };
    await saveScreenshot(page, deps.artifactsDir, 'before-submit');
    if (deps.dryRun) return { kind: 'dry_run', answers };

    const submit = await page.$('#submit_app, input[type="submit"], button[type="submit"]');
    if (!submit) return { kind: 'needs_action', reason: 'submit button not found' };
    await submit.click();

    let confirmation = '';
    try {
      const conf = await page.waitForSelector('#application_confirmation, .application-confirmation', { timeout: 20_000 });
      confirmation = (await conf.innerText()).trim();
    } catch {
      await page.waitForTimeout(4000);
      const body = (await page.textContent('body').catch(() => '')) ?? '';
      const m = body.match(/[^.\n]*?(thank you|application (?:was )?(?:received|submitted))[^.\n]*/i);
      if (m) confirmation = m[0].trim();
    }
    if (!confirmation) {
      const errors = await page.$$('.field-error, .error:visible').catch(() => []);
      await saveScreenshot(page, deps.artifactsDir, 'after-submit-unclear');
      return {
        kind: 'needs_action',
        reason:
          errors.length > 0
            ? 'the form reported validation errors after submission'
            : 'submission result could not be confirmed — verify manually',
      };
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
