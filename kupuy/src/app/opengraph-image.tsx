import { ImageResponse } from "next/og";
import { C, Desk, OgStamp, ogFonts } from "@/lib/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Купуй вчасно — знижка справжня чи намальована?";

export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <Desk pad={40}>
        <div style={{ display: "flex", width: "100%", background: C.paper, padding: "44px 56px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
            <div style={{ display: "flex", fontSize: 22, color: C.ink2, letterSpacing: 4 }}>КУПУЙ ВЧАСНО</div>
            <div style={{ display: "flex", fontFamily: "Oswald", fontSize: 82, lineHeight: 1, marginTop: 18 }}>ЗНИЖКА СПРАВЖНЯ</div>
            <div style={{ display: "flex", fontFamily: "Oswald", fontSize: 82, lineHeight: 1 }}>ЧИ НАМАЛЬОВАНА?</div>
            <div style={{ display: "flex", fontSize: 26, marginTop: 26, color: C.ink2 }}>Три цифри з картки товару → чесний чек.</div>
            <div style={{ display: "flex", fontSize: 26, color: C.ink2 }}>Україна vs Німеччина з доставкою і митом.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 40, alignItems: "center" }}>
            <OgStamp text="ФЕЙКОВА" tone="red" size={64} rot={-10} />
            <OgStamp text="СПРАВЖНЯ" tone="blue" size={48} rot={6} />
          </div>
        </div>
      </Desk>
    ),
    { ...size, fonts },
  );
}
