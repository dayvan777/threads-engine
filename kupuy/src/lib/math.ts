import type { PricePoint } from "./types";

export const DAY = 86_400_000;

export function toDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}
export function isoDay(t: Date | number): string {
  return new Date(t).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  return isoDay(toDate(d).getTime() + n * DAY);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function min(xs: number[]): number {
  return xs.length ? Math.min(...xs) : NaN;
}
export function max(xs: number[]): number {
  return xs.length ? Math.max(...xs) : NaN;
}
export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Ціни в діапазоні [from, to) днів відносно `end` (0 = сьогодні). */
export function windowPrices(
  history: PricePoint[],
  end: string,
  fromDaysAgo: number,
  toDaysAgo = 0,
): number[] {
  const start = addDays(end, -fromDaysAgo);
  const stop = addDays(end, -toDaysAgo);
  return history.filter((h) => h.d >= start && h.d < stop).map((h) => h.p);
}

export const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
