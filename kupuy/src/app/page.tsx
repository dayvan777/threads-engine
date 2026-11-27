import Link from "next/link";
import { Suspense } from "react";
import { Checker } from "@/components/Checker";
import { SearchBox } from "@/components/SearchBox";
import { Stamp } from "@/components/Stamp";
import { DemoBadge } from "@/components/Chrome";
import { allProducts } from "@/lib/repo";
import { verdictFor, VERDICT_LABEL } from "@/lib/verdict";
import { todayCounters } from "@/lib/db";

export const revalidate = 60;

export default async function Home() {
  const counters = await todayCounters();
  const examples = allProducts()
    .map((p) => ({ p, v: verdictFor(p.offers[0]) }))
    .filter((x) => ["FAKE", "PRE_HIKE", "RECORD", "GENUINE"].includes(x.v.id))
    .slice(0, 6);

  return (
    <div className="grid gap-10">
      <section className="grid gap-5">
        <h1 className="font-display text-[clamp(34px,10vw,56px)] font-bold uppercase leading-[0.95] tracking-[0.01em]">
          Знижка справжня <br />чи <span className="mark">намальована</span>?
        </h1>
        <p className="max-w-[52ch] text-[15px] text-ink-2">
          Магазини підіймають ціну перед Black Friday, а потім «знижують» назад. Вставте три цифри з картки товару — і отримайте чесний чек.
        </p>
        {counters && counters.checked > 0 && (
          <p className="tnum text-[14px]" aria-live="polite">
            Сьогодні перевірено <b>{counters.checked}</b> {counters.checked === 1 ? "товар" : "товарів"}, знайдено{" "}
            <b className="text-red">{counters.fake}</b> фейкових знижок.
          </p>
        )}
      </section>

      <section className="receipt torn-top" aria-labelledby="check-h">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="check-h" className="font-display text-[22px] font-bold uppercase tracking-[0.04em]">Чек перевірки</h2>
          <span className="label">№ BF-2026</span>
        </div>
        <Suspense>
          <Checker compact />
        </Suspense>
      </section>

      <section className="grid gap-3">
        <SearchBox />
        <p className="text-[12px] text-ink-2">
          Поки що пошук працює по демо-каталогу з 20 популярних товарів. Посилання на товар відкриває ручну перевірку.
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="ex-h">
        <div className="flex items-center justify-between">
          <h2 id="ex-h" className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Як це виглядає</h2>
          <DemoBadge />
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {examples.map(({ p, v }, i) => (
            <li key={p.slug}>
              <Link href={`/tovar/${p.slug}`} className="receipt flex min-h-[92px] items-center justify-between gap-3 !pb-5 hover:bg-paper-2">
                <span className="grid gap-1">
                  <span className="text-[14px] font-medium leading-tight">{p.emoji} {p.name}</span>
                  <span className="label">Україна · дивитись чек →</span>
                </span>
                <Stamp text={VERDICT_LABEL[v.id].stamp} tone={VERDICT_LABEL[v.id].tone} size="sm" rot={i % 2 ? 5 : -6} />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/poshuk?q=" className="text-[14px] underline underline-offset-4">Весь демо-каталог →</Link>
      </section>

      <section className="grid gap-3 text-[14px]">
        <h2 className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Чому зачеркнутій ціні не можна вірити</h2>
        <ol className="grid list-decimal gap-2 pl-5">
          <li>Знижку рахують від «старої» ціни, яку магазин сам і намалював.</li>
          <li>Чесне порівняння — з найнижчою ціною за останні 30 днів. У Німеччині магазин зобовʼязаний її показати (§11 PAngV).</li>
          <li>В Україні такого правила нема, тому дивіться графік на hotline.ua або в нашому чеку.</li>
        </ol>
        <p>
          Купуєте з Німеччини? <Link href="/kalkulyator" className="underline">Порахуйте ціну «в руках»</Link> з доставкою і митом.
        </p>
      </section>
    </div>
  );
}
