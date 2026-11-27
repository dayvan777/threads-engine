import type { Metadata } from "next";
import Link from "next/link";
import { checkDiscount, CHECK_LABEL, type CheckInput } from "@/lib/check";
import { Stamp } from "@/components/Stamp";
import { Share } from "@/components/Share";

type SP = Promise<Record<string, string | undefined>>;

function parse(sp: Record<string, string | undefined>) {
  const n = (k: string) => {
    const v = Number(sp[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const input: CheckInput = {
    country: sp.c === "DE" ? "DE" : "UA",
    price: n("p") ?? 0,
    crossed: n("x") ?? 0,
    low30: n("l"),
    isUvp: sp.u === "1",
  };
  const name = (sp.n ?? "").slice(0, 60);
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries({ c: input.country, p: sp.p, x: sp.x, l: sp.l, u: sp.u, n: name || undefined }).filter(([, v]) => v)) as Record<string, string>,
  ).toString();
  return { input, name, qs };
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { input, name, qs } = parse(await searchParams);
  if (!input.price || !input.crossed) return { title: "Перевірка знижки" };
  const r = checkDiscount(input);
  const title = `${CHECK_LABEL[r.id].stamp}: магазин пише −${Math.round(r.claimed * 100)}%${r.real !== null ? `, насправді ${Math.round(r.real * 100)}%` : ""}`;
  return {
    title,
    description: `${name ? name + ". " : ""}${r.advice} Перевір і свою знижку.`,
    openGraph: { title, images: [{ url: `/api/og/check?${qs}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [`/api/og/check?${qs}`] },
    robots: { index: false },
  };
}

export default async function Result({ searchParams }: { searchParams: SP }) {
  const { input, name, qs } = parse(await searchParams);
  if (!input.price || !input.crossed || input.crossed <= input.price) {
    return (
      <div className="receipt">
        <p>Не вистачає цифр для перевірки.</p>
        <Link className="btn mt-4" href="/perevir">Перевірити знижку</Link>
      </div>
    );
  }
  const r = checkDiscount(input);
  const L = CHECK_LABEL[r.id];
  const cur = input.country === "UA" ? "₴" : "€";
  const num = (x: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(x);
  const shareText =
    r.real !== null
      ? `${name ? name + ": " : ""}магазин пише −${Math.round(r.claimed * 100)}%, а насправді ${r.real > 0 ? "−" : "+"}${Math.abs(Math.round(r.real * 100))}% 🧾 ${L.stamp}. Перевір свою знижку тут:`
      : `${name ? name + ": " : ""}магазин пише −${Math.round(r.claimed * 100)}%, а мінімум за 30 днів сховав 🧾 Перевір свою знижку:`;

  return (
    <div className="grid gap-6">
      <section className="receipt torn-top relative overflow-visible">
        <div className="flex justify-between">
          <span className="label">Купуй вчасно · чек перевірки</span>
          <span className="label">{input.country === "UA" ? "🇺🇦 UA" : "🇩🇪 DE"}</span>
        </div>
        <h1 className="mt-3 text-[20px] font-bold leading-tight">{name || "Перевірка знижки"}</h1>
        <hr className="dash" />
        <div className="grid gap-1 tnum">
          <div className="row"><span>Було (зачеркнута)</span><span className="lead" /><span className="line-through decoration-red decoration-2">{num(input.crossed)} {cur}</span></div>
          <div className="row font-bold"><span>Зараз</span><span className="lead" /><span>{num(input.price)} {cur}</span></div>
          {input.low30 !== null && <div className="row"><span>Мінімум 30 днів</span><span className="lead" /><span>{num(input.low30)} {cur}</span></div>}
        </div>
        <hr className="dash" />
        <div className="grid gap-1 text-[18px] tnum">
          <div className="row"><span>Магазин пише</span><span className="lead" /><span>−{Math.round(r.claimed * 100)}%</span></div>
          <div className={`row font-bold ${r.id === "GENUINE" ? "text-blue" : "text-red"}`}>
            <span>Насправді</span><span className="lead" />
            <span>{r.real === null ? "невідомо" : `${r.real > 0 ? "−" : "+"}${Math.abs(Math.round(r.real * 100))}%`}</span>
          </div>
        </div>
        <div className="my-6 flex justify-center">
          <Stamp text={L.stamp} tone={L.tone} animate rot={-8} sub="чек перевірено" />
        </div>
        <p className="text-[15px]">{r.advice}</p>
        {r.pangvViolation && (
          <p className="mt-3 border-l-4 border-red bg-paper-2 px-3 py-2 text-[14px]">
            Схоже на порушення §11 PAngV: знижка без найнижчої ціни за 30 днів. Скарга: <a className="underline" href="https://www.verbraucherzentrale.de/beschwerde" target="_blank" rel="noopener">Verbraucherzentrale</a>.
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">Покажи іншим</h2>
        <Share url={`/r?${qs}`} text={shareText} storyUrl={`/api/og/check?${qs}&format=story`} imageUrl={`/api/og/check?${qs}`} />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/perevir" className="btn btn-ghost">Перевірити інший товар</Link>
        {input.country === "DE" && <Link href="/kalkulyator" className="btn btn-ghost">Скільки буде в Україні?</Link>}
      </section>
    </div>
  );
}
