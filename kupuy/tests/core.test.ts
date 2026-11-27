import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictFor } from "../src/lib/verdict";
import { landedCost } from "../src/lib/landed";
import { checkDiscount } from "../src/lib/check";
import { normalizeGtin, matchKind, classifyQuery } from "../src/lib/matching";
import { addDays } from "../src/lib/math";
import { seedProducts } from "../src/lib/seed";
import type { Offer } from "../src/lib/types";

const T = "2026-11-27";
function offer(fn: (daysAgo: number) => number, extra: Partial<Offer> = {}): Offer {
  const history = Array.from({ length: 400 }, (_, i) => ({ d: addDays(T, i - 399), p: fn(399 - i) }));
  return { country: "UA", store: "t", currency: "UAH", history, ...extra };
}

test("РЕКОРД має найвищий пріоритет", () => {
  const o = offer((d) => (d === 0 ? 80 : 100), { crossedPrice: 150, saleStartedAt: T });
  assert.equal(verdictFor(o).id, "RECORD");
});

test("ПІДНЯЛИ ПЕРЕД ЗНИЖКОЮ", () => {
  const o = offer((d) => (d >= 300 ? 90 : d >= 18 && d <= 40 ? 125 : 100), { crossedPrice: 125, saleStartedAt: addDays(T, -3) });
  assert.equal(verdictFor(o).id, "PRE_HIKE");
});

test("ФЕЙКОВА: зачеркнута є, ціна ≈ медіана", () => {
  const o = offer((d) => (d === 200 ? 80 : 100), { crossedPrice: 140, saleStartedAt: addDays(T, -2) });
  assert.equal(verdictFor(o).id, "FAKE");
});

test("СПРАВЖНЯ ЗНИЖКА / ПОДОРОЖЧАЛО / ЗНИЖКИ НЕМА", () => {
  assert.equal(verdictFor(offer((d) => (d === 200 ? 70 : d < 3 ? 85 : 100))).id, "GENUINE");
  assert.equal(verdictFor(offer((d) => (d === 200 ? 70 : d < 10 ? 120 : 100))).id, "PRICIER");
  assert.equal(verdictFor(offer((d) => (d === 200 ? 70 : 100))).id, "NONE");
});

test("§11 PAngV: DE без мінімуму 30 днів = прапорець", () => {
  const o = offer((d) => (d === 200 ? 70 : 100), { country: "DE", currency: "EUR", crossedPrice: 140, shows30DayLow: false });
  assert.equal(verdictFor(o).pangvViolation, true);
});

test("Мито: приклад Укрпошти €170 → €2 мито + €4.40 ПДВ", () => {
  const r = landedCost(170, 1, "novapost", 50);
  assert.equal(r.dutyEur, 2);
  assert.equal(r.vatEur, 4.4);
  assert.equal(r.shippingEur, 23);
  assert.equal(landedCost(150, 1, "novapost", 50).dutyEur, 0);
  assert.equal(landedCost(450, 1, "luggage", 50).dutyEur, 0);
});

test("Перевірка користувача", () => {
  assert.equal(checkDiscount({ country: "UA", price: 11999, crossed: 17999, low30: 11899 }).id, "FAKE");
  assert.equal(checkDiscount({ country: "UA", price: 8000, crossed: 12000, low30: 10000 }).id, "GENUINE");
  const h = checkDiscount({ country: "DE", price: 399, crossed: 599, low30: null });
  assert.equal(h.id, "HIDDEN");
  assert.equal(h.pangvViolation, true);
  assert.equal(checkDiscount({ country: "DE", price: 399, crossed: 599, low30: null, isUvp: true }).pangvViolation, false);
});

test("GTIN та зіставлення", () => {
  assert.equal(normalizeGtin("4006381333931"), "04006381333931");
  assert.equal(normalizeGtin("4006381333932"), null);
  assert.equal(matchKind({ model: "WH-1000XM5" }, { model: "wh 1000xm5" }), "model");
  assert.equal(matchKind({ ean: "4006381333931", model: "A" }, { ean: "4006381333931", model: "B" }), "gtin");
  assert.equal(classifyQuery("https://rozetka.com.ua/ua/x/p1").kind, "url");
  assert.equal(classifyQuery("4006381333931").kind, "ean");
  assert.equal(classifyQuery("AirPods Pro").kind, "text");
});

test("Демо-каталог: 20 товарів, усі вердикти представлені", () => {
  const ps = seedProducts();
  assert.equal(ps.length, 20);
  const ids = new Set(ps.flatMap((p) => p.offers.map((o) => verdictFor(o).id)));
  for (const v of ["RECORD", "PRE_HIKE", "FAKE", "GENUINE", "PRICIER", "NONE"]) assert.ok(ids.has(v as never), v);
});
