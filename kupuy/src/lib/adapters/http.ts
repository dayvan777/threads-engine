/**
 * «Ввічливий» HTTP-клієнт для адаптерів: robots.txt, ліміт 1 запит / 10 с на хост, кеш 6 год.
 */
const UA = "KupuyVchasnoBot/0.1 (+https://kupuy-vchasno.vercel.app/about-bot)";
const robotsCache = new Map<string, { at: number; disallow: string[] }>();
const lastHit = new Map<string, number>();
const MIN_GAP_MS = 10_000;

async function robots(host: string) {
  const c = robotsCache.get(host);
  if (c && Date.now() - c.at < 24 * 3600_000) return c.disallow;
  const disallow: string[] = [];
  try {
    const txt = await (await fetch(`https://${host}/robots.txt`, { headers: { "User-Agent": UA } })).text();
    let applies = false;
    for (const line of txt.split("\n")) {
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === "*" || /kupuy/i.test(v);
      else if (applies && /^disallow$/i.test(k.trim()) && v) disallow.push(v);
    }
  } catch {
    disallow.push("/"); // не змогли прочитати robots.txt — не ходимо
  }
  robotsCache.set(host, { at: Date.now(), disallow });
  return disallow;
}

export async function politeFetch(url: string): Promise<string | null> {
  const u = new URL(url);
  const dis = await robots(u.host);
  if (dis.some((p) => u.pathname.startsWith(p.replace(/\*.*$/, "")))) return null;
  const wait = (lastHit.get(u.host) ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  const r = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 6 * 3600 } });
  return r.ok ? r.text() : null;
}
