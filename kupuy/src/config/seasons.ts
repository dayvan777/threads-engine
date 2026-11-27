/** Сезонні розпродажі. Дати перевірені на 2025–2026. */
export const SALE_EVENTS = [
  { id: "bf2025", name: "Black Friday 2025", date: "2025-11-28" },
  { id: "cm2025", name: "Cyber Monday 2025", date: "2025-12-01" },
  { id: "xmas2025", name: "Різдвяні знижки 2025", date: "2025-12-20" },
  { id: "bf2026", name: "Black Friday 2026", date: "2026-11-27" },
  { id: "cm2026", name: "Cyber Monday 2026", date: "2026-11-30" },
] as const;

export const BLACK_FRIDAYS = ["2025-11-28", "2026-11-27"];

export const FORECAST_CONFIG = {
  /** Скільки відсотків падіння вважаємо «вартим чекати» */
  meaningfulDrop: 0.03,
  /** Максимальна впевненість, коли є лише 1 рік історії */
  maxConfidenceOneYear: 0.6,
  maxConfidenceMultiYear: 0.8,
} as const;
