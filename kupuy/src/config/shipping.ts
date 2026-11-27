/**
 * Тарифи доставки Німеччина → Україна для приватних осіб.
 * Звірено 2026-11-27. Ціни з ПДВ, EUR.
 */
export type ShippingMethodId = "novapost" | "meest" | "luggage";

export interface ShippingMethod {
  id: ShippingMethodId;
  name: string;
  /** Ціна за вагу, EUR */
  price: (kg: number) => number;
  days: string;
  sourceUrl: string;
  note?: string;
}

export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "novapost",
    name: "Нова Пошта Global",
    // Тариф з 08.07.2026: до 2 кг €23, до 10 кг €32, далі +€1.50/кг
    price: (kg) => (kg <= 2 ? 23 : kg <= 10 ? 32 : 32 + Math.ceil(kg - 10) * 1.5),
    days: "5–9 днів",
    sourceUrl: "https://novapost.com/en-de/international/shipping-cost/",
    note: "Страхування безкоштовно до €500, далі 0,5% оголошеної вартості.",
  },
  {
    id: "meest",
    name: "Meest",
    // Тарифна сторінка: до 2 кг €10, до 5 кг €12, до 10 кг €17, 10–50 кг €1.90/кг
    price: (kg) => (kg <= 2 ? 10 : kg <= 5 ? 12 : kg <= 10 ? 17 : Math.ceil(kg) * 1.9),
    days: "7–14 днів",
    sourceUrl: "https://de.meest.com/services/de-for-private-clients/parcel-delivery-from-germany-to-ukraine",
    note: "На сайті Meest зустрічаються різні тарифи — уточніть у калькуляторі перед відправкою.",
  },
  {
    id: "luggage",
    name: "Везу сам / друзі в багажі",
    price: () => 0,
    days: "як поїдете",
    sourceUrl: "https://zakon.rada.gov.ua/laws/show/4495-17#n2981",
    note: "Безмитно до €500 і 50 кг на людину. Товар має бути для особистого користування.",
  },
];

export const NBU_FALLBACK_EUR_UAH = 49.49; // НБУ на 27.11.2026, якщо API недоступне
