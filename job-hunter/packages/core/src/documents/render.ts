import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const CV_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a202c;
         font-size: 10.5pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: -0.02em; }
  h1 + p { margin-top: 0; color: #4a5568; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.08em; color: #2d3748;
       border-bottom: 1.5px solid #cbd5e0; padding-bottom: 3pt; margin: 14pt 0 6pt; }
  h3 { font-size: 11pt; margin: 9pt 0 1pt; }
  h3 + p em, h3 + em { color: #718096; font-size: 9.5pt; }
  p { margin: 3pt 0; }
  ul { margin: 3pt 0 3pt 14pt; padding: 0; }
  li { margin: 1.5pt 0; }
  a { color: #1a202c; text-decoration: none; }
  em { color: #4a5568; }
`;

const LETTER_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a202c;
         font-size: 11pt; line-height: 1.6; margin: 0; }
  p { margin: 0 0 10pt; }
  h1, h2, h3 { font-size: 12pt; }
`;

export function mdToHtml(markdown: string, opts: { title: string; kind?: 'cv' | 'letter' }): string {
  const body = marked.parse(markdown, { async: false }) as string;
  const css = opts.kind === 'letter' ? LETTER_CSS : CV_CSS;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title><style>${css}</style></head><body>${body}</body></html>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getBrowser(): Promise<any> {
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
          `Could not launch Chromium for PDF rendering: ${(err as Error).message}. ` +
            `Run "npx playwright install chromium" or set JH_CHROMIUM_PATH.`,
        );
      }
    })();
  }
  return browserPromise;
}

export async function closeRenderBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }
}

/** Render markdown to an A4 PDF at outPath. Returns the absolute path. */
export async function renderPdf(
  markdown: string,
  outPath: string,
  opts: { title: string; kind?: 'cv' | 'letter' },
): Promise<string> {
  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(mdToHtml(markdown, opts), { waitUntil: 'load' });
    await page.pdf({
      path: abs,
      format: 'A4',
      margin: { top: '16mm', bottom: '16mm', left: '17mm', right: '17mm' },
      printBackground: true,
    });
  } finally {
    await page.close().catch(() => {});
  }
  return abs;
}
