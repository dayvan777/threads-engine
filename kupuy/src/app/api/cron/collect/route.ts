import { enabledAdapters, ADAPTERS } from "@/lib/adapters";
import { allProducts } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Vercel Cron (Hobby: раз на добу). Збирає ціни з увімкнених джерел. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const active = enabledAdapters();
  let found = 0;
  for (const a of active) {
    for (const p of allProducts()) {
      const offers = await a.lookup({ gtin: p.ean, model: p.model, name: p.name });
      found += offers.length;
      // TODO: upsert у price_points, коли зʼявиться перше легальне джерело
    }
  }
  return Response.json({
    ok: true,
    activeSources: active.map((a) => a.id),
    disabledSources: ADAPTERS.filter((a) => !a.enabled).map((a) => ({ id: a.id, status: a.status })),
    offersFound: found,
  });
}
