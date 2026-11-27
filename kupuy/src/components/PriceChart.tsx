"use client";
import { useMemo, useRef, useState } from "react";

type P = { d: string; p: number };

const W = 360;
const H = 210;
const PAD = { l: 8, r: 8, t: 16, b: 26 };

function med(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const fmt = (x: number, c: "UAH" | "EUR") =>
  c === "UAH"
    ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(x) + " ₴"
    : "€" + new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(x);

const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

export function PriceChart({
  ua,
  de,
  rate,
  blackFridays,
}: {
  ua: P[];
  de: P[];
  rate: number;
  blackFridays: string[];
}) {
  const [cur, setCur] = useState<"UAH" | "EUR">("UAH");
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    const end = ua[ua.length - 1].d;
    const startT = Date.parse(end) - 365 * 86400000;
    const cut = (xs: P[]) => xs.filter((x) => Date.parse(x.d) >= startT);
    const conv = (xs: P[], from: "UAH" | "EUR") =>
      xs.map((x) => ({ d: x.d, p: from === cur ? x.p : from === "UAH" ? x.p / rate : x.p * rate }));
    const a = conv(cut(ua), "UAH");
    const b = conv(cut(de), "EUR");
    const all = [...a, ...b].map((x) => x.p);
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.12 || hi * 0.05;
    lo -= pad;
    hi += pad;
    const t0 = startT;
    const t1 = Date.parse(end);
    const x = (d: string) => PAD.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const path = (xs: P[]) => xs.map((pt, i) => `${i ? "L" : "M"}${x(pt.d).toFixed(1)},${y(pt.p).toFixed(1)}`).join("");
    const last90 = (xs: P[]) => xs.filter((pt) => Date.parse(pt.d) > t1 - 90 * 86400000).map((pt) => pt.p);
    const mA = med(last90(a));
    const mB = med(last90(b));
    const months: { x: number; label: string }[] = [];
    const dt = new Date(t0);
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    while (dt.getTime() < t1) {
      if (dt.getUTCMonth() % 2 === 0)
        months.push({ x: x(dt.toISOString().slice(0, 10)), label: MONTHS[dt.getUTCMonth()] });
      dt.setUTCMonth(dt.getUTCMonth() + 1);
    }
    return { a, b, x, y, path, mA, mB, months, t0, t1 };
  }, [ua, de, rate, cur]);

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    data.a.forEach((pt, i) => {
      const dd = Math.abs(data.x(pt.d) - fx);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  }

  const h = hover !== null ? data.a[hover] : null;
  const hb = h ? data.b.find((pt) => pt.d === h.d) : null;

  return (
    <figure className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <figcaption className="flex flex-wrap gap-3 text-[13px]">
          <span className="flex items-center gap-1.5"><i className="inline-block h-[3px] w-5 bg-[var(--ua)]" />Україна</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-[3px] w-5 bg-[var(--de)]" style={{ backgroundImage: "repeating-linear-gradient(90deg,var(--de) 0 5px,transparent 5px 8px)", backgroundColor: "transparent" }} />Німеччина</span>
        </figcaption>
        <div className="seg w-[120px] text-[13px]" role="group" aria-label="Валюта графіка">
          <button type="button" aria-pressed={cur === "UAH"} onClick={() => setCur("UAH")}>₴</button>
          <button type="button" aria-pressed={cur === "EUR"} onClick={() => setCur("EUR")}>€</button>
        </div>
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y select-none"
          role="img"
          aria-label="Графік цін за 12 місяців в Україні та Німеччині"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* полоси медіани 90 днів (±2%) */}
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={data.y(data.mA * 1.02)} height={Math.max(2, data.y(data.mA * 0.98) - data.y(data.mA * 1.02))} fill="var(--ua)" opacity="0.1" />
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={data.y(data.mB * 1.02)} height={Math.max(2, data.y(data.mB * 0.98) - data.y(data.mB * 1.02))} fill="var(--de)" opacity="0.08" />
          {/* Black Friday */}
          {blackFridays.map((d) => {
            const t = Date.parse(d);
            if (t < data.t0 || t > data.t1) return null;
            const xx = data.x(d);
            return (
              <g key={d}>
                <line x1={xx} x2={xx} y1={PAD.t - 6} y2={H - PAD.b} stroke="var(--red)" strokeDasharray="3 3" strokeWidth="1" />
                <text x={Math.min(xx, W - 30)} y={PAD.t - 7} fontSize="9" fill="var(--red)" textAnchor={xx > W - 40 ? "end" : "middle"} fontFamily="var(--font-mono)">
                  BF{d.slice(2, 4)}
                </text>
              </g>
            );
          })}
          <path d={data.path(data.b)} fill="none" stroke="var(--de)" strokeWidth="1.6" strokeDasharray="5 3" strokeLinejoin="round" />
          <path d={data.path(data.a)} fill="none" stroke="var(--ua)" strokeWidth="2" strokeLinejoin="round" />
          {data.months.map((m) => (
            <text key={m.x} x={m.x} y={H - 8} fontSize="10" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">
              {m.label}
            </text>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--rule)" />
          {h && (
            <g>
              <line x1={data.x(h.d)} x2={data.x(h.d)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeWidth="0.8" />
              <circle cx={data.x(h.d)} cy={data.y(h.p)} r="3.5" fill="var(--ua)" />
              {hb && <circle cx={data.x(hb.d)} cy={data.y(hb.p)} r="3.5" fill="var(--de)" />}
            </g>
          )}
        </svg>
        <div className="pointer-events-none mt-1 h-5 text-center text-[12px] text-ink-2 tnum" aria-live="polite">
          {h
            ? `${new Date(h.d).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" })}: UA ${fmt(h.p, cur)}${hb ? ` · DE ${fmt(hb.p, cur)}` : ""}`
            : "Торкніться графіка, щоб побачити ціну на дату"}
        </div>
      </div>
      <p className="text-[12px] text-ink-2">
        Смуга — медіана за 90 днів (±2%). Червоні лінії — Black Friday. Курс НБУ: 1 € = {rate.toFixed(2)} ₴.
      </p>
    </figure>
  );
}
