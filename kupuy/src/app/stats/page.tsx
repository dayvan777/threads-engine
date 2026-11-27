import Link from "next/link";
import { statsByCountry } from "@/lib/db";
import { allProducts } from "@/lib/repo";
import { verdictFor } from "@/lib/verdict";
import { DemoBadge } from "@/components/Chrome";
import { pct } from "@/lib/format";

export const revalidate = 300;
export const metadata = {
  title: "Чорна пʼятниця в цифрах",
  description: "Скільки знижок на Black Friday 2026 виявились фейковими — за перевірками користувачів в Україні та Німеччині.",
};

function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const w = total ? (value / total) * 100 : 0;
  return (
    <div className="grid gap-1">
      <div className="row text-[13px] tnum"><span>{label}</span><span className="lead" /><span>{value} · {total ? Math.round(w) : 0}%</span></div>
      <div className="h-3 w-full bg-paper-2"><div className="h-full" style={{ width: `${w}%`, background: tone }} /></div>
    </div>
  );
}

export default async function Page() {
  const stats = await statsByCountry("2026-11-20T00:00:00Z");
  const demo = allProducts().flatMap((p) => p.offers.map((o) => ({ c: o.country, v: verdictFor(o) })));
  const demoBy = (c: "UA" | "DE") => {
    const xs = demo.filter((x) => x.c === c && x.v.metrics.claimedDiscount !== null);
    const bad = xs.filter((x) => ["FAKE", "PRE_HIKE"].includes(x.v.id)).length;
    return { total: xs.length, bad };
  };

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-[clamp(32px,9vw,48px)] font-bold uppercase leading-[0.95]">Чорна пʼятниця <br />в цифрах</h1>
        <p className="text-[14px] text-ink-2">Black Week 2026 (з 20 листопада). Рахуємо тільки реальні перевірки людей на цьому сайті — анонімно.</p>
      </header>

      {stats && stats.some((s) => s.total > 0) ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {stats.map((s) => {
            const bad = s.fake + s.hidden + s.pricier;
            return (
              <section key={s.country} className="receipt grid gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-[22px] font-bold uppercase">{s.country === "UA" ? "🇺🇦 Україна" : "🇩🇪 Німеччина"}</h2>
                  <span className="label">{s.total} перевірок</span>
                </div>
                <p className="font-display text-[44px] font-bold leading-none text-red tnum">{s.total ? Math.round((bad / s.total) * 100) : 0}%</p>
                <p className="text-[13px]">знижок — фейкові, приховані або «подорожчання»</p>
                <hr className="dash" />
                <Bar label="Фейкова" value={s.fake} total={s.total} tone="var(--red)" />
                <Bar label="Мінімум приховали" value={s.hidden} total={s.total} tone="var(--red)" />
                <Bar label="Подорожчало" value={s.pricier} total={s.total} tone="#8a2a20" />
                <Bar label="Скромна" value={s.modest} total={s.total} tone="var(--ink-3)" />
                <Bar label="Справжня" value={s.genuine} total={s.total} tone="var(--blue)" />
                {s.avgClaimed !== null && (
                  <p className="text-[14px] tnum">
                    У середньому магазини пишуть <b>−{pct(s.avgClaimed)}</b>
                    {s.avgReal !== null && <>, а насправді <b>{s.avgReal > 0 ? "−" : "+"}{pct(Math.abs(s.avgReal))}</b></>}.
                  </p>
                )}
                {s.country === "DE" && s.pangv > 0 && <p className="text-[13px] text-red">Можливих порушень §11 PAngV: {s.pangv}</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="receipt grid gap-3">
          <p className="font-bold">Тут зʼявляться цифри, щойно люди почнуть перевіряти знижки.</p>
          <p className="text-[14px] text-ink-2">Ми не малюємо статистику — тільки рахуємо реальні перевірки.</p>
          <Link href="/perevir" className="btn">Перевірити першу знижку</Link>
        </section>
      )}

      <section className="receipt grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[20px] font-bold uppercase">Демо-каталог</h2>
          <DemoBadge />
        </div>
        <p className="text-[13px] text-ink-2">Як виглядатиме аналіз, коли підключимо реальні ціни (зараз ціни змодельовані):</p>
        {(["UA", "DE"] as const).map((c) => {
          const d = demoBy(c);
          return (
            <div key={c} className="row text-[14px] tnum">
              <span>{c === "UA" ? "🇺🇦" : "🇩🇪"} акцій з зачеркнутою ціною</span><span className="lead" />
              <span>{d.bad} з {d.total} — фейк або «підняли перед знижкою»</span>
            </div>
          );
        })}
      </section>

      <p className="text-[12px] text-ink-3">
        Чому нема рейтингу магазинів: перевірки вводять користувачі, і ми не можемо підтвердити кожну. Назви магазинів зʼявляться, коли будуть перевірені дані з офіційних фідів.
      </p>
    </div>
  );
}
