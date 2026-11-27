/**
 * Пороги вердиктів. Усі числа — тут, не в коді.
 * Порядок перевірки = пріоритет (див. src/lib/verdict.ts).
 */
export const VERDICT_CONFIG = {
  /** Вікно для медіани, днів */
  medianWindowDays: 90,
  /** Вікно «мінімум до акції», днів */
  preSaleMinWindowDays: 30,
  /** Вікно річного мінімуму, днів */
  yearWindowDays: 365,

  /** РЕКОРД: поточна ціна ≤ річного мінімуму × (1 + допуск) */
  recordTolerance: 0.0,

  /** ПІДНЯЛИ ПЕРЕД ЗНИЖКОЮ: за 14–45 днів до акції ціна була ≥ +10% над медіаною… */
  preHikeWindowDays: { from: 45, to: 14 },
  preHikeRiseOverMedian: 1.1,
  /** …а зараз не нижче 97% медіани */
  notRealDiscountFloor: 0.97,

  /** СПРАВЖНЯ ЗНИЖКА: ≤ 90% медіани */
  genuineMaxShareOfMedian: 0.9,
  /** ПОДОРОЖЧАЛО: > 105% медіани */
  pricierMinShareOfMedian: 1.05,

  /** Умна заміна: попередня модель дешевша щонайменше на 25% */
  replacementMinSaving: 0.25,

  /** Перевірка користувача: падіння вважається «справжнім», якщо ≤ 90% від мінімуму 30 днів */
  userCheckGenuineMax: 0.9,
  userCheckFakeFloor: 0.97,
} as const;
