import { ImageResponse } from "next/og";
import { checkDiscount, CHECK_LABEL } from "@/lib/check";
import { C, Dash, Desk, Line, OgStamp, ogFonts } from "@/lib/og";
import { SITE } from "@/config/site";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const country = sp.get("c") === "DE" ? "DE" : "UA";
  const n = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const price = n("p") ?? 1;
  const crossed = n("x") ?? price;
  const low30 = n("l");
  const name = (sp.get("n") ?? "").slice(0, 60);
  const story = sp.get("format") === "story";
  const r = checkDiscount({ country, price, crossed, low30, isUvp: sp.get("u") === "1" });
  const L = CHECK_LABEL[r.id];
  const cur = country === "UA" ? " грн" : " €";
  const num = (x: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(x).replace(/ /g, " ");
  const claimed = `−${Math.round(r.claimed * 100)}%`;
  const real = r.real === null ? "невідомо" : `${r.real > 0 ? "−" : "+"}${Math.abs(Math.round(r.real * 100))}%`;
  const fonts = await ogFonts();
  const host = SITE.url.replace(/^https?:\/\//, "");

  const receipt = (w: number, fs: number) => (
    <div style={{ display: "flex", flexDirection: "column", width: w, background: C.paper, padding: `${fs * 1.2}px ${fs * 1.2}px ${fs * 1.4}px`, boxShadow: "0 18px 40px -20px rgba(40,30,10,.45)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs * 0.62, color: C.ink2, letterSpacing: 3 }}>
        <div style={{ display: "flex" }}>КУПУЙ ВЧАСНО</div>
        <div style={{ display: "flex" }}>{country === "UA" ? "МАГАЗИН UA" : "МАГАЗИН DE"}</div>
      </div>
      <div style={{ display: "flex", fontSize: fs * 1.05, fontWeight: 700, marginTop: fs * 0.6, lineHeight: 1.2 }}>{name || "Перевірка знижки"}</div>
      <Dash />
      <Line size={fs} left="Було (зачеркнута)" right={num(crossed) + cur} />
      <Line size={fs} left="Зараз" right={num(price) + cur} bold />
      {low30 !== null && <Line size={fs} left="Мінімум 30 днів" right={num(low30) + cur} />}
      <Dash />
      <Line size={fs * 1.15} left="Магазин пише" right={claimed} />
      <Line size={fs * 1.15} left="Насправді" right={real} bold color={r.id === "GENUINE" ? C.blue : C.red} />
      {r.pangvViolation && (
        <div style={{ display: "flex", marginTop: fs * 0.6, fontSize: fs * 0.7, color: C.red }}>⚠ мінімум за 30 днів не вказано (§11 PAngV)</div>
      )}
    </div>
  );

  if (story) {
    return new ImageResponse(
      (
        <Desk pad={70}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", justifyContent: "center" }}>
            <div style={{ display: "flex", fontFamily: "Oswald", fontSize: 92, letterSpacing: 2, marginBottom: 50 }}>ЗНИЖКА ЧИ ЦИРК?</div>
            <div style={{ display: "flex", position: "relative" }}>
              {receipt(940, 48)}
            </div>
            <div style={{ display: "flex", marginTop: -40 }}>
              <OgStamp text={L.stamp} tone={L.tone} size={L.stamp.length > 12 ? 70 : 100} rot={-8} sub="ЧЕК ПЕРЕВІРЕНО" />
            </div>
            <div style={{ display: "flex", marginTop: 90, fontSize: 38, color: C.ink2 }}>Перевір свою знижку:</div>
            <div style={{ display: "flex", marginTop: 10, fontSize: 44, fontWeight: 700, background: C.hl, padding: "4px 16px" }}>{host}</div>
          </div>
        </Desk>
      ),
      { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
    );
  }

  return new ImageResponse(
    (
      <Desk pad={40}>
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
          {receipt(680, 30)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 420 }}>
            <OgStamp text={L.stamp} tone={L.tone} size={L.stamp.length > 12 ? 48 : 64} rot={-9} sub="ЧЕК ПЕРЕВІРЕНО" />
            <div style={{ display: "flex", marginTop: 56, fontSize: 24, color: C.ink2 }}>Перевір свою знижку:</div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 26, fontWeight: 700, background: C.hl, padding: "2px 10px" }}>{host}</div>
          </div>
        </div>
      </Desk>
    ),
    { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
