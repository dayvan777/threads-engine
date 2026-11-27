"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

function parse(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function Checker({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [country, setCountry] = useState<"UA" | "DE">((sp.get("c") as "UA" | "DE") ?? "UA");
  const [name, setName] = useState(sp.get("n") ?? "");
  const [price, setPrice] = useState("");
  const [crossed, setCrossed] = useState("");
  const [low30, setLow30] = useState("");
  const [noLow, setNoLow] = useState(false);
  const [uvp, setUvp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = country === "UA" ? "₴" : "€";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = parse(price);
    const x = parse(crossed);
    const l = noLow ? null : parse(low30);
    if (!p) return setError("Впишіть ціну зараз — цифрами, наприклад 12999.");
    if (!x) return setError("Впишіть зачеркнуту («стару») ціну з магазину.");
    if (x <= p) return setError("Зачеркнута ціна має бути більшою за теперішню.");
    if (!noLow && !l) return setError("Впишіть мінімум за 30 днів або позначте, що магазин його не показує.");
    setError(null);
    setBusy(true);
    // зберігаємо анонімно для статистики; результат рахуємо однаково і без бази
    fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, price: p, crossed: x, low30: l, isUvp: uvp }),
      keepalive: true,
    }).catch(() => {});
    const q = new URLSearchParams({ c: country, p: String(p), x: String(x) });
    if (l) q.set("l", String(l));
    if (uvp) q.set("u", "1");
    if (name.trim()) q.set("n", name.trim().slice(0, 60));
    router.push(`/r?${q.toString()}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {!compact && (
        <div>
          <p className="label mb-1.5">Де магазин</p>
          <div className="seg" role="group" aria-label="Країна магазину">
            <button type="button" aria-pressed={country === "UA"} onClick={() => setCountry("UA")}>🇺🇦 Україна</button>
            <button type="button" aria-pressed={country === "DE"} onClick={() => setCountry("DE")}>🇩🇪 Німеччина</button>
          </div>
        </div>
      )}
      {compact && (
        <div className="seg" role="group" aria-label="Країна магазину">
          <button type="button" aria-pressed={country === "UA"} onClick={() => setCountry("UA")}>🇺🇦 Україна</button>
          <button type="button" aria-pressed={country === "DE"} onClick={() => setCountry("DE")}>🇩🇪 Німеччина</button>
        </div>
      )}

      <label className="grid gap-1.5">
        <span className="label">Ціна зараз, {cur}</span>
        <input className="field tnum" inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={country === "UA" ? "12999" : "249,99"} />
      </label>
      <label className="grid gap-1.5">
        <span className="label">Зачеркнута ціна, {cur}</span>
        <input className="field tnum" inputMode="decimal" autoComplete="off" value={crossed} onChange={(e) => setCrossed(e.target.value)} placeholder={country === "UA" ? "17999" : "399,99"} />
      </label>
      <div className="grid gap-1.5">
        <label className="grid gap-1.5">
          <span className="label">Мінімум за 30 днів, {cur}</span>
          <input className="field tnum disabled:opacity-40" inputMode="decimal" autoComplete="off" disabled={noLow} value={low30} onChange={(e) => setLow30(e.target.value)} placeholder={country === "UA" ? "з графіка на hotline.ua" : "«Niedrigster Preis 30 Tage»"} />
        </label>
        <p className="text-[12px] leading-snug text-ink-2">
          {country === "DE"
            ? "За законом (§11 PAngV) магазин у Німеччині мусить показати найнижчу ціну за 30 днів поруч зі знижкою. Шукайте дрібний текст біля ціни."
            : "Відкрийте цей товар на hotline.ua → «Динаміка цін» і подивіться мінімум за останній місяць."}
        </p>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={noLow} onChange={(e) => setNoLow(e.target.checked)} />
          {country === "DE" ? "Магазин мінімум за 30 днів не показує" : "Не знаю / не можу знайти"}
        </label>
        {country === "DE" && (
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={uvp} onChange={(e) => setUvp(e.target.checked)} />
            Зачеркнута позначена як «UVP» (рекомендована ціна)
          </label>
        )}
      </div>
      <label className="grid gap-1.5">
        <span className="label">Що за товар (не обовʼязково)</span>
        <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Навушники Sony" />
      </label>
      {error && (
        <p role="alert" className="border-l-4 border-red bg-paper-2 px-3 py-2 text-[14px]">
          {error}
        </p>
      )}
      <button className="btn w-full" disabled={busy}>
        {busy ? "Рахуємо…" : "Перевірити знижку"}
      </button>
    </form>
  );
}
