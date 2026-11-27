import { OPERATOR, operatorFilled } from "@/config/site";

export const metadata = { title: "Impressum", robots: { index: false } };

export default function Page() {
  return (
    <div className="receipt torn-top grid gap-3 text-[14px]">
      <h1 className="font-display text-[30px] font-bold uppercase leading-none">Impressum</h1>
      {!operatorFilled() && (
        <p className="border-l-4 border-red bg-paper-2 px-3 py-2">
          Дані оператора ще не заповнені (NEXT_PUBLIC_OPERATOR_*). Без них сайт не можна публікувати в Німеччині.
        </p>
      )}
      <p className="label">Angaben gemäß § 5 DDG</p>
      <p>
        {OPERATOR.name || "[Vor- und Nachname]"}<br />
        {OPERATOR.street || "[Straße Hausnummer]"}<br />
        {OPERATOR.city || "[PLZ Ort]"}<br />
        Deutschland
      </p>
      <p className="label">Kontakt</p>
      <p>E-Mail: {OPERATOR.email || "[E-Mail]"}</p>
      <p className="label">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</p>
      <p>{OPERATOR.name || "[Vor- und Nachname]"}, Anschrift wie oben</p>
      <p className="label">Hinweis</p>
      <p>Preisangaben mit der Kennzeichnung „ДЕМО“ sind simulierte Beispieldaten und keine Angaben realer Händler. Keine Gewähr für die Richtigkeit der Berechnungen; maßgeblich sind die Angaben der Händler und Behörden.</p>
    </div>
  );
}
