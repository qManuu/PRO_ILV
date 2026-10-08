/**
 * Frontend des Schuhshops.
 * Eine Seite mit mehreren Ansichten (Start, Shop, Produkt, Schuh-Finder, Warenkorb, Kasse).
 * Die Daten kommen über die API von server.js, der Warenkorb wird im Browser gespeichert.
 */

// ===================== Einstellungen =====================

const FARBWERTE = {
  Schwarz: "#1E1F22",
  "Weiß": "#FAFAFA",
  Grau: "#9AA0A8",
  Blau: "#2F5DBA",
  "Grün": "#3B7D48",
  Beige: "#D9C8A5",
  Rot: "#C7352C",
  Braun: "#6E4B30",
  Gelb: "#F0C02F",
  "Türkis": "#25AFAE",
  Silber: "#C3C8CF",
};

const GROESSEN = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
const MAX_MENGE = 10;
const VERSANDKOSTEN_CENT = 490;
const VERSANDKOSTENFREI_AB_CENT = 5000;
const KORB_SCHLUESSEL = "schuhshop-warenkorb";

const preisFormat = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });

const app = document.getElementById("app");

let schuhe = [];
let warenkorb = ladeWarenkorb();
let shopFilter = null;
let produktAuswahl = null;
let letzteBestellung = null;
let neuheitAb = 0;
let preisGrenzen = { min: 0, max: 0 };

// ===================== Hilfsfunktionen =====================

function farbe(name) {
  return FARBWERTE[name] || "#B8BDC5";
}

function istDunkel(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function esc(text) {
  return String(text)
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

function istNeu(schuh) {
  return schuh.release_jahr >= neuheitAb;
}

function aufzaehlung(liste) {
  if (liste.length <= 1) return liste.join("");
  return `${liste.slice(0, -1).join(", ")} und ${liste[liste.length - 1]}`;
}

function findeSchuh(id) {
  return schuhe.find((schuh) => schuh.schuh_id === Number(id));
}

/**
 * Zeichnet einen einfachen Schuh als SVG in den Farben des Modells.
 * Mit hauptfarbe wird diese Farbe für das Obermaterial verwendet.
 */
function schuhSvg(schuh, hauptfarbe) {
  const reihenfolge = hauptfarbe
    ? [hauptfarbe, ...schuh.farben.filter((f) => f !== hauptfarbe)]
    : schuh.farben;

  const obermaterial = farbe(reihenfolge[0]);
  const akzent = farbe(reihenfolge[1] || reihenfolge[0]);
  const sohle = reihenfolge[2] ? farbe(reihenfolge[2]) : "#F1F1EE";
  const schnuerung = istDunkel(obermaterial) ? "#F1F1EE" : "#2A2C31";
  const hoch = /boot|mid/i.test(schuh.name);

  const schaft = hoch
    ? "M16 72 L20 14 Q21 8 28 8 L60 8 Q67 8 67 15 L70 40 Q82 45 100 49 L128 53 Q162 57 182 62 Q194 66 194 72 Z"
    : "M16 72 L20 30 Q22 22 30 22 L62 24 Q72 25 78 36 L104 48 Q150 53 180 59 Q194 63 194 72 Z";
  const ferse = hoch ? "M16 72 L19 36 Q32 36 40 46 L44 72 Z" : "M16 72 L18 42 Q30 42 38 50 L42 72 Z";
  const kappe = "M150 56 Q178 59 189 64 Q194 68 194 72 L150 72 Z";
  const schnuere = hoch
    ? [[60, 16, 72, 16], [61, 24, 73, 24], [62, 32, 74, 32], [64, 40, 76, 41]]
    : [[78, 40, 86, 34], [87, 44, 95, 38], [96, 48, 104, 42]];

  const linien = schnuere
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`)
    .join("");

  const beschriftung = `${schuh.name} in ${hauptfarbe || aufzaehlung(schuh.farben)}`;

  return `
    <svg viewBox="0 0 210 92" role="img" aria-label="${esc(beschriftung)}">
      <g stroke="rgba(0,0,0,0.28)" stroke-width="1.2" stroke-linejoin="round">
        <path d="${schaft}" fill="${obermaterial}" />
        <path d="${ferse}" fill="${akzent}" />
        <path d="${kappe}" fill="${akzent}" />
        <path d="M10 72 H196 Q201 72 201 77 V80 Q201 86 195 86 H16 Q10 86 10 80 Z" fill="${sohle}" />
      </g>
      <g stroke="${schnuerung}" stroke-width="2.4" stroke-linecap="round">${linien}</g>
    </svg>`;
}

function produktKarte(schuh) {
  const punkte = schuh.farben
    .map((name) => `<span class="farbpunkt" style="--c:${farbe(name)}"></span>`)
    .join("");
  const farbText = schuh.farben.length === 1 ? "1 Farbe" : `${schuh.farben.length} Farben`;

  return `
    <a class="produkt-karte" href="#/produkt/${schuh.schuh_id}">
      ${istNeu(schuh) ? '<span class="etikett">Neu</span>' : ""}
      <div class="schuh-bild">${schuhSvg(schuh)}</div>
      <div class="karte-text">
        <h3>${esc(schuh.name)}</h3>
        <div class="farbreihe" aria-label="Farben: ${esc(aufzaehlung(schuh.farben))}">
          ${punkte}<span class="farbreihe-text" aria-hidden="true">${farbText}</span>
        </div>
        <p class="preis">${preis(schuh.preis)}</p>
      </div>
    </a>`;
}

function meldung(html, istFehler = false) {
  return `<div class="meldung${istFehler ? " fehler" : ""}">${html}</div>`;
}

const SERVER_HINWEIS =
  "Starte den Server im Terminal mit <code>node server.js</code> und öffne dann <code>http://localhost:3000</code>.";

// ===================== Warenkorb =====================

function ladeWarenkorb() {
  try {
    const roh = localStorage.getItem(KORB_SCHLUESSEL);
    const daten = roh ? JSON.parse(roh) : [];
    return Array.isArray(daten) ? daten : [];
  } catch {
    return [];
  }
}

function speichereWarenkorb() {
  try {
    localStorage.setItem(KORB_SCHLUESSEL, JSON.stringify(warenkorb));
  } catch {
    // Speichern nicht möglich, der Warenkorb bleibt trotzdem bis zum Neuladen erhalten
  }
  aktualisiereZaehler();
}

function bereinigeWarenkorb() {
  warenkorb = warenkorb.filter((position) => {
    const schuh = findeSchuh(position.schuh_id);
    return (
      schuh &&
      schuh.farben.includes(position.farbe) &&
      GROESSEN.includes(position.groesse) &&
      Number.isInteger(position.menge) &&
      position.menge >= 1
    );
  });
  speichereWarenkorb();
}

function legeInWarenkorb(schuh, farbeName, groesse, menge) {
  const vorhanden = warenkorb.find(
    (p) => p.schuh_id === schuh.schuh_id && p.farbe === farbeName && p.groesse === groesse
  );
  if (vorhanden) {
    vorhanden.menge = Math.min(MAX_MENGE, vorhanden.menge + menge);
  } else {
    warenkorb.push({ schuh_id: schuh.schuh_id, farbe: farbeName, groesse, menge });
  }
  speichereWarenkorb();
}

function korbSummen() {
  const anzahl = warenkorb.reduce((summe, p) => summe + p.menge, 0);
  const summeCent = warenkorb.reduce((summe, p) => summe + zuCent(findeSchuh(p.schuh_id).preis) * p.menge, 0);
  const versandCent = summeCent === 0 || summeCent >= VERSANDKOSTENFREI_AB_CENT ? 0 : VERSANDKOSTEN_CENT;
  return {
    anzahl,
    summe: summeCent / 100,
    versand: versandCent / 100,
    gesamt: (summeCent + versandCent) / 100,
    bisVersandfrei: Math.max(0, VERSANDKOSTENFREI_AB_CENT - summeCent) / 100,
  };
}

function aktualisiereZaehler() {
  const zaehler = document.getElementById("warenkorb-anzahl");
  const anzahl = warenkorb.reduce((summe, p) => summe + p.menge, 0);
  zaehler.textContent = anzahl;
  zaehler.classList.toggle("voll", anzahl > 0);
}

function zusammenfassungHtml({ mitKnopf }) {
  const s = korbSummen();
  const paar = s.anzahl === 1 ? "1 Paar" : `${s.anzahl} Paar`;
  return `
    <dl>
      <dt>Zwischensumme (${paar})</dt><dd>${preis(s.summe)}</dd>
      <dt>Versand</dt><dd>${s.versand === 0 ? "kostenlos" : preis(s.versand)}</dd>
      <dt class="gesamt">Gesamt</dt><dd class="gesamt">${preis(s.gesamt)}</dd>
    </dl>
    ${s.bisVersandfrei > 0 ? `<p class="versand-hinweis">Noch ${preis(s.bisVersandfrei)} bis zum kostenlosen Versand.</p>` : ""}
    ${mitKnopf ? '<a class="knopf gross" href="#/kasse">Zur Kasse</a>' : ""}`;
}

// ===================== Toast =====================

let toastTimer;

function zeigeToast(html) {
  const toast = document.getElementById("toast");
  toast.innerHTML = html;
  toast.classList.add("sichtbar");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(versteckeToast, 4500);
}

function versteckeToast() {
  document.getElementById("toast").classList.remove("sichtbar");
}

// ===================== Seite: Start =====================

function zeigeStart() {
  document.title = "Schuhshop";

  const neueste = [...schuhe].sort((a, b) => b.release_jahr - a.release_jahr || a.preis - b.preis);
  const highlight = neueste[0];
  const guenstig = schuhe.filter((s) => s.preis < 60).sort((a, b) => a.preis - b.preis);
  const anzahlFarben = new Set(schuhe.flatMap((s) => s.farben)).size;

  app.innerHTML = `
    <section class="held">
      <div>
        <h1>Schuhe für jeden Weg.</h1>
        <p>Vom Trail bis zur Stadt: ${schuhe.length} Modelle in ${anzahlFarben} Farben, ab ${preis(preisGrenzen.minPreis)}.</p>
        <div class="held-aktionen">
          <a class="knopf gross" href="#/shop">Alle Schuhe ansehen</a>
          <a class="knopf zweit gross" href="#/finder">Schuh-Finder starten</a>
        </div>
      </div>
      <a class="held-buehne" href="#/produkt/${highlight.schuh_id}">
        <div class="schuh-bild">${schuhSvg(highlight)}</div>
        <div class="held-buehne-text">
          <strong>Neu: ${esc(highlight.name)}</strong>
          <span>${preis(highlight.preis)}</span>
        </div>
      </a>
    </section>

    <section class="abschnitt">
      <div class="abschnitt-kopf">
        <h2>Neuheiten</h2>
        <a class="mehr-link" href="#/shop?neu=1">Alle Neuheiten</a>
      </div>
      <div class="raster">${neueste.slice(0, 4).map(produktKarte).join("")}</div>
    </section>

    <section class="finder-band" aria-labelledby="band-titel">
      <div>
        <h2 id="band-titel">Nicht sicher, welcher passt?</h2>
        <p>Der Schuh-Finder schlägt dir passende Modelle vor. Du wählst nur deine Lieblingsfarben und dein Budget.</p>
      </div>
      <a class="knopf gross" href="#/finder">Schuh-Finder starten</a>
    </section>

    <section class="abschnitt">
      <div class="abschnitt-kopf">
        <h2>Unter 60 €</h2>
        <a class="mehr-link" href="#/shop?maxpreis=60">Alle ansehen</a>
      </div>
      <div class="raster">${guenstig.slice(0, 4).map(produktKarte).join("")}</div>
    </section>`;
}

// ===================== Seite: Shop =====================

function standardFilter() {
  return { suche: "", farben: [], maxPreis: preisGrenzen.max, nurNeu: false, sortierung: "neu" };
}

function zeigeShop(query) {
  document.title = "Alle Schuhe | Schuhshop";

  if (!shopFilter || query.toString() !== "") {
    shopFilter = standardFilter();
    if (query.get("neu") === "1") shopFilter.nurNeu = true;
    if (query.get("maxpreis")) shopFilter.maxPreis = Number(query.get("maxpreis")) || preisGrenzen.max;
  }

  const f = shopFilter;
  const alleFarben = [...new Set(schuhe.flatMap((s) => s.farben))].sort((a, b) => a.localeCompare(b, "de"));

  const farbFelder = alleFarben
    .map(
      (name) => `
      <label class="check">
        <input type="checkbox" name="filter-farbe" value="${esc(name)}" ${f.farben.includes(name) ? "checked" : ""}>
        <span class="farbpunkt" style="--c:${farbe(name)}"></span>${esc(name)}
      </label>`
    )
    .join("");

  const sortierungen = [
    ["neu", "Neueste zuerst"],
    ["preis-auf", "Preis aufsteigend"],
    ["preis-ab", "Preis absteigend"],
    ["name", "Name A bis Z"],
  ]
    .map(([wert, text]) => `<option value="${wert}" ${f.sortierung === wert ? "selected" : ""}>${text}</option>`)
    .join("");

  app.innerHTML = `
    <h1 class="seitentitel">Alle Schuhe</h1>
    <p class="unterzeile">Stöbere durch das ganze Sortiment und filtere nach Farbe, Preis und Neuheit.</p>

    <div class="shop-layout">
      <aside class="filter" aria-label="Filter">
        <div>
          <label class="filter-titel" for="suche">Suche</label>
          <input id="suche" type="search" placeholder="Modellname, z. B. Runner" value="${esc(f.suche)}">
        </div>

        <fieldset class="filter-farben-feld">
          <legend>Farbe</legend>
          <div class="filter-farben">${farbFelder}</div>
        </fieldset>

        <div>
          <label class="filter-titel" for="max-preis">Preis</label>
          <input id="max-preis" type="range" min="${preisGrenzen.min}" max="${preisGrenzen.max}" step="5" value="${f.maxPreis}">
          <div class="preis-wert"><span>ab ${preis(preisGrenzen.min)}</span><strong id="max-preis-wert">bis ${preis(f.maxPreis)}</strong></div>
        </div>

        <fieldset>
          <legend>Neuheit</legend>
          <label class="check">
            <input type="checkbox" id="nur-neu" ${f.nurNeu ? "checked" : ""}>
            Nur Neuheiten ab ${neuheitAb}
          </label>
        </fieldset>

        <div><button type="button" class="textknopf" data-action="filter-zuruecksetzen">Filter zurücksetzen</button></div>
      </aside>

      <div>
        <div class="shop-leiste">
          <p class="treffer" id="treffer" aria-live="polite"></p>
          <label class="sortierung">Sortieren nach <select id="sortierung">${sortierungen}</select></label>
        </div>
        <div class="raster" id="shop-raster"></div>
      </div>
    </div>`;

  aktualisiereShopListe();
}

function gefilterteSchuhe() {
  const f = shopFilter;
  const suche = f.suche.trim().toLowerCase();

  const liste = schuhe.filter((schuh) => {
    if (suche && !schuh.name.toLowerCase().includes(suche) && !String(schuh.schuh_id).includes(suche)) return false;
    if (f.farben.length > 0 && !schuh.farben.some((name) => f.farben.includes(name))) return false;
    if (schuh.preis > f.maxPreis) return false;
    if (f.nurNeu && !istNeu(schuh)) return false;
    return true;
  });

  const sortierer = {
    neu: (a, b) => b.release_jahr - a.release_jahr || a.preis - b.preis,
    "preis-auf": (a, b) => a.preis - b.preis,
    "preis-ab": (a, b) => b.preis - a.preis,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };

  return liste.sort(sortierer[f.sortierung] || sortierer.neu);
}

function aktualisiereShopListe() {
  const liste = gefilterteSchuhe();
  const raster = document.getElementById("shop-raster");

  document.getElementById("treffer").textContent = liste.length === 1 ? "1 Modell" : `${liste.length} Modelle`;
  document.getElementById("max-preis-wert").textContent = `bis ${preis(shopFilter.maxPreis)}`;

  raster.innerHTML =
    liste.length > 0
      ? liste.map(produktKarte).join("")
      : `<div class="leer">
           <p>Kein Modell passt zu deinen Filtern.</p>
           <button type="button" class="knopf zweit" data-action="filter-zuruecksetzen">Filter zurücksetzen</button>
         </div>`;
}

// ===================== Seite: Produkt =====================

function zeigeProdukt(id) {
  const schuh = findeSchuh(id);
  if (!schuh) return zeigeNichtGefunden("Diesen Schuh gibt es nicht (mehr).");

  document.title = `${schuh.name} | Schuhshop`;
  produktAuswahl = { schuh, farbe: schuh.farben[0], groesse: null, menge: 1 };

  const alter =
    istNeu(schuh)
      ? "gehört zu unseren neuesten Modellen"
      : schuh.release_jahr < 2000
        ? `ist ein Klassiker aus dem Jahr ${schuh.release_jahr}`
        : `ist seit ${schuh.release_jahr} im Sortiment`;

  const farbKnoepfe = schuh.farben
    .map(
      (name, i) => `
      <button type="button" data-action="farbe-waehlen" data-farbe="${esc(name)}"
              aria-pressed="${i === 0}" aria-label="${esc(name)}" title="${esc(name)}">
        <span class="farbpunkt" style="--c:${farbe(name)}"></span>
      </button>`
    )
    .join("");

  const groessenKnoepfe = GROESSEN.map(
    (g) => `<button type="button" data-action="groesse-waehlen" data-groesse="${g}" aria-pressed="false">${g}</button>`
  ).join("");

  app.innerHTML = `
    <nav class="brotkrumen" aria-label="Brotkrumen">
      <a href="#/">Start</a> / <a href="#/shop">Shop</a> / <span aria-current="page">${esc(schuh.name)}</span>
    </nav>

    <div class="produkt">
      <div class="produkt-buehne">
        ${istNeu(schuh) ? '<span class="etikett">Neu</span>' : ""}
        <div class="schuh-bild" id="produkt-bild">${schuhSvg(schuh, produktAuswahl.farbe)}</div>
      </div>

      <div>
        <h1>${esc(schuh.name)}</h1>
        <p class="produkt-meta">Art.-Nr. ${schuh.schuh_id}, erschienen ${schuh.release_jahr}</p>
        <p class="preis">${preis(schuh.preis)}</p>
        <p class="versand-info">${
          zuCent(schuh.preis) >= VERSANDKOSTENFREI_AB_CENT
            ? "Versandkostenfrei"
            : "Zzgl. 4,90 € Versand, versandkostenfrei ab 50 €"
        }</p>

        <fieldset class="auswahl">
          <legend>Farbe: <span id="farbe-name">${esc(produktAuswahl.farbe)}</span></legend>
          <div class="farbwahl">${farbKnoepfe}</div>
        </fieldset>

        <fieldset class="auswahl">
          <legend>Größe (EU)</legend>
          <div class="groessen">${groessenKnoepfe}</div>
          <p class="feldfehler" id="groesse-fehler" aria-live="polite"></p>
        </fieldset>

        <div class="kauf-zeile">
          <div class="mengenwahl" role="group" aria-label="Menge">
            <button type="button" data-action="menge" data-delta="-1" aria-label="Menge verringern" disabled>−</button>
            <output id="menge" aria-live="polite">1</output>
            <button type="button" data-action="menge" data-delta="1" aria-label="Menge erhöhen">+</button>
          </div>
          <button type="button" class="knopf gross" data-action="in-warenkorb">In den Warenkorb</button>
        </div>

        <div class="produkt-beschreibung">
          <p>Der ${esc(schuh.name)} ${alter} und ist in ${esc(aufzaehlung(schuh.farben))} erhältlich.</p>
          <dl>
            <dt>Farben</dt><dd>${esc(schuh.farben.join(", "))}</dd>
            <dt>Größen</dt><dd>EU ${GROESSEN[0]} bis ${GROESSEN[GROESSEN.length - 1]}</dd>
            <dt>Erschienen</dt><dd>${schuh.release_jahr}</dd>
          </dl>
        </div>
      </div>
    </div>

    <section class="abschnitt" id="passend" hidden>
      <div class="abschnitt-kopf"><h2>Passt auch zu dir</h2></div>
      <p class="unterzeile" id="passend-info"></p>
      <div class="raster" id="passend-raster"></div>
    </section>`;

  ladePassendeSchuhe(schuh);
}

/** Nutzt den Empfehlungs-Algorithmus für ähnliche Modelle. */
async function ladePassendeSchuhe(schuh) {
  const budget = Math.ceil(schuh.preis * 1.25);
  const parameter = new URLSearchParams({ farben: schuh.farben.join(","), budget, anzahl: 4 });

  try {
    const antwort = await fetch(`/api/empfehlung?${parameter}`);
    if (!antwort.ok) return;
    const vorschlaege = (await antwort.json()).filter((s) => s.schuh_id !== schuh.schuh_id).slice(0, 3);

    const abschnitt = document.getElementById("passend");
    if (!abschnitt || vorschlaege.length === 0 || produktAuswahl.schuh !== schuh) return;

    document.getElementById("passend-info").textContent =
      `Vom Schuh-Finder ausgewählt: Modelle in ähnlichen Farben bis ${preis(budget)}.`;
    document.getElementById("passend-raster").innerHTML = vorschlaege
      .map((v) => produktKarte(findeSchuh(v.schuh_id)))
      .join("");
    abschnitt.hidden = false;
  } catch {
    // Ohne Vorschläge bleibt der Abschnitt einfach ausgeblendet
  }
}

function waehleFarbe(name) {
  produktAuswahl.farbe = name;
  document.querySelectorAll('[data-action="farbe-waehlen"]').forEach((knopf) => {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.farbe === name));
  });
  document.getElementById("farbe-name").textContent = name;
  document.getElementById("produkt-bild").innerHTML = schuhSvg(produktAuswahl.schuh, name);
}

function waehleGroesse(groesse) {
  produktAuswahl.groesse = groesse;
  document.querySelectorAll('[data-action="groesse-waehlen"]').forEach((knopf) => {
    knopf.setAttribute("aria-pressed", String(Number(knopf.dataset.groesse) === groesse));
  });
  document.getElementById("groesse-fehler").textContent = "";
}

function aendereMenge(delta) {
  produktAuswahl.menge = Math.min(MAX_MENGE, Math.max(1, produktAuswahl.menge + delta));
  document.getElementById("menge").textContent = produktAuswahl.menge;
  document.querySelector('[data-action="menge"][data-delta="-1"]').disabled = produktAuswahl.menge <= 1;
  document.querySelector('[data-action="menge"][data-delta="1"]').disabled = produktAuswahl.menge >= MAX_MENGE;
}

function produktInWarenkorb() {
  const { schuh, farbe: farbeName, groesse, menge } = produktAuswahl;

  if (!groesse) {
    document.getElementById("groesse-fehler").textContent = "Bitte wähle eine Größe.";
    document.querySelector('[data-action="groesse-waehlen"]').focus();
    return;
  }

  legeInWarenkorb(schuh, farbeName, groesse, menge);
  const paar = menge === 1 ? "" : `${menge} × `;
  zeigeToast(
    `<span>${paar}${esc(schuh.name)} (${esc(farbeName)}, Gr. ${groesse}) liegt im Warenkorb.</span>
     <a href="#/warenkorb">Zum Warenkorb</a>`
  );
}

// ===================== Seite: Schuh-Finder =====================

function zeigeFinder() {
  document.title = "Schuh-Finder | Schuhshop";

  const alleFarben = [...new Set(schuhe.flatMap((s) => s.farben))].sort((a, b) => a.localeCompare(b, "de"));
  const chips = alleFarben
    .map(
      (name) => `
      <label class="farb-chip">
        <input type="checkbox" name="finder-farbe" value="${esc(name)}">
        <span class="farbpunkt" style="--c:${farbe(name)}"></span>${esc(name)}
      </label>`
    )
    .join("");

  app.innerHTML = `
    <h1 class="seitentitel">Schuh-Finder</h1>
    <p class="unterzeile">Wähle deine Lieblingsfarben und dein Budget. Der Finder bewertet alle Modelle und zeigt dir die besten Treffer.</p>

    <form id="finder-form" class="finder-form" novalidate>
      <fieldset class="feld farb-feld">
        <legend>Lieblingsfarben</legend>
        <div class="farb-auswahl">${chips}</div>
      </fieldset>

      <div class="feld">
        <label for="budget">Budget</label>
        <div class="budget-zeile">
          <input id="budget" type="range" min="30" max="200" step="5" value="130">
          <output id="budget-wert" for="budget">bis 130 €</output>
        </div>
      </div>

      <div class="feld">
        <label for="anzahl">Vorschläge</label>
        <select id="anzahl">
          <option value="1">1</option>
          <option value="3" selected>3</option>
          <option value="5">5</option>
        </select>
      </div>

      <button type="submit" class="knopf">Vorschläge anzeigen</button>
    </form>

    <div id="ergebnis" class="ergebnis" aria-live="polite"></div>`;
}

async function sucheEmpfehlung(form) {
  const farben = [...form.querySelectorAll('input[name="finder-farbe"]:checked')].map((i) => i.value);
  const budget = Number(form.querySelector("#budget").value);
  const anzahl = Number(form.querySelector("#anzahl").value);
  const ergebnis = document.getElementById("ergebnis");

  const parameter = new URLSearchParams({ farben: farben.join(","), budget, anzahl });

  try {
    const antwort = await fetch(`/api/empfehlung?${parameter}`);
    const daten = await antwort.json();

    if (!antwort.ok) {
      ergebnis.innerHTML = meldung(esc(daten.fehler || "Die Empfehlung ist fehlgeschlagen."), true);
      return;
    }
    ergebnis.innerHTML = vorschlaegeHtml(daten, { farben, budget });
  } catch {
    ergebnis.innerHTML = meldung(`Die Empfehlung konnte nicht geladen werden. ${SERVER_HINWEIS}`, true);
  }
}

function vorschlaegeHtml(vorschlaege, { farben, budget }) {
  if (vorschlaege.length === 0) {
    return meldung(`Bis ${budget} € gibt es kein Modell. Erhöhe dein Budget, um Vorschläge zu sehen.`);
  }

  const leistbar = schuhe.filter((s) => s.preis <= budget).length;
  const farbText = farben.length > 0 ? `in ${aufzaehlung(farben)}` : "ohne Farbwunsch";

  const zeilen = vorschlaege
    .map((schuh, index) => {
      const passt =
        schuh.passende_farben.length > 0
          ? `passt in ${esc(aufzaehlung(schuh.passende_farben))}`
          : "keine Wunschfarbe";
      return `
        <li class="vorschlag">
          <span class="platz" aria-label="Platz ${index + 1}">${index + 1}</span>
          <div class="schuh-bild">${schuhSvg(schuh, schuh.passende_farben[0])}</div>
          <div>
            <h3><a href="#/produkt/${schuh.schuh_id}">${esc(schuh.name)}</a></h3>
            <p class="vorschlag-details">Erschienen ${schuh.release_jahr}, ${passt}</p>
            <div class="punkte">
              <div class="punkte-balken" aria-hidden="true"><span style="width:${schuh.punkte}%"></span></div>
              ${schuh.punkte} von 100 Punkten
            </div>
          </div>
          <p class="preis">${preis(schuh.preis)}</p>
        </li>`;
    })
    .join("");

  return `
    <h2>Deine Vorschläge</h2>
    <p class="ergebnis-info">Die besten ${vorschlaege.length} von ${leistbar} Modellen bis ${budget} €, ${esc(farbText)}.</p>
    <ol class="vorschlaege">${zeilen}</ol>
    <p class="erklaerung">So entsteht die Punktzahl: 50 Punkte, wenn eine Farbe passt, bis zu 30 Punkte für ein neueres Modell und bis zu 20 Punkte, je weiter der Preis unter deinem Budget liegt.</p>`;
}

// ===================== Seite: Warenkorb =====================

function zeigeWarenkorb() {
  document.title = "Warenkorb | Schuhshop";

  if (warenkorb.length === 0) {
    app.innerHTML = `
      <h1 class="seitentitel">Warenkorb</h1>
      <div class="leer">
        <p>Dein Warenkorb ist leer.</p>
        <a class="knopf" href="#/shop">Zum Shop</a>
      </div>`;
    return;
  }

  const positionen = warenkorb
    .map((p, i) => {
      const schuh = findeSchuh(p.schuh_id);
      return `
        <li class="korb-position">
          <div class="schuh-bild">${schuhSvg(schuh, p.farbe)}</div>
          <div>
            <h3><a href="#/produkt/${schuh.schuh_id}">${esc(schuh.name)}</a></h3>
            <p class="korb-details">${esc(p.farbe)}, Größe ${p.groesse}, ${preis(schuh.preis)} pro Paar</p>
            <div class="korb-aktionen">
              <div class="mengenwahl" role="group" aria-label="Menge für ${esc(schuh.name)}">
                <button type="button" data-action="korb-menge" data-index="${i}" data-delta="-1"
                        aria-label="Menge verringern" ${p.menge <= 1 ? "disabled" : ""}>−</button>
                <output>${p.menge}</output>
                <button type="button" data-action="korb-menge" data-index="${i}" data-delta="1"
                        aria-label="Menge erhöhen" ${p.menge >= MAX_MENGE ? "disabled" : ""}>+</button>
              </div>
              <button type="button" class="textknopf" data-action="korb-entfernen" data-index="${i}">Entfernen</button>
            </div>
          </div>
          <p class="preis">${preis((zuCent(schuh.preis) * p.menge) / 100)}</p>
        </li>`;
    })
    .join("");

  app.innerHTML = `
    <h1 class="seitentitel" id="korb-titel" tabindex="-1">Warenkorb</h1>
    <div class="korb-layout">
      <ul class="korb-liste">${positionen}</ul>
      <aside class="zusammenfassung" aria-label="Übersicht">
        <h2>Übersicht</h2>
        ${zusammenfassungHtml({ mitKnopf: true })}
      </aside>
    </div>`;
}

function aendereKorbMenge(index, delta) {
  const position = warenkorb[index];
  if (!position) return;
  position.menge = Math.min(MAX_MENGE, Math.max(1, position.menge + delta));
  speichereWarenkorb();
  zeigeWarenkorb();
  const knopf = app.querySelector(`[data-action="korb-menge"][data-index="${index}"][data-delta="${delta}"]`);
  (knopf && !knopf.disabled ? knopf : document.getElementById("korb-titel")).focus();
}

function entferneAusKorb(index) {
  const position = warenkorb[index];
  if (!position) return;
  const schuh = findeSchuh(position.schuh_id);
  warenkorb.splice(index, 1);
  speichereWarenkorb();
  zeigeWarenkorb();
  zeigeToast(`<span>${esc(schuh.name)} wurde aus dem Warenkorb entfernt.</span>`);
  const titel = document.getElementById("korb-titel");
  if (titel) titel.focus();
}

// ===================== Seite: Kasse =====================

const KASSEN_FELDER = [
  { id: "name", label: "Vor- und Nachname", typ: "text", autocomplete: "name", voll: true },
  { id: "email", label: "E-Mail", typ: "email", autocomplete: "email", voll: true },
  { id: "strasse", label: "Straße und Hausnummer", typ: "text", autocomplete: "street-address", voll: true },
  { id: "plz", label: "PLZ", typ: "text", autocomplete: "postal-code", voll: false },
  { id: "ort", label: "Ort", typ: "text", autocomplete: "address-level2", voll: false },
];

function zeigeKasse() {
  document.title = "Kasse | Schuhshop";

  if (warenkorb.length === 0) {
    location.hash = "#/warenkorb";
    return;
  }

  const felder = KASSEN_FELDER.map(
    (f) => `
    <div class="${f.voll ? "voll" : ""}">
      <label for="k-${f.id}">${f.label}</label>
      <input id="k-${f.id}" name="${f.id}" type="${f.typ}" autocomplete="${f.autocomplete}" required
             aria-describedby="k-${f.id}-fehler">
      <p class="feldfehler" id="k-${f.id}-fehler"></p>
    </div>`
  ).join("");

  const posten = warenkorb
    .map((p) => {
      const schuh = findeSchuh(p.schuh_id);
      return `<li><span>${p.menge} × ${esc(schuh.name)}, ${esc(p.farbe)}, Gr. ${p.groesse}</span>
                  <span>${preis((zuCent(schuh.preis) * p.menge) / 100)}</span></li>`;
    })
    .join("");

  app.innerHTML = `
    <h1 class="seitentitel">Kasse</h1>
    <p class="unterzeile">Gib deine Lieferadresse ein. Das ist ein Demo-Shop, es wird nichts bezahlt.</p>

    <div class="korb-layout">
      <form id="kasse-form" class="kasse-form" novalidate>
        ${felder}
        <p class="feldfehler voll" id="kasse-fehler" aria-live="polite"></p>
        <div class="voll"><button type="submit" class="knopf gross">Bestellung abschicken</button></div>
      </form>

      <aside class="zusammenfassung" aria-label="Deine Bestellung">
        <h2>Deine Bestellung</h2>
        <ul class="kasse-posten">${posten}</ul>
        ${zusammenfassungHtml({ mitKnopf: false })}
        <a href="#/warenkorb">Warenkorb bearbeiten</a>
      </aside>
    </div>`;
}

function pruefeKasse(form) {
  const werte = {};
  let erstesFehlerfeld = null;

  KASSEN_FELDER.forEach((f) => {
    const input = form.querySelector(`#k-${f.id}`);
    const wert = input.value.trim();
    let fehler = "";

    if (wert === "") fehler = `Bitte ${f.label} angeben.`;
    else if (f.id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert)) fehler = "Bitte eine gültige E-Mail-Adresse angeben.";

    form.querySelector(`#k-${f.id}-fehler`).textContent = fehler;
    input.setAttribute("aria-invalid", String(fehler !== ""));
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

  try {
    const antwort = await fetch("/api/bestellung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kunde, positionen: warenkorb }),
    });
    const daten = await antwort.json();

    if (!antwort.ok) {
      fehlerFeld.textContent = daten.fehler || "Die Bestellung ist fehlgeschlagen.";
      knopf.disabled = false;
      knopf.textContent = "Bestellung abschicken";
      return;
    }

    letzteBestellung = daten;
    warenkorb = [];
    speichereWarenkorb();
    location.hash = `#/bestellt/${daten.bestellnummer}`;
  } catch {
    fehlerFeld.textContent = "Die Bestellung konnte nicht gesendet werden. Läuft der Server noch?";
    knopf.disabled = false;
    knopf.textContent = "Bestellung abschicken";
  }
}

// ===================== Seite: Bestätigung =====================

function zeigeBestaetigung(nummer) {
  document.title = "Danke für deine Bestellung | Schuhshop";
  const b = letzteBestellung && letzteBestellung.bestellnummer === nummer ? letzteBestellung : null;

  const details = b
    ? `<p>Lieferung an ${esc(b.kunde.name)}, ${esc(b.kunde.strasse)}, ${esc(b.kunde.plz)} ${esc(b.kunde.ort)}.</p>
       <p>Gesamtbetrag: <strong>${preis(b.gesamt)}</strong>${b.versand === 0 ? " inklusive kostenlosem Versand" : ` inklusive ${preis(b.versand)} Versand`}.</p>`
    : "";

  app.innerHTML = `
    <section class="bestaetigung">
      <div class="haken" aria-hidden="true">✓</div>
      <h1 class="seitentitel">Danke für deine Bestellung!</h1>
      <p class="bestellnummer">Bestellnummer <strong>${esc(nummer || "")}</strong></p>
      ${details}
      <p class="hinweis">Die Bestellung wurde in der Datei bestellungen.json gespeichert.</p>
      <a class="knopf" href="#/shop">Weiter einkaufen</a>
    </section>`;
}

// ===================== Seite: Nicht gefunden =====================

function zeigeNichtGefunden(text = "Diese Seite gibt es nicht.") {
  document.title = "Nicht gefunden | Schuhshop";
  app.innerHTML = `
    <h1 class="seitentitel">Nicht gefunden</h1>
    <p class="unterzeile">${esc(text)}</p>
    <a class="knopf" href="#/shop">Zum Shop</a>`;
}

// ===================== Navigation (Router) =====================

function aktuelleRoute() {
  const [pfad, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [seite, param] = pfad.split("/");
  return { seite: seite || "start", param, query: new URLSearchParams(query) };
}

function markiereNavigation(seite) {
  const zuordnung = { shop: "shop", produkt: "shop", finder: "finder", warenkorb: "warenkorb", kasse: "warenkorb" };
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === zuordnung[seite]) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function zeigeSeite() {
  const { seite, param, query } = aktuelleRoute();
  versteckeToast();
  markiereNavigation(seite);

  const seiten = {
    start: () => zeigeStart(),
    shop: () => zeigeShop(query),
    produkt: () => zeigeProdukt(param),
    finder: () => zeigeFinder(),
    warenkorb: () => zeigeWarenkorb(),
    kasse: () => zeigeKasse(),
    bestellt: () => zeigeBestaetigung(param),
  };

  (seiten[seite] || (() => zeigeNichtGefunden()))();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

// ===================== Ereignisse =====================

document.addEventListener("click", (event) => {
  const ziel = event.target.closest("[data-action]");
  if (!ziel) return;
  const aktion = ziel.dataset.action;

  if (aktion === "farbe-waehlen") waehleFarbe(ziel.dataset.farbe);
  if (aktion === "groesse-waehlen") waehleGroesse(Number(ziel.dataset.groesse));
  if (aktion === "menge") aendereMenge(Number(ziel.dataset.delta));
  if (aktion === "in-warenkorb") produktInWarenkorb();
  if (aktion === "korb-menge") aendereKorbMenge(Number(ziel.dataset.index), Number(ziel.dataset.delta));
  if (aktion === "korb-entfernen") entferneAusKorb(Number(ziel.dataset.index));
  if (aktion === "filter-zuruecksetzen") {
    shopFilter = standardFilter();
    zeigeShop(new URLSearchParams());
  }
});

app.addEventListener("input", (event) => {
  const ziel = event.target;

  if (ziel.id === "suche") shopFilter.suche = ziel.value;
  else if (ziel.id === "max-preis") shopFilter.maxPreis = Number(ziel.value);
  else if (ziel.id === "budget") {
    document.getElementById("budget-wert").textContent = `bis ${ziel.value} €`;
    return;
  } else return;

  aktualisiereShopListe();
});

app.addEventListener("change", (event) => {
  const ziel = event.target;

  if (ziel.name === "filter-farbe") {
    shopFilter.farben = [...app.querySelectorAll('input[name="filter-farbe"]:checked')].map((i) => i.value);
  } else if (ziel.id === "nur-neu") {
    shopFilter.nurNeu = ziel.checked;
  } else if (ziel.id === "sortierung") {
    shopFilter.sortierung = ziel.value;
  } else return;

  aktualisiereShopListe();
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "finder-form") sucheEmpfehlung(event.target);
  if (event.target.id === "kasse-form") sendeBestellung(event.target);
});

window.addEventListener("hashchange", zeigeSeite);

// ===================== Start =====================

async function starte() {
  if (location.protocol === "file:") {
    app.innerHTML = meldung(`Die Seite muss über den Server geöffnet werden. ${SERVER_HINWEIS}`, true);
    return;
  }

  try {
    const antwort = await fetch("/api/schuhe");
    if (!antwort.ok) throw new Error(`Status ${antwort.status}`);
    schuhe = await antwort.json();
  } catch {
    app.innerHTML = meldung(`Die Modelle konnten nicht geladen werden. ${SERVER_HINWEIS}`, true);
    return;
  }

  const jahre = schuhe.map((s) => s.release_jahr);
  const preise = schuhe.map((s) => s.preis);
  neuheitAb = Math.max(...jahre) - 1;
  preisGrenzen = {
    min: Math.floor(Math.min(...preise) / 10) * 10,
    max: Math.ceil(Math.max(...preise) / 10) * 10,
    minPreis: Math.min(...preise),
  };

  bereinigeWarenkorb();
  zeigeSeite();
}

aktualisiereZaehler();
starte();
