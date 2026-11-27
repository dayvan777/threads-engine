import type { PriceAdapter } from "./types";

const disabled = (
  id: string,
  name: string,
  country: "UA" | "DE",
  termsUrl: string,
  status: string,
): PriceAdapter => ({
  id,
  name,
  country,
  currency: country === "UA" ? "UAH" : "EUR",
  enabled: false,
  status,
  termsUrl,
  async lookup() {
    return [];
  },
});

/**
 * Реальні джерела. Вимкнені, доки нема легального доступу:
 * автоматичний збір без дозволу порушує умови цих сайтів.
 */
export const ADAPTERS: PriceAdapter[] = [
  disabled("hotline", "Hotline", "UA", "https://hotline.ua/about/agreement/",
    "Потрібна партнерська угода / фід. Після отримання — реалізувати lookup через фід."),
  disabled("rozetka", "Rozetka", "UA", "https://rozetka.com.ua/ua/legal-information/",
    "Підключати через партнерську програму (фід товарів), а не парсинг."),
  disabled("idealo", "idealo", "DE", "https://www.idealo.de/agb",
    "AGB забороняють автоматичний збір. Легальний шлях — idealo Partner API."),
  disabled("geizhals", "Geizhals", "DE", "https://geizhals.de/?agb",
    "Автоматичний збір без дозволу заборонений. Писати на partner@ для доступу."),
];

export const enabledAdapters = () => ADAPTERS.filter((a) => a.enabled);
