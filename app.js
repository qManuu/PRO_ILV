/**
 * Frontend des Schuhshops "Schuhwerk".
 * Eine Seite mit mehreren Ansichten: Start, Shop, Produkt, Schuh-Finder, Warenkorb, Kasse,
 * Anmelden, Konto. Der Inhaber-Bereich steht in admin.js.
 * Alle Daten kommen über die API von server.js.
 */

// ===================== Einstellungen =====================

const FARBWERTE = {
  Schwarz: "#1E1F23",
  "Weiß": "#F7F7F5",
  Grau: "#9AA0A8",
  Silber: "#C5CAD1",
  Blau: "#2F5DBA",
  "Türkis": "#22ADAC",
  "Grün": "#3B7D48",
  Gelb: "#F0C02F",
  Rot: "#C7352C",
  Braun: "#7A5232",
  Beige: "#D9C8A5",
};

const KATEGORIEN = {
  Sneaker: "Sneaker",
  Laufschuh: "Laufschuhe",
  Basketball: "Basketball",
  Boot: "Boots",
  Freizeit: "Freizeit",
};

const GROESSEN = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
const MAX_MENGE = 10;
const VERSANDKOSTEN_CENT = 490;
const VERSANDKOSTENFREI_AB_CENT = 5000;
const KORB_SCHLUESSEL = "schuhwerk-warenkorb";
const SHOPNAME = "Schuhwerk";

const preisFormat = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const datumFormat = new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "long", year: "numeric" });
const kurzDatumFormat = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

const app = document.getElementById("app");

// ===================== Zustand =====================

const zustand = {
  schuhe: [],
  ich: { angemeldet: false },
  warenkorb: ladeWarenkorb(),
  shopFilter: null,
  produkt: null, // Auswahl auf der Produktseite
  gutschein: null, // eingelöster Gutschein an der Kasse
  letzteBestellung: null,
  nachLogin: null, // wohin nach dem Anmelden
};

// ===================== Hilfsfunktionen =====================

function farbe(name) {
  return FARBWERTE[name] || "#B8BDC5";
}

function hexZuRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function istDunkel(hex) {
  const [r, g, b] = hexZuRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function abdunkeln(hex, faktor) {
  const [r, g, b] = hexZuRgb(hex).map((wert) => Math.round(wert * faktor));
  return `#${[r, g, b].map((wert) => wert.toString(16).padStart(2, "0")).join("")}`;
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function preis(euro) {
  return preisFormat.format(euro);
}

function zuCent(euro) {
  return Math.round(euro * 100);
}

function datum(text) {
  return datumFormat.format(new Date(text));
}

function kurzDatum(text) {
  return kurzDatumFormat.format(new Date(text));
}

function aufzaehlung(liste) {
  if (liste.length <= 1) return liste.join("");
  return `${liste.slice(0, -1).join(", ")} und ${liste[liste.length - 1]}`;
}

function findeSchuh(id) {
  return zustand.schuhe.find((schuh) => schuh.schuh_id === Number(id));
}

function istNeu(schuh) {
  if (schuh.status !== "erhaeltlich") return false;
  const grenze = new Date();
  grenze.setFullYear(grenze.getFullYear() - 1);
  return new Date(schuh.release_datum) >= grenze;
}

function alleFarben() {
  return [...new Set(zustand.schuhe.flatMap((s) => s.farben))].sort((a, b) => a.localeCompare(b, "de"));
}

function meldung(html, art = "") {
  return `<div class="meldung ${art}">${html}</div>`;
}

const SERVER_HINWEIS =
  "Starte den Server im Terminal mit <code>node server.js</code> und öffne dann <code>http://localhost:3000</code>.";

// ===================== Server-Anfragen =====================

async function api(pfad, { methode = "GET", daten } = {}) {
  try {
    const antwort = await fetch(pfad, {
      method: methode,
      headers: daten ? { "Content-Type": "application/json" } : {},
      body: daten ? JSON.stringify(daten) : undefined,
    });
    const inhalt = await antwort.json().catch(() => ({}));
    return { ok: antwort.ok, status: antwort.status, daten: inhalt };
  } catch {
    return { ok: false, status: 0, daten: { fehler: "Der Server ist nicht erreichbar. Läuft er noch?" } };
  }
}

async function ladeSchuhe() {
  const antwort = await api("/api/schuhe");
  if (antwort.ok) zustand.schuhe = antwort.daten;
  return antwort.ok;
}

async function ladeIch() {
  const antwort = await api("/api/ich");
  zustand.ich = antwort.ok ? antwort.daten : { angemeldet: false };
  aktualisiereKopf();
}

// ===================== Schuh-Grafik (1000 x 1000) =====================

let svgZaehler = 0;

function schuhForm(schuh) {
  const name = schuh.name.toLowerCase();
  return {
    hoch: schuh.kategorie === "Basketball" || schuh.kategorie === "Boot",
    ohneSchnuerung: /slip|loafer|chelsea/.test(name),
    chelsea: /chelsea/.test(name),
    profil: schuh.kategorie === "Boot",
    lauf: schuh.kategorie === "Laufschuh",
  };
}

/**
 * Zeichnet den Schuh als Vektorgrafik auf einer 1000 x 1000 Fläche.
 * voll = ganzes Quadrat (Produktbild), sonst zugeschnitten für Karten.
 */
function schuhSvg(schuh, { farbe: hauptfarbe, voll = false } = {}) {
  const id = `schuh${++svgZaehler}`;
  const form = schuhForm(schuh);
  const farben = hauptfarbe ? [hauptfarbe, ...schuh.farben.filter((f) => f !== hauptfarbe)] : schuh.farben;

  const ober = farbe(farben[0]);
  const akzent = farben[1] ? farbe(farben[1]) : abdunkeln(ober, 0.8);
  const mittelsohle = farben[2] ? farbe(farben[2]) : form.profil ? "#3B342D" : "#F3F3F0";
  const aussensohle = istDunkel(mittelsohle) ? "#17181B" : "#2B2D32";
  const futter = abdunkeln(ober, istDunkel(ober) ? 0.6 : 0.78);
  const zunge = abdunkeln(ober, 0.92);
  const schnuersenkel = istDunkel(ober) ? "#F2F2EE" : "#24262B";
  const oesen = abdunkeln(akzent, 0.55);

  const schaft = form.hoch
    ? "M112 612 C102 520 114 380 130 292 C134 272 148 262 170 262 L298 262 C320 262 332 272 336 292 L352 338 C382 400 452 446 560 476 C700 514 860 532 916 568 C944 586 950 606 944 622 Z"
    : "M112 612 C100 540 108 470 140 420 C160 392 200 390 236 402 C268 412 296 424 318 432 L372 392 C430 410 520 452 620 482 C740 516 860 532 916 568 C944 586 950 606 944 622 Z";
  const ferse = form.hoch
    ? "M112 612 C104 530 112 430 126 360 C170 380 210 450 228 530 C238 574 238 600 236 616 Z"
    : "M112 612 C100 540 108 474 138 424 C176 440 214 490 232 548 C242 582 240 604 236 616 Z";
  const kragen = form.hoch
    ? "M130 292 C134 272 148 262 170 262 L298 262 C320 262 332 272 336 292 L322 302 C318 290 308 284 292 284 L176 284 C160 284 150 292 146 308 Z"
    : "M140 420 C160 392 200 390 236 402 C268 412 296 424 318 432 L310 452 C284 444 254 432 226 424 C196 416 166 420 150 438 Z";
  const zungenPfad = form.hoch
    ? "M300 270 C306 224 330 196 368 192 C396 190 408 210 400 236 L360 300 Z"
    : "M326 428 C330 380 352 342 392 330 C424 322 444 340 438 366 L404 410 Z";
  const schnuerleiste = form.hoch
    ? "M346 300 C382 380 470 440 640 488 L626 530 C456 484 364 420 326 330 Z"
    : "M366 398 C440 418 540 458 690 498 L676 540 C540 506 432 466 352 444 Z";
  const kappe = "M760 516 C840 528 900 540 922 566 C944 586 950 606 944 622 L736 618 C726 584 734 544 760 516 Z";
  const schutzband = "M236 598 C400 584 600 582 748 598 L744 618 L236 616 Z";

  const senkelPunkte = form.hoch
    ? [[356, 318], [384, 358], [420, 394], [466, 424], [520, 448], [578, 468]]
    : [[392, 402], [452, 422], [512, 442], [572, 462], [632, 482]];

  let schnuerung = "";
  if (!form.ohneSchnuerung) {
    schnuerung = senkelPunkte
      .map(([x, y]) => `<circle cx="${x - 4}" cy="${y + 26}" r="6" fill="${oesen}" />`)
      .join("");
    schnuerung += `<g stroke="${schnuersenkel}" stroke-width="13" stroke-linecap="round">${senkelPunkte
      .map(([x, y]) => `<line x1="${x - 8}" y1="${y + 20}" x2="${x + 34}" y2="${y - 8}" />`)
      .join("")}</g>`;
  }

  // Elastischer Einsatz für Slip-On, Loafer und Chelsea Boots
  let einsatz = "";
  if (form.chelsea) {
    einsatz = `<path d="M300 280 C330 340 360 400 420 440 L380 470 C320 430 280 360 262 292 Z" fill="${abdunkeln(ober, 0.7)}" />
      <g stroke="rgba(0,0,0,0.25)" stroke-width="3">${[0, 1, 2, 3, 4].map((i) => `<line x1="${282 + i * 22}" y1="${300 + i * 34}" x2="${312 + i * 22}" y2="${290 + i * 34}" />`).join("")}</g>
      <path d="M150 262 L162 214 C164 206 172 202 180 204 L204 210 C210 212 212 218 210 224 L198 266 Z" fill="${akzent}" />`;
  } else if (form.ohneSchnuerung) {
    einsatz = `<path d="M372 400 C430 414 480 432 520 448 L506 484 C460 466 414 452 360 440 Z" fill="${abdunkeln(ober, 0.7)}" />`;
  }

  const profil = form.profil
    ? `<path d="M100 652 L952 644 C968 664 958 708 916 712 L130 722 C110 722 100 708 100 690 Z" fill="${aussensohle}" />
       <g stroke="rgba(255,255,255,0.12)" stroke-width="7">${Array.from({ length: 14 }, (_, i) => `<line x1="${160 + i * 55}" y1="694" x2="${160 + i * 55}" y2="716" />`).join("")}</g>`
    : `<path d="M102 660 L948 652 C962 668 952 694 916 698 L132 706 C112 706 102 696 102 680 Z" fill="${aussensohle}" />`;

  const laufStreifen = form.lauf
    ? `<path d="M140 648 C400 640 700 638 930 644" fill="none" stroke="${akzent}" stroke-width="9" stroke-linecap="round" />`
    : "";

  const zuschnitt = voll ? "0 0 1000 1000" : "40 170 920 580";
  const groesse = voll ? 'width="1000" height="1000"' : "";
  const beschriftung = `${schuh.name} in ${hauptfarbe || aufzaehlung(schuh.farben)}`;

  return `
    <svg class="schuh-svg" viewBox="${zuschnitt}" ${groesse} role="img" aria-label="${esc(beschriftung)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}-glanz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.3" />
          <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.12" />
        </linearGradient>
      </defs>
      <ellipse cx="525" cy="${form.profil ? 728 : 714}" rx="440" ry="22" fill="#000" opacity="0.09" />
      <ellipse cx="525" cy="${form.profil ? 726 : 712}" rx="340" ry="12" fill="#000" opacity="0.08" />
      ${profil}
      <path d="M96 628 C96 606 108 598 132 598 L860 598 C912 598 948 606 958 628 C966 646 958 668 930 674 L132 682 C108 682 96 668 96 650 Z" fill="${mittelsohle}" stroke="rgba(0,0,0,0.18)" stroke-width="2" />
      ${laufStreifen}
      ${form.ohneSchnuerung ? "" : `<path d="${zungenPfad}" fill="${zunge}" stroke="rgba(0,0,0,0.2)" stroke-width="2" />`}
      <path d="${schaft}" fill="${ober}" stroke="rgba(0,0,0,0.22)" stroke-width="2.5" stroke-linejoin="round" />
      <path d="${kragen}" fill="${futter}" />
      <path d="${ferse}" fill="${akzent}" stroke="rgba(0,0,0,0.15)" stroke-width="2" />
      <path d="${kappe}" fill="${akzent}" stroke="rgba(0,0,0,0.15)" stroke-width="2" />
      <path d="${schutzband}" fill="${akzent}" opacity="0.85" />
      ${form.ohneSchnuerung ? "" : `<path d="${schnuerleiste}" fill="${akzent}" stroke="rgba(0,0,0,0.15)" stroke-width="2" />`}
      ${einsatz}
      <g fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="3" stroke-dasharray="10 9">
        <path d="M770 528 C748 552 742 586 748 612" />
        <path d="M146 432 C182 450 216 496 232 552 C240 580 240 600 238 612" />
      </g>
      ${schnuerung}
      <path d="${schaft}" fill="url(#${id}-glanz)" />
    </svg>`;
}

// ===================== Bausteine =====================

/** Preis mit grüner Kennzeichnung, wenn der Schuh rabattiert ist (Requirement). */
function preisHtml(schuh, klasse = "") {
  if (schuh.rabattiert) {
    return `<span class="preis-zeile ${klasse}">
      <span class="preis rabattiert">${preis(schuh.preis)}</span>
      <span class="preis-alt"><span class="sr-only">statt </span>${preis(schuh.preis_vorher)}</span>
    </span>`;
  }
  return `<span class="preis-zeile ${klasse}"><span class="preis">${preis(schuh.preis)}</span></span>`;
}

function etikettenHtml(schuh) {
  const etiketten = [];
  if (schuh.status === "vorbestellbar") etiketten.push('<span class="etikett vorbestellen">Vorbestellen</span>');
  else if (istNeu(schuh)) etiketten.push('<span class="etikett">Neu</span>');
  if (schuh.rabattiert) etiketten.push(`<span class="etikett rabatt">−${schuh.rabatt_prozent} %</span>`);
  if (schuh.nur_noch !== null && schuh.nur_noch !== undefined) etiketten.push(`<span class="etikett knapp">Nur noch ${schuh.nur_noch}</span>`);
  return etiketten.length ? `<div class="etiketten">${etiketten.join("")}</div>` : "";
}

function produktKarte(schuh) {
  const punkte = schuh.farben.map((name) => `<span class="farbpunkt" style="--c:${farbe(name)}"></span>`).join("");
  const farbText = schuh.farben.length === 1 ? "1 Farbe" : `${schuh.farben.length} Farben`;
  const unten =
    schuh.status === "vorbestellbar"
      ? `${preisHtml(schuh)}<span class="karte-termin">Erscheint am ${datum(schuh.release_datum)}</span>`
      : preisHtml(schuh);

  return `
    <a class="produkt-karte" href="#/produkt/${schuh.schuh_id}">
      <div class="karte-bild">${etikettenHtml(schuh)}${schuhSvg(schuh)}</div>
      <div class="karte-text">
        <p class="karte-kategorie">${esc(KATEGORIEN[schuh.kategorie] || schuh.kategorie)}</p>
        <h3>${esc(schuh.name)}</h3>
        <div class="farbreihe" aria-label="Farben: ${esc(aufzaehlung(schuh.farben))}">${punkte}<span class="farbreihe-text" aria-hidden="true">${farbText}</span></div>
        ${unten}
      </div>
    </a>`;
}

// ===================== Warenkorb =====================

function ladeWarenkorb() {
  try {
    const daten = JSON.parse(localStorage.getItem(KORB_SCHLUESSEL) || "[]");
    return Array.isArray(daten) ? daten : [];
  } catch {
    return [];
  }
}

function speichereWarenkorb() {
  try {
    localStorage.setItem(KORB_SCHLUESSEL, JSON.stringify(zustand.warenkorb));
  } catch {
    // Ohne Speicher bleibt der Warenkorb bis zum Neuladen erhalten
  }
  aktualisiereKopf();
}

/** Entfernt Artikel, die nicht mehr kaufbar sind (z. B. ausverkauft). */
function bereinigeWarenkorb() {
  const vorher = zustand.warenkorb.length;
  zustand.warenkorb = zustand.warenkorb.filter((p) => {
    const schuh = findeSchuh(p.schuh_id);
    return schuh && schuh.status === "erhaeltlich" && schuh.farben.includes(p.farbe) && GROESSEN.includes(p.groesse) && Number.isInteger(p.menge) && p.menge >= 1;
  });
  speichereWarenkorb();
  return vorher - zustand.warenkorb.length;
}

function legeInWarenkorb(schuh, farbeName, groesse, menge) {
  const vorhanden = zustand.warenkorb.find((p) => p.schuh_id === schuh.schuh_id && p.farbe === farbeName && p.groesse === groesse);
  if (vorhanden) vorhanden.menge = Math.min(MAX_MENGE, vorhanden.menge + menge);
  else zustand.warenkorb.push({ schuh_id: schuh.schuh_id, farbe: farbeName, groesse, menge });
  speichereWarenkorb();
}

function korbSummen() {
  const anzahl = zustand.warenkorb.reduce((s, p) => s + p.menge, 0);
  const summeCent = zustand.warenkorb.reduce((s, p) => s + zuCent(findeSchuh(p.schuh_id).preis) * p.menge, 0);
  const gutscheinCent = zustand.gutschein ? Math.round((summeCent * zustand.gutschein.prozent) / 100) : 0;
  const zwischenCent = summeCent - gutscheinCent;
  const versandCent = summeCent === 0 || zwischenCent >= VERSANDKOSTENFREI_AB_CENT ? 0 : VERSANDKOSTEN_CENT;
  return {
    anzahl,
    summe: summeCent / 100,
    gutschein: gutscheinCent / 100,
    versand: versandCent / 100,
    gesamt: (zwischenCent + versandCent) / 100,
    bisVersandfrei: Math.max(0, VERSANDKOSTENFREI_AB_CENT - zwischenCent) / 100,
  };
}

function summenHtml({ mitKnopf }) {
  const s = korbSummen();
  const treue = zustand.ich.angemeldet ? zustand.ich.treue.prozent : 0;
  return `
    <dl class="summen">
      <dt>Zwischensumme (${s.anzahl} Paar)</dt><dd>${preis(s.summe)}</dd>
      ${zustand.gutschein ? `<dt class="gruen">Gutschein ${esc(zustand.gutschein.code)} (−${zustand.gutschein.prozent} %)</dt><dd class="gruen">−${preis(s.gutschein)}</dd>` : ""}
      <dt>Versand</dt><dd>${s.versand === 0 ? "kostenlos" : preis(s.versand)}</dd>
      <dt class="gesamt">Gesamt</dt><dd class="gesamt">${preis(s.gesamt)}</dd>
    </dl>
    ${treue > 0 ? `<p class="treue-hinweis">Dein Treuerabatt von ${treue} % ist in den Preisen schon enthalten.</p>` : ""}
    ${s.bisVersandfrei > 0 ? `<p class="versand-hinweis">Noch ${preis(s.bisVersandfrei)} bis zum kostenlosen Versand.</p>` : ""}
    ${mitKnopf ? '<a class="knopf gross voll" href="#/kasse">Zur Kasse</a>' : ""}`;
}

// ===================== Kopfzeile, Toast, Dialog =====================

function aktualisiereKopf() {
  const anzahl = zustand.warenkorb.reduce((s, p) => s + p.menge, 0);
  const zaehler = document.getElementById("warenkorb-anzahl");
  zaehler.textContent = anzahl;
  zaehler.classList.toggle("voll", anzahl > 0);

  const ich = zustand.ich;
  const kontoLink = document.getElementById("konto-link");
  document.getElementById("konto-text").textContent = ich.angemeldet ? ich.benutzer.name.split(" ")[0] : "Anmelden";
  kontoLink.setAttribute("href", ich.angemeldet ? "#/konto" : "#/login");
  document.getElementById("dashboard-link").hidden = !(ich.angemeldet && ich.benutzer.rolle === "inhaber");
}

let toastTimer;

function zeigeToast(html, dauer = 5000) {
  const toast = document.getElementById("toast");
  toast.innerHTML = html;
  toast.classList.add("sichtbar");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(versteckeToast, dauer);
}

function versteckeToast() {
  document.getElementById("toast").classList.remove("sichtbar");
}

function oeffneDialog(titel, inhalt) {
  const dialog = document.getElementById("dialog");
  dialog.innerHTML = `
    <div class="dialog-kopf">
      <h2 id="dialog-titel">${titel}</h2>
      <button type="button" class="dialog-schliessen" data-aktion="dialog-schliessen" aria-label="Schließen">×</button>
    </div>
    <div class="dialog-inhalt">${inhalt}</div>`;
  dialog.showModal();
  return dialog;
}

function schliesseDialog() {
  const dialog = document.getElementById("dialog");
  if (dialog.open) dialog.close();
}

// ===================== Seite: Start =====================

function zeigeStart() {
  document.title = `${SHOPNAME} | Schuhe online kaufen`;

  // Requirement: Startseite nach Release-Datum sortiert, neue Schuhe erscheinen automatisch
  const erhaeltlich = zustand.schuhe
    .filter((s) => s.status === "erhaeltlich")
    .sort((a, b) => b.release_datum.localeCompare(a.release_datum));
  const demnaechst = zustand.schuhe
    .filter((s) => s.status === "vorbestellbar")
    .sort((a, b) => a.release_datum.localeCompare(b.release_datum));
  const angebote = zustand.schuhe.filter((s) => s.rabattiert && s.status === "erhaeltlich");

  const highlight = [...demnaechst].sort((a, b) => b.vorbestellungen - a.vorbestellungen)[0] || erhaeltlich[0];
  const kacheln = Object.entries(KATEGORIEN)
    .map(([schluessel, name]) => {
      const inKategorie = erhaeltlich.filter((s) => s.kategorie === schluessel);
      if (inKategorie.length === 0) return "";
      return `
        <a class="kategorie-kachel" href="#/shop?kategorie=${schluessel}">
          ${schuhSvg(inKategorie[0])}
          <strong>${name}</strong>
          <span>${inKategorie.length} ${inKategorie.length === 1 ? "Modell" : "Modelle"}</span>
        </a>`;
    })
    .join("");

  const highlightText =
    highlight.status === "vorbestellbar"
      ? `<strong>${esc(highlight.name)}</strong><span>Erscheint am ${datum(highlight.release_datum)}, schon ${highlight.vorbestellungen}-mal vorbestellt</span>`
      : `<strong>${esc(highlight.name)}</strong><span>Neu im Sortiment, ${preis(highlight.preis)}</span>`;

  app.innerHTML = `
    <section class="held">
      <div class="wrap held-inhalt">
        <div>
          <p class="held-marke">Neue Saison bei ${SHOPNAME}</p>
          <h1>Schuhe für jeden Weg.</h1>
          <p class="held-text">${zustand.schuhe.length} Modelle vom Laufschuh bis zum Winterboot. Kommende Modelle kannst du schon heute vorbestellen.</p>
          <div class="held-aktionen">
            <a class="knopf gross" href="#/shop?sort=neu">Jetzt shoppen</a>
            <a class="knopf zweit gross" href="#/finder">Schuh-Finder</a>
          </div>
        </div>
        <a class="held-buehne" href="#/produkt/${highlight.schuh_id}">
          ${schuhSvg(highlight, { voll: false })}
          <div class="held-karte">${highlightText}</div>
        </a>
      </div>
    </section>

    <div class="wrap">
      <section class="abschnitt">
        <div class="abschnitt-kopf"><h2>Kategorien</h2></div>
        <div class="kategorien">${kacheln}</div>
      </section>

      ${
        demnaechst.length
          ? `<section class="abschnitt" style="padding-top:0">
              <div class="abschnitt-kopf">
                <div><h2>Demnächst erhältlich</h2><p>Sichere dir neue Modelle schon vor dem Erscheinen.</p></div>
                <a class="mehr-link" href="#/shop?verfuegbarkeit=vorbestellbar">Alle ansehen</a>
              </div>
              <div class="raster vier">${demnaechst.slice(0, 4).map(produktKarte).join("")}</div>
            </section>`
          : ""
      }

      <section class="abschnitt" style="padding-top:0">
        <div class="abschnitt-kopf">
          <div><h2>Neuheiten</h2><p>Sortiert nach Erscheinungsdatum, die neuesten zuerst.</p></div>
          <a class="mehr-link" href="#/shop?sort=neu">Alle Schuhe</a>
        </div>
        <div class="raster vier">${erhaeltlich.slice(0, 8).map(produktKarte).join("")}</div>
      </section>

      <section class="finder-band" aria-labelledby="band-titel">
        <div>
          <h2 id="band-titel">Nicht sicher, welcher passt?</h2>
          <p>Der Schuh-Finder bewertet alle Modelle nach deinen Lieblingsfarben und deinem Budget und zeigt dir die besten Treffer.</p>
        </div>
        <a class="knopf gross" href="#/finder">Schuh-Finder starten</a>
      </section>

      ${
        angebote.length
          ? `<section class="abschnitt">
              <div class="abschnitt-kopf">
                <div><h2>Angebote</h2><p>Reduzierte Modelle erkennst du am grünen Preis.</p></div>
                <a class="mehr-link" href="#/shop?angebote=1">Alle Angebote</a>
              </div>
              <div class="raster vier">${angebote.slice(0, 4).map(produktKarte).join("")}</div>
            </section>`
          : ""
      }

      <section class="vorteile" aria-label="Vorteile">
        <div><strong>Versandkostenfrei ab 50 €</strong><span>Darunter zahlst du 4,90 € Versand.</span></div>
        <div><strong>Bis zu 10 % Treuerabatt</strong><span>Ab 3 gekauften oder vorbestellten Paaren 5 %, ab 6 Paaren 10 %.</span></div>
        <div><strong>Vorbestellen ohne Risiko</strong><span>Vorbestellungen kannst du jederzeit in deinem Konto stornieren.</span></div>
      </section>
    </div>`;
}

// ===================== Seite: Shop =====================

function standardFilter() {
  const preise = zustand.schuhe.map((s) => s.preis);
  return {
    suche: "",
    kategorien: [],
    farben: [],
    maxPreis: Math.ceil(Math.max(...preise, 0) / 10) * 10,
    verfuegbarkeit: [],
    nurAngebote: false,
    sortierung: "neu",
  };
}

function preisSpanne() {
  const preise = zustand.schuhe.map((s) => s.preis);
  return { min: Math.floor(Math.min(...preise) / 10) * 10, max: Math.ceil(Math.max(...preise) / 10) * 10 };
}

function zeigeShop(query) {
  if (!zustand.shopFilter || [...query.keys()].length > 0) {
    const f = standardFilter();
    if (query.get("kategorie")) f.kategorien = [query.get("kategorie")];
    if (query.get("angebote") === "1") f.nurAngebote = true;
    if (query.get("verfuegbarkeit")) f.verfuegbarkeit = [query.get("verfuegbarkeit")];
    if (query.get("suche")) f.suche = query.get("suche");
    if (query.get("sort")) f.sortierung = query.get("sort");
    zustand.shopFilter = f;
  }

  const f = zustand.shopFilter;
  const spanne = preisSpanne();
  const titel =
    f.kategorien.length === 1 && !f.nurAngebote ? KATEGORIEN[f.kategorien[0]] :
    f.nurAngebote ? "Angebote" :
    f.verfuegbarkeit.length === 1 && f.verfuegbarkeit[0] === "vorbestellbar" ? "Demnächst erhältlich" :
    f.suche ? `Suche: „${f.suche}“` : "Alle Schuhe";
  document.title = `${titel} | ${SHOPNAME}`;

  const kategorieFelder = Object.entries(KATEGORIEN)
    .map(([wert, name]) => {
      const anzahl = zustand.schuhe.filter((s) => s.kategorie === wert).length;
      return `<label class="check"><input type="checkbox" name="f-kategorie" value="${wert}" ${f.kategorien.includes(wert) ? "checked" : ""}> ${name}<span class="anzahl">${anzahl}</span></label>`;
    })
    .join("");

  const farbFelder = alleFarben()
    .map((name) => `<label title="${esc(name)}"><input type="checkbox" name="f-farbe" value="${esc(name)}" ${f.farben.includes(name) ? "checked" : ""}><span class="farbpunkt" style="--c:${farbe(name)}"></span><span class="sr-only">${esc(name)}</span></label>`)
    .join("");

  const sortierungen = [["neu", "Neueste zuerst"], ["preis-auf", "Preis aufsteigend"], ["preis-ab", "Preis absteigend"], ["name", "Name A bis Z"]]
    .map(([wert, text]) => `<option value="${wert}" ${f.sortierung === wert ? "selected" : ""}>${text}</option>`)
    .join("");

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf">
        <h1>${esc(titel)}</h1>
        <p>Filtere nach Kategorie, Farbe, Preis und Verfügbarkeit.</p>
      </div>

      <div class="shop-layout">
        <details class="filter-box" id="filter-box">
          <summary>Filter</summary>
          <div class="filter-inhalt">
            <div>
              <label class="filter-titel" for="f-suche">Suche</label>
              <input id="f-suche" type="search" placeholder="z. B. Runner" value="${esc(f.suche)}">
            </div>
            <fieldset><legend>Kategorie</legend>${kategorieFelder}</fieldset>
            <fieldset><legend>Farbe</legend><div class="farbfilter">${farbFelder}</div></fieldset>
            <div>
              <label class="filter-titel" for="f-preis">Preis</label>
              <input id="f-preis" type="range" min="${spanne.min}" max="${spanne.max}" step="5" value="${f.maxPreis}">
              <div class="preis-wert"><span>ab ${preis(spanne.min)}</span><strong id="f-preis-wert">bis ${preis(f.maxPreis)}</strong></div>
            </div>
            <fieldset>
              <legend>Verfügbarkeit</legend>
              <label class="check"><input type="checkbox" name="f-verfuegbar" value="erhaeltlich" ${f.verfuegbarkeit.includes("erhaeltlich") ? "checked" : ""}> Sofort lieferbar</label>
              <label class="check"><input type="checkbox" name="f-verfuegbar" value="vorbestellbar" ${f.verfuegbarkeit.includes("vorbestellbar") ? "checked" : ""}> Vorbestellbar</label>
            </fieldset>
            <label class="check"><input type="checkbox" id="f-angebote" ${f.nurAngebote ? "checked" : ""}> Nur Angebote</label>
            <div><button type="button" class="textknopf" data-aktion="filter-zuruecksetzen">Alle Filter zurücksetzen</button></div>
          </div>
        </details>

        <div>
          <div class="shop-leiste">
            <p class="treffer" id="treffer" aria-live="polite"></p>
            <label class="sortierung">Sortieren <select id="f-sortierung">${sortierungen}</select></label>
          </div>
          <div class="aktive-filter" id="aktive-filter"></div>
          <div class="raster" id="shop-raster"></div>
        </div>
      </div>
    </div>`;

  document.getElementById("filter-box").open = window.matchMedia("(min-width: 901px)").matches;
  aktualisiereShopListe();
}

function gefilterteSchuhe() {
  const f = zustand.shopFilter;
  const suche = f.suche.trim().toLowerCase();

  const liste = zustand.schuhe.filter((s) => {
    const text = `${s.name} ${s.kategorie} ${KATEGORIEN[s.kategorie]} ${s.farben.join(" ")}`.toLowerCase();
    if (suche && !text.includes(suche)) return false;
    if (f.kategorien.length && !f.kategorien.includes(s.kategorie)) return false;
    if (f.farben.length && !s.farben.some((name) => f.farben.includes(name))) return false;
    if (s.preis > f.maxPreis) return false;
    if (f.verfuegbarkeit.length && !f.verfuegbarkeit.includes(s.status)) return false;
    if (f.nurAngebote && !s.rabattiert) return false;
    return true;
  });

  const sortierer = {
    neu: (a, b) => b.release_datum.localeCompare(a.release_datum),
    "preis-auf": (a, b) => a.preis - b.preis,
    "preis-ab": (a, b) => b.preis - a.preis,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };
  return liste.sort(sortierer[f.sortierung] || sortierer.neu);
}

function aktualisiereShopListe() {
  const f = zustand.shopFilter;
  const liste = gefilterteSchuhe();

  document.getElementById("treffer").textContent = liste.length === 1 ? "1 Modell" : `${liste.length} Modelle`;
  document.getElementById("f-preis-wert").textContent = `bis ${preis(f.maxPreis)}`;

  const chips = [
    ...f.kategorien.map((k) => ["kategorie", k, KATEGORIEN[k]]),
    ...f.farben.map((k) => ["farbe", k, k]),
    ...f.verfuegbarkeit.map((k) => ["verfuegbar", k, k === "erhaeltlich" ? "Sofort lieferbar" : "Vorbestellbar"]),
    ...(f.nurAngebote ? [["angebote", "1", "Nur Angebote"]] : []),
    ...(f.suche ? [["suche", "", `„${f.suche}“`]] : []),
  ];
  document.getElementById("aktive-filter").innerHTML = chips
    .map(([art, wert, text]) => `<button type="button" class="filter-chip" data-aktion="filter-entfernen" data-art="${art}" data-wert="${esc(wert)}">${esc(text)} <span aria-hidden="true">×</span><span class="sr-only">Filter entfernen</span></button>`)
    .join("");

  document.getElementById("shop-raster").innerHTML = liste.length
    ? liste.map(produktKarte).join("")
    : `<div class="leer"><p>Kein Modell passt zu deinen Filtern.</p><button type="button" class="knopf zweit" data-aktion="filter-zuruecksetzen">Filter zurücksetzen</button></div>`;
}

function entferneFilter(art, wert) {
  const f = zustand.shopFilter;
  if (art === "kategorie") f.kategorien = f.kategorien.filter((k) => k !== wert);
  if (art === "farbe") f.farben = f.farben.filter((k) => k !== wert);
  if (art === "verfuegbar") f.verfuegbarkeit = f.verfuegbarkeit.filter((k) => k !== wert);
  if (art === "angebote") f.nurAngebote = false;
  if (art === "suche") f.suche = "";
  zeigeShop(new URLSearchParams());
}

// ===================== Seite: Produkt =====================

function zeigeProdukt(id) {
  const schuh = findeSchuh(id);
  if (!schuh) return zeigeNichtGefunden("Diesen Schuh gibt es nicht oder er ist ausverkauft und nicht mehr im Sortiment.");

  document.title = `${schuh.name} | ${SHOPNAME}`;
  if (!zustand.produkt || zustand.produkt.schuhId !== schuh.schuh_id) {
    zustand.produkt = { schuhId: schuh.schuh_id, farbe: schuh.farben[0], groesse: null, menge: 1 };
  }
  const auswahl = zustand.produkt;
  const vorbestellbar = schuh.status === "vorbestellbar";
  const angemeldet = zustand.ich.angemeldet;

  const rabattInfos = [];
  if (schuh.aktion_prozent > 0) rabattInfos.push(`<span class="etikett rabatt">Aktion −${schuh.aktion_prozent} %</span>`);
  if (schuh.treue_prozent > 0) rabattInfos.push(`<span class="etikett rabatt">Dein Treuerabatt −${schuh.treue_prozent} %</span>`);
  if (schuh.nachfrage_aufschlag) rabattInfos.push(`<span class="etikett nachfrage">+5 % wegen hoher Nachfrage</span>`);

  const preisNotiz = schuh.nachfrage_aufschlag
    ? `<p class="preis-notiz">Über 100 Vorbestellungen: Der Preis ist um 5 % gestiegen und sinkt automatisch wieder, sobald es weniger werden. Normalpreis ${preis(schuh.basispreis)}.</p>`
    : schuh.rabattiert
      ? `<p class="preis-notiz">Du sparst ${preis(schuh.preis_vorher - schuh.preis)}.</p>`
      : !angemeldet
        ? `<p class="preis-notiz"><a href="#/login">Melde dich an</a> und spare als Stammkunde bis zu 10 %.</p>`
        : "";

  const verfuegbarkeit = vorbestellbar
    ? `<p class="verfuegbar bald">Erscheint am ${datum(schuh.release_datum)}, schon ${schuh.vorbestellungen}-mal vorbestellt</p>`
    : schuh.nur_noch !== null
      ? `<p class="verfuegbar knapp">Nur noch ${schuh.nur_noch} Stück auf Lager</p>`
      : `<p class="verfuegbar">Auf Lager, sofort lieferbar</p>`;

  const farbKnoepfe = schuh.farben
    .map((name) => `<button type="button" data-aktion="farbe-waehlen" data-farbe="${esc(name)}" aria-pressed="${name === auswahl.farbe}" aria-label="${esc(name)}" title="${esc(name)}"><span class="farbpunkt" style="--c:${farbe(name)}"></span></button>`)
    .join("");
  const groessenKnoepfe = GROESSEN.map((g) => `<button type="button" data-aktion="groesse-waehlen" data-groesse="${g}" aria-pressed="${g === auswahl.groesse}">${g}</button>`).join("");

  let kaufbereich;
  if (!vorbestellbar) {
    kaufbereich = `
      <div class="kauf-zeile">
        <div class="mengenwahl" role="group" aria-label="Menge">
          <button type="button" data-aktion="menge" data-delta="-1" aria-label="Menge verringern" ${auswahl.menge <= 1 ? "disabled" : ""}>−</button>
          <output id="menge" aria-live="polite">${auswahl.menge}</output>
          <button type="button" data-aktion="menge" data-delta="1" aria-label="Menge erhöhen" ${auswahl.menge >= MAX_MENGE ? "disabled" : ""}>+</button>
        </div>
        <button type="button" class="knopf gross" data-aktion="in-warenkorb">In den Warenkorb</button>
      </div>`;
  } else if (angemeldet) {
    kaufbereich = `<div class="kauf-zeile"><button type="button" class="knopf gross akzent" data-aktion="vorbestellen">Jetzt vorbestellen</button></div>`;
  } else {
    kaufbereich = `<div class="kauf-zeile"><button type="button" class="knopf gross akzent" data-aktion="zum-login">Zum Vorbestellen anmelden</button></div>`;
  }

  const alterText =
    vorbestellbar ? `erscheint am ${datum(schuh.release_datum)}` :
    istNeu(schuh) ? "gehört zu unseren neuesten Modellen" :
    schuh.release_jahr < 2000 ? `ist ein Klassiker aus dem Jahr ${schuh.release_jahr}` :
    `ist seit ${schuh.release_jahr} im Sortiment`;

  app.innerHTML = `
    <div class="wrap">
      <nav class="brotkrumen" aria-label="Brotkrumen">
        <a href="#/">Start</a> / <a href="#/shop?kategorie=${schuh.kategorie}">${KATEGORIEN[schuh.kategorie]}</a> / <span aria-current="page">${esc(schuh.name)}</span>
      </nav>

      <div class="produkt">
        <div class="produkt-bild">
          <div class="produkt-buehne" id="produkt-buehne">${etikettenHtml(schuh)}${schuhSvg(schuh, { farbe: auswahl.farbe, voll: true })}</div>
          <button type="button" class="textknopf bild-gross" data-aktion="bild-gross">Bild in Originalgröße ansehen (1000 × 1000 px)</button>
        </div>

        <div class="produkt-info">
          <p class="karte-kategorie">${KATEGORIEN[schuh.kategorie]}</p>
          <h1>${esc(schuh.name)}</h1>
          <p class="produkt-meta">Art.-Nr. ${schuh.schuh_id}, ${vorbestellbar ? "erscheint" : "erschienen"} ${datum(schuh.release_datum)}</p>

          <div class="produkt-preis">
            ${preisHtml(schuh)}
            ${rabattInfos.length ? `<div class="rabatt-info">${rabattInfos.join("")}</div>` : ""}
            ${preisNotiz}
          </div>

          ${verfuegbarkeit}

          <fieldset class="auswahl">
            <legend>Farbe: <span id="farbe-name">${esc(auswahl.farbe)}</span></legend>
            <div class="farbwahl">${farbKnoepfe}</div>
          </fieldset>

          <fieldset class="auswahl">
            <legend>Größe <span>(EU)</span></legend>
            <div class="groessen">${groessenKnoepfe}</div>
            <p class="feldfehler" id="groesse-fehler" aria-live="polite"></p>
          </fieldset>

          ${kaufbereich}

          <ul class="produkt-vorteile">
            <li>Versandkostenfrei ab 50 €, sonst 4,90 €</li>
            <li>${vorbestellbar ? "Vorbestellung jederzeit kostenlos im Konto stornierbar" : "Bis zu 10 % Treuerabatt für Stammkunden"}</li>
            <li>Gekaufte und vorbestellte Paare zählen für deinen Treuerabatt</li>
          </ul>

          <div class="produkt-beschreibung">
            <p>Der ${esc(schuh.name)} ${alterText} und ist in ${esc(aufzaehlung(schuh.farben))} erhältlich.</p>
            <dl>
              <dt>Kategorie</dt><dd>${KATEGORIEN[schuh.kategorie]}</dd>
              <dt>Farben</dt><dd>${esc(schuh.farben.join(", "))}</dd>
              <dt>Größen</dt><dd>EU ${GROESSEN[0]} bis ${GROESSEN[GROESSEN.length - 1]}</dd>
              <dt>Erscheinungsdatum</dt><dd>${datum(schuh.release_datum)}</dd>
            </dl>
          </div>
        </div>
      </div>

      <section class="abschnitt" id="passend" hidden style="padding-top:1rem">
        <div class="abschnitt-kopf"><div><h2>Passt auch zu dir</h2><p id="passend-info"></p></div></div>
        <div class="raster vier" id="passend-raster"></div>
      </section>
    </div>`;

  if (!vorbestellbar) ladePassendeSchuhe(schuh);
}

/** "Passt auch zu dir" nutzt den Empfehlungs-Algorithmus. */
async function ladePassendeSchuhe(schuh) {
  const budget = Math.ceil(schuh.preis * 1.25);
  const parameter = new URLSearchParams({ farben: schuh.farben.join(","), budget, anzahl: 5 });
  const antwort = await api(`/api/empfehlung?${parameter}`);
  if (!antwort.ok) return;

  const vorschlaege = antwort.daten.filter((v) => v.schuh_id !== schuh.schuh_id).slice(0, 4);
  const abschnitt = document.getElementById("passend");
  if (!abschnitt || !zustand.produkt || zustand.produkt.schuhId !== schuh.schuh_id || vorschlaege.length === 0) return;

  document.getElementById("passend-info").textContent = `Vom Schuh-Finder ausgewählt: ähnliche Farben bis ${preis(budget)}.`;
  document.getElementById("passend-raster").innerHTML = vorschlaege.map((v) => produktKarte(findeSchuh(v.schuh_id))).join("");
  abschnitt.hidden = false;
}

function waehleFarbe(name) {
  zustand.produkt.farbe = name;
  const schuh = findeSchuh(zustand.produkt.schuhId);
  document.querySelectorAll('[data-aktion="farbe-waehlen"]').forEach((k) => k.setAttribute("aria-pressed", String(k.dataset.farbe === name)));
  document.getElementById("farbe-name").textContent = name;
  document.getElementById("produkt-buehne").innerHTML = etikettenHtml(schuh) + schuhSvg(schuh, { farbe: name, voll: true });
}

function waehleGroesse(groesse) {
  zustand.produkt.groesse = groesse;
  document.querySelectorAll('[data-aktion="groesse-waehlen"]').forEach((k) => k.setAttribute("aria-pressed", String(Number(k.dataset.groesse) === groesse)));
  document.getElementById("groesse-fehler").textContent = "";
}

function aendereMenge(delta) {
  const auswahl = zustand.produkt;
  auswahl.menge = Math.min(MAX_MENGE, Math.max(1, auswahl.menge + delta));
  document.getElementById("menge").textContent = auswahl.menge;
  document.querySelector('[data-aktion="menge"][data-delta="-1"]').disabled = auswahl.menge <= 1;
  document.querySelector('[data-aktion="menge"][data-delta="1"]').disabled = auswahl.menge >= MAX_MENGE;
}

function pruefeGroesse() {
  if (zustand.produkt.groesse) return true;
  document.getElementById("groesse-fehler").textContent = "Bitte wähle eine Größe.";
  document.querySelector('[data-aktion="groesse-waehlen"]').focus();
  return false;
}

function produktInWarenkorb() {
  if (!pruefeGroesse()) return;
  const { schuhId, farbe: farbeName, groesse, menge } = zustand.produkt;
  const schuh = findeSchuh(schuhId);

  const imKorb = zustand.warenkorb.filter((p) => p.schuh_id === schuhId).reduce((s, p) => s + p.menge, 0);
  if (schuh.nur_noch !== null && imKorb + menge > schuh.nur_noch) {
    document.getElementById("groesse-fehler").textContent = `Es sind nur noch ${schuh.nur_noch} Stück verfügbar${imKorb ? `, ${imKorb} liegen schon in deinem Warenkorb` : ""}.`;
    return;
  }

  legeInWarenkorb(schuh, farbeName, groesse, menge);
  zeigeToast(`<span>${menge > 1 ? `${menge} × ` : ""}${esc(schuh.name)} (${esc(farbeName)}, Gr. ${groesse}) liegt im Warenkorb.</span><a href="#/warenkorb">Zum Warenkorb</a>`);
}

async function vorbestellen() {
  if (!pruefeGroesse()) return;
  const { schuhId, farbe: farbeName, groesse } = zustand.produkt;
  const knopf = app.querySelector('[data-aktion="vorbestellen"]');
  knopf.disabled = true;

  const antwort = await api("/api/vorbestellung", { methode: "POST", daten: { schuh_id: schuhId, farbe: farbeName, groesse } });
  if (!antwort.ok) {
    knopf.disabled = false;
    document.getElementById("groesse-fehler").textContent = antwort.daten.fehler;
    return;
  }

  const vorher = findeSchuh(schuhId);
  const warAufschlag = vorher.nachfrage_aufschlag;
  await Promise.all([ladeSchuhe(), ladeIch()]);
  const nachher = findeSchuh(schuhId);

  zeigeProdukt(schuhId);
  const extra = !warAufschlag && nachher.nachfrage_aufschlag ? " Damit hat das Modell über 100 Vorbestellungen, der Preis steigt um 5 %." : "";
  zeigeToast(`<span>${esc(nachher.name)} ist vorbestellt.${extra}</span><a href="#/konto">Zum Konto</a>`, 7000);
}

function zeigeBildGross() {
  const schuh = findeSchuh(zustand.produkt.schuhId);
  oeffneDialog(
    `${esc(schuh.name)} in ${esc(zustand.produkt.farbe)}, 1000 × 1000 px`,
    `<div class="bild-original">${schuhSvg(schuh, { farbe: zustand.produkt.farbe, voll: true })}</div>`
  );
}

// ===================== Seite: Schuh-Finder =====================

function zeigeFinder() {
  document.title = `Schuh-Finder | ${SHOPNAME}`;
  const chips = alleFarben()
    .map((name) => `<label class="farb-chip"><input type="checkbox" name="finder-farbe" value="${esc(name)}"><span class="farbpunkt" style="--c:${farbe(name)}"></span>${esc(name)}</label>`)
    .join("");

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf">
        <h1>Schuh-Finder</h1>
        <p>Wähle deine Lieblingsfarben und dein Budget. Der Finder bewertet alle lieferbaren Modelle und zeigt dir die besten Treffer.</p>
      </div>

      <form id="finder-form" class="finder-form" novalidate>
        <fieldset class="farb-feld"><legend>Lieblingsfarben</legend><div class="farb-auswahl">${chips}</div></fieldset>
        <div>
          <label class="feld-titel" for="budget">Budget</label>
          <div class="budget-zeile">
            <input id="budget" type="range" min="30" max="250" step="5" value="130">
            <output id="budget-wert" for="budget">bis 130 €</output>
          </div>
        </div>
        <div>
          <label class="feld-titel" for="anzahl">Vorschläge</label>
          <select id="anzahl"><option value="3" selected>3</option><option value="5">5</option><option value="8">8</option></select>
        </div>
        <button type="submit" class="knopf">Vorschläge anzeigen</button>
      </form>

      <div id="ergebnis" class="ergebnis" aria-live="polite"></div>
    </div>`;
}

async function sucheEmpfehlung(form) {
  const farben = [...form.querySelectorAll('input[name="finder-farbe"]:checked')].map((i) => i.value);
  const budget = Number(form.querySelector("#budget").value);
  const anzahl = Number(form.querySelector("#anzahl").value);
  const ergebnis = document.getElementById("ergebnis");

  const antwort = await api(`/api/empfehlung?${new URLSearchParams({ farben: farben.join(","), budget, anzahl })}`);
  if (!antwort.ok) {
    ergebnis.innerHTML = meldung(esc(antwort.daten.fehler), "fehler");
    return;
  }

  const vorschlaege = antwort.daten;
  if (vorschlaege.length === 0) {
    ergebnis.innerHTML = meldung(`Bis ${budget} € gibt es kein lieferbares Modell. Erhöhe dein Budget, um Vorschläge zu sehen.`);
    return;
  }

  const leistbar = zustand.schuhe.filter((s) => s.status === "erhaeltlich" && s.preis <= budget).length;
  const zeilen = vorschlaege
    .map((v, i) => {
      const schuh = findeSchuh(v.schuh_id);
      const passt = v.passende_farben.length ? `passt in ${esc(aufzaehlung(v.passende_farben))}` : "keine Wunschfarbe";
      return `
        <li class="vorschlag">
          <span class="platz" aria-label="Platz ${i + 1}">${i + 1}</span>
          <div class="vorschlag-bild">${schuhSvg(schuh, { farbe: v.passende_farben[0] })}</div>
          <div>
            <h3><a href="#/produkt/${schuh.schuh_id}">${esc(schuh.name)}</a></h3>
            <p class="vorschlag-details">${KATEGORIEN[schuh.kategorie]}, erschienen ${schuh.release_jahr}, ${passt}</p>
            <div class="punkte"><div class="punkte-balken" aria-hidden="true"><span style="width:${v.punkte}%"></span></div>${v.punkte} von 100 Punkten</div>
          </div>
          ${preisHtml(schuh)}
        </li>`;
    })
    .join("");

  ergebnis.innerHTML = `
    <h2>Deine Vorschläge</h2>
    <p class="ergebnis-info">Die besten ${vorschlaege.length} von ${leistbar} lieferbaren Modellen bis ${budget} €, ${farben.length ? `in ${esc(aufzaehlung(farben))}` : "ohne Farbwunsch"}.</p>
    <ol class="vorschlaege">${zeilen}</ol>
    <p class="erklaerung">So entsteht die Punktzahl: 50 Punkte, wenn eine Farbe passt, bis zu 30 Punkte für ein neueres Modell und bis zu 20 Punkte, je weiter der Preis unter deinem Budget liegt.</p>`;
}

// ===================== Seite: Warenkorb =====================

function zeigeWarenkorb() {
  document.title = `Warenkorb | ${SHOPNAME}`;

  if (zustand.warenkorb.length === 0) {
    app.innerHTML = `
      <div class="wrap">
        <div class="seitenkopf"><h1>Warenkorb</h1></div>
        <div class="leer" style="margin-bottom:4rem"><p>Dein Warenkorb ist leer.</p><a class="knopf" href="#/shop?sort=neu">Weiter einkaufen</a></div>
      </div>`;
    return;
  }

  const positionen = zustand.warenkorb
    .map((p, i) => {
      const schuh = findeSchuh(p.schuh_id);
      return `
        <li class="korb-position">
          <a class="korb-bild" href="#/produkt/${schuh.schuh_id}" tabindex="-1" aria-hidden="true">${schuhSvg(schuh, { farbe: p.farbe })}</a>
          <div>
            <h3><a href="#/produkt/${schuh.schuh_id}">${esc(schuh.name)}</a></h3>
            <p class="korb-details">${esc(p.farbe)}, Größe ${p.groesse}${schuh.nur_noch !== null ? `, nur noch ${schuh.nur_noch} auf Lager` : ""}</p>
            <div class="korb-aktionen">
              <div class="mengenwahl" role="group" aria-label="Menge für ${esc(schuh.name)}">
                <button type="button" data-aktion="korb-menge" data-index="${i}" data-delta="-1" aria-label="Menge verringern" ${p.menge <= 1 ? "disabled" : ""}>−</button>
                <output>${p.menge}</output>
                <button type="button" data-aktion="korb-menge" data-index="${i}" data-delta="1" aria-label="Menge erhöhen" ${p.menge >= MAX_MENGE ? "disabled" : ""}>+</button>
              </div>
              <button type="button" class="textknopf" data-aktion="korb-entfernen" data-index="${i}">Entfernen</button>
            </div>
          </div>
          <div class="preis-block">
            <span class="preis ${schuh.rabattiert ? "rabattiert" : ""}">${preis((zuCent(schuh.preis) * p.menge) / 100)}</span>
            ${p.menge > 1 ? `<div class="hinweis" style="font-size:.85rem">${preis(schuh.preis)} pro Paar</div>` : ""}
          </div>
        </li>`;
    })
    .join("");

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf"><h1 id="korb-titel" tabindex="-1">Warenkorb</h1></div>
      <div class="korb-layout">
        <ul class="korb-liste">${positionen}</ul>
        <aside class="zusammenfassung" aria-label="Übersicht"><h2>Übersicht</h2>${summenHtml({ mitKnopf: true })}</aside>
      </div>
    </div>`;
}

function aendereKorbMenge(index, delta) {
  const position = zustand.warenkorb[index];
  if (!position) return;
  const schuh = findeSchuh(position.schuh_id);
  const neu = Math.min(MAX_MENGE, Math.max(1, position.menge + delta));
  const imKorb = zustand.warenkorb.filter((p) => p.schuh_id === schuh.schuh_id).reduce((s, p) => s + p.menge, 0);
  if (delta > 0 && schuh.nur_noch !== null && imKorb + 1 > schuh.nur_noch) {
    zeigeToast(`<span>Von ${esc(schuh.name)} sind nur noch ${schuh.nur_noch} Stück verfügbar.</span>`);
    return;
  }
  position.menge = neu;
  speichereWarenkorb();
  zeigeWarenkorb();
  const knopf = app.querySelector(`[data-aktion="korb-menge"][data-index="${index}"][data-delta="${delta}"]`);
  (knopf && !knopf.disabled ? knopf : document.getElementById("korb-titel")).focus();
}

function entferneAusKorb(index) {
  const position = zustand.warenkorb[index];
  if (!position) return;
  const schuh = findeSchuh(position.schuh_id);
  zustand.warenkorb.splice(index, 1);
  speichereWarenkorb();
  zeigeWarenkorb();
  zeigeToast(`<span>${esc(schuh.name)} wurde entfernt.</span>`);
  document.getElementById("korb-titel")?.focus();
}

// ===================== Seite: Kasse =====================

const KASSEN_FELDER = [
  { id: "name", label: "Vor- und Nachname", typ: "text", autocomplete: "name", ganz: true },
  { id: "email", label: "E-Mail", typ: "email", autocomplete: "email", ganz: true },
  { id: "strasse", label: "Straße und Hausnummer", typ: "text", autocomplete: "street-address", ganz: true },
  { id: "plz", label: "PLZ", typ: "text", autocomplete: "postal-code" },
  { id: "ort", label: "Ort", typ: "text", autocomplete: "address-level2" },
];

function zeigeKasse() {
  document.title = `Kasse | ${SHOPNAME}`;
  if (zustand.warenkorb.length === 0) {
    location.hash = "#/warenkorb";
    return;
  }

  const ich = zustand.ich;
  const vorbelegt = ich.angemeldet ? { name: ich.benutzer.name, email: ich.benutzer.email } : {};
  const felder = KASSEN_FELDER.map((f) => `
    <div class="feld ${f.ganz ? "ganz" : ""}">
      <label for="k-${f.id}">${f.label}</label>
      <input id="k-${f.id}" name="${f.id}" type="${f.typ}" autocomplete="${f.autocomplete}" value="${esc(vorbelegt[f.id] || "")}" required aria-describedby="k-${f.id}-fehler">
      <p class="feldfehler" id="k-${f.id}-fehler"></p>
    </div>`).join("");

  const offeneGutscheine = ich.angemeldet ? ich.gutscheine : [];
  const gutscheinBereich = ich.angemeldet
    ? `<div class="feld ganz">
        <label for="k-gutschein">Gutscheincode</label>
        <div class="gutschein-zeile">
          <input id="k-gutschein" type="text" autocomplete="off" placeholder="z. B. WIEDER15-ABC123" value="${esc(zustand.gutschein ? zustand.gutschein.code : "")}">
          <button type="button" class="knopf zweit" data-aktion="gutschein-einloesen">Einlösen</button>
        </div>
        <p class="feldfehler" id="gutschein-fehler" aria-live="polite"></p>
        ${offeneGutscheine.length && !zustand.gutschein ? `<div class="gutschein-vorschlaege">${offeneGutscheine.map((g) => `<button type="button" class="filter-chip" data-aktion="gutschein-nutzen" data-code="${esc(g.code)}">${esc(g.code)} anwenden (−${g.prozent} %)</button>`).join("")}</div>` : ""}
        ${zustand.gutschein ? `<button type="button" class="textknopf" data-aktion="gutschein-entfernen" style="margin-top:.5rem">Gutschein entfernen</button>` : ""}
      </div>`
    : `<p class="hinweis ganz">Du hast ein Konto? <a href="#/login" data-aktion="login-von-kasse">Melde dich an</a>, um Treuerabatt und Gutscheine zu nutzen.</p>`;

  const posten = zustand.warenkorb
    .map((p) => {
      const schuh = findeSchuh(p.schuh_id);
      return `<li><span>${p.menge} × ${esc(schuh.name)}, ${esc(p.farbe)}, Gr. ${p.groesse}</span><span>${preis((zuCent(schuh.preis) * p.menge) / 100)}</span></li>`;
    })
    .join("");

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf"><h1>Kasse</h1><p>Das ist ein Demo-Shop, es wird nichts bezahlt.</p></div>
      <div class="korb-layout">
        <form id="kasse-form" class="kasse-form" novalidate>
          <h2>Lieferadresse</h2>
          ${felder}
          <h2>Rabatte</h2>
          ${gutscheinBereich}
          <p class="feldfehler ganz" id="kasse-fehler" aria-live="polite"></p>
          <div class="ganz"><button type="submit" class="knopf gross">Bestellung abschicken</button></div>
        </form>
        <aside class="zusammenfassung" aria-label="Deine Bestellung" id="kasse-summe">
          <h2>Deine Bestellung</h2>
          <ul class="kasse-posten">${posten}</ul>
          ${summenHtml({ mitKnopf: false })}
          <a href="#/warenkorb">Warenkorb bearbeiten</a>
        </aside>
      </div>
    </div>`;
}

async function loeseGutscheinEin(code) {
  const fehlerFeld = document.getElementById("gutschein-fehler");
  if (!code.trim()) {
    fehlerFeld.textContent = "Bitte einen Code eingeben.";
    return;
  }
  const antwort = await api("/api/gutschein/pruefen", { methode: "POST", daten: { code } });
  if (!antwort.ok) {
    fehlerFeld.textContent = antwort.daten.fehler;
    return;
  }
  zustand.gutschein = antwort.daten;
  merkeKassenEingaben();
  zeigeKasse();
  stelleKassenEingabenWiederHer();
  zeigeToast(`<span>Gutschein ${esc(antwort.daten.code)} eingelöst: −${antwort.daten.prozent} %.</span>`);
}

let kassenEingaben = {};
function merkeKassenEingaben() {
  kassenEingaben = {};
  KASSEN_FELDER.forEach((f) => {
    const input = document.getElementById(`k-${f.id}`);
    if (input) kassenEingaben[f.id] = input.value;
  });
}
function stelleKassenEingabenWiederHer() {
  Object.entries(kassenEingaben).forEach(([id, wert]) => {
    const input = document.getElementById(`k-${id}`);
    if (input && wert) input.value = wert;
  });
}

function pruefeKasse(form) {
  const werte = {};
  let erstesFehlerfeld = null;
  KASSEN_FELDER.forEach((f) => {
    const input = form.querySelector(`#k-${f.id}`);
    const wert = input.value.trim();
    let fehler = "";
    if (!wert) fehler = `Bitte ${f.label} angeben.`;
    else if (f.id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert)) fehler = "Bitte eine gültige E-Mail-Adresse angeben.";
    form.querySelector(`#k-${f.id}-fehler`).textContent = fehler;
    input.setAttribute("aria-invalid", String(Boolean(fehler)));
    if (fehler && !erstesFehlerfeld) erstesFehlerfeld = input;
    werte[f.id] = wert;
  });
  if (erstesFehlerfeld) {
    erstesFehlerfeld.focus();
    return null;
  }
  return werte;
}

async function sendeBestellung(form) {
  const kunde = pruefeKasse(form);
  if (!kunde) return;

  const knopf = form.querySelector('button[type="submit"]');
  const fehlerFeld = document.getElementById("kasse-fehler");
  knopf.disabled = true;
  knopf.textContent = "Wird gesendet …";
  fehlerFeld.textContent = "";

  const antwort = await api("/api/bestellung", {
    methode: "POST",
    daten: { kunde, positionen: zustand.warenkorb, gutschein: zustand.gutschein ? zustand.gutschein.code : null },
  });

  if (!antwort.ok) {
    fehlerFeld.textContent = antwort.daten.fehler;
    knopf.disabled = false;
    knopf.textContent = "Bestellung abschicken";
    return;
  }

  zustand.letzteBestellung = antwort.daten;
  zustand.warenkorb = [];
  zustand.gutschein = null;
  speichereWarenkorb();
  await Promise.all([ladeSchuhe(), ladeIch()]);
  location.hash = `#/bestellt/${antwort.daten.bestellnummer}`;
}

// ===================== Seite: Bestätigung =====================

function zeigeBestaetigung(nummer) {
  document.title = `Danke für deine Bestellung | ${SHOPNAME}`;
  const b = zustand.letzteBestellung && zustand.letzteBestellung.bestellnummer === nummer ? zustand.letzteBestellung : null;

  const details = b
    ? `<div class="tabelle-rahmen" style="margin:1.5rem 0">
        <table class="tabelle">
          <thead><tr><th>Artikel</th><th class="zahl">Menge</th><th class="zahl">Preis</th></tr></thead>
          <tbody>
            ${b.positionen.map((p) => `<tr><td>${esc(p.name)}<div class="klein">${esc(p.farbe)}, Größe ${p.groesse}</div></td><td class="zahl">${p.menge}</td><td class="zahl">${preis((zuCent(p.einzelpreis) * p.menge) / 100)}</td></tr>`).join("")}
            ${b.treuerabatt_prozent ? `<tr><td colspan="2">Treuerabatt ${b.treuerabatt_prozent} % (in den Preisen enthalten)</td><td></td></tr>` : ""}
            ${b.gutschein ? `<tr><td colspan="2">Gutschein ${esc(b.gutschein)}</td><td class="zahl" style="color:var(--gruen)">−${preis(b.gutschein_abzug)}</td></tr>` : ""}
            <tr><td colspan="2">Versand</td><td class="zahl">${b.versand === 0 ? "kostenlos" : preis(b.versand)}</td></tr>
            <tr><td colspan="2"><strong>Gesamt</strong></td><td class="zahl"><strong>${preis(b.gesamt)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p>Lieferung an ${esc(b.kunde.name)}, ${esc(b.kunde.strasse)}, ${esc(b.kunde.plz)} ${esc(b.kunde.ort)}.</p>`
    : "";

  app.innerHTML = `
    <div class="wrap">
      <section class="bestaetigung">
        <div class="haken" aria-hidden="true">✓</div>
        <h1>Danke für deine Bestellung!</h1>
        <p>Bestellnummer <strong>${esc(nummer || "")}</strong></p>
        ${details}
        <p class="hinweis">Die Bestellung wurde in daten/bestellungen.json gespeichert.</p>
        <div class="held-aktionen" style="margin-top:1.5rem">
          <a class="knopf" href="#/shop?sort=neu">Weiter einkaufen</a>
          ${zustand.ich.angemeldet ? '<a class="knopf zweit" href="#/konto">Zu meinem Konto</a>' : ""}
        </div>
      </section>
    </div>`;
}

// ===================== Seite: Anmelden / Registrieren =====================

function zeigeLogin() {
  document.title = `Anmelden | ${SHOPNAME}`;
  if (zustand.ich.angemeldet) {
    location.hash = zustand.ich.benutzer.rolle === "inhaber" ? "#/inhaber" : "#/konto";
    return;
  }

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf"><h1>Willkommen bei ${SHOPNAME}</h1><p>Mit einem Konto speicherst du deine Bestellungen und Vorbestellungen und bekommst bis zu 10 % Treuerabatt.</p></div>

      <div class="login-layout">
        <section class="karte" aria-labelledby="login-titel">
          <h2 id="login-titel">Anmelden</h2>
          <p>Schön, dass du wieder da bist.</p>
          <form id="login-form" class="formular" novalidate>
            <div class="feld"><label for="l-email">E-Mail</label><input id="l-email" type="email" autocomplete="email" required></div>
            <div class="feld"><label for="l-passwort">Passwort</label><input id="l-passwort" type="password" autocomplete="current-password" required></div>
            <p class="feldfehler" id="login-fehler" aria-live="polite"></p>
            <button type="submit" class="knopf gross">Anmelden</button>
          </form>
        </section>

        <section class="karte" aria-labelledby="reg-titel">
          <h2 id="reg-titel">Neues Konto erstellen</h2>
          <p>Kostenlos und in wenigen Sekunden.</p>
          <form id="registrieren-form" class="formular" novalidate>
            <div class="feld"><label for="r-name">Vor- und Nachname</label><input id="r-name" type="text" autocomplete="name" required></div>
            <div class="feld"><label for="r-email">E-Mail</label><input id="r-email" type="email" autocomplete="email" required></div>
            <div class="feld"><label for="r-passwort">Passwort (mindestens 6 Zeichen)</label><input id="r-passwort" type="password" autocomplete="new-password" minlength="6" required></div>
            <p class="feldfehler" id="registrieren-fehler" aria-live="polite"></p>
            <button type="submit" class="knopf gross zweit">Konto erstellen</button>
          </form>
        </section>
      </div>

      <section class="demo-konten" aria-labelledby="demo-titel">
        <h2 id="demo-titel">Demo-Zugänge zum Ausprobieren</h2>
        <ul>
          <li><div><code>inhaber@schuhwerk.at</code> / <code>inhaber123</code></div><span>Inhaber: Bestand, Verkäufe, Knappheits-Warnungen</span><button type="button" class="knopf klein zweit" data-aktion="demo-login" data-email="inhaber@schuhwerk.at" data-passwort="inhaber123">Einloggen</button></li>
          <li><div><code>anna@beispiel.at</code> / <code>anna123</code></div><span>Stammkundin mit 10 % Treuerabatt und einer Vorbestellung</span><button type="button" class="knopf klein zweit" data-aktion="demo-login" data-email="anna@beispiel.at" data-passwort="anna123">Einloggen</button></li>
          <li><div><code>max@beispiel.at</code> / <code>max123</code></div><span>War 2 Monate nicht da und hat einen 15-%-Gutschein bekommen</span><button type="button" class="knopf klein zweit" data-aktion="demo-login" data-email="max@beispiel.at" data-passwort="max123">Einloggen</button></li>
        </ul>
      </section>
    </div>`;
}

async function nachAnmeldung(daten) {
  zustand.ich = daten;
  aktualisiereKopf();
  await ladeSchuhe(); // Preise mit Treuerabatt neu laden
  bereinigeWarenkorb();

  if (daten.benutzer.rolle === "inhaber") {
    location.hash = "#/inhaber";
    if (daten.hinweise && daten.hinweise.length) {
      zeigeToast(`<span>Achtung: ${daten.hinweise.length} ${daten.hinweise.length === 1 ? "Modell ist" : "Modelle sind"} knapp oder ausverkauft.</span>`, 7000);
    }
    return;
  }

  const ziel = zustand.nachLogin || "#/konto";
  zustand.nachLogin = null;
  location.hash = ziel;
  const treue = daten.treue.prozent ? ` Dein Treuerabatt: ${daten.treue.prozent} %.` : "";
  const gutschein = daten.gutscheine.length ? ` Du hast ${daten.gutscheine.length === 1 ? "einen Gutschein" : `${daten.gutscheine.length} Gutscheine`} im Konto.` : "";
  zeigeToast(`<span>Hallo ${esc(daten.benutzer.name.split(" ")[0])}!${treue}${gutschein}</span>`, 6000);
}

async function anmelden(email, passwort, fehlerFeld) {
  const antwort = await api("/api/login", { methode: "POST", daten: { email, passwort } });
  if (!antwort.ok) {
    if (fehlerFeld) fehlerFeld.textContent = antwort.daten.fehler;
    return;
  }
  await nachAnmeldung(antwort.daten);
}

async function registrieren(form) {
  const antwort = await api("/api/registrieren", {
    methode: "POST",
    daten: { name: form.querySelector("#r-name").value, email: form.querySelector("#r-email").value, passwort: form.querySelector("#r-passwort").value },
  });
  if (!antwort.ok) {
    document.getElementById("registrieren-fehler").textContent = antwort.daten.fehler;
    return;
  }
  await nachAnmeldung(antwort.daten);
}

async function abmelden() {
  await api("/api/logout", { methode: "POST" });
  zustand.ich = { angemeldet: false };
  zustand.gutschein = null;
  aktualisiereKopf();
  await ladeSchuhe();
  location.hash = "#/";
  zeigeToast("<span>Du bist abgemeldet.</span>");
}

// ===================== Seite: Konto =====================

function zeigeKonto() {
  document.title = `Mein Konto | ${SHOPNAME}`;
  const ich = zustand.ich;
  if (!ich.angemeldet) {
    zustand.nachLogin = "#/konto";
    location.hash = "#/login";
    return;
  }

  const t = ich.treue;
  const maxStufe = t.stufen[t.stufen.length - 1].ab;
  const fortschritt = Math.min(100, (t.paare / maxStufe) * 100);
  const naechste = t.naechste_stufe
    ? `Noch ${t.naechste_stufe.ab - t.paare} Paar bis ${t.naechste_stufe.prozent} % Treuerabatt.`
    : "Du hast die höchste Stufe erreicht.";

  const gutscheine = ich.gutscheine.length
    ? ich.gutscheine.map((g) => `<div class="gutschein"><div><code>${esc(g.code)}</code><div class="hinweis" style="font-size:.88rem">${g.prozent} % auf deine nächste Bestellung</div></div><a class="knopf klein" href="#/warenkorb">Einlösen</a></div>`).join("")
    : `<p class="hinweis">Aktuell hast du keine offenen Gutscheine.</p>`;

  const vorbestellungen = ich.vorbestellungen.length
    ? `<div class="tabelle-rahmen"><table class="tabelle">
        <thead><tr><th>Modell</th><th>Erscheint</th><th class="zahl">Preis</th><th>Status</th><th></th></tr></thead>
        <tbody>${ich.vorbestellungen.map((v) => `
          <tr>
            <td><a href="#/produkt/${v.schuh_id}">${esc(v.name)}</a><div class="klein">${esc(v.farbe)}, Größe ${v.groesse}, vorbestellt am ${kurzDatum(v.datum)}</div></td>
            <td>${v.release_datum ? datum(v.release_datum) : ""}</td>
            <td class="zahl">${preis(v.preis)}</td>
            <td><span class="status ${v.status}">${v.status === "aktiv" ? "Aktiv" : "Storniert"}</span></td>
            <td class="zahl">${v.status === "aktiv" ? `<button type="button" class="textknopf" data-aktion="stornieren" data-id="${esc(v.id)}">Stornieren</button>` : ""}</td>
          </tr>`).join("")}</tbody></table></div>`
    : `<p class="hinweis">Noch keine Vorbestellungen. <a href="#/shop?verfuegbarkeit=vorbestellbar">Kommende Modelle ansehen</a></p>`;

  const bestellungen = ich.bestellungen.length
    ? `<div class="tabelle-rahmen"><table class="tabelle">
        <thead><tr><th>Bestellung</th><th>Datum</th><th>Artikel</th><th class="zahl">Gesamt</th></tr></thead>
        <tbody>${ich.bestellungen.map((b) => `
          <tr>
            <td><strong>${esc(b.bestellnummer)}</strong></td>
            <td>${kurzDatum(b.datum)}</td>
            <td>${b.positionen.map((p) => `${p.menge} × ${esc(p.name)}`).join("<br>")}<div class="klein">${b.treuerabatt_prozent ? `Treuerabatt ${b.treuerabatt_prozent} %` : ""}${b.gutschein ? `${b.treuerabatt_prozent ? ", " : ""}Gutschein ${esc(b.gutschein)}` : ""}</div></td>
            <td class="zahl">${preis(b.gesamt)}</td>
          </tr>`).join("")}</tbody></table></div>`
    : `<p class="hinweis">Noch keine Bestellungen.</p>`;

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf dash-kopf">
        <div><h1>Hallo ${esc(ich.benutzer.name.split(" ")[0])}</h1><p>${esc(ich.benutzer.email)}</p></div>
        <button type="button" class="knopf zweit" data-aktion="abmelden">Abmelden</button>
      </div>

      <div class="konto-raster">
        <section class="karte" aria-labelledby="treue-titel">
          <h2 id="treue-titel">Dein Treuerabatt</h2>
          <p class="treue-zahl">${t.prozent} %</p>
          <p style="margin:0">${t.gekauft} gekaufte und ${t.vorbestellt} vorbestellte Paare, zusammen ${t.paare}. ${naechste}</p>
          <div class="treue-balken" aria-hidden="true"><span style="width:${fortschritt}%"></span></div>
          <div class="treue-stufen">${t.stufen.map((s) => `<span>ab ${s.ab} Paar: ${s.prozent} %</span>`).join("")}</div>
        </section>
        <section class="karte" aria-labelledby="gutschein-titel">
          <h2 id="gutschein-titel">Deine Gutscheine</h2>
          ${gutscheine}
        </section>
      </div>

      <section class="konto-abschnitt"><h2>Vorbestellungen</h2>${vorbestellungen}</section>
      <section class="konto-abschnitt"><h2>Bestellungen</h2>${bestellungen}</section>
    </div>`;
}

async function storniere(id) {
  const vorher = zustand.ich.vorbestellungen.find((v) => v.id === id);
  const schuhVorher = vorher && findeSchuh(vorher.schuh_id);
  const warAufschlag = schuhVorher ? schuhVorher.nachfrage_aufschlag : false;
  const treueVorher = zustand.ich.treue.prozent;

  const antwort = await api(`/api/vorbestellung/${encodeURIComponent(id)}/stornieren`, { methode: "POST" });
  if (!antwort.ok) {
    zeigeToast(`<span>${esc(antwort.daten.fehler)}</span>`);
    return;
  }

  await Promise.all([ladeSchuhe(), ladeIch()]);
  zeigeKonto();

  const nachher = schuhVorher && findeSchuh(schuhVorher.schuh_id);
  let text = `${esc(antwort.daten.name)} wurde storniert.`;
  if (warAufschlag && nachher && !nachher.nachfrage_aufschlag) text += " Das Modell hat jetzt nicht mehr über 100 Vorbestellungen, der Preis ist wieder normal.";
  if (zustand.ich.treue.prozent !== treueVorher) text += ` Dein Treuerabatt beträgt jetzt ${zustand.ich.treue.prozent} %.`;
  zeigeToast(`<span>${text}</span>`, 8000);
}

// ===================== Seite: Nicht gefunden =====================

function zeigeNichtGefunden(text = "Diese Seite gibt es nicht.") {
  document.title = `Nicht gefunden | ${SHOPNAME}`;
  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf"><h1>Nicht gefunden</h1><p>${esc(text)}</p></div>
      <a class="knopf" href="#/shop?sort=neu" style="margin-bottom:4rem">Zum Shop</a>
    </div>`;
}

// ===================== Navigation (Router) =====================

function aktuelleRoute() {
  const [pfad, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [seite, param] = pfad.split("/");
  return { seite: seite || "start", param: param ? decodeURIComponent(param) : undefined, query: new URLSearchParams(query) };
}

function markiereNavigation({ seite, query }) {
  let aktiv = null;
  if (seite === "shop") {
    if (query.get("kategorie")) aktiv = `kat-${query.get("kategorie")}`;
    else if (query.get("angebote")) aktiv = "angebote";
    else if (query.get("verfuegbarkeit") === "vorbestellbar") aktiv = "demnaechst";
    else if ([...query.keys()].length) aktiv = "shop-alle";
  }
  if (seite === "finder") aktiv = "finder";
  if (seite === "warenkorb" || seite === "kasse") aktiv = "warenkorb";
  if (seite === "konto" || seite === "login") aktiv = "konto";
  if (seite === "inhaber") aktiv = "inhaber";

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === aktiv) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function zeigeSeite() {
  const route = aktuelleRoute();
  versteckeToast();
  schliesseDialog();
  markiereNavigation(route);

  const seiten = {
    start: () => zeigeStart(),
    shop: () => zeigeShop(route.query),
    produkt: () => {
      zustand.produkt = null; // neue Auswahl bei jedem Aufruf der Produktseite
      zeigeProdukt(route.param);
    },
    finder: () => zeigeFinder(),
    warenkorb: () => zeigeWarenkorb(),
    kasse: () => zeigeKasse(),
    bestellt: () => zeigeBestaetigung(route.param),
    login: () => zeigeLogin(),
    konto: () => zeigeKonto(),
    inhaber: () => zeigeInhaber(),
  };

  (seiten[route.seite] || (() => zeigeNichtGefunden()))();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

// ===================== Ereignisse =====================

document.addEventListener("click", (event) => {
  const ziel = event.target.closest("[data-aktion]");
  if (!ziel) return;
  const aktion = ziel.dataset.aktion;
  const d = ziel.dataset;

  const aktionen = {
    "farbe-waehlen": () => waehleFarbe(d.farbe),
    "groesse-waehlen": () => waehleGroesse(Number(d.groesse)),
    menge: () => aendereMenge(Number(d.delta)),
    "in-warenkorb": () => produktInWarenkorb(),
    vorbestellen: () => vorbestellen(),
    "zum-login": () => {
      zustand.nachLogin = location.hash;
      location.hash = "#/login";
    },
    "bild-gross": () => zeigeBildGross(),
    "dialog-schliessen": () => schliesseDialog(),
    "korb-menge": () => aendereKorbMenge(Number(d.index), Number(d.delta)),
    "korb-entfernen": () => entferneAusKorb(Number(d.index)),
    "filter-zuruecksetzen": () => {
      zustand.shopFilter = standardFilter();
      zeigeShop(new URLSearchParams());
    },
    "filter-entfernen": () => entferneFilter(d.art, d.wert),
    "gutschein-einloesen": () => loeseGutscheinEin(document.getElementById("k-gutschein").value),
    "gutschein-nutzen": () => loeseGutscheinEin(d.code),
    "gutschein-entfernen": () => {
      merkeKassenEingaben();
      zustand.gutschein = null;
      zeigeKasse();
      stelleKassenEingabenWiederHer();
    },
    "login-von-kasse": () => {
      zustand.nachLogin = "#/kasse";
    },
    "demo-login": () => anmelden(d.email, d.passwort, document.getElementById("login-fehler")),
    abmelden: () => abmelden(),
    stornieren: () => storniere(d.id),
  };

  if (aktionen[aktion]) aktionen[aktion]();
  else if (typeof inhaberAktion === "function") inhaberAktion(aktion, ziel);
});

app.addEventListener("input", (event) => {
  const ziel = event.target;
  const f = zustand.shopFilter;

  if (ziel.id === "budget") {
    document.getElementById("budget-wert").textContent = `bis ${ziel.value} €`;
    return;
  }
  if (!f) return;
  if (ziel.id === "f-suche") f.suche = ziel.value;
  else if (ziel.id === "f-preis") f.maxPreis = Number(ziel.value);
  else return;
  aktualisiereShopListe();
});

app.addEventListener("change", (event) => {
  const ziel = event.target;
  const f = zustand.shopFilter;
  if (!f) return;
  const ausgewaehlt = (name) => [...app.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

  if (ziel.name === "f-kategorie") f.kategorien = ausgewaehlt("f-kategorie");
  else if (ziel.name === "f-farbe") f.farben = ausgewaehlt("f-farbe");
  else if (ziel.name === "f-verfuegbar") f.verfuegbarkeit = ausgewaehlt("f-verfuegbar");
  else if (ziel.id === "f-angebote") f.nurAngebote = ziel.checked;
  else if (ziel.id === "f-sortierung") f.sortierung = ziel.value;
  else return;
  aktualisiereShopListe();
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  const formulare = {
    "finder-form": () => sucheEmpfehlung(form),
    "kasse-form": () => sendeBestellung(form),
    "login-form": () => anmelden(form.querySelector("#l-email").value, form.querySelector("#l-passwort").value, document.getElementById("login-fehler")),
    "registrieren-form": () => registrieren(form),
    "kopf-suche": () => {
      const begriff = document.getElementById("kopf-suche-feld").value.trim();
      location.hash = `#/shop?${new URLSearchParams(begriff ? { suche: begriff } : { sort: "neu" })}`;
      if (location.hash.startsWith("#/shop")) zeigeSeite();
    },
  };
  if (formulare[form.id]) {
    event.preventDefault();
    formulare[form.id]();
  } else if (typeof inhaberFormular === "function" && inhaberFormular(form)) {
    event.preventDefault();
  }
});

window.addEventListener("hashchange", zeigeSeite);

// ===================== Start =====================

async function starte() {
  if (location.protocol === "file:") {
    app.innerHTML = `<div class="wrap" style="padding:3rem 0">${meldung(`Die Seite muss über den Server geöffnet werden. ${SERVER_HINWEIS}`, "fehler")}</div>`;
    return;
  }

  const [ok] = await Promise.all([ladeSchuhe(), ladeIch()]);
  if (!ok) {
    app.innerHTML = `<div class="wrap" style="padding:3rem 0">${meldung(`Die Modelle konnten nicht geladen werden. ${SERVER_HINWEIS}`, "fehler")}</div>`;
    return;
  }

  const entfernt = bereinigeWarenkorb();
  zeigeSeite();
  if (entfernt > 0) zeigeToast(`<span>${entfernt === 1 ? "Ein Artikel wurde" : `${entfernt} Artikel wurden`} aus dem Warenkorb entfernt, weil ${entfernt === 1 ? "er" : "sie"} nicht mehr lieferbar ${entfernt === 1 ? "ist" : "sind"}.</span>`, 7000);
}

aktualisiereKopf();
starte();
