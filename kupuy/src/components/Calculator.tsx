"use client";
import { useMemo, useState } from "react";
import { landedCost } from "@/lib/landed";
import { SHIPPING_METHODS } from "@/config/shipping";
import { CUSTOMS_CONFIG } from "@/config/customs";

const PRESETS = [
  { label: "Телефон", kg: 0.5 },
  { label: "Навушники", kg: 0.6 },
  { label: "Ноутбук", kg: 2 },
  { label: "Консоль", kg: 4.5 },
  { label: "Пилосос", kg: 4 },
  { label: "Кавомашина", kg: 10 },
];

const n = (v: string) => {
  const x = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x : null;
};
const uah = (x: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(x)) + "\u00a0₴";
const eur = (x: number) => "€" + new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(x);

export function Calculator({ rate, rateDate, live }: { rate: number; rateDate: string; live: boolean }) {
  const [de, setDe] = useState("");
  const [ua, setUa] = useState("");
  const [kg, setKg] = useState(0.5);
  const [warrantyGlobal, setWarrantyGlobal] = useState(false);
  const deN = n(de);
  const uaN = n(ua);

  const rows = useMemo(
    () => (deN ? SHIPPING_METHODS.map((m) => landedCost(deN, kg, m.id, rate)).sort((a, b) => a.totalUah - b.totalUah) : []),
    [deN, kg, rate],
  );
  const best = rows.find((r) => r.method !== "luggage");
  const winner = best && uaN ? (best.totalUah < uaN ? "DE" : "UA") : null;
  const diff = best && uaN ? Math.abs(best.totalUah - uaN) : 0;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="label">🇩🇪 Ціна в DE, €</span>
          <input className="field tnum" inputMode="decimal" value={de} onChange={(e) => setDe(e.target.value)} placeholder="249" />
        </label>
        <label className="grid gap-1.5">
          <span className="label">🇺🇦 Ціна в UA, ₴</span>
          <input className="field tnum" inputMode="decimal" value={ua} onChange={(e) => setUa(e.target.value)} placeholder="11999" />
        </label>
      </div>
      <div className="grid gap-1.5">
        <span className="label">Вага посилки: {kg} кг</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" aria-pressed={kg === p.kg} onClick={() => setKg(p.kg)} className="min-h-10 border-[1.5px] border-ink px-3 text-[13px] aria-pressed:bg-ink aria-pressed:text-paper">
              {p.label}
            </button>
          ))}
        </div>
        <input type="range" min={0.2} max={20} step={0.1} value={kg} onChange={(e) => setKg(Number(e.target.value))} aria-label="Вага, кг" className="accent-[var(--ink)]" />
      </div>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={warrantyGlobal} onChange={(e) => setWarrantyGlobal(e.target.checked)} />
        Бренд дає міжнародну гарантію (напр. Apple)
      </label>

      {!deN && <p className="text-[14px] text-ink-2">Впишіть ціну в Німеччині — порахуємо доставку, мито і ПДВ.</p>}

      {deN && (
        <div className="grid gap-2">
          <hr className="dash" />
          {winner && (
            <p className="text-[18px] font-bold" aria-live="polite">
              {winner === "DE" ? "🇩🇪 Вигідніше з Німеччини" : "🇺🇦 Вигідніше купити в Україні"}: економія {uah(diff)}
            </p>
          )}
          {best && <p className="text-[12px] text-ink-2">Порівнюємо з найдешевшою доставкою посилкою. Варіант «у багажі» — якщо хтось їде.</p>}
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r.method} className={`border-[1.5px] p-3 ${r === best ? "border-ink bg-paper-2" : "border-rule"}`}>
                <div className="row font-bold">
                  <span>{r.methodName}</span>
                  <span className="lead" />
                  <span className="tnum">{uah(r.totalUah)}</span>
                </div>
                <div className="mt-1 grid gap-0.5 text-[13px] text-ink-2 tnum">
                  <div className="row"><span>Товар</span><span className="lead" /><span>{eur(r.itemEur)}</span></div>
                  <div className="row"><span>Доставка</span><span className="lead" /><span>{eur(r.shippingEur)}</span></div>
                  <div className="row"><span>Мито 10% + ПДВ 20% з суми понад €{r.limitEur}</span><span className="lead" /><span>{eur(r.dutyEur + r.vatEur)}</span></div>
                </div>
                {r.note && <p className="mt-1 text-[12px] text-ink-3">{r.note}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 border-l-4 border-ink bg-paper-2 px-3 py-2 text-[13px]">
            <b>Гарантія:</b>{" "}
            {warrantyGlobal
              ? "міжнародна гарантія бренду — сервіс в Україні має прийняти, але збережіть чек."
              : "гарантія німецького магазину діє в ЄС. Сервіс в Україні може відмовити — закладіть ризик."}
          </p>
        </div>
      )}
      <p className="text-[12px] text-ink-3">
        Курс НБУ {rateDate}: 1 € = {rate.toFixed(4)} ₴{live ? "" : " (резервне значення)"}. Митні правила звірено {CUSTOMS_CONFIG.verifiedAt} з{" "}
        <a className="underline" href={CUSTOMS_CONFIG.sourceUrl} target="_blank" rel="noopener">МКУ ст. 374</a>: посилка безмитно до €
        {CUSTOMS_CONFIG.parcelDutyFreeEur}, багаж — до €{CUSTOMS_CONFIG.luggageDutyFreeEur}/{CUSTOMS_CONFIG.luggageMaxKg} кг. {CUSTOMS_CONFIG.upcomingChange.text}
      </p>
    </div>
  );
}
