/**
 * Митні правила України для фізосіб.
 * Звірено 2026-11-27. Перевіряйте перед кожним сезоном!
 *
 * Джерела:
 * - Митний кодекс України, ст. 374 (ч. 6–7): https://zakon.rada.gov.ua/laws/show/4495-17#n2981
 * - Держмитслужба: https://customs.gov.ua/
 * - Укрпошта, приклад розрахунку: https://www.ukrposhta.ua/en/mytne-oformlennia-import
 * - Закон № 5025-IX (ПДВ на посилки з першого євро): набирає чинності не раніше 01.07.2027
 *   https://news.dtkt.ua/taxation/pdv/115576-pdv-na-posilki-do-150-jevro-z-1-lipnia-2027-roku-prezident-pidpisav-zakoni
 */
export const CUSTOMS_CONFIG = {
  verifiedAt: "2026-11-27",
  sourceUrl: "https://zakon.rada.gov.ua/laws/show/4495-17#n2981",
  /** Посилка: безмитно, якщо вартість товарів в одному відправленні ≤ €150 */
  parcelDutyFreeEur: 150,
  /** Мито на суму перевищення */
  dutyRate: 0.1,
  /** ПДВ на (перевищення + мито) */
  vatRate: 0.2,
  /** Ручна поклажа / багаж: безмитно до €500 і 50 кг (ст. 374) */
  luggageDutyFreeEur: 500,
  luggageMaxKg: 50,
  upcomingChange: {
    effectiveFrom: "2027-07-01",
    text: "З 01.07.2027 (за рішенням Кабміну) комерційні посилки обкладатимуть ПДВ 20% з першого євро.",
  },
} as const;
