import { VERDICT_CONFIG as C } from "@/config/verdict";
import {
  addDays,
  daysBetween,
  max,
  median,
  min,
  stdev,
  mean,
  windowPrices,
} from "./math";
import type { Offer, VerdictId } from "./types";

export interface OfferMetrics {
  current: number;
  median90: number;
  /** мінімум за 30 днів до старту акції (або до сьогодні, якщо акції нема) */
  min30BeforeSale: number;
  min365: number;
  /** реальна знижка від медіани, частка (0.12 = −12%) */
  realDiscount: number;
  /** знижка, яку малює магазин (від зачеркнутої), частка */
  claimedDiscount: number | null;
  /** відрив від рекорду, частка (0 = рекорд) */
  gapToRecord: number;
  /** коефіцієнт варіації за 90 днів */
  volatility: number;
  /** скільки днів тому ціна була такою ж або нижчою (null = ніколи за історію) */
  daysSinceSamePrice: number | null;
  /** max за вікно 14–45 днів до акції */
  preSalePeak: number | null;
}

export interface Verdict {
  id: VerdictId;
  metrics: OfferMetrics;
  /** порушення §11 PAngV: DE-магазин показує знижку без мінімуму за 30 днів */
  pangvViolation: boolean;
}

export function computeMetrics(offer: Offer): OfferMetrics {
  const h = offer.history;
  const today = h[h.length - 1].d;
  const current = h[h.length - 1].p;
  const past = h.slice(0, -1);

  const med90 = median(windowPrices(h, today, C.medianWindowDays, 0));
  const saleStart = offer.saleStartedAt ?? today;
  const preSale = windowPrices(h, saleStart, C.preSaleMinWindowDays, 0);
  const min30 = preSale.length ? min(preSale) : current;
  const yearPrices = windowPrices(past, today, C.yearWindowDays, 0);
  const min365 = yearPrices.length ? min(yearPrices) : current;

  const last90 = windowPrices(h, today, C.medianWindowDays, 0);
  const volatility = last90.length > 1 ? stdev(last90) / mean(last90) : 0;

  // Скільки днів тому вже було так само дешево — шукаємо поза поточною акцією
  let daysSince: number | null = null;
  const cutoff = offer.saleStartedAt ?? today;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].d < cutoff && past[i].p <= current) {
      daysSince = daysBetween(past[i].d, today);
      break;
    }
  }

  let preSalePeak: number | null = null;
  if (offer.saleStartedAt) {
    const win = windowPrices(
      h,
      offer.saleStartedAt,
      C.preHikeWindowDays.from,
      C.preHikeWindowDays.to,
    );
    preSalePeak = win.length ? max(win) : null;
  }

  return {
    current,
    median90: med90,
    min30BeforeSale: min30,
    min365,
    realDiscount: (med90 - current) / med90,
    claimedDiscount: offer.crossedPrice
      ? (offer.crossedPrice - current) / offer.crossedPrice
      : null,
    gapToRecord: (current - min365) / min365,
    volatility,
    daysSinceSamePrice: daysSince,
    preSalePeak,
  };
}

/** Головна функція: вердикт за пріоритетом зі специфікації. */
export function verdictFor(offer: Offer): Verdict {
  const m = computeMetrics(offer);
  const pangvViolation =
    offer.country === "DE" && !!offer.crossedPrice && offer.shows30DayLow === false;

  const notReallyLower = m.current >= C.notRealDiscountFloor * m.median90;

  let id: VerdictId;
  if (m.current <= m.min365 * (1 + C.recordTolerance)) id = "RECORD";
  else if (
    m.preSalePeak !== null &&
    m.preSalePeak >= C.preHikeRiseOverMedian * m.median90 &&
    notReallyLower
  )
    id = "PRE_HIKE";
  else if (offer.crossedPrice && notReallyLower) id = "FAKE";
  else if (m.current <= C.genuineMaxShareOfMedian * m.median90) id = "GENUINE";
  else if (m.current > C.pricierMinShareOfMedian * m.median90) id = "PRICIER";
  else id = "NONE";

  return { id, metrics: m, pangvViolation };
}

export const VERDICT_LABEL: Record<VerdictId, { stamp: string; line: string; tone: "red" | "blue" | "green" | "ink" }> = {
  RECORD: { stamp: "РЕКОРД", line: "Найнижча ціна за рік. Бери.", tone: "green" },
  PRE_HIKE: { stamp: "ПІДНЯЛИ ПЕРЕД ЗНИЖКОЮ", line: "Перед акцією ціну задрали, тепер «знижують» назад.", tone: "red" },
  FAKE: { stamp: "ФЕЙКОВА", line: "Зачеркнута ціна є, а реальної знижки — нема.", tone: "red" },
  GENUINE: { stamp: "СПРАВЖНЯ ЗНИЖКА", line: "Нижче звичайної ціни на 10%+.", tone: "blue" },
  PRICIER: { stamp: "ПОДОРОЖЧАЛО", line: "Дорожче, ніж зазвичай. Не поспішай.", tone: "red" },
  NONE: { stamp: "ЗНИЖКИ НЕМА", line: "Звичайна ціна. Нічого особливого.", tone: "ink" },
};

export { addDays };
