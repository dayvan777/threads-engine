import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allProducts, getProduct, smartReplacement } from "@/lib/repo";
import { verdictFor, VERDICT_LABEL, type Verdict } from "@/lib/verdict";
import { forecast } from "@/lib/forecast";
import { bestLanded } from "@/lib/landed";
import { eurUah } from "@/lib/nbu";
import { Stamp } from "@/components/Stamp";
import { DemoBadge } from "@/components/Chrome";
import { PriceChart } from "@/components/PriceChart";
import { Share } from "@/components/Share";
import { BLACK_FRIDAYS } from "@/config/seasons";
import { eur, money, pct, uah } from "@/lib/format";

export const revalidate = 3600;

export function generateStaticParams() {
  return allProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = getProduct((await params).slug);
  if (!p) return {};
  const v = verdictFor(p.offers[0]);
  return {
    title: `${p.name}: ${VERDICT_LABEL[v.id].stamp.toLowerCase()}? Ціни UA vs DE`,
    description: `Чи справжня знижка на ${p.name}: медіана 90 днів, мінімум за рік, ціна з Німеччини з доставкою і митом. Демо-дані.`,
  };
}

function MetricRows({ ua, de }: { ua: Verdict; de: Verdict }) {
  const rows: [string, (v: Verdict, c: "UAH" | "EUR") => string][] = [
    ["Зараз", (v, c) => money(v.metrics.current, c)],
    ["Реальна знижка від медіани", (v) => pct(v.metrics.realDiscount)],
    ["Магазин пише", (v) => (v.metrics.claimedDiscount === null ? "—" : "−" + pct(v.metrics.claimedDiscount))],
    ["Медіана 90 днів", (v, c) => money(v.metrics.median90, c)],
    ["Мінімум 30 днів до акції", (v, c) => money(v.metrics.min30BeforeSale, c)],
    ["Мінімум за рік", (v, c) => money(v.metrics.min365, c)],
    ["Відрив від рекорду", (v) => (v.metrics.gapToRecord <= 0 ? "рекорд" : "+" + pct(v.metrics.gapToRecord))],
    ["Волатильність", (v) => pct(v.metrics.volatility)],
    ["Така ціна була", (v) => (v.metrics.daysSinceSamePrice === null ? "ніколи" : `${v.metrics.daysSinceSamePrice} дн. тому`)],
  ];
  return (
    <table className="w-full text-[12.5px] tnum">
      <thead>
        <tr className="label text-left">
          <th className="py-1 font-normal">Показник</th>
          <th className="py-1 text-right font-normal">🇺🇦 UA</th>
          <th className="py-1 text-right font-normal">🇩🇪 DE</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, f]) => (
          <tr key={label} className="border-t border-dashed border-rule">
            <td className="py-1.5 pr-2">{label}</td>
            <td className="whitespace-nowrap py-1.5 pl-2 text-right">{f(ua, "UAH")}</td>
            <td className="whitespace-nowrap py-1.5 pl-2 text-right">{f(de, "EUR")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = getProduct((await params).slug);
  if (!p) notFound();
  const [uaO, deO] = p.offers;
  const ua = verdictFor(uaO);
  const de = verdictFor(deO);
  const fUA = forecast(uaO, ua.metrics);
  const fDE = forecast(deO, de.metrics);
  const { rate } = await eurUah();
  const landed = bestLanded(de.metrics.current, p.weightKg, rate).sort((a, b) => a.totalUah - b.totalUah);
  const best = landed.find((l) => l.method !== "luggage") ?? landed[0];
  const carry = landed.find((l) => l.method === "luggage")!;
  const uaWins = ua.metrics.current <= best.totalUah;
  const diff = Math.abs(best.totalUah - ua.metrics.current);
  const repl = smartReplacement(p);
  const LU = VERDICT_LABEL[ua.id];
  const LD = VERDICT_LABEL[de.id];

  return (
    <article className="grid gap-8">
      {/* Перший екран: штамп */}
      <section className="receipt torn-top">
        <div className="flex items-center justify-between">
          <span className="label">{p.category} · {p.brand}</span>
          <DemoBadge />
        </div>
        <h1 className="mt-2 text-[24px] font-bold leading-tight">{p.emoji} {p.name}</h1>
        <p className="mt-1 text-[12px] text-ink-3">Модель: {p.model}</p>
        <hr className="dash" />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid justify-items-center gap-3 text-center">
            <span className="label">🇺🇦 Україна</span>
            <Stamp text={LU.stamp} tone={LU.tone} size="md" rot={-7} animate />
            <span className="text-[18px] font-bold tnum">{uah(ua.metrics.current)}</span>
            <span className="text-[12px] leading-snug text-ink-2">{LU.line}</span>
          </div>
          <div className="grid justify-items-center gap-3 text-center">
            <span className="label">🇩🇪 Німеччина</span>
            <Stamp text={LD.stamp} tone={LD.tone} size="md" rot={6} animate />
            <span className="text-[18px] font-bold tnum">{eur(de.metrics.current)}</span>
            <span className="text-[12px] leading-snug text-ink-2">{LD.line}</span>
          </div>
        </div>
        {de.pangvViolation && (
          <p className="mt-4 border-l-4 border-red bg-paper-2 px-3 py-2 text-[13px]">
            ⚠ DE-магазин показує знижку без найнижчої ціни за 30 днів — це порушення §11 PAngV.
          </p>
        )}
      </section>

      {/* UA vs DE */}
      <section className="receipt grid gap-3" aria-labelledby="vs-h">
        <h2 id="vs-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Ціна «в руках» в Україні</h2>
        <div className="grid gap-1 tnum">
          <div className="row"><span>🇺🇦 Купити в Україні</span><span className="lead" /><b>{uah(ua.metrics.current)}</b></div>
          <div className="row"><span>🇩🇪 З Німеччини ({best.methodName})</span><span className="lead" /><b>{uah(best.totalUah)}</b></div>
          <div className="row text-[12px] text-ink-2"><span>  товар {eur(best.itemEur)} + доставка {eur(best.shippingEur)} + мито/ПДВ {eur(best.dutyEur + best.vatEur)}</span></div>
          <div className="row text-[13px] text-ink-2"><span>🧳 Якщо привезе знайомий у багажі</span><span className="lead" /><span>{uah(carry.totalUah)}</span></div>
        </div>
        <p className="text-[17px] font-bold">
          {uaWins ? "🇺🇦 Перемагає Україна" : "🇩🇪 Перемагає Німеччина"} · різниця {uah(diff)}
        </p>
        <p className="text-[12px] text-ink-2">
          Гарантія: {p.warranty === "international" ? "міжнародна гарантія бренду, сервіс в Україні має прийняти." : "німецька гарантія діє в ЄС — в Україні сервіс може відмовити."}{" "}
          Живете в Німеччині? Тоді просто порівняйте {eur(de.metrics.current)} з {eur(ua.metrics.current / rate)} (українська ціна за курсом НБУ).
        </p>
        <Link href="/kalkulyator" className="text-[13px] underline">Порахувати свій варіант →</Link>
      </section>

      {/* Графік */}
      <section className="receipt grid gap-3" aria-labelledby="ch-h">
        <h2 id="ch-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">12 місяців цін</h2>
        <PriceChart ua={uaO.history} de={deO.history} rate={rate} blackFridays={BLACK_FRIDAYS} />
      </section>

      {/* Метрики */}
      <section className="receipt grid gap-3" aria-labelledby="m-h">
        <h2 id="m-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Метрики</h2>
        <MetricRows ua={ua} de={de} />
      </section>

      {/* Прогноз */}
      <section className="receipt grid gap-4" aria-labelledby="f-h">
        <h2 id="f-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Бери зараз чи почекай</h2>
        {[
          { flag: "🇺🇦 Україна", f: fUA },
          { flag: "🇩🇪 Німеччина", f: fDE },
        ].map(({ flag, f }) => (
          <div key={flag} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">{flag}: {f.action === "WAIT" ? "почекай" : "бери зараз"}</span>
              <span className="text-[13px] tnum">падіння до кінця року ≈ {pct(f.dropProbability)}</span>
            </div>
            <ul className="grid gap-0.5 pl-4 text-[13px] text-ink-2 [list-style:'–_']">
              {f.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="text-[12px] text-ink-3">Впевненість прогнозу: {pct(f.confidence)} — це евристика за сезонністю, не гарантія.</p>
          </div>
        ))}
      </section>

      {/* Заміна */}
      {repl && (
        <section className="receipt grid gap-2" aria-labelledby="r-h">
          <h2 id="r-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Умна заміна</h2>
          <p className="text-[14px]">
            Попередня модель <b>{repl.product.name}</b> дешевша на <b>{pct(Math.max(repl.saveUA, repl.saveDE))}</b>. Для більшості людей різниця між поколіннями не варта цих грошей.
          </p>
          <Link href={`/tovar/${repl.product.slug}`} className="btn btn-ghost">Подивитись {repl.product.name} →</Link>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Поділитись чеком</h2>
        <Share url={`/tovar/${p.slug}`} text={`${p.name}: в Україні — ${LU.stamp.toLowerCase()}, у Німеччині — ${LD.stamp.toLowerCase()} 🧾 (демо-приклад)`} />
      </section>
    </article>
  );
}
