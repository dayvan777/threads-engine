import Link from "next/link";
import { redirect } from "next/navigation";
import { classifyQuery } from "@/lib/matching";
import { allProducts, searchProducts } from "@/lib/repo";
import { verdictFor, VERDICT_LABEL } from "@/lib/verdict";
import { SearchBox } from "@/components/SearchBox";
import { Stamp } from "@/components/Stamp";
import { DemoBadge } from "@/components/Chrome";

export const metadata = { title: "Пошук" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const c = q ? classifyQuery(q) : null;
  if (c?.kind === "url") redirect(`/perevir?shop=${encodeURIComponent(c.host)}&c=${/\.de$/.test(c.host) ? "DE" : "UA"}`);
  const list = !q ? allProducts() : c?.kind === "ean" ? allProducts().filter((p) => p.ean && p.ean.endsWith(c.gtin.replace(/^0+/, ""))) : searchProducts(q);

  return (
    <div className="grid gap-6">
      <SearchBox initial={q} />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[22px] font-bold uppercase">{q ? `Знайдено: ${list.length}` : "Демо-каталог"}</h1>
        <DemoBadge />
      </div>
      {list.length === 0 && (
        <div className="receipt grid gap-3">
          <p>У демо-каталозі такого товару нема. Але знижку можна перевірити вручну — потрібні три цифри з картки товару.</p>
          <Link className="btn" href={`/perevir?n=${encodeURIComponent(q)}`}>Перевірити «{q.slice(0, 30)}»</Link>
        </div>
      )}
      <ul className="grid gap-3">
        {list.map((p, i) => {
          const ua = verdictFor(p.offers[0]);
          const de = verdictFor(p.offers[1]);
          return (
            <li key={p.slug}>
              <Link href={`/tovar/${p.slug}`} className="receipt flex items-center justify-between gap-3 !py-4 hover:bg-paper-2">
                <span className="grid gap-1">
                  <span className="font-medium leading-tight">{p.emoji} {p.name}</span>
                  <span className="label">{p.category}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-2">
                  <span className="flex items-center gap-1.5 text-[11px]">UA <Stamp text={VERDICT_LABEL[ua.id].stamp} tone={VERDICT_LABEL[ua.id].tone} size="sm" rot={i % 2 ? 3 : -4} /></span>
                  <span className="flex items-center gap-1.5 text-[11px]">DE <Stamp text={VERDICT_LABEL[de.id].stamp} tone={VERDICT_LABEL[de.id].tone} size="sm" rot={i % 2 ? -3 : 4} /></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
