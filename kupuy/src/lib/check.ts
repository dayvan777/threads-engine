import { VERDICT_CONFIG as C } from "@/config/verdict";
import type { Country } from "./types";

/** Перевірка знижки, яку людина бачить у магазині (без нашої історії цін). */
export interface CheckInput {
  country: Country;
  price: number;
  crossed: number;
  /** мінімум за 30 днів: DE — з картки товару (§11 PAngV), UA — з графіка Hotline */
  low30: number | null;
  /** DE: магазин порівнює з UVP (рекомендованою ціною), а не зі своєю старою */
  isUvp?: boolean;
}

export type CheckVerdictId = "FAKE" | "GENUINE" | "NONE" | "HIDDEN" | "PRICIER";

export interface CheckResult {
  id: CheckVerdictId;
  claimed: number; // частка
  real: number | null; // частка від мінімуму 30 днів
  pangvViolation: boolean;
  advice: string;
}

export function checkDiscount(i: CheckInput): CheckResult {
  const claimed = i.crossed > 0 ? (i.crossed - i.price) / i.crossed : 0;
  const pangvViolation = i.country === "DE" && i.low30 === null && !i.isUvp && i.crossed > i.price;

  if (i.low30 === null || i.low30 <= 0) {
    return {
      id: "HIDDEN",
      claimed,
      real: null,
      pangvViolation,
      advice:
        i.country === "DE"
          ? i.isUvp
            ? "Порівняння з UVP — це не знижка магазину. Подивіться ціну на idealo.de або geizhals.de («Preisverlauf»)."
            : "У Німеччині магазин зобовʼязаний показати найнижчу ціну за 30 днів (§11 PAngV). Нема — це порушення, можна скаржитись у Verbraucherzentrale."
          : "Відкрийте товар на hotline.ua → «Динаміка цін» і впишіть мінімум за останній місяць.",
    };
  }
  const real = (i.low30 - i.price) / i.low30;
  let id: CheckVerdictId;
  if (i.price > i.low30 * 1.05) id = "PRICIER";
  else if (i.price <= i.low30 * C.userCheckGenuineMax) id = "GENUINE";
  else if (i.price >= i.low30 * C.userCheckFakeFloor) id = "FAKE";
  else id = "NONE";
  const advice =
    id === "FAKE"
      ? "Місяць тому було так само (або дешевше). Знижка намальована."
      : id === "PRICIER"
        ? "Зараз дорожче, ніж було протягом місяця. Це не акція, а підйом."
        : id === "GENUINE"
          ? "Ціна реально нижча за мінімум місяця. Можна брати."
          : "Дешевше, але менш ніж на 10%. Знижка є, але скромна.";
  return { id, claimed, real, pangvViolation, advice };
}

export const CHECK_LABEL: Record<CheckVerdictId, { stamp: string; tone: "red" | "blue" | "green" | "ink" }> = {
  FAKE: { stamp: "ФЕЙКОВА", tone: "red" },
  PRICIER: { stamp: "ПОДОРОЖЧАЛО", tone: "red" },
  GENUINE: { stamp: "СПРАВЖНЯ ЗНИЖКА", tone: "blue" },
  NONE: { stamp: "ЗНИЖКА СКРОМНА", tone: "ink" },
  HIDDEN: { stamp: "МІНІМУМ ПРИХОВАЛИ", tone: "red" },
};
