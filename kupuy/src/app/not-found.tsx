import Link from "next/link";
export default function NotFound() {
  return (
    <div className="receipt torn-top grid gap-4">
      <span className="stamp self-start" data-tone="ink" style={{ fontSize: 28 }}>ЧЕК НЕ ЗНАЙДЕНО</span>
      <p>Такої сторінки нема. Можливо, посилання обрізалось.</p>
      <Link href="/" className="btn">На головну</Link>
    </div>
  );
}
