/** Мінімальний клієнт Supabase REST (PostgREST). Без ключів — усе вимкнено, нічого не вигадуємо. */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dbEnabled = () => Boolean(URL_ && KEY);

async function rest(path: string, init: RequestInit = {}) {
  if (!dbEnabled()) throw new Error("db disabled");
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r;
}

export interface CheckRow {
  country: "UA" | "DE";
  verdict: string;
  claimed: number | null;
  real: number | null;
  pangv_violation: boolean;
}

export async function saveCheck(row: CheckRow) {
  if (!dbEnabled()) return false;
  try {
    await rest("checks", { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } });
    return true;
  } catch {
    return false;
  }
}

async function count(query: string): Promise<number> {
  const r = await rest(`checks?select=id&${query}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") ?? "*/0";
  return Number(cr.split("/")[1]) || 0;
}

function kyivMidnightIso() {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const offset = kyiv.getTime() - now.getTime();
  const mid = new Date(kyiv);
  mid.setHours(0, 0, 0, 0);
  return new Date(mid.getTime() - offset).toISOString();
}

/** «Сьогодні перевірено X, фейкових Y». null = бази нема → лічильник ховаємо. */
export async function todayCounters(): Promise<{ checked: number; fake: number } | null> {
  if (!dbEnabled()) return null;
  try {
    const since = `created_at=gte.${encodeURIComponent(kyivMidnightIso())}`;
    const [checked, fake] = await Promise.all([
      count(since),
      count(`${since}&verdict=in.(FAKE,HIDDEN,PRICIER)`),
    ]);
    return { checked, fake };
  } catch {
    return null;
  }
}

export interface CountryStats {
  country: "UA" | "DE";
  total: number;
  fake: number;
  hidden: number;
  pricier: number;
  genuine: number;
  modest: number;
  pangv: number;
  avgClaimed: number | null;
  avgReal: number | null;
}

export async function statsByCountry(sinceIso: string): Promise<CountryStats[] | null> {
  if (!dbEnabled()) return null;
  try {
    const r = await rest(
      `checks?select=country,verdict,claimed,real,pangv_violation&created_at=gte.${encodeURIComponent(sinceIso)}&limit=50000`,
    );
    const rows = (await r.json()) as CheckRow[];
    return (["UA", "DE"] as const).map((c) => {
      const xs = rows.filter((x) => x.country === c);
      const by = (v: string) => xs.filter((x) => x.verdict === v).length;
      const claimed = xs.map((x) => Number(x.claimed)).filter((x) => Number.isFinite(x));
      const real = xs.map((x) => (x.real === null ? NaN : Number(x.real))).filter((x) => Number.isFinite(x));
      const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
      return {
        country: c,
        total: xs.length,
        fake: by("FAKE"),
        hidden: by("HIDDEN"),
        pricier: by("PRICIER"),
        genuine: by("GENUINE"),
        modest: by("NONE"),
        pangv: xs.filter((x) => x.pangv_violation).length,
        avgClaimed: avg(claimed),
        avgReal: avg(real),
      };
    });
  } catch {
    return null;
  }
}
