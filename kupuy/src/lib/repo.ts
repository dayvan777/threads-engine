/** Доступ до товарів. Зараз — демо-каталог; після підключення джерел — Supabase. */
import { seedProducts } from "./seed";
import { normalizeModel } from "./matching";
import type { Product } from "./types";
import { VERDICT_CONFIG as C } from "@/config/verdict";

export function allProducts(): Product[] {
  return seedProducts();
}

export function getProduct(slug: string): Product | undefined {
  return seedProducts().find((p) => p.slug === slug);
}

export function searchProducts(q: string): Product[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const nm = normalizeModel(q);
  return seedProducts()
    .map((p) => {
      const hay = `${p.name} ${p.brand} ${p.model} ${p.category}`.toLowerCase();
      let score = words.filter((w) => hay.includes(w)).length;
      if (nm && normalizeModel(p.model)?.includes(nm)) score += 3;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

const current = (p: Product, c: "UA" | "DE") => {
  const h = p.offers.find((o) => o.country === c)!.history;
  return h[h.length - 1].p;
};

/** Умна заміна: попередня модель тієї ж родини, дешевша на 25%+. Правила, без ІІ. */
export function smartReplacement(p: Product) {
  const candidates = seedProducts()
    .filter((x) => x.family === p.family && x.generation < p.generation)
    .sort((a, b) => b.generation - a.generation);
  for (const c of candidates) {
    const saveUA = 1 - current(c, "UA") / current(p, "UA");
    const saveDE = 1 - current(c, "DE") / current(p, "DE");
    if (Math.max(saveUA, saveDE) >= C.replacementMinSaving) {
      return { product: c, saveUA, saveDE };
    }
  }
  return null;
}
