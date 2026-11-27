import type { Country, Currency } from "../types";

export interface RawOffer {
  source: string;
  country: Country;
  currency: Currency;
  title: string;
  price: number;
  crossedPrice?: number;
  shows30DayLow?: boolean;
  gtin?: string;
  model?: string;
  url: string;
  fetchedAt: string;
}

/** Єдиний інтерфейс для всіх джерел цін. */
export interface PriceAdapter {
  id: string;
  name: string;
  country: Country;
  currency: Currency;
  /** Чи дозволено вмикати автоматичний збір (ToS + robots.txt) */
  enabled: boolean;
  /** Чому вимкнено і як підключити легально */
  status: string;
  termsUrl: string;
  /** Пошук пропозицій за GTIN або моделлю */
  lookup(q: { gtin?: string; model?: string; name?: string }): Promise<RawOffer[]>;
}
