import { OPERATOR } from "@/config/site";

export const metadata = { title: "Datenschutz", robots: { index: false } };

export default function Page() {
  return (
    <div className="receipt torn-top grid gap-3 text-[14px]">
      <h1 className="font-display text-[30px] font-bold uppercase leading-none">Datenschutzerklärung</h1>
      <p className="label">1. Verantwortlicher</p>
      <p>{OPERATOR.name || "[Vor- und Nachname]"}, {OPERATOR.street || "[Straße]"}, {OPERATOR.city || "[PLZ Ort]"}, {OPERATOR.email || "[E-Mail]"}.</p>
      <p className="label">2. Hosting (Vercel)</p>
      <p>Diese Website wird bei Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA gehostet. Beim Aufruf werden technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Seite, User-Agent) in Server-Logs verarbeitet. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Die Übermittlung in die USA erfolgt auf Grundlage des EU-US Data Privacy Framework.</p>
      <p className="label">3. Reichweitenmessung (Vercel Web Analytics)</p>
      <p>Wir nutzen Vercel Web Analytics ohne Cookies. Es werden keine personenbezogenen Profile erstellt; Besucher werden über einen täglich wechselnden Hash gezählt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
      <p className="label">4. Rabatt-Prüfungen</p>
      <p>Wenn Sie eine Prüfung durchführen, speichern wir anonym nur: Land des Shops, Ergebnis und Prozentwerte. Keine IP-Adresse, kein Produktname, keine Cookies. Speicherung bei Supabase (Region EU). Die Werte werden für die öffentliche Statistik verwendet.</p>
      <p className="label">5. Externe Dienste</p>
      <p>Wechselkurse werden serverseitig von der Nationalbank der Ukraine (bank.gov.ua) abgerufen; dabei werden keine Daten der Besucher übermittelt.</p>
      <p className="label">6. Ihre Rechte</p>
      <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.</p>
    </div>
  );
}
