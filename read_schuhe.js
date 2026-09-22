/**
 * Einfache Funktion zum Einlesen der Schuh-Datenstruktur (schuhe.json).
 * Lauffähig mit Node.js in VS Code (keine externen Packages nötig).
 *
 * Ausführen im Terminal:  node read_schuhe.js
 */

const fs = require("fs");
const path = require("path");

/**
 * Liest die Schuh-Datensätze aus einer JSON-Datei ein.
 *
 * @param {string} dateipfad - Pfad zur JSON-Datei (z. B. "schuhe.json")
 * @returns {Array<Object>} Liste von Objekten, jedes Objekt ist ein Schuh-Datensatz
 */
function leseSchuhe(dateipfad) {
  if (!fs.existsSync(dateipfad)) {
    throw new Error(`Datei nicht gefunden: ${dateipfad}`);
  }

  const inhalt = fs.readFileSync(dateipfad, "utf-8");
  const daten = JSON.parse(inhalt);

  return daten;
}

// Nur ausführen, wenn die Datei direkt gestartet wird (nicht bei require())
if (require.main === module) {
  const dateipfad = path.join(__dirname, "schuhe.json");
  const schuhe = leseSchuhe(dateipfad);

  console.log(`Anzahl eingelesener Schuhe: ${schuhe.length}\n`);

  schuhe.forEach((schuh) => {
    console.log(
      `ID: ${schuh.schuh_id} | ` +
        `Name: ${schuh.name} | ` +
        `Preis: ${schuh.preis} € | ` +
        `Farben: ${schuh.farben.join(", ")} | ` +
        `Release: ${schuh.release_jahr}`
    );
  });
}

module.exports = { leseSchuhe };
