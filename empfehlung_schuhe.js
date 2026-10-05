/**
 * Algorithmus: Schuh-Empfehlung für den Schuhshop
 *
 * Eingabe:
 *   - Liste aller Schuhe (aus schuhe.json, eingelesen mit leseSchuhe)
 *   - Wünsche des Kunden: Wunschfarben, Maximalbudget, Anzahl der Vorschläge
 *
 * Ablauf:
 *   1. Alle Schuhe, die teurer als das Budget sind, werden aussortiert.
 *   2. Jeder verbleibende Schuh bekommt Punkte (max. 100):
 *        - 50 Punkte, wenn mindestens eine seiner Farben eine Wunschfarbe ist
 *        - bis zu 30 Punkte für Aktualität (neuestes Modell = 30, ältestes = 0)
 *        - bis zu 20 Punkte für den Preis (je weiter unter dem Budget, desto mehr)
 *   3. Die Schuhe werden nach Punkten absteigend sortiert
 *      (bei Gleichstand gewinnt der günstigere Schuh).
 *
 * Ausgabe:
 *   - Neue Liste mit den besten Vorschlägen inkl. Punktzahl und passenden Farben
 *
 * Ausführen im Terminal:  node empfehlung_schuhe.js
 */

const path = require("path");
const { leseSchuhe } = require("./read_schuhe.js");

/**
 * Erstellt eine Empfehlungsliste passend zu den Kundenwünschen.
 *
 * @param {Array<Object>} schuhe - Liste aller Schuh-Datensätze
 * @param {Object} wunsch - Kundenwünsche
 * @param {string[]} wunsch.farben - Wunschfarben, z. B. ["Schwarz", "Rot"]
 * @param {number} wunsch.budget - Maximaler Preis in Euro
 * @param {number} [wunsch.anzahl=3] - Wie viele Vorschläge zurückgegeben werden
 * @returns {Array<Object>} Neue Liste mit den empfohlenen Schuhen
 */
function empfehleSchuhe(schuhe, wunsch) {
  const { farben = [], budget, anzahl = 3 } = wunsch;

  // Schritt 1: Zu teure Schuhe aussortieren
  const leistbar = schuhe.filter((schuh) => schuh.preis <= budget);

  if (leistbar.length === 0) {
    return [];
  }

  // Bezugswerte für die Aktualitäts-Punkte
  const jahre = leistbar.map((schuh) => schuh.release_jahr);
  const aeltestesJahr = Math.min(...jahre);
  const neuestesJahr = Math.max(...jahre);

  const wunschFarben = farben.map((farbe) => farbe.toLowerCase());

  // Schritt 2: Punkte für jeden Schuh berechnen
  const bewertet = leistbar.map((schuh) => {
    const passendeFarben = schuh.farben.filter((farbe) =>
      wunschFarben.includes(farbe.toLowerCase())
    );

    const farbPunkte = passendeFarben.length > 0 ? 50 : 0;

    const aktualitaetPunkte =
      neuestesJahr === aeltestesJahr
        ? 30
        : ((schuh.release_jahr - aeltestesJahr) / (neuestesJahr - aeltestesJahr)) * 30;

    const preisPunkte = ((budget - schuh.preis) / budget) * 20;

    const punkte = Math.round(farbPunkte + aktualitaetPunkte + preisPunkte);

    return {
      ...schuh,
      punkte: punkte,
      passende_farben: passendeFarben,
    };
  });

  // Schritt 3: Nach Punkten sortieren (Gleichstand: günstiger zuerst) und Top-N zurückgeben
  bewertet.sort((a, b) => b.punkte - a.punkte || a.preis - b.preis);

  return bewertet.slice(0, anzahl);
}

// Nur ausführen, wenn die Datei direkt gestartet wird
if (require.main === module) {
  const schuhe = leseSchuhe(path.join(__dirname, "schuhe.json"));

  // Testfall 1: normaler Kundenwunsch
  const wunsch1 = { farben: ["Schwarz"], budget: 130, anzahl: 3 };
  console.log("=== Testfall 1 ===");
  console.log("Kundenwunsch:", wunsch1, "\n");

  const ergebnis1 = empfehleSchuhe(schuhe, wunsch1);
  ergebnis1.forEach((schuh, index) => {
    console.log(`--- Platz ${index + 1} ---`);
    console.log(schuh);
    console.log("");
  });

  // Testfall 2: Budget zu niedrig, kein Schuh passt
  const wunsch2 = { farben: ["Rot"], budget: 30, anzahl: 3 };
  console.log("=== Testfall 2 ===");
  console.log("Kundenwunsch:", wunsch2, "\n");

  const ergebnis2 = empfehleSchuhe(schuhe, wunsch2);
  if (ergebnis2.length === 0) {
    console.log("Leider passt kein Schuh zu diesen Wünschen.");
  }
}

module.exports = { empfehleSchuhe };
