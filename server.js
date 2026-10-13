/**
 * Webserver für den Schuhshop "Schuhwerk".
 * Liefert die Website aus und stellt die API bereit (Shop, Konto, Inhaber-Bereich).
 * Nur eingebaute Node.js-Module, keine Installation nötig.
 *
 * Starten im Terminal:  node server.js
 * Danach im Browser öffnen:  http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const shop = require("./shop_logik.js");
const { empfehleSchuhe } = require("./empfehlung_schuhe.js");
const { erstelleDemodaten, DEMO_KONTEN } = require("./demodaten.js");

const PORT = 3000;
const SITZUNG_TAGE = 7;

// Nur diese Dateien werden an den Browser ausgeliefert
const SEITEN = {
  "/": { datei: "index.html", typ: "text/html; charset=utf-8" },
  "/index.html": { datei: "index.html", typ: "text/html; charset=utf-8" },
  "/style.css": { datei: "style.css", typ: "text/css; charset=utf-8" },
  "/app.js": { datei: "app.js", typ: "text/javascript; charset=utf-8" },
  "/admin.js": { datei: "admin.js", typ: "text/javascript; charset=utf-8" },
};

// ===================== Sitzungen (Login) =====================

const sitzungen = new Map(); // Token -> { benutzerId, ablauf }

function leseCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";").map((c) => c.trim().split("="));
  const treffer = cookies.find(([schluessel]) => schluessel === name);
  return treffer ? decodeURIComponent(treffer[1] || "") : null;
}

function aktuellerBenutzer(req) {
  const token = leseCookie(req, "sid");
  const sitzung = token && sitzungen.get(token);
  if (!sitzung || sitzung.ablauf < Date.now()) return null;
  return shop.speicher.benutzer().find((b) => b.id === sitzung.benutzerId) || null;
}

function starteSitzung(res, benutzer) {
  const token = crypto.randomBytes(32).toString("hex");
  sitzungen.set(token, { benutzerId: benutzer.id, ablauf: Date.now() + SITZUNG_TAGE * 86400000 });
  res.setHeader("Set-Cookie", `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SITZUNG_TAGE * 86400}`);
}

function beendeSitzung(req, res) {
  const token = leseCookie(req, "sid");
  if (token) sitzungen.delete(token);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

// ===================== Antwortzeiten (Requirement: unter 300 ms) =====================

const antwortzeiten = [];

function merkeAntwortzeit(ms) {
  antwortzeiten.push(ms);
  if (antwortzeiten.length > 500) antwortzeiten.shift();
}

function antwortzeitStatistik() {
  if (antwortzeiten.length === 0) return { anzahl: 0, durchschnitt_ms: 0, max_ms: 0, unter_ziel_prozent: 100, ziel_ms: 300 };
  const summe = antwortzeiten.reduce((a, b) => a + b, 0);
  return {
    anzahl: antwortzeiten.length,
    durchschnitt_ms: Math.round((summe / antwortzeiten.length) * 10) / 10,
    max_ms: Math.round(Math.max(...antwortzeiten) * 10) / 10,
    unter_ziel_prozent: Math.round((antwortzeiten.filter((ms) => ms < 300).length / antwortzeiten.length) * 100),
    ziel_ms: 300,
  };
}

// ===================== Hilfsfunktionen =====================

function sendeJson(res, status, daten) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
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
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Die Anfrage konnte nicht gelesen werden."));
      }
    });
    req.on("error", reject);
  });
}

/** Alles, was das Konto eines Benutzers betrifft. */
function kontoDaten(benutzer) {
  const bestellungen = shop.speicher.bestellungen();
  const vorbestellungen = shop.speicher.vorbestellungen();
  const schuhe = shop.speicher.schuhe();
  const daten = {
    angemeldet: true,
    benutzer: { name: benutzer.name, email: benutzer.email, rolle: benutzer.rolle },
    treue: shop.treueVon(benutzer.id, bestellungen, vorbestellungen),
    gutscheine: benutzer.gutscheine.filter((g) => !g.eingeloest),
    bestellungen: bestellungen.filter((b) => b.benutzer_id === benutzer.id).reverse(),
    vorbestellungen: vorbestellungen
      .filter((v) => v.benutzer_id === benutzer.id)
      .map((v) => ({ ...v, release_datum: (schuhe.find((s) => s.schuh_id === v.schuh_id) || {}).release_datum }))
      .reverse(),
  };

  if (benutzer.rolle === "inhaber") {
    daten.hinweise = shop.inhaberUebersicht(antwortzeitStatistik()).warnungen;
  }
  return daten;
}

function nurInhaber(benutzer, res) {
  if (!benutzer) {
    sendeJson(res, 401, { fehler: "Bitte zuerst anmelden." });
    return false;
  }
  if (benutzer.rolle !== "inhaber") {
    sendeJson(res, 403, { fehler: "Dieser Bereich ist nur für den Inhaber." });
    return false;
  }
  return true;
}

// ===================== API =====================

async function api(req, res, url) {
  const benutzer = aktuellerBenutzer(req);
  const pfad = url.pathname;
  const methode = req.method;
  let treffer;

  // ---------- Shop ----------
  if (methode === "GET" && pfad === "/api/schuhe") {
    return sendeJson(res, 200, shop.sortimentFuer(benutzer));
  }

  if (methode === "GET" && (treffer = pfad.match(/^\/api\/schuhe\/(\d+)$/))) {
    const schuh = shop.sortimentFuer(benutzer).find((s) => s.schuh_id === Number(treffer[1]));
    if (!schuh) return sendeJson(res, 404, { fehler: "Diesen Schuh gibt es nicht oder er ist nicht mehr im Sortiment." });
    return sendeJson(res, 200, schuh);
  }

  if (methode === "GET" && pfad === "/api/empfehlung") {
    const farben = (url.searchParams.get("farben") || "").split(",").map((f) => f.trim()).filter(Boolean);
    const budget = Number(url.searchParams.get("budget"));
    const anzahl = Number(url.searchParams.get("anzahl") || 3);

    if (!Number.isFinite(budget) || budget <= 0) return sendeJson(res, 400, { fehler: "Bitte ein Budget größer als 0 € angeben." });
    if (!Number.isInteger(anzahl) || anzahl < 1) return sendeJson(res, 400, { fehler: "Die Anzahl muss mindestens 1 sein." });

    // Der Algorithmus bekommt nur kaufbare Schuhe mit dem aktuellen Preis
    const kaufbar = shop.sortimentFuer(benutzer).filter((s) => s.status === "erhaeltlich");
    return sendeJson(res, 200, empfehleSchuhe(kaufbar, { farben, budget, anzahl }));
  }

  // ---------- Konto ----------
  if (methode === "GET" && pfad === "/api/ich") {
    return sendeJson(res, 200, benutzer ? kontoDaten(benutzer) : { angemeldet: false });
  }

  if (methode === "POST" && pfad === "/api/registrieren") {
    const { name = "", email = "", passwort = "" } = await leseBody(req);
    const sauberEmail = String(email).trim().toLowerCase();

    if (String(name).trim().length < 2) return sendeJson(res, 400, { fehler: "Bitte deinen Namen angeben." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sauberEmail)) return sendeJson(res, 400, { fehler: "Bitte eine gültige E-Mail-Adresse angeben." });
    if (String(passwort).length < 6) return sendeJson(res, 400, { fehler: "Das Passwort muss mindestens 6 Zeichen haben." });

    const alle = shop.speicher.benutzer();
    if (alle.some((b) => b.email === sauberEmail)) return sendeJson(res, 409, { fehler: "Mit dieser E-Mail gibt es schon ein Konto." });

    const { salt, hash } = shop.hashePasswort(String(passwort));
    const jetzt = new Date().toISOString();
    const neu = {
      id: `u-${crypto.randomUUID()}`,
      name: String(name).trim(),
      email: sauberEmail,
      passwort_hash: hash,
      salt,
      rolle: "kunde",
      registriert: jetzt,
      letzter_login: jetzt,
      anzahl_logins: 1,
      letzte_erinnerung: null,
      gutscheine: [],
    };
    alle.push(neu);
    shop.speicher.speichereBenutzer(alle);
    starteSitzung(res, neu);
    return sendeJson(res, 201, kontoDaten(neu));
  }

  if (methode === "POST" && pfad === "/api/login") {
    const { email = "", passwort = "" } = await leseBody(req);
    const alle = shop.speicher.benutzer();
    const gefunden = alle.find((b) => b.email === String(email).trim().toLowerCase());

    if (!gefunden || !shop.pruefePasswort(String(passwort), gefunden)) {
      return sendeJson(res, 401, { fehler: "E-Mail oder Passwort ist falsch." });
    }

    gefunden.letzter_login = new Date().toISOString();
    gefunden.anzahl_logins = (gefunden.anzahl_logins || 0) + 1;
    shop.speicher.speichereBenutzer(alle);
    starteSitzung(res, gefunden);
    return sendeJson(res, 200, kontoDaten(gefunden));
  }

  if (methode === "POST" && pfad === "/api/logout") {
    beendeSitzung(req, res);
    return sendeJson(res, 200, { angemeldet: false });
  }

  // ---------- Bestellung & Vorbestellung ----------
  if (methode === "POST" && pfad === "/api/bestellung") {
    const ergebnis = shop.erstelleBestellung(await leseBody(req), benutzer);
    if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);
    console.log(`Neue Bestellung ${ergebnis.bestellnummer} über ${ergebnis.gesamt.toFixed(2)} €`);
    return sendeJson(res, 201, ergebnis);
  }

  if (methode === "POST" && pfad === "/api/gutschein/pruefen") {
    if (!benutzer) return sendeJson(res, 401, { fehler: "Gutscheine können nur angemeldet eingelöst werden." });
    const { code } = await leseBody(req);
    const gutschein = shop.findeGutschein(benutzer, code);
    if (!gutschein) return sendeJson(res, 400, { fehler: "Dieser Code ist ungültig oder wurde schon eingelöst." });
    return sendeJson(res, 200, { code: gutschein.code, prozent: gutschein.prozent });
  }

  if (methode === "POST" && pfad === "/api/vorbestellung") {
    if (!benutzer) return sendeJson(res, 401, { fehler: "Bitte melde dich an, um vorzubestellen." });
    const ergebnis = shop.erstelleVorbestellung(benutzer, await leseBody(req));
    if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);
    return sendeJson(res, 201, ergebnis);
  }

  if (methode === "POST" && (treffer = pfad.match(/^\/api\/vorbestellung\/([\w-]+)\/stornieren$/))) {
    if (!benutzer) return sendeJson(res, 401, { fehler: "Bitte zuerst anmelden." });
    const ergebnis = shop.storniereVorbestellung(benutzer, treffer[1]);
    if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);
    return sendeJson(res, 200, ergebnis);
  }

  // ---------- Inhaber ----------
  if (methode === "GET" && pfad === "/api/inhaber/uebersicht") {
    if (!nurInhaber(benutzer, res)) return;
    return sendeJson(res, 200, shop.inhaberUebersicht(antwortzeitStatistik()));
  }

  if (methode === "POST" && (treffer = pfad.match(/^\/api\/inhaber\/nachbestellen\/(\d+)$/))) {
    if (!nurInhaber(benutzer, res)) return;
    const ergebnis = shop.nachbestellen(Number(treffer[1]));
    if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);
    return sendeJson(res, 200, ergebnis);
  }

  if (methode === "POST" && (treffer = pfad.match(/^\/api\/inhaber\/schuh(?:\/(\d+))?$/))) {
    if (!nurInhaber(benutzer, res)) return;
    const ergebnis = shop.speichereSchuh(await leseBody(req), treffer[1] ? Number(treffer[1]) : null);
    if (ergebnis.fehler) return sendeJson(res, 400, ergebnis);
    return sendeJson(res, treffer[1] ? 200 : 201, ergebnis);
  }

  return sendeJson(res, 404, { fehler: "Diese Schnittstelle gibt es nicht." });
}

// ===================== Server =====================

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    const start = process.hrtime.bigint();
    res.on("finish", () => merkeAntwortzeit(Number(process.hrtime.bigint() - start) / 1e6));

    try {
      await api(req, res, url);
    } catch (fehler) {
      console.error(fehler);
      if (!res.headersSent) sendeJson(res, 500, { fehler: fehler.message || "Auf dem Server ist ein Fehler aufgetreten." });
    }
    return;
  }

  const seite = SEITEN[url.pathname];
  if (req.method === "GET" && seite) {
    res.writeHead(200, { "Content-Type": seite.typ, "Cache-Control": "no-cache" });
    return res.end(fs.readFileSync(path.join(__dirname, seite.datei)));
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Seite nicht gefunden");
});

function erinnerungenPruefen() {
  for (const email of shop.pruefeErinnerungen()) {
    console.log(`Erinnerungs-E-Mail an ${email.an} mit Code ${email.rabattcode} (simuliert, siehe daten/emails.json)`);
  }
}

if (erstelleDemodaten()) console.log("Demodaten im Ordner daten/ angelegt.");
erinnerungenPruefen();
setInterval(erinnerungenPruefen, 60 * 60 * 1000); // jede Stunde prüfen

server.listen(PORT, () => {
  console.log(`\nSchuhwerk läuft auf http://localhost:${PORT}`);
  console.log("Demo-Zugänge:");
  for (const konto of DEMO_KONTEN) console.log(`  ${konto.email.padEnd(24)} Passwort: ${konto.passwort}`);
  console.log("Zum Beenden im Terminal Strg + C drücken.\n");
});
