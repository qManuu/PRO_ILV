/**
 * Inhaber-Bereich (Dashboard) des Schuhshops.
 * Zeigt Bestand und Verkäufe der letzten 3 Monate, warnt bei knappen Schuhen
 * und erlaubt Nachbestellen, Bearbeiten und Anlegen neuer Schuhe.
 * Nutzt Hilfsfunktionen aus app.js (wird davor geladen, aber erst danach aufgerufen).
 */

let inhaberDaten = null;
let inhaberSortierung = "status";

const STATUS_TEXT = {
  ausverkauft: "Ausverkauft",
  knapp: "Knapp",
  vorbestellbar: "Vorbestellbar",
  erhaeltlich: "Auf Lager",
};

async function zeigeInhaber() {
  document.title = `Dashboard | ${SHOPNAME}`;
  const ich = zustand.ich;

  if (!ich.angemeldet) {
    zustand.nachLogin = "#/inhaber";
    location.hash = "#/login";
    return;
  }
  if (ich.benutzer.rolle !== "inhaber") {
    zeigeNichtGefunden("Dieser Bereich ist nur für den Inhaber.");
    return;
  }

  if (!inhaberDaten) app.innerHTML = `<div class="wrap"><p class="hinweis lade">Dashboard wird geladen …</p></div>`;
  const antwort = await api("/api/inhaber/uebersicht");
  if (aktuelleRoute().seite !== "inhaber") return;

  if (!antwort.ok) {
    app.innerHTML = `<div class="wrap" style="padding:3rem 0">${meldung(esc(antwort.daten.fehler), "fehler")}</div>`;
    return;
  }

  inhaberDaten = antwort.daten;
  zeichneInhaber();
}

function sortierteInhaberSchuhe() {
  const rang = { ausverkauft: 0, knapp: 1, vorbestellbar: 2, erhaeltlich: 3 };
  const liste = [...inhaberDaten.schuhe];
  const sortierer = {
    status: (a, b) => rang[a.status] - rang[b.status] || a.bestand_quote - b.bestand_quote,
    verkauf: (a, b) => b.verkauft_paare - a.verkauft_paare,
    bestand: (a, b) => a.bestand_quote - b.bestand_quote,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };
  return liste.sort(sortierer[inhaberSortierung]);
}

function zeichneInhaber() {
  const d = inhaberDaten;
  const umsatz = d.monate.reduce((s, m) => s + m.umsatz, 0);
  const paare = d.monate.reduce((s, m) => s + m.paare, 0);
  const maxUmsatz = Math.max(...d.monate.map((m) => m.umsatz), 1);
  const maxMonat = Math.max(1, ...d.schuhe.flatMap((s) => s.verkauft_monate));
  const zeit = d.antwortzeiten;
  const r = d.regeln;

  // Requirement: Beim Einloggen des Inhabers Nachricht bei Knappheit + Empfehlung nachzubestellen
  const warnungen = d.warnungen.length
    ? `<section class="warnungen" aria-label="Warnungen">${d.warnungen
        .map((w) => {
          const prozent = Math.round((w.bestand / w.sollbestand) * 100);
          const text =
            w.status === "ausverkauft"
              ? `Das Modell wurde automatisch aus dem Shop genommen und kann nicht mehr gekauft werden. Wir empfehlen, ${w.empfehlung} Stück nachzubestellen.`
              : `Nur noch ${w.bestand} von ${w.sollbestand} Stück (${prozent} %). Wir empfehlen, ${w.empfehlung} Stück nachzubestellen.`;
          return `
            <div class="warnung ${w.status}">
              <span class="warnung-symbol" aria-hidden="true">!</span>
              <div><strong>${esc(w.name)} ${w.status === "ausverkauft" ? "ist ausverkauft" : "wird knapp"}</strong><p>${text}</p></div>
              <button type="button" class="knopf klein" data-aktion="nachbestellen" data-id="${w.schuh_id}">${w.empfehlung} Stück nachbestellen</button>
            </div>`;
        })
        .join("")}</section>`
    : `<div class="meldung erfolg" style="margin-bottom:2rem">Alle Modelle haben genug Bestand.</div>`;

  const monate = d.monate
    .map((m) => `
      <div class="monat">
        <strong>${preis(m.umsatz)}</strong>
        <div class="monat-balken" style="height:${Math.max(2, (m.umsatz / maxUmsatz) * 100)}%"></div>
        <span>${esc(m.name)}</span><span>${m.paare} Paar</span>
      </div>`)
    .join("");

  const zeilen = sortierteInhaberSchuhe()
    .map((s) => {
      const p = s.preis_aktuell;
      const hinweise = [];
      if (s.rabatt_prozent > 0) hinweise.push(`Aktion −${s.rabatt_prozent} %`);
      if (p.nachfrage_aufschlag) hinweise.push("+5 % Nachfrage");
      const balken = s.verkauft_monate.map((n) => `<span style="height:${Math.max(8, (n / maxMonat) * 100)}%" title="${n} Paar"></span>`).join("");

      return `
        <tr>
          <td><strong>${esc(s.name)}</strong><div class="klein">Art.-Nr. ${s.schuh_id}, ${KATEGORIEN[s.kategorie] || esc(s.kategorie)}</div></td>
          <td><span class="status ${s.status}">${STATUS_TEXT[s.status]}</span></td>
          <td class="bestand-zelle">
            ${s.status === "vorbestellbar" ? `<span class="klein">ab ${kurzDatum(s.release_datum)}</span>` : `${s.bestand} von ${s.sollbestand}`}
            <div class="bestand-balken ${s.status}"><span style="width:${Math.min(100, s.bestand_quote * 100)}%"></span></div>
          </td>
          <td class="zahl">${s.vorbestellungen || "–"}</td>
          <td class="zahl"><span class="mini-balken" aria-hidden="true">${balken}</span>${s.verkauft_paare}</td>
          <td class="zahl">${preis(s.verkauft_umsatz)}</td>
          <td class="zahl"><span class="preis ${p.rabattiert ? "rabattiert" : ""}">${preis(p.preis)}</span>${hinweise.length ? `<div class="klein">${hinweise.join(", ")}</div>` : ""}</td>
          <td>
            <div class="zeilen-aktionen">
              <button type="button" class="knopf klein zweit" data-aktion="schuh-bearbeiten" data-id="${s.schuh_id}">Bearbeiten</button>
              ${s.status === "knapp" || s.status === "ausverkauft" ? `<button type="button" class="knopf klein" data-aktion="nachbestellen" data-id="${s.schuh_id}">Nachbestellen</button>` : ""}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const emails = d.emails.length
    ? d.emails
        .map((e) => `
          <details>
            <summary><strong>${esc(e.betreff)}</strong><span>an ${esc(e.an)}, ${kurzDatum(e.datum)}</span></summary>
            <pre>${esc(e.text)}</pre>
          </details>`)
        .join("")
    : `<p class="hinweis">Noch keine Erinnerungs-E-Mails verschickt.</p>`;

  const sortierOptionen = [["status", "Status (Warnungen zuerst)"], ["verkauf", "Meistverkauft"], ["bestand", "Geringster Bestand"], ["name", "Name"]]
    .map(([wert, text]) => `<option value="${wert}" ${inhaberSortierung === wert ? "selected" : ""}>${text}</option>`)
    .join("");

  app.innerHTML = `
    <div class="wrap">
      <div class="seitenkopf dash-kopf">
        <div><h1>Dashboard</h1><p>Bestand, Verkäufe seit ${datum(d.seit)} und Hinweise für dich.</p></div>
        <div class="held-aktionen">
          <button type="button" class="knopf zweit" data-aktion="inhaber-aktualisieren">Aktualisieren</button>
          <button type="button" class="knopf" data-aktion="schuh-neu">Neuen Schuh anlegen</button>
        </div>
      </div>

      ${warnungen}

      <section class="kennzahlen" aria-label="Kennzahlen">
        <div class="kennzahl"><span>Warenumsatz (3 Monate)</span><strong>${preis(umsatz)}</strong><small>seit ${kurzDatum(d.seit)}</small></div>
        <div class="kennzahl"><span>Verkaufte Paare</span><strong>${paare}</strong><small>in ${d.monate.length} Monaten</small></div>
        <div class="kennzahl"><span>Offene Vorbestellungen</span><strong>${d.offene_vorbestellungen}</strong><small>für ${d.schuhe.filter((s) => s.status === "vorbestellbar").length} kommende Modelle</small></div>
        <div class="kennzahl"><span>Antwortzeit der API</span><strong>${zeit.durchschnitt_ms} ms</strong><small class="${zeit.max_ms < zeit.ziel_ms ? "ok" : ""}">max. ${zeit.max_ms} ms, Ziel unter ${zeit.ziel_ms} ms${zeit.max_ms < zeit.ziel_ms ? " ✓" : ""}</small></div>
      </section>

      <div class="dash-raster">
        <section class="karte" aria-labelledby="monate-titel">
          <h2 id="monate-titel">Umsatz pro Monat</h2>
          <div class="monate">${monate}</div>
        </section>
        <section class="karte" aria-labelledby="regeln-titel">
          <h2 id="regeln-titel">Automatische Regeln</h2>
          <ul class="regeln">
            <li><span>Knapp-Warnung</span><strong>unter ${r.knappGrenze * 100} % des Sollbestands</strong></li>
            <li><span>Ausverkauft</span><strong>automatisch aus dem Shop genommen</strong></li>
            <li><span>Hohe Nachfrage</span><strong>+${r.nachfrageAufschlag} % ab mehr als ${r.nachfrageGrenze} Vorbestellungen</strong></li>
            <li><span>Treuerabatt</span><strong>${r.treueStufen.slice().reverse().map((s) => `ab ${s.ab} Paar ${s.prozent} %`).join(", ")}</strong></li>
            <li><span>Erinnerung</span><strong>nach ${r.erinnerungNachMonaten} Monaten ohne Login, ${r.erinnerungsRabatt} % Gutschein</strong></li>
          </ul>
        </section>
      </div>

      <section class="konto-abschnitt">
        <div class="abschnitt-kopf" style="margin-bottom:1rem">
          <h2 style="font-size:1.5rem">Bestand und Verkäufe</h2>
          <label class="sortierung">Sortieren <select id="inhaber-sortierung">${sortierOptionen}</select></label>
        </div>
        <div class="tabelle-rahmen">
          <table class="tabelle">
            <thead><tr><th>Modell</th><th>Status</th><th>Bestand</th><th class="zahl">Vorbest.</th><th class="zahl">Verkauft (3 Mon.)</th><th class="zahl">Umsatz</th><th class="zahl">Preis</th><th><span class="sr-only">Aktionen</span></th></tr></thead>
            <tbody>${zeilen}</tbody>
          </table>
        </div>
      </section>

      <section class="konto-abschnitt postausgang" aria-labelledby="post-titel">
        <h2 id="post-titel">Postausgang: Erinnerungs-E-Mails</h2>
        <p class="hinweis">Kunden, die sich ${r.erinnerungNachMonaten} Monate nicht angemeldet haben, bekommen automatisch eine E-Mail mit ${r.erinnerungsRabatt} % Rabattcode. Der Versand ist simuliert, die E-Mails stehen in daten/emails.json.</p>
        ${emails}
      </section>
    </div>`;
}

// ===================== Schuh anlegen / bearbeiten =====================

function oeffneSchuhFormular(schuh) {
  const werte = schuh || { name: "", kategorie: "Sneaker", preis: "", farben: [], release_datum: new Date().toISOString().slice(0, 10), bestand: 20, sollbestand: 40, rabatt_prozent: 0 };
  const farbChips = Object.keys(FARBWERTE)
    .map((name) => `<label class="farb-chip"><input type="checkbox" name="s-farbe" value="${esc(name)}" ${werte.farben.includes(name) ? "checked" : ""}><span class="farbpunkt" style="--c:${farbe(name)}"></span>${esc(name)}</label>`)
    .join("");
  const kategorien = Object.entries(KATEGORIEN).map(([wert, name]) => `<option value="${wert}" ${werte.kategorie === wert ? "selected" : ""}>${name}</option>`).join("");

  oeffneDialog(
    schuh ? `${esc(schuh.name)} bearbeiten` : "Neuen Schuh anlegen",
    `<form id="schuh-form" class="schuh-form" data-id="${schuh ? schuh.schuh_id : ""}" novalidate>
      <div class="feld ganz"><label for="s-name">Name</label><input id="s-name" type="text" value="${esc(werte.name)}" required></div>
      <div class="feld"><label for="s-kategorie">Kategorie</label><select id="s-kategorie">${kategorien}</select></div>
      <div class="feld"><label for="s-preis">Preis in €</label><input id="s-preis" type="number" min="1" step="0.01" value="${werte.preis}" required></div>
      <div class="feld"><label for="s-datum">Erscheinungsdatum</label><input id="s-datum" type="date" value="${werte.release_datum}" required></div>
      <div class="feld"><label for="s-rabatt">Aktionsrabatt in %</label><input id="s-rabatt" type="number" min="0" max="90" step="1" value="${werte.rabatt_prozent}"></div>
      <div class="feld"><label for="s-bestand">Bestand</label><input id="s-bestand" type="number" min="0" step="1" value="${werte.bestand}"></div>
      <div class="feld"><label for="s-soll">Sollbestand</label><input id="s-soll" type="number" min="1" step="1" value="${werte.sollbestand}"></div>
      <fieldset class="feld ganz" style="border:0;padding:0;margin:0"><legend class="feld-titel" style="font-weight:600;margin-bottom:.5rem">Farben</legend><div class="farb-auswahl">${farbChips}</div></fieldset>
      <p class="feldfehler ganz" id="schuh-fehler" aria-live="polite"></p>
      <div class="dialog-fuss">
        <button type="button" class="knopf zweit" data-aktion="dialog-schliessen">Abbrechen</button>
        <button type="submit" class="knopf">${schuh ? "Speichern" : "Schuh anlegen"}</button>
      </div>
    </form>`
  );
  document.getElementById("s-name").focus();
}

async function speichereSchuhFormular(form) {
  const id = form.dataset.id;
  const daten = {
    name: form.querySelector("#s-name").value,
    kategorie: form.querySelector("#s-kategorie").value,
    preis: Number(form.querySelector("#s-preis").value),
    release_datum: form.querySelector("#s-datum").value,
    rabatt_prozent: Number(form.querySelector("#s-rabatt").value || 0),
    bestand: Number(form.querySelector("#s-bestand").value),
    sollbestand: Number(form.querySelector("#s-soll").value),
    farben: [...form.querySelectorAll('input[name="s-farbe"]:checked')].map((i) => i.value),
  };

  const antwort = await api(`/api/inhaber/schuh${id ? `/${id}` : ""}`, { methode: "POST", daten });
  if (!antwort.ok) {
    document.getElementById("schuh-fehler").textContent = antwort.daten.fehler;
    return;
  }

  schliesseDialog();
  await ladeSchuhe();
  await zeigeInhaber();
  zeigeToast(
    id
      ? `<span>${esc(antwort.daten.name)} wurde gespeichert.</span>`
      : `<span>${esc(antwort.daten.name)} wurde angelegt und erscheint automatisch auf der Startseite.</span><a href="#/produkt/${antwort.daten.schuh_id}">Ansehen</a>`,
    7000
  );
}

// ===================== Aktionen (werden von app.js weitergeleitet) =====================

async function inhaberAktion(aktion, ziel) {
  if (aktion === "inhaber-aktualisieren") return zeigeInhaber();
  if (aktion === "schuh-neu") return oeffneSchuhFormular(null);
  if (aktion === "schuh-bearbeiten") {
    return oeffneSchuhFormular(inhaberDaten.schuhe.find((s) => s.schuh_id === Number(ziel.dataset.id)));
  }
  if (aktion === "nachbestellen") {
    ziel.disabled = true;
    const antwort = await api(`/api/inhaber/nachbestellen/${ziel.dataset.id}`, { methode: "POST" });
    if (!antwort.ok) {
      ziel.disabled = false;
      zeigeToast(`<span>${esc(antwort.daten.fehler)}</span>`);
      return;
    }
    await ladeSchuhe();
    await zeigeInhaber();
    zeigeToast(`<span>${esc(antwort.daten.name)} wurde nachbestellt, Bestand jetzt ${antwort.daten.bestand} Stück.</span>`);
  }
}

function inhaberFormular(form) {
  if (form.id !== "schuh-form") return false;
  speichereSchuhFormular(form);
  return true;
}

document.addEventListener("change", (event) => {
  if (event.target.id === "inhaber-sortierung") {
    inhaberSortierung = event.target.value;
    zeichneInhaber();
  }
});
