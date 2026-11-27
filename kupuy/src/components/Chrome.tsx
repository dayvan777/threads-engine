import Link from "next/link";

export function Header() {
  return (
    <header className="mx-auto w-full max-w-[760px] px-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-baseline gap-2" aria-label="Купуй вчасно — на головну">
          <span className="whitespace-nowrap font-display text-[21px] font-bold uppercase tracking-[0.04em]">Купуй вчасно</span>
          <span className="hidden text-[11px] text-ink-2 sm:inline">чек правди для знижок</span>
        </Link>
        <nav className="flex gap-3 whitespace-nowrap text-[13px]">
          <Link href="/perevir" className="underline-offset-4 hover:underline">Перевірити</Link>
          <Link href="/kalkulyator" className="underline-offset-4 hover:underline">UA/DE</Link>
          <Link href="/stats" className="underline-offset-4 hover:underline">Цифри</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-14 w-full max-w-[760px] px-4 pb-10 text-[12px] text-ink-2">
      <hr className="dash" />
      <p>
        Не реклама і не магазин. Ми не отримуємо гроші від магазинів. Товари з позначкою «ДЕМО» мають змодельовані ціни,
        це не дані реальних магазинів.
      </p>
      <p className="mt-2 flex flex-wrap gap-4">
        <Link href="/yak-rakhuyemo" className="underline">Як ми рахуємо</Link>
        <Link href="/impressum" className="underline">Impressum</Link>
        <Link href="/datenschutz" className="underline">Datenschutz</Link>
      </p>
    </footer>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-block rotate-[-2deg] border border-dashed border-red px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red">
      Демо-дані
    </span>
  );
}
