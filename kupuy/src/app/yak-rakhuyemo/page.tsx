import { VERDICT_CONFIG as V } from "@/config/verdict";
import { CUSTOMS_CONFIG as CU } from "@/config/customs";
import { ADAPTERS } from "@/lib/adapters";

export const metadata = { title: "Як ми рахуємо" };

export default function Page() {
  const p = (x: number) => Math.round(x * 100) + "%";
  return (
    <div className="receipt torn-top grid gap-4 text-[14px]">
      <h1 className="font-display text-[30px] font-bold uppercase leading-none">Як ми рахуємо</h1>
      <h2 className="font-bold">Вердикти (у порядку пріоритету)</h2>
      <ol className="grid list-decimal gap-1.5 pl-5">
        <li><b>Рекорд</b> — ціна не вища за мінімум за {V.yearWindowDays} днів.</li>
        <li><b>Підняли перед знижкою</b> — за {V.preHikeWindowDays.to}–{V.preHikeWindowDays.from} днів до акції ціна була на {p(V.preHikeRiseOverMedian - 1)}+ вища за медіану, а зараз не нижча за {p(V.notRealDiscountFloor)} медіани.</li>
        <li><b>Фейкова</b> — є зачеркнута ціна, але поточна не нижча за {p(V.notRealDiscountFloor)} медіани.</li>
        <li><b>Справжня знижка</b> — не вища за {p(V.genuineMaxShareOfMedian)} медіани за {V.medianWindowDays} днів.</li>
        <li><b>Подорожчало</b> — вища за {p(V.pricierMinShareOfMedian)} медіани.</li>
        <li><b>Знижки нема</b> — усе інше.</li>
      </ol>
      <h2 className="font-bold">Перевірка вашої знижки</h2>
      <p>Порівнюємо поточну ціну з мінімумом за 30 днів (саме так вимагає німецький закон, §11 PAngV). Не нижче {p(V.userCheckFakeFloor)} мінімуму — фейк; ≤{p(V.userCheckGenuineMax)} — справжня.</p>
      <h2 className="font-bold">Прогноз «бери чи чекай»</h2>
      <p>Евристика, без «штучного інтелекту»: що робила ціна торік у ці ж тижні (Black Friday → Cyber Monday → Різдво), наскільки далеко поточна ціна від річного рекорду, скільки сезонів історії ми бачили. Впевненість ніколи не вища за 60% при одному році даних.</p>
      <h2 className="font-bold">Мито</h2>
      <p>Посилка — безмитно до €{CU.parcelDutyFreeEur}. З суми понад ліміт: {p(CU.dutyRate)} мито і {p(CU.vatRate)} ПДВ (на перевищення + мито). Багаж — до €{CU.luggageDutyFreeEur} і {CU.luggageMaxKg} кг. Звірено {CU.verifiedAt}. <a className="underline" href={CU.sourceUrl}>Джерело</a>.</p>
      <h2 className="font-bold">Звідки ціни</h2>
      <ul className="grid gap-1">
        {ADAPTERS.map((a) => (
          <li key={a.id}>{a.name} ({a.country}) — {a.enabled ? "підключено" : "не підключено"}: {a.status}</li>
        ))}
      </ul>
      <p>Ми не парсимо сайти, правила яких це забороняють. Поки джерел нема, каталог працює на позначених демо-даних.</p>
    </div>
  );
}
