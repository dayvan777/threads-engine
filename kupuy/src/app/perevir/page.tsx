import { Suspense } from "react";
import { Checker } from "@/components/Checker";

export const metadata = { title: "Перевір свою знижку", description: "Три цифри з картки товару — і чесний вердикт: справжня знижка чи фейкова." };

export default async function Page({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { shop } = await searchParams;
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none">Перевір свою знижку</h1>
      {shop && (
        <p className="text-[14px] text-ink-2">
          Магазин: <b>{shop}</b>. Автоматично ціни з магазинів ми поки не беремо (це заборонено їхніми правилами). Перепишіть три цифри з картки — це 30 секунд.
        </p>
      )}
      <section className="receipt torn-top">
        <Suspense>
          <Checker />
        </Suspense>
      </section>
    </div>
  );
}
