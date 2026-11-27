import type { MetadataRoute } from "next";
import { allProducts } from "@/lib/repo";
import { SITE } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/perevir`, priority: 0.9 },
    { url: `${base}/kalkulyator`, priority: 0.8 },
    { url: `${base}/stats`, changeFrequency: "hourly", priority: 0.8 },
    ...allProducts().map((p) => ({ url: `${base}/tovar/${p.slug}`, priority: 0.5 })),
  ];
}
