/**
 * ДЕМО-ДАНІ. Ціни змодельовані (детермінований генератор), а не зібрані з магазинів.
 * Потрібні, щоб інтерфейс працював до підключення реальних джерел.
 */
import { BLACK_FRIDAYS } from "@/config/seasons";
import { addDays, daysBetween } from "./math";
import type { Country, Offer, Product } from "./types";

export const SEED_TODAY = "2026-11-27";

type Scenario = "record" | "prehike" | "fake" | "genuine" | "pricier" | "none";

interface SeedDef {
  slug: string;
  name: string;
  brand: string;
  category: string;
  family: string;
  generation: number;
  model: string;
  launch: string;
  weightKg: number;
  warranty: "international" | "eu-only";
  emoji: string;
  de: number; // EUR сьогодні (базова)
  ua: number; // UAH сьогодні (базова)
  decline: number; // наскільки дорожче було рік тому (частка)
  sUA: Scenario;
  sDE: Scenario;
  deShowsLow?: boolean;
}

const DEFS: SeedDef[] = [
  { slug: "iphone-17-256", name: "Apple iPhone 17 256 ГБ", brand: "Apple", category: "Смартфони", family: "iphone", generation: 17, model: "iPhone 17 256GB", launch: "2026-09-19", weightKg: 0.5, warranty: "international", emoji: "📱", de: 949, ua: 48999, decline: 0.04, sUA: "fake", sDE: "none" },
  { slug: "iphone-16-128", name: "Apple iPhone 16 128 ГБ", brand: "Apple", category: "Смартфони", family: "iphone", generation: 16, model: "iPhone 16 128GB", launch: "2024-09-20", weightKg: 0.5, warranty: "international", emoji: "📱", de: 679, ua: 32999, decline: 0.18, sUA: "genuine", sDE: "record" },
  { slug: "galaxy-s26-256", name: "Samsung Galaxy S26 256 ГБ", brand: "Samsung", category: "Смартфони", family: "galaxy-s", generation: 26, model: "Galaxy S26 256GB", launch: "2026-02-25", weightKg: 0.5, warranty: "eu-only", emoji: "📱", de: 799, ua: 39999, decline: 0.12, sUA: "prehike", sDE: "genuine" },
  { slug: "galaxy-s25-256", name: "Samsung Galaxy S25 256 ГБ", brand: "Samsung", category: "Смартфони", family: "galaxy-s", generation: 25, model: "Galaxy S25 256GB", launch: "2025-02-07", weightKg: 0.5, warranty: "eu-only", emoji: "📱", de: 579, ua: 27999, decline: 0.22, sUA: "none", sDE: "fake", deShowsLow: false },
  { slug: "sony-wh-1000xm6", name: "Sony WH-1000XM6", brand: "Sony", category: "Навушники", family: "sony-wh", generation: 6, model: "WH-1000XM6", launch: "2025-05-20", weightKg: 0.6, warranty: "eu-only", emoji: "🎧", de: 399, ua: 17999, decline: 0.1, sUA: "record", sDE: "prehike" },
  { slug: "sony-wh-1000xm5", name: "Sony WH-1000XM5", brand: "Sony", category: "Навушники", family: "sony-wh", generation: 5, model: "WH-1000XM5", launch: "2022-05-20", weightKg: 0.6, warranty: "eu-only", emoji: "🎧", de: 249, ua: 11499, decline: 0.12, sUA: "genuine", sDE: "none" },
  { slug: "airpods-pro-3", name: "Apple AirPods Pro 3", brand: "Apple", category: "Навушники", family: "airpods-pro", generation: 3, model: "AirPods Pro 3", launch: "2025-09-19", weightKg: 0.2, warranty: "international", emoji: "🎧", de: 249, ua: 11999, decline: 0.04, sUA: "fake", sDE: "genuine" },
  { slug: "airpods-pro-2", name: "Apple AirPods Pro 2", brand: "Apple", category: "Навушники", family: "airpods-pro", generation: 2, model: "AirPods Pro 2", launch: "2022-09-23", weightKg: 0.2, warranty: "international", emoji: "🎧", de: 179, ua: 8499, decline: 0.12, sUA: "none", sDE: "record" },
  { slug: "ps5-pro", name: "Sony PlayStation 5 Pro", brand: "Sony", category: "Ігри", family: "ps5", generation: 2, model: "CFI-7016", launch: "2024-11-07", weightKg: 4.5, warranty: "eu-only", emoji: "🎮", de: 749, ua: 35999, decline: 0.06, sUA: "pricier", sDE: "fake", deShowsLow: true },
  { slug: "nintendo-switch-2", name: "Nintendo Switch 2", brand: "Nintendo", category: "Ігри", family: "switch", generation: 2, model: "Switch 2", launch: "2025-06-05", weightKg: 1.2, warranty: "eu-only", emoji: "🎮", de: 469, ua: 22999, decline: 0.02, sUA: "none", sDE: "pricier" },
  { slug: "dyson-v15-detect", name: "Dyson V15 Detect Absolute", brand: "Dyson", category: "Дім", family: "dyson-stick", generation: 15, model: "V15 Detect Absolute", launch: "2021-03-01", weightKg: 3.5, warranty: "eu-only", emoji: "🧹", de: 499, ua: 24999, decline: 0.15, sUA: "genuine", sDE: "prehike" },
  { slug: "dyson-gen5detect", name: "Dyson Gen5detect", brand: "Dyson", category: "Дім", family: "dyson-stick", generation: 16, model: "Gen5detect", launch: "2023-03-01", weightKg: 4, warranty: "eu-only", emoji: "🧹", de: 749, ua: 34999, decline: 0.08, sUA: "prehike", sDE: "none" },
  { slug: "macbook-air-13-m4", name: "Apple MacBook Air 13\" M4 16/256", brand: "Apple", category: "Ноутбуки", family: "macbook-air", generation: 4, model: "MacBook Air M4 13", launch: "2025-03-12", weightKg: 2, warranty: "international", emoji: "💻", de: 999, ua: 49999, decline: 0.12, sUA: "genuine", sDE: "none" },
  { slug: "kindle-paperwhite-2024", name: "Kindle Paperwhite (2024) 16 ГБ", brand: "Amazon", category: "Гаджети", family: "kindle", generation: 12, model: "Kindle Paperwhite 12", launch: "2024-10-16", weightKg: 0.4, warranty: "eu-only", emoji: "📖", de: 169, ua: 8499, decline: 0.05, sUA: "none", sDE: "record" },
  { slug: "steam-deck-oled-512", name: "Steam Deck OLED 512 ГБ", brand: "Valve", category: "Ігри", family: "steam-deck", generation: 2, model: "Steam Deck OLED 512GB", launch: "2023-11-16", weightKg: 1.5, warranty: "eu-only", emoji: "🎮", de: 569, ua: 28999, decline: 0.03, sUA: "record", sDE: "none" },
  { slug: "delonghi-magnifica-evo", name: "De'Longhi Magnifica Evo", brand: "De'Longhi", category: "Дім", family: "delonghi-magnifica", generation: 2, model: "ECAM290.61.B", launch: "2022-03-01", weightKg: 10, warranty: "eu-only", emoji: "☕", de: 399, ua: 18999, decline: 0.1, sUA: "fake", sDE: "genuine" },
  { slug: "xiaomi-robot-vacuum-x20-plus", name: "Xiaomi Robot Vacuum X20+", brand: "Xiaomi", category: "Дім", family: "xiaomi-x", generation: 20, model: "Robot Vacuum X20+", launch: "2024-03-01", weightKg: 6, warranty: "eu-only", emoji: "🤖", de: 449, ua: 17999, decline: 0.15, sUA: "genuine", sDE: "fake", deShowsLow: false },
  { slug: "apple-watch-series-11", name: "Apple Watch Series 11 42 мм", brand: "Apple", category: "Гаджети", family: "apple-watch", generation: 11, model: "Watch Series 11 42mm", launch: "2026-09-19", weightKg: 0.3, warranty: "international", emoji: "⌚", de: 449, ua: 19999, decline: 0.03, sUA: "none", sDE: "fake", deShowsLow: true },
  { slug: "apple-watch-series-10", name: "Apple Watch Series 10 42 мм", brand: "Apple", category: "Гаджети", family: "apple-watch", generation: 10, model: "Watch Series 10 42mm", launch: "2024-09-20", weightKg: 0.3, warranty: "international", emoji: "⌚", de: 319, ua: 14999, decline: 0.15, sUA: "record", sDE: "genuine" },
  { slug: "gopro-hero13-black", name: "GoPro HERO13 Black", brand: "GoPro", category: "Гаджети", family: "gopro", generation: 13, model: "HERO13 Black", launch: "2024-09-04", weightKg: 0.4, warranty: "eu-only", emoji: "📷", de: 329, ua: 15999, decline: 0.14, sUA: "prehike", sDE: "record" },
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const roundPrice = (x: number, c: Country) =>
  c === "DE" ? Math.max(1, Math.round(x)) - 0.01 : Math.max(1, Math.round(x / 100) * 100) - 1;

function genOffer(def: SeedDef, country: Country): Offer {
  const r = rng(hash(def.slug + country));
  const base = country === "DE" ? def.de : def.ua;
  const scen = country === "DE" ? def.sDE : def.sUA;
  const yearAgo = addDays(SEED_TODAY, -400);
  const start = def.launch > yearAgo ? def.launch : yearAgo;
  const n = daysBetween(start, SEED_TODAY) + 1;

  // 1) тренд + ступінчасті зміни ціни
  const raw: number[] = [];
  let level = 1;
  let nextChange = 0;
  for (let i = 0; i < n; i++) {
    const daysAgo = n - 1 - i;
    const trend = 1 + def.decline * (daysAgo / 365);
    if (i >= nextChange) {
      level = 1 + (r() - 0.5) * 0.04;
      nextChange = i + 4 + Math.floor(r() * 10);
    }
    raw.push(base * trend * level);
  }
  const dayOf = (i: number) => addDays(start, i);
  const idx = (d: string) => daysBetween(start, d);

  // 2) сезонні події минулого року
  const bf25 = BLACK_FRIDAYS[0];
  const bfDepth = scen === "genuine" ? 0.2 + r() * 0.05 : 0.1 + r() * 0.08;
  for (let i = 0; i < n; i++) {
    const d = dayOf(i);
    const rel = daysBetween(bf25, d);
    if (rel >= -4 && rel <= 4) raw[i] *= 1 - bfDepth;
    else if (rel > 4 && rel <= 27 && d.slice(5, 7) === "12") raw[i] *= 1 - bfDepth * 0.45; // Різдво
    if (country === "DE" && d >= "2026-07-08" && d <= "2026-07-11") raw[i] *= 0.92; // Prime Day
  }

  // 2b) у кожного товару за рік була хоча б одна помітна акція (весняний розпродаж тощо)
  const histMin = Math.min(...raw.slice(0, Math.max(1, n - 50)));
  const wantMin = scen === "genuine" ? base * 0.8 : base * 0.9;
  if (scen !== "record" && histMin > wantMin && n > 120) {
    const at = 60 + Math.floor(r() * Math.min(120, n - 110));
    for (let i = n - 1 - at - 3; i <= n - 1 - at; i++) raw[i] = Math.min(raw[i], wantMin);
  }

  // 3) сценарій поточної акції
  let crossedPrice: number | undefined;
  let saleStartedAt: string | undefined;
  const last = n - 1;
  const typical = base;
  const set = (fromDaysAgo: number, toDaysAgo: number, v: number) => {
    for (let i = Math.max(0, last - fromDaysAgo); i <= last - toDaysAgo; i++) raw[i] = v;
  };
  switch (scen) {
    case "record": {
      saleStartedAt = addDays(SEED_TODAY, -3);
      const yearMin = Math.min(...raw.slice(0, last - 3));
      set(3, 0, yearMin * 0.97);
      crossedPrice = typical * 1.18;
      break;
    }
    case "prehike": {
      saleStartedAt = addDays(SEED_TODAY, -4);
      set(42, 8, typical * 1.2);
      set(7, 5, typical * 1.14);
      set(4, 0, typical * 1.04);
      crossedPrice = typical * 1.2;
      break;
    }
    case "fake": {
      saleStartedAt = addDays(SEED_TODAY, -3);
      set(3, 0, typical * 1.0);
      crossedPrice = typical * (1.3 + r() * 0.15);
      break;
    }
    case "genuine": {
      saleStartedAt = addDays(SEED_TODAY, -5);
      set(5, 0, typical * 0.86);
      crossedPrice = typical * 1.05;
      break;
    }
    case "pricier":
      set(20, 0, typical * 1.09);
      break;
    case "none":
      break;
  }

  if (idx(SEED_TODAY) !== last) throw new Error("seed date mismatch");

  const history = raw.map((p, i) => ({ d: dayOf(i), p: roundPrice(p, country) }));
  return {
    country,
    store: country === "DE" ? "DE-магазин (демо)" : "UA-магазин (демо)",
    currency: country === "DE" ? "EUR" : "UAH",
    history,
    crossedPrice: crossedPrice ? roundPrice(crossedPrice, country) : undefined,
    saleStartedAt,
    shows30DayLow: country === "DE" ? (def.deShowsLow ?? true) : undefined,
  };
}

let cache: Product[] | null = null;
export function seedProducts(): Product[] {
  if (cache) return cache;
  cache = DEFS.map((d) => ({
    slug: d.slug,
    name: d.name,
    brand: d.brand,
    category: d.category,
    family: d.family,
    generation: d.generation,
    model: d.model,
    weightKg: d.weightKg,
    warranty: d.warranty,
    emoji: d.emoji,
    demo: true as const,
    offers: [genOffer(d, "UA"), genOffer(d, "DE")],
  }));
  return cache;
}
