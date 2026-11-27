import { FORECAST_CONFIG as F } from "@/config/seasons";
import { addDays, clamp, min, windowPrices } from "./math";
import type { Offer } from "./types";
import type { OfferMetrics } from "./verdict";

export interface Forecast {
  action: "BUY_NOW" | "WAIT";
  /** ймовірність падіння ще на 3%+ до кінця року, 0..1 */
  dropProbability: number;
  /** чесна впевненість у прогнозі, 0..1 */
  confidence: number;
  /** людське пояснення, чому так */
  reasons: string[];
  /** на скільки впала ціна минулого року в цей самий період (частка) */
  lastYearDrop: number | null;
}

/**
 * Евристика без ML:
 * 1) дивимось, що робила ціна торік від цієї дати до 31.12;
 * 2) порівнюємо поточну ціну з рекордом і медіаною;
 * 3) впевненість обмежена кількістю років історії.
 */
export function forecast(offer: Offer, m: OfferMetrics): Forecast {
  const h = offer.history;
  const today = h[h.length - 1].d;
  const year = Number(today.slice(0, 4));
  const yearEnd = `${year}-12-31`;
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(yearEnd) - Date.parse(today)) / 86_400_000),
  );
  const reasons: string[] = [];

  // Торік у той самий відрізок (від цієї дати до 31.12): наскільки нижче за теперішню ціну опускались
  const lyDay = addDays(today, -367);
  const lyEnd = `${year - 1}-12-31`;
  const lyRest = h.filter((p) => p.d >= lyDay && p.d <= lyEnd).map((p) => p.p);
  let lastYearDrop: number | null = null;
  if (h[0].d <= lyDay && lyRest.length) {
    lastYearDrop = (m.current - min(lyRest)) / m.current;
  }

  // базова ймовірність
  let p = 0.3;
  if (lastYearDrop !== null) {
    if (lastYearDrop >= F.meaningfulDrop) {
      p = 0.5 + clamp(lastYearDrop, 0, 0.3);
      reasons.push(
        `Торік з цієї дати до 31 грудня ціна опускалась на ${Math.round(lastYearDrop * 100)}% нижче, ніж зараз.`,
      );
    } else {
      p = 0.2;
      reasons.push("Торік до кінця року дешевше, ніж зараз, не було.");
    }
  } else {
    reasons.push("Товару ще нема року — минулого сезону не бачимо.");
  }

  if (m.gapToRecord <= 0.005) {
    p -= 0.25;
    reasons.push("Зараз ціна на рівні річного рекорду.");
  } else if (m.gapToRecord > 0.1) {
    p += 0.1;
    reasons.push(`До рекорду ще ${Math.round(m.gapToRecord * 100)}% — запас для падіння є.`);
  }
  if (m.realDiscount >= 0.1) {
    p -= 0.1;
    reasons.push("Ціна вже нижча за звичайну на 10%+.");
  }
  if (daysLeft < 7) p -= 0.15;
  else reasons.push(`До кінця року ${daysLeft} днів: попереду Cyber Monday і різдвяні знижки.`);
  p = clamp(p, 0.05, 0.9);

  // Впевненість: скільки сезонів бачили × наскільки ціна «шумна»
  const recent = windowPrices(h, today, 90, 0);
  const seasons = lastYearDrop === null ? 0 : 1;
  let confidence =
    seasons === 0 ? 0.3 : seasons === 1 ? F.maxConfidenceOneYear : F.maxConfidenceMultiYear;
  confidence -= clamp(m.volatility * 2, 0, 0.2);
  if (recent.length < 60) confidence -= 0.1;
  confidence = clamp(confidence, 0.15, 0.85);

  const action = p >= 0.5 && m.gapToRecord > 0.03 ? "WAIT" : "BUY_NOW";
  return { action, dropProbability: p, confidence, reasons, lastYearDrop };
}
