export type Country = "UA" | "DE";
export type Currency = "UAH" | "EUR";

export type VerdictId =
  | "RECORD"
  | "PRE_HIKE"
  | "FAKE"
  | "GENUINE"
  | "PRICIER"
  | "NONE";

export interface PricePoint {
  /** YYYY-MM-DD */
  d: string;
  /** ціна у валюті пропозиції */
  p: number;
}

export interface Offer {
  country: Country;
  store: string;
  currency: Currency;
  /** Щоденна історія, від старого до нового, останній елемент — сьогодні */
  history: PricePoint[];
  /** Зачеркнута ціна, якщо магазин її показує */
  crossedPrice?: number;
  /** Дата старту поточної акції */
  saleStartedAt?: string;
  /** DE: чи показано «niedrigster Preis der letzten 30 Tage» (§11 PAngV) */
  shows30DayLow?: boolean;
  url?: string;
}

export interface Product {
  slug: string;
  name: string;
  brand: string;
  category: string;
  /** родина моделей для «умної заміни» */
  family: string;
  generation: number;
  model: string;
  ean?: string;
  weightKg: number;
  warranty: "international" | "eu-only";
  emoji: string;
  offers: Offer[];
  demo: true;
}
