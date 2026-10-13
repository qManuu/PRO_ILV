/**
 * Geschäftslogik des Schuhshops.
 * Hier stehen alle Regeln aus den Requirements an einem Ort:
 * Preisregeln, Treuerabatt, Bestand, Vorbestellungen, Erinnerungs-E-Mails und Verkaufsstatistik.
 * Alle Daten liegen als JSON-Dateien (Flat Files) vor.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHUH_DATEI = path.join(__dirname, "schuhe.json");
const DATEN_ORDNER = path.join(__dirname, "daten");
const DATEIEN = {
  benutzer: path.join(DATEN_ORDNER, "benutzer.json"),
  bestellungen: path.join(DATEN_ORDNER, "bestellungen.json"),
  vorbestellungen: path.join(DATEN_ORDNER, "vorbestellungen.json"),
  emails: path.join(DATEN_ORDNER, "emails.json"),
};

// Alle Zahlen aus den Requirements, damit man sie leicht findet und ändern kann
const REGELN = {
  nachfrageGrenze: 100, // mehr als 100 Vorbestellungen ...
  nachfrageAufschlag: 5, // ... erhöhen den Preis um 5 %
  knappGrenze: 0.2, // unter 20 % des Sollbestands ist ein Schuh knapp
  treueStufen: [
    { ab: 6, prozent: 10 }, // höchstens 10 %
    { ab: 3, prozent: 5 },
  ],
  erinnerungNachMonaten: 2, // kein Login seit 2 Monaten
  erinnerungsRabatt: 15, // Rabattcode in der Erinnerungs-E-Mail
  versandkostenCent: 490,
  versandfreiAbCent: 5000,
  maxMenge: 10,
};

const GROESSEN = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
const KATEGORIEN = ["Sneaker", "Laufschuh", "Basketball", "Boot", "Freizeit"];
const FARBEN = ["Schwarz", "Weiß", "Grau", "Silber", "Blau", "Türkis", "Grün", "Gelb", "Rot", "Braun", "Beige"];

// ===================== Dateien lesen und schreiben =====================

function lese(datei) {
  if (!fs.existsSync(datei)) return [];
  return JSON.parse(fs.readFileSync(datei, "utf-8"));
}

function schreibe(datei, daten) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const temp = `${datei}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(daten, null, 2) + "\n", "utf-8");
  fs.renameSync(temp, datei); // erst komplett schreiben, dann ersetzen
}

const speicher = {
  schuhe: () => lese(SCHUH_DATEI),
  speichereSchuhe: (daten) => schreibe(SCHUH_DATEI, daten),
  benutzer: () => lese(DATEIEN.benutzer),
  speichereBenutzer: (daten) => schreibe(DATEIEN.benutzer, daten),
  bestellungen: () => lese(DATEIEN.bestellungen),
  speichereBestellungen: (daten) => schreibe(DATEIEN.bestellungen, daten),
  vorbestellungen: () => lese(DATEIEN.vorbestellungen),
  speichereVorbestellungen: (daten) => schreibe(DATEIEN.vorbestellungen, daten),
  emails: () => lese(DATEIEN.emails),
  speichereEmails: (daten) => schreibe(DATEIEN.emails, daten),
};

// ===================== Hilfsfunktionen =====================

function datumText(datum) {
  const d = new Date(datum);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function istErschienen(schuh, jetzt = new Date()) {
  return schuh.release_datum <= datumText(jetzt);
}

function zuCent(euro) {
  return Math.round(euro * 100);
}

// ===================== Status & Bestand =====================

/**
 * vorbestellbar = erscheint erst noch
 * ausverkauft   = erschienen, aber kein Bestand mehr -> wird aus dem Sortiment genommen
 * knapp         = weniger als 20 % des Sollbestands
 */
function statusVon(schuh, jetzt = new Date()) {
  if (!istErschienen(schuh, jetzt)) return "vorbestellbar";
  if (schuh.bestand <= 0) return "ausverkauft";
  if (schuh.bestand < schuh.sollbestand * REGELN.knappGrenze) return "knapp";
  return "erhaeltlich";
}

function zaehleVorbestellungen(vorbestellungen) {
  const anzahl = {};
  for (const v of vorbestellungen) {
    if (v.status === "aktiv") anzahl[v.schuh_id] = (anzahl[v.schuh_id] || 0) + 1;
  }
  return anzahl;
}

// ===================== Treuerabatt =====================

function treueVon(benutzerId, bestellungen, vorbestellungen) {
  const gekauft = bestellungen
    .filter((b) => benutzerId && b.benutzer_id === benutzerId)
    .reduce((summe, b) => summe + b.positionen.reduce((s, p) => s + p.menge, 0), 0);
  const vorbestellt = vorbestellungen.filter(
    (v) => benutzerId && v.benutzer_id === benutzerId && v.status === "aktiv"
  ).length;

  const paare = gekauft + vorbestellt;
  const stufe = REGELN.treueStufen.find((s) => paare >= s.ab);
  const naechste = [...REGELN.treueStufen].reverse().find((s) => paare < s.ab) || null;

  return {
    gekauft,
    vorbestellt,
    paare,
    prozent: stufe ? stufe.prozent : 0,
    naechste_stufe: naechste,
    stufen: [...REGELN.treueStufen].reverse(),
  };
}

// ===================== Preise =====================

/**
 * Reihenfolge: Basispreis -> +5 % bei hoher Nachfrage -> Aktionsrabatt -> Treuerabatt
 */
function berechnePreis(schuh, { vorbestellungen = 0, treueProzent = 0 } = {}) {
  const basisCent = zuCent(schuh.preis);
  const aufschlag = vorbestellungen > REGELN.nachfrageGrenze;
  const vorherCent = aufschlag ? Math.round(basisCent * (1 + REGELN.nachfrageAufschlag / 100)) : basisCent;

  let cent = vorherCent;
  if (schuh.rabatt_prozent > 0) cent = Math.round(cent * (1 - schuh.rabatt_prozent / 100));
  if (treueProzent > 0) cent = Math.round(cent * (1 - treueProzent / 100));

  return {
    preis: cent / 100,
    preis_vorher: vorherCent / 100,
    rabattiert: cent < vorherCent,
    rabatt_prozent: Math.round((1 - cent / vorherCent) * 100),
    aktion_prozent: schuh.rabatt_prozent || 0,
    treue_prozent: treueProzent,
    nachfrage_aufschlag: aufschlag,
  };
}

/** So sieht ein Kunde einen Schuh (ohne interne Daten wie den Sollbestand). */
function kundenansicht(schuh, { anzahlVorbestellungen, treueProzent }) {
  const status = statusVon(schuh);
  const vorbestellungen = anzahlVorbestellungen[schuh.schuh_id] || 0;

  return {
    schuh_id: schuh.schuh_id,
    name: schuh.name,
    kategorie: schuh.kategorie,
    farben: schuh.farben,
    release_jahr: schuh.release_jahr,
    release_datum: schuh.release_datum,
    basispreis: schuh.preis,
    ...berechnePreis(schuh, { vorbestellungen, treueProzent }),
    status: status === "vorbestellbar" ? "vorbestellbar" : "erhaeltlich",
    vorbestellungen: status === "vorbestellbar" ? vorbestellungen : null,
    nur_noch: status !== "vorbestellbar" && schuh.bestand <= 5 ? schuh.bestand : null,
  };
}

/** Alle Schuhe im Sortiment, ausverkaufte werden automatisch ausgeblendet. */
function sortimentFuer(benutzer) {
  const vorbestellungen = speicher.vorbestellungen();
  const anzahlVorbestellungen = zaehleVorbestellungen(vorbestellungen);
  const treueProzent = benutzer ? treueVon(benutzer.id, speicher.bestellungen(), vorbestellungen).prozent : 0;

  return speicher
    .schuhe()
    .filter((schuh) => statusVon(schuh) !== "ausverkauft")
    .map((schuh) => kundenansicht(schuh, { anzahlVorbestellungen, treueProzent }));
}

// ===================== Passwörter =====================

function hashePasswort(passwort, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(passwort, salt, 64).toString("hex") };
}

function pruefePasswort(passwort, benutzer) {
  const { hash } = hashePasswort(passwort, benutzer.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(benutzer.passwort_hash, "hex"));
}

// ===================== Bestellung =====================

function pruefeKunde(kunde) {
  const pflichtfelder = { name: "Name", email: "E-Mail", strasse: "Straße", plz: "PLZ", ort: "Ort" };
  for (const [feld, bezeichnung] of Object.entries(pflichtfelder)) {
    if (!kunde || typeof kunde[feld] !== "string" || kunde[feld].trim() === "") {
      return `Bitte ${bezeichnung} angeben.`;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kunde.email.trim())) {
    return "Bitte eine gültige E-Mail-Adresse angeben.";
  }
  return null;
}

function findeGutschein(benutzer, code) {
  if (!benutzer || !code) return null;
  return (
    benutzer.gutscheine.find((g) => g.code.toUpperCase() === String(code).trim().toUpperCase() && !g.eingeloest) ||
    null
  );
}

/**
 * Prüft und speichert eine Bestellung.
 * Preise, Rabatte und Bestand werden immer hier berechnet, nie im Browser.
 */
function erstelleBestellung({ kunde, positionen, gutschein }, benutzer) {
  const kundenFehler = pruefeKunde(kunde);
  if (kundenFehler) return { fehler: kundenFehler };
  if (!Array.isArray(positionen) || positionen.length === 0) return { fehler: "Der Warenkorb ist leer." };
  if (positionen.length > 30) return { fehler: "Zu viele Positionen in einer Bestellung." };

  const schuhe = speicher.schuhe();
  const bestellungen = speicher.bestellungen();
  const vorbestellungen = speicher.vorbestellungen();
  const anzahlVorbestellungen = zaehleVorbestellungen(vorbestellungen);
  const treue = treueVon(benutzer && benutzer.id, bestellungen, vorbestellungen);

  const mengeProSchuh = {};
  const geprueft = [];
  let summeCent = 0;

  for (const position of positionen) {
    const schuh = schuhe.find((s) => s.schuh_id === position.schuh_id);
    if (!schuh) return { fehler: `Artikel ${position.schuh_id} gibt es nicht.` };

    const status = statusVon(schuh);
    if (status === "vorbestellbar") return { fehler: `${schuh.name} erscheint erst und kann nur vorbestellt werden.` };
    if (status === "ausverkauft") return { fehler: `${schuh.name} ist leider ausverkauft.` };
    if (!schuh.farben.includes(position.farbe)) return { fehler: `${schuh.name} gibt es nicht in ${position.farbe}.` };
    if (!GROESSEN.includes(position.groesse)) return { fehler: `Größe ${position.groesse} ist nicht verfügbar.` };
    if (!Number.isInteger(position.menge) || position.menge < 1 || position.menge > REGELN.maxMenge) {
      return { fehler: `Die Menge muss zwischen 1 und ${REGELN.maxMenge} liegen.` };
    }

    mengeProSchuh[schuh.schuh_id] = (mengeProSchuh[schuh.schuh_id] || 0) + position.menge;
    if (mengeProSchuh[schuh.schuh_id] > schuh.bestand) {
      return { fehler: `Von ${schuh.name} sind nur noch ${schuh.bestand} Stück verfügbar.` };
    }

    const preis = berechnePreis(schuh, {
      vorbestellungen: anzahlVorbestellungen[schuh.schuh_id] || 0,
      treueProzent: treue.prozent,
    });

    summeCent += zuCent(preis.preis) * position.menge;
    geprueft.push({
      schuh_id: schuh.schuh_id,
      name: schuh.name,
      farbe: position.farbe,
      groesse: position.groesse,
      menge: position.menge,
      einzelpreis: preis.preis,
      basispreis: schuh.preis,
    });
  }

  let gutscheinEintrag = null;
  let gutscheinCent = 0;
  if (gutschein) {
    gutscheinEintrag = findeGutschein(benutzer, gutschein);
    if (!gutscheinEintrag) return { fehler: "Der Gutscheincode ist ungültig, gehört zu einem anderen Konto oder wurde schon eingelöst." };
    gutscheinCent = Math.round((summeCent * gutscheinEintrag.prozent) / 100);
  }

  const zwischensummeCent = summeCent - gutscheinCent;
  const versandCent = zwischensummeCent >= REGELN.versandfreiAbCent ? 0 : REGELN.versandkostenCent;

  // Ab hier wird gespeichert: Bestand abziehen, Gutschein entwerten, Bestellung ablegen
  for (const [id, menge] of Object.entries(mengeProSchuh)) {
    schuhe.find((s) => s.schuh_id === Number(id)).bestand -= menge;
  }
  speicher.speichereSchuhe(schuhe);

  if (gutscheinEintrag) {
    const alleBenutzer = speicher.benutzer();
    const eintrag = alleBenutzer
      .find((b) => b.id === benutzer.id)
      .gutscheine.find((g) => g.code === gutscheinEintrag.code);
    eintrag.eingeloest = new Date().toISOString();
    speicher.speichereBenutzer(alleBenutzer);
  }

  const bestellung = {
    bestellnummer: `SW-${String(bestellungen.length + 1).padStart(5, "0")}`,
    datum: new Date().toISOString(),
    benutzer_id: benutzer ? benutzer.id : null,
    kunde: {
      name: kunde.name.trim(),
      email: kunde.email.trim(),
      strasse: kunde.strasse.trim(),
      plz: kunde.plz.trim(),
      ort: kunde.ort.trim(),
    },
    positionen: geprueft,
    treuerabatt_prozent: treue.prozent,
    summe: summeCent / 100,
    gutschein: gutscheinEintrag ? gutscheinEintrag.code : null,
    gutschein_abzug: gutscheinCent / 100,
    versand: versandCent / 100,
    gesamt: (zwischensummeCent + versandCent) / 100,
  };

  bestellungen.push(bestellung);
  speicher.speichereBestellungen(bestellungen);
  return bestellung;
}

// ===================== Vorbestellungen =====================

function erstelleVorbestellung(benutzer, { schuh_id, farbe, groesse }) {
  const schuh = speicher.schuhe().find((s) => s.schuh_id === schuh_id);
  if (!schuh) return { fehler: "Diesen Schuh gibt es nicht." };
  if (statusVon(schuh) !== "vorbestellbar") return { fehler: `${schuh.name} ist schon erschienen und kann direkt gekauft werden.` };
  if (!schuh.farben.includes(farbe)) return { fehler: `${schuh.name} gibt es nicht in ${farbe}.` };
  if (!GROESSEN.includes(groesse)) return { fehler: `Größe ${groesse} ist nicht verfügbar.` };

  const vorbestellungen = speicher.vorbestellungen();
  const anzahl = zaehleVorbestellungen(vorbestellungen);
  const treue = treueVon(benutzer.id, speicher.bestellungen(), vorbestellungen);
  const preis = berechnePreis(schuh, { vorbestellungen: anzahl[schuh_id] || 0, treueProzent: treue.prozent });

  const vorbestellung = {
    id: crypto.randomUUID(),
    datum: new Date().toISOString(),
    benutzer_id: benutzer.id,
    email: benutzer.email,
    schuh_id,
    name: schuh.name,
    farbe,
    groesse,
    preis: preis.preis,
    status: "aktiv",
  };

  vorbestellungen.push(vorbestellung);
  speicher.speichereVorbestellungen(vorbestellungen);
  return vorbestellung;
}

function storniereVorbestellung(benutzer, id) {
  const vorbestellungen = speicher.vorbestellungen();
  const eintrag = vorbestellungen.find((v) => v.id === id && v.benutzer_id === benutzer.id);
  if (!eintrag) return { fehler: "Diese Vorbestellung gibt es nicht." };
  if (eintrag.status !== "aktiv") return { fehler: "Diese Vorbestellung ist bereits storniert." };

  eintrag.status = "storniert";
  eintrag.storniert_am = new Date().toISOString();
  speicher.speichereVorbestellungen(vorbestellungen);
  return eintrag;
}

// ===================== Erinnerungs-E-Mails =====================

/**
 * Kunden ohne Login seit 2 Monaten bekommen eine Erinnerung mit 15 % Rabattcode.
 * Die E-Mails werden simuliert und in daten/emails.json abgelegt (Postausgang),
 * weil für echten Versand ein Mailserver mit Zugangsdaten nötig wäre.
 */
function pruefeErinnerungen(jetzt = new Date()) {
  const benutzer = speicher.benutzer();
  const emails = speicher.emails();
  const grenze = new Date(jetzt);
  grenze.setMonth(grenze.getMonth() - REGELN.erinnerungNachMonaten);

  const neu = [];

  for (const b of benutzer) {
    if (b.rolle !== "kunde") continue;
    const letzterLogin = new Date(b.letzter_login);
    if (letzterLogin > grenze) continue;
    if (b.letzte_erinnerung && new Date(b.letzte_erinnerung) > letzterLogin) continue; // schon erinnert

    const code = `WIEDER${REGELN.erinnerungsRabatt}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    b.gutscheine.push({ code, prozent: REGELN.erinnerungsRabatt, erstellt: jetzt.toISOString(), eingeloest: null });
    b.letzte_erinnerung = jetzt.toISOString();

    const vorname = b.name.split(" ")[0];
    const email = {
      id: crypto.randomUUID(),
      datum: jetzt.toISOString(),
      an: b.email,
      art: "erinnerung",
      betreff: `${vorname}, wir vermissen dich: ${REGELN.erinnerungsRabatt} % auf deinen nächsten Einkauf`,
      text:
        `Hallo ${vorname},\n\nwir haben dich schon länger nicht mehr bei Schuhwerk gesehen. ` +
        `Als Dankeschön schenken wir dir ${REGELN.erinnerungsRabatt} % Rabatt auf deine nächste Bestellung.\n\n` +
        `Dein Code: ${code}\n\nMelde dich einfach an und gib den Code an der Kasse ein.\n\nDein Schuhwerk-Team`,
      rabattcode: code,
    };

    emails.push(email);
    neu.push(email);
  }

  if (neu.length > 0) {
    speicher.speichereBenutzer(benutzer);
    speicher.speichereEmails(emails);
  }
  return neu;
}

// ===================== Inhaber-Bereich =====================

function verkaufsstatistik(bestellungen, jetzt = new Date()) {
  const start = new Date(jetzt.getFullYear(), jetzt.getMonth() - 2, 1);
  const monate = [0, 1, 2].map((i) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - 2 + i, 1);
    return { jahr: d.getFullYear(), monat: d.getMonth(), name: d.toLocaleDateString("de-AT", { month: "long" }), paare: 0, umsatzCent: 0 };
  });

  const proSchuh = {};

  for (const bestellung of bestellungen) {
    const datum = new Date(bestellung.datum);
    if (datum < start || datum > jetzt) continue;
    const index = monate.findIndex((m) => m.jahr === datum.getFullYear() && m.monat === datum.getMonth());

    for (const p of bestellung.positionen) {
      const eintrag = (proSchuh[p.schuh_id] ||= { paare: 0, umsatzCent: 0, monate: [0, 0, 0] });
      const cent = zuCent(p.einzelpreis) * p.menge;
      eintrag.paare += p.menge;
      eintrag.umsatzCent += cent;
      eintrag.monate[index] += p.menge;
      monate[index].paare += p.menge;
      monate[index].umsatzCent += cent;
    }
  }

  return { seit: datumText(start), monate, proSchuh };
}

function inhaberUebersicht(antwortzeiten) {
  const schuhe = speicher.schuhe();
  const bestellungen = speicher.bestellungen();
  const anzahlVorbestellungen = zaehleVorbestellungen(speicher.vorbestellungen());
  const statistik = verkaufsstatistik(bestellungen);

  const liste = schuhe.map((schuh) => {
    const vorbestellungen = anzahlVorbestellungen[schuh.schuh_id] || 0;
    const verkauf = statistik.proSchuh[schuh.schuh_id] || { paare: 0, umsatzCent: 0, monate: [0, 0, 0] };
    return {
      ...schuh,
      status: statusVon(schuh),
      bestand_quote: schuh.sollbestand > 0 ? schuh.bestand / schuh.sollbestand : 0,
      vorbestellungen,
      preis_aktuell: berechnePreis(schuh, { vorbestellungen }),
      verkauft_paare: verkauf.paare,
      verkauft_umsatz: verkauf.umsatzCent / 100,
      verkauft_monate: verkauf.monate,
    };
  });

  const warnungen = liste
    .filter((s) => s.status === "knapp" || s.status === "ausverkauft")
    .map((s) => ({
      schuh_id: s.schuh_id,
      name: s.name,
      status: s.status,
      bestand: s.bestand,
      sollbestand: s.sollbestand,
      empfehlung: s.sollbestand - s.bestand,
    }));

  return {
    regeln: REGELN,
    seit: statistik.seit,
    monate: statistik.monate.map((m) => ({ name: m.name, paare: m.paare, umsatz: m.umsatzCent / 100 })),
    schuhe: liste,
    warnungen,
    emails: speicher.emails().slice(-20).reverse(),
    offene_vorbestellungen: Object.values(anzahlVorbestellungen).reduce((a, b) => a + b, 0),
    antwortzeiten,
  };
}

function nachbestellen(schuhId) {
  const schuhe = speicher.schuhe();
  const schuh = schuhe.find((s) => s.schuh_id === schuhId);
  if (!schuh) return { fehler: "Diesen Schuh gibt es nicht." };
  schuh.bestand = schuh.sollbestand;
  speicher.speichereSchuhe(schuhe);
  return schuh;
}

/** Legt einen neuen Schuh an (ohne schuhId) oder ändert einen bestehenden. */
function speichereSchuh(daten, schuhId) {
  const name = String(daten.name || "").trim();
  const preis = Number(daten.preis);
  const farben = Array.isArray(daten.farben) ? daten.farben.filter((f) => FARBEN.includes(f)) : [];
  const bestand = Number(daten.bestand);
  const sollbestand = Number(daten.sollbestand);
  const rabatt = Number(daten.rabatt_prozent || 0);

  if (name.length < 2 || name.length > 60) return { fehler: "Der Name muss zwischen 2 und 60 Zeichen lang sein." };
  if (!Number.isFinite(preis) || preis < 1 || preis > 2000) return { fehler: "Der Preis muss zwischen 1 € und 2000 € liegen." };
  if (farben.length === 0) return { fehler: "Bitte mindestens eine Farbe wählen." };
  if (!KATEGORIEN.includes(daten.kategorie)) return { fehler: "Bitte eine Kategorie wählen." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(daten.release_datum || "") || Number.isNaN(Date.parse(daten.release_datum))) {
    return { fehler: "Bitte ein gültiges Erscheinungsdatum angeben." };
  }
  if (!Number.isInteger(bestand) || bestand < 0) return { fehler: "Der Bestand muss 0 oder mehr sein." };
  if (!Number.isInteger(sollbestand) || sollbestand < 1) return { fehler: "Der Sollbestand muss mindestens 1 sein." };
  if (!Number.isInteger(rabatt) || rabatt < 0 || rabatt > 90) return { fehler: "Der Rabatt muss zwischen 0 und 90 % liegen." };

  const schuhe = speicher.schuhe();
  const werte = {
    name,
    preis: Math.round(preis * 100) / 100,
    farben,
    release_jahr: Number(daten.release_datum.slice(0, 4)),
    release_datum: daten.release_datum,
    kategorie: daten.kategorie,
    bestand,
    sollbestand,
    rabatt_prozent: rabatt,
  };

  let schuh;
  if (schuhId) {
    schuh = schuhe.find((s) => s.schuh_id === schuhId);
    if (!schuh) return { fehler: "Diesen Schuh gibt es nicht." };
    Object.assign(schuh, werte);
  } else {
    schuh = { schuh_id: Math.max(1000, ...schuhe.map((s) => s.schuh_id)) + 1, ...werte };
    schuhe.push(schuh);
  }

  speicher.speichereSchuhe(schuhe);
  return schuh;
}

module.exports = {
  REGELN,
  GROESSEN,
  KATEGORIEN,
  FARBEN,
  speicher,
  statusVon,
  zaehleVorbestellungen,
  treueVon,
  berechnePreis,
  sortimentFuer,
  hashePasswort,
  pruefePasswort,
  findeGutschein,
  erstelleBestellung,
  erstelleVorbestellung,
  storniereVorbestellung,
  pruefeErinnerungen,
  inhaberUebersicht,
  nachbestellen,
  speichereSchuh,
};
