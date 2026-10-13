/**
 * Erstellt beim ersten Start Beispieldaten im Ordner daten/,
 * damit man alle Funktionen sofort ausprobieren kann:
 *   - 3 Demo-Konten (Inhaber, Stammkundin, inaktiver Kunde)
 *   - Bestellungen der letzten Monate (für die Verkaufsstatistik)
 *   - Vorbestellungen, darunter über 100 für "Summit Peak" (Preisaufschlag)
 *
 * Zum Zurücksetzen: Ordner daten/ löschen und den Server neu starten.
 */

const crypto = require("crypto");
const { speicher, hashePasswort } = require("./shop_logik.js");

const DEMO_KONTEN = [
  { id: "u-inhaber", name: "Inhaber Schuhwerk", email: "inhaber@schuhwerk.at", passwort: "inhaber123", rolle: "inhaber", loginVorTagen: 1 },
  { id: "u-anna", name: "Anna Berger", email: "anna@beispiel.at", passwort: "anna123", rolle: "kunde", loginVorTagen: 3 },
  { id: "u-max", name: "Max Huber", email: "max@beispiel.at", passwort: "max123", rolle: "kunde", loginVorTagen: 75 },
];

const VORNAMEN = ["Lena", "Paul", "Sophie", "Lukas", "Marie", "Felix", "Emma", "Jonas", "Laura", "David", "Hannah", "Elias", "Lea", "Tobias", "Sarah"];
const NACHNAMEN = ["Gruber", "Wagner", "Bauer", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Fuchs", "Eder", "Schmid"];
const ORTE = [["1010", "Wien"], ["1200", "Wien"], ["8010", "Graz"], ["4020", "Linz"], ["5020", "Salzburg"], ["6020", "Innsbruck"], ["3100", "St. Pölten"]];

// Immer gleiche "Zufallszahlen", damit die Demodaten bei jedem Start gleich aussehen
function zufallsgenerator(startwert) {
  let wert = startwert;
  return () => {
    wert = (wert * 1103515245 + 12345) % 2147483648;
    return wert / 2147483648;
  };
}

function vorTagen(tage, zufall = () => 0.5) {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  d.setHours(9 + Math.floor(zufall() * 11), Math.floor(zufall() * 60), 0, 0);
  return d.toISOString();
}

function position(schuh, farbe, groesse, menge) {
  const einzelpreis = Math.round(schuh.preis * (1 - (schuh.rabatt_prozent || 0) / 100) * 100) / 100;
  return { schuh_id: schuh.schuh_id, name: schuh.name, farbe, groesse, menge, einzelpreis, basispreis: schuh.preis };
}

function bestellung(datum, benutzerId, kunde, positionen) {
  const summeCent = positionen.reduce((s, p) => s + Math.round(p.einzelpreis * 100) * p.menge, 0);
  const versandCent = summeCent >= 5000 ? 0 : 490;
  return {
    datum,
    benutzer_id: benutzerId,
    kunde,
    positionen,
    treuerabatt_prozent: 0,
    summe: summeCent / 100,
    gutschein: null,
    gutschein_abzug: 0,
    versand: versandCent / 100,
    gesamt: (summeCent + versandCent) / 100,
  };
}

function erstelleDemodaten() {
  if (speicher.benutzer().length > 0) return false;

  const zufall = zufallsgenerator(42);
  const schuhe = speicher.schuhe();
  const schuh = (id) => schuhe.find((s) => s.schuh_id === id);

  // ---------- Konten ----------
  const benutzer = DEMO_KONTEN.map((k) => {
    const { salt, hash } = hashePasswort(k.passwort);
    return {
      id: k.id,
      name: k.name,
      email: k.email,
      passwort_hash: hash,
      salt,
      rolle: k.rolle,
      registriert: vorTagen(220),
      letzter_login: vorTagen(k.loginVorTagen),
      anzahl_logins: k.rolle === "inhaber" ? 40 : 9,
      letzte_erinnerung: null,
      gutscheine: [],
    };
  });

  // ---------- Bestellungen ----------
  const bestellungen = [];

  // Gastbestellungen über die letzten ca. 110 Tage verteilt
  for (let i = 0; i < 90; i++) {
    const tage = Math.floor(zufall() * 110);
    const datum = vorTagen(tage, zufall);
    const erschienen = schuhe.filter((s) => s.release_datum <= datum.slice(0, 10));
    const vorname = VORNAMEN[Math.floor(zufall() * VORNAMEN.length)];
    const nachname = NACHNAMEN[Math.floor(zufall() * NACHNAMEN.length)];
    const [plz, ort] = ORTE[Math.floor(zufall() * ORTE.length)];

    const positionen = [];
    const anzahlPositionen = zufall() < 0.75 ? 1 : 2;
    for (let j = 0; j < anzahlPositionen; j++) {
      const s = erschienen[Math.floor(zufall() * erschienen.length)];
      const farbe = s.farben[Math.floor(zufall() * s.farben.length)];
      positionen.push(position(s, farbe, 37 + Math.floor(zufall() * 9), zufall() < 0.85 ? 1 : 2));
    }

    bestellungen.push(
      bestellung(datum, null, {
        name: `${vorname} ${nachname}`,
        email: `${vorname}.${nachname}@beispiel.at`.toLowerCase(),
        strasse: `Hauptstraße ${1 + Math.floor(zufall() * 80)}`,
        plz,
        ort,
      }, positionen)
    );
  }

  // Stammkundin Anna: 5 gekaufte Paare (+ 1 Vorbestellung = 6 -> 10 % Treuerabatt)
  const anna = { name: "Anna Berger", email: "anna@beispiel.at", strasse: "Höchstädtplatz 6", plz: "1200", ort: "Wien" };
  bestellungen.push(bestellung(vorTagen(70), "u-anna", anna, [position(schuh(1001), "Schwarz", 39, 1), position(schuh(1009), "Gelb", 38, 1)]));
  bestellungen.push(bestellung(vorTagen(41), "u-anna", anna, [position(schuh(1011), "Weiß", 39, 1)]));
  bestellungen.push(bestellung(vorTagen(12), "u-anna", anna, [position(schuh(1015), "Blau", 39, 1), position(schuh(1019), "Schwarz", 39, 1)]));

  // Max: hat vor fast 3 Monaten bestellt und sich seitdem nicht mehr angemeldet
  const max = { name: "Max Huber", email: "max@beispiel.at", strasse: "Landstraße 12", plz: "4020", ort: "Linz" };
  bestellungen.push(bestellung(vorTagen(80), "u-max", max, [position(schuh(1007), "Braun", 43, 1), position(schuh(1003), "Grün", 43, 1)]));

  bestellungen.sort((a, b) => a.datum.localeCompare(b.datum));
  bestellungen.forEach((b, i) => {
    b.bestellnummer = `SW-${String(i + 1).padStart(5, "0")}`;
  });

  // ---------- Vorbestellungen ----------
  const vorbestellungen = [];
  const vorbestellen = (schuhId, anzahl) => {
    const s = schuh(schuhId);
    for (let i = 0; i < anzahl; i++) {
      vorbestellungen.push({
        id: crypto.randomUUID(),
        datum: vorTagen(Math.floor(zufall() * 40), zufall),
        benutzer_id: null,
        email: `kunde${vorbestellungen.length + 1}@beispiel.at`,
        schuh_id: schuhId,
        name: s.name,
        farbe: s.farben[Math.floor(zufall() * s.farben.length)],
        groesse: 37 + Math.floor(zufall() * 9),
        preis: s.preis,
        status: "aktiv",
      });
    }
  };

  vorbestellen(1022, 100); // + Anna = 101 -> mehr als 100, Preis steigt um 5 %
  vorbestellen(1023, 37);
  vorbestellen(1024, 12);

  vorbestellungen.push({
    id: crypto.randomUUID(),
    datum: vorTagen(5),
    benutzer_id: "u-anna",
    email: "anna@beispiel.at",
    schuh_id: 1022,
    name: schuh(1022).name,
    farbe: "Rot",
    groesse: 39,
    preis: schuh(1022).preis,
    status: "aktiv",
  });

  speicher.speichereBenutzer(benutzer);
  speicher.speichereBestellungen(bestellungen);
  speicher.speichereVorbestellungen(vorbestellungen);
  speicher.speichereEmails([]);
  return true;
}

module.exports = { erstelleDemodaten, DEMO_KONTEN };
