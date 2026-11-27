import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

const dir = join(process.cwd(), "assets/fonts");
let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
export function ogFonts() {
  fontsP ??= Promise.all([
    readFile(join(dir, "ibm-plex-mono-latin-400-normal.woff")).then((data) => ({ name: "Plex", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "ibm-plex-mono-cyrillic-400-normal.woff")).then((data) => ({ name: "Plex", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "ibm-plex-mono-latin-700-normal.woff")).then((data) => ({ name: "Plex", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "ibm-plex-mono-cyrillic-700-normal.woff")).then((data) => ({ name: "Plex", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "oswald-latin-700-normal.woff")).then((data) => ({ name: "Oswald", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "oswald-cyrillic-700-normal.woff")).then((data) => ({ name: "Oswald", data, weight: 700 as const, style: "normal" as const })),
  ]);
  return fontsP;
}

export const C = {
  desk: "#e7e1d3",
  paper: "#fbf8f1",
  ink: "#1d1c1a",
  ink2: "#5f5a4f",
  rule: "#cfc7b4",
  red: "#c3272e",
  blue: "#1f4f9e",
  green: "#2e7a43",
  hl: "#ffe27a",
};
export const toneColor = (t: "red" | "blue" | "green" | "ink") =>
  t === "red" ? C.red : t === "blue" ? C.blue : t === "green" ? C.green : "#3b3833";

export function OgStamp({ text, tone, size, rot = -8, sub }: { text: string; tone: "red" | "blue" | "green" | "ink"; size: number; rot?: number; sub?: string }) {
  const c = toneColor(tone);
  return (
    <div style={{ display: "flex", transform: `rotate(${rot}deg)`, padding: 6, border: `3px solid ${c}`, borderRadius: 12 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          border: `${Math.round(size / 9)}px solid ${c}`,
          borderRadius: 8,
          padding: `${Math.round(size * 0.18)}px ${Math.round(size * 0.35)}px`,
          color: c,
          fontFamily: "Oswald",
          fontSize: size,
          lineHeight: 1,
          letterSpacing: 2,
          textAlign: "center",
          maxWidth: size * 9,
        }}
      >
        <div style={{ display: "flex", textAlign: "center" }}>{text}</div>
        {sub && <div style={{ display: "flex", fontSize: size * 0.32, marginTop: size * 0.12, letterSpacing: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function Line({ left, right, size = 30, bold = false, color = C.ink }: { left: string; right: string; size?: number; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", fontSize: size, color, fontWeight: bold ? 700 : 400, width: "100%" }}>
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex", flex: 1, borderBottom: `3px dashed ${C.rule}`, margin: "0 12px", marginBottom: size * 0.28 }} />
      <div style={{ display: "flex" }}>{right}</div>
    </div>
  );
}

export function Dash() {
  return <div style={{ display: "flex", width: "100%", borderTop: `3px dashed ${C.rule}`, margin: "18px 0" }} />;
}

export function Desk({ children, pad = 48 }: { children: ReactNode; pad?: number }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: C.desk, padding: pad, fontFamily: "Plex", color: C.ink }}>
      {children}
    </div>
  );
}
