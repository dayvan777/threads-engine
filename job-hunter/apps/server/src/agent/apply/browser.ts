import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';

/**
 * Safety rails for browser automation:
 * - single browser, single page at a time (global concurrency 1)
 * - per-domain pacing with jitter
 * - CAPTCHA / bot-challenge detection that ABORTS (never solves or evades)
 * - screenshot audit trail
 */

let browserPromise: Promise<Browser> | null = null;

export async function getApplyBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      try {
        return await chromium.launch({
          headless: true,
          executablePath: process.env.JH_CHROMIUM_PATH || undefined,
        });
      } catch (err) {
        browserPromise = null;
        throw new Error(
          `Could not launch Chromium: ${(err as Error).message}. Run "npx playwright install chromium" or set JH_CHROMIUM_PATH.`,
        );
      }
    })();
  }
  return browserPromise;
}

export async function closeApplyBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }
}

const lastActionByDomain = new Map<string, number>();
const MIN_DOMAIN_INTERVAL_MS = 45_000;

export async function rateLimit(url: string): Promise<void> {
  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch {
    /* keep raw */
  }
  const last = lastActionByDomain.get(domain) ?? 0;
  const wait = last + MIN_DOMAIN_INTERVAL_MS + Math.floor(Math.random() * 10_000) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastActionByDomain.set(domain, Date.now());
}

const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  '.g-recaptcha',
  '[data-sitekey]',
  'iframe[src*="hcaptcha"]',
  '.h-captcha',
  '#cf-challenge-running',
  'iframe[src*="turnstile"]',
];

/** Returns a human-readable reason when a CAPTCHA / bot challenge is present. */
export async function detectCaptcha(page: Page): Promise<string | null> {
  for (const sel of CAPTCHA_SELECTORS) {
    const el = await page.$(sel).catch(() => null);
    if (el && (await el.isVisible().catch(() => false))) return `CAPTCHA present (${sel})`;
  }
  const title = await page.title().catch(() => '');
  if (/just a moment|attention required|verify you are human/i.test(title)) {
    return `bot challenge page ("${title}")`;
  }
  return null;
}

export async function saveScreenshot(page: Page, dir: string, name: string): Promise<string | null> {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}

export async function fillIfPresent(page: Page, selector: string, value: string): Promise<boolean> {
  if (!value) return false;
  const el = await page.$(selector).catch(() => null);
  if (!el) return false;
  try {
    await el.fill(value);
    return true;
  } catch {
    return false;
  }
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}
