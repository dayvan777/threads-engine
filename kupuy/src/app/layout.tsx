import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Footer, Header } from "@/components/Chrome";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Купуй вчасно — знижка справжня чи намальована?", template: "%s · Купуй вчасно" },
  description:
    "Перевір знижку за 30 секунд: реальна ціна проти зачеркнутої, Україна vs Німеччина з доставкою і митом, прогноз «бери зараз чи почекай».",
  openGraph: { type: "website", locale: "uk_UA", siteName: SITE.name },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#e7e1d3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="flex min-h-dvh flex-col antialiased">
        <Header />
        <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pt-6">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
