import { NBU_FALLBACK_EUR_UAH } from "@/config/shipping";

/** Офіційний курс EUR НБУ. Кеш 1 година. */
export async function eurUah(): Promise<{ rate: number; date: string; live: boolean }> {
  try {
    const r = await fetch(
      "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json",
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) },
    );
    const j = (await r.json()) as { rate: number; exchangedate: string }[];
    if (j[0]?.rate) return { rate: j[0].rate, date: j[0].exchangedate, live: true };
  } catch {}
  return { rate: NBU_FALLBACK_EUR_UAH, date: "27.11.2026", live: false };
}
