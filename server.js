/**
 * Webserver für den Schuhshop.
 * Liefert die Website aus und stellt die Daten über eine kleine API bereit.
 * Nutzt die bestehenden Funktionen leseSchuhe und empfehleSchuhe.
 * Nur eingebaute Node.js-Module, keine Installation nötig.
 *
 * Starten im Terminal:  node server.js
 * Danach im Browser öffnen:  http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { leseSchuhe } = require("./read_schuhe.js");
const { empfehleSchuhe } = require("./empfehlung_schuhe.js");

const PORT = 3000;
const DATENDATEI = path.join(__dirname, "schuhe.json");
const BESTELLDATEI = path.join(__dirname, "bestellungen.json");

const GROESSEN = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
const VERSANDKOSTEN_CENT = 490;
const VERSANDKOSTENFREI_AB_CENT = 5000;

// Nur diese Dateien werden an den Browser ausgeliefert
const SEITEN = {
  "/": { datei: "index.html", typ: "text/html; charset=utf-8" },
  "/index.html": { datei: "index.html", typ: "text/html; charset=utf-8" },
  "/style.css": { datei: "style.css", typ: "text/css; charset=utf-8" },
  "/app.js": { datei: "app.js", typ: "text/javascript; charset=utf-8" },
};

function sendeJson(res, status, daten) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(daten));
}

function leseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (teil) => {
      body += teil;
      if (body.length > 100000) {
        reject(new Error("Anfrage ist zu groß."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function leseBestellungen() {
  if (!fs.existsSync(BESTELLDATEI)) return [];
  return JSON.parse(fs.readFileSync(BESTELLDATEI, "utf-8"));
}

/**
 * Prüft eine Bestellung und berechnet die Summe.
 * Die Preise kommen immer aus schuhe.json, nie aus dem Browser.
 */
function pruefeBestellung(daten, schuhe) {
  const kunde = daten && daten.kunde;
  const positionen = daten && daten.positionen;

  const pflichtfelder = { name: "Name", email: "E-Mail", strasse: "Straße", plz: "PLZ", ort: "Ort" };
  for (const [feld, bezeichnung] of Object.entries(pflichtfelder)) {
    if (!kunde || typeof kunde[feld] !== "string" || kunde[feld].trim() === "") {
      return { fehler: `Bitte ${bezeichnung} angeben.` };
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kunde.email.trim())) {
    return { fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  }
  if (!Array.isArray(positionen) || positionen.length === 0) {
    return { fehler: "Der Warenkorb ist leer." };
  }

  let summeCent = 0;
  const geprueft = [];

  for (const position of positionen) {
    const schuh = schuhe.find((s) => s.schuh_id === position.schuh_id);
    if (!schuh) return { fehler: `Artikel ${position.schuh_id} gibt es nicht.` };
    if (!schuh.farben.includes(position.farbe)) {
      return { fehler: `${schuh.name} gibt es nicht in ${position.farbe}.` };
    }
    if (!GROESSEN.includes(position.groesse)) {
      return { fehler: `Größe ${position.groesse} ist nicht verfügbar.` };
    }
    if (!Number.isInteger(position.menge) || position.menge < 1 || position.menge > 10) {
      return { fehler: "Die Menge muss zwischen 1 und 10 liegen." };
    }

    const preisCent = Math.round(schuh.preis * 100);
    summeCent += preisCent * position.menge;
    geprueft.push({
      schuh_id: schuh.schuh_id,
      name: schuh.name,
      farbe: position.farbe,
      groesse: position.groesse,
      menge: position.menge,
      einzelpreis: preisCent / 100,
    });
  }

  const versandCent = summeCent >= VERSANDKOSTENFREI_AB_CENT ? 0 : VERSANDKOSTEN_CENT;

  return {
    kunde: {
      name: kunde.name.trim(),
      email: kunde.email.trim(),
      strasse: kunde.strasse.trim(),
      plz: kunde.plz.trim(),
      ort: kunde.ort.trim(),
    },
    positionen: geprueft,
    summe: summeCent / 100,
    versand: versandCent / 100,
    gesamt: (summeCent + versandCent) / 100,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // API: alle Schuhe
    if (req.method === "GET" && url.pathname === "/api/schuhe") {
      return sendeJson(res, 200, leseSchuhe(DATENDATEI));
    }

    // API: ein Schuh, z. B. /api/schuhe/1003
    const treffer = url.pathname.match(/^\/api\/schuhe\/(\d+)$/);
    if (req.method === "GET" && treffer) {
      const schuh = leseSchuhe(DATENDATEI).find((s) => s.schuh_id === Number(treffer[1]));
      if (!schuh) return sendeJson(res, 404, { fehler: "Diesen Schuh gibt es nicht." });
      return sendeJson(res, 200, schuh);
    }

    // API: Empfehlung (Algorithmus), z. B. /api/empfehlung?farben=Schwarz,Rot&budget=130&anzahl=3
    if (req.method === "GET" && url.pathname === "/api/empfehlung") {
      const farben = (url.searchParams.get("farben") || "")
        .split(",")
        .map((farbe) => farbe.trim())
        .filter(Boolean);
      const budget = Number(url.searchParams.get("budget"));
      const anzahl = Number(url.searchParams.get("anzahl") || 3);

      if (!Number.isFinite(budget) || budget <= 0) {
        return sendeJson(res, 400, { fehler: "Bitte ein Budget größer als 0 € angeben." });
      }
      if (!Number.isInteger(anzahl) || anzahl < 1) {
        return sendeJson(res, 400, { fehler: "Die Anzahl der Vorschläge muss mindestens 1 sein." });
      }

      return sendeJson(res, 200, empfehleSchuhe(leseSchuhe(DATENDATEI), { farben, budget, anzahl }));
    }

    // API: Bestellung abschicken (wird in bestellungen.json gespeichert)
    if (req.method === "POST" && url.pathname === "/api/bestellung") {
      let daten;
      try {
        daten = JSON.parse(await leseBody(req));
      } catch {
        return sendeJson(res, 400, { fehler: "Die Bestellung konnte nicht gelesen werden." });
      }

      const ergebnis = pruefeBestellung(daten, leseSchuhe(DATENDATEI));
      if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);

      const bestellungen = leseBestellungen();
      const bestellung = {
        bestellnummer: `SH-${String(bestellungen.length + 1).padStart(4, "0")}`,
        datum: new Date().toISOString(),
        ...ergebnis,
      };
      bestellungen.push(bestellung);
      fs.writeFileSync(BESTELLDATEI, JSON.stringify(bestellungen, null, 2), "utf-8");

      console.log(`Neue Bestellung ${bestellung.bestellnummer} über ${bestellung.gesamt} €`);
      return sendeJson(res, 201, bestellung);
    }

    // Website-Dateien
    const seite = SEITEN[url.pathname];
    if (req.method === "GET" && seite) {
      res.writeHead(200, { "Content-Type": seite.typ });
      return res.end(fs.readFileSync(path.join(__dirname, seite.datei)));
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Seite nicht gefunden");
  } catch (fehler) {
    console.error(fehler);
    sendeJson(res, 500, { fehler: "Auf dem Server ist ein Fehler aufgetreten." });
  }
});

server.listen(PORT, () => {
  console.log(`Schuhshop läuft auf http://localhost:${PORT}`);
  console.log("Zum Beenden im Terminal Strg + C drücken.");
});
