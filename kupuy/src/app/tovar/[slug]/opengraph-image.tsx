import { ImageResponse } from "next/og";
import { getProduct, allProducts } from "@/lib/repo";
import { verdictFor, VERDICT_LABEL } from "@/lib/verdict";
import { C, Desk, OgStamp, ogFonts } from "@/lib/og";
import { NBU_FALLBACK_EUR_UAH } from "@/config/shipping";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Вердикт ціни";

export function generateStaticParams() {
  return allProducts().map((p) => ({ slug: p.slug }));
}

function spark(xs: number[], w: number, h: number, lo: number, hi: number) {
  return xs
    .map((v, i) => `${i ? "L" : "M"}${((i / (xs.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo || 1)) * h).toFixed(1)}`)
    .join("");
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = getProduct((await params).slug)!;
  const ua = verdictFor(p.offers[0]);
  const de = verdictFor(p.offers[1]);
  const pts = p.offers[0].history.slice(-365).filter((_, i) => i % 3 === 0).map((x) => x.p);
  const ptsDe = p.offers[1].history.slice(-365).filter((_, i) => i % 3 === 0).map((x) => x.p * NBU_FALLBACK_EUR_UAH);
  const lo = Math.min(...pts, ...ptsDe);
  const hi = Math.max(...pts, ...ptsDe);
  const fonts = await ogFonts();
  const LU = VERDICT_LABEL[ua.id];
  const LD = VERDICT_LABEL[de.id];
  return new ImageResponse(
    (
      <Desk pad={36}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", background: C.paper, padding: "30px 40px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: C.ink2, letterSpacing: 3 }}>
            <div style={{ display: "flex" }}>КУПУЙ ВЧАСНО · ЧЕК ЦІНИ</div>
            <div style={{ display: "flex", color: C.red, border: `2px dashed ${C.red}`, padding: "0 8px" }}>ДЕМО-ДАНІ</div>
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, marginTop: 14 }}>{p.name}</div>
          <div style={{ display: "flex", marginTop: 26, justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 330 }}>
              <div style={{ display: "flex", fontSize: 22, color: C.ink2, marginBottom: 18 }}>УКРАЇНА</div>
              <OgStamp text={LU.stamp} tone={LU.tone} size={LU.stamp.length > 12 ? 30 : 40} rot={-8} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 330 }}>
              <div style={{ display: "flex", fontSize: 22, color: C.ink2, marginBottom: 18 }}>НІМЕЧЧИНА</div>
              <OgStamp text={LD.stamp} tone={LD.tone} size={LD.stamp.length > 12 ? 30 : 40} rot={7} />
            </div>
            <svg width="380" height="170" viewBox="0 0 380 170">
              <path d={spark(ptsDe, 380, 150, lo, hi)} fill="none" stroke={C.ink} strokeWidth="3" strokeDasharray="8 5" transform="translate(0,10)" />
              <path d={spark(pts, 380, 150, lo, hi)} fill="none" stroke={C.blue} strokeWidth="4" transform="translate(0,10)" />
            </svg>
          </div>
          <div style={{ display: "flex", marginTop: "auto", gap: 24, fontSize: 20, color: C.ink2 }}><div style={{ display: "flex", alignItems: "center", color: C.blue }}><div style={{ display: "flex", width: 28, height: 4, background: C.blue, marginRight: 8 }} />Україна</div><div style={{ display: "flex", alignItems: "center" }}><div style={{ display: "flex", width: 28, borderTop: `3px dashed ${C.ink}`, marginRight: 8 }} />Німеччина</div></div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 22, color: C.ink2 }}>12 місяців цін · медіана, рекорд, Black Friday · перевір свою знижку</div>
        </div>
      </Desk>
    ),
    { ...size, fonts },
  );
}
