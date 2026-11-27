import { checkDiscount } from "@/lib/check";
import { saveCheck } from "@/lib/db";
import { allow } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (!allow(ip, 15)) return Response.json({ ok: false, error: "rate" }, { status: 429 });
  const b = await req.json().catch(() => null);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x < 1e8 ? x : null);
  if (!b || (b.country !== "UA" && b.country !== "DE")) return Response.json({ ok: false }, { status: 400 });
  const price = num(b.price);
  const crossed = num(b.crossed);
  if (!price || !crossed) return Response.json({ ok: false }, { status: 400 });
  const res = checkDiscount({ country: b.country, price, crossed, low30: num(b.low30), isUvp: !!b.isUvp });
  const saved = await saveCheck({
    country: b.country,
    verdict: res.id,
    claimed: res.claimed,
    real: res.real,
    pangv_violation: res.pangvViolation,
  });
  return Response.json({ ok: true, saved, result: res });
}
