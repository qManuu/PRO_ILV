/**
 * Funktion zum Anzeigen der Schuh-Datensätze als einzelne Objekte.
 * Baut auf read_schuhe.js auf (Funktion leseSchuhe).
 *
 * Ausführen im Terminal:  node display_schuhe.js
 */

const path = require("path");
const { leseSchuhe } = require("./read_schuhe.js");

/**
 * Zeigt jeden Datensatz als einzelnes Objekt in der Konsole an.
 *
 * @param {Array<Object>} schuhe - Liste der Schuh-Datensätze
 */
function zeigeSchuhe(schuhe) {
  schuhe.forEach((schuh, index) => {
    console.log(`--- Datensatz ${index + 1} ---`);
    console.log(schuh);
    console.log(""); // Leerzeile zur besseren Lesbarkeit
  });
}

// Nur ausführen, wenn die Datei direkt gestartet wird
if (require.main === module) {
  const dateipfad = path.join(__dirname, "schuhe.json");

  const schuhe = leseSchuhe(dateipfad);
  console.log(`Anzahl geladener Schuhe: ${schuhe.length}\n`);

  zeigeSchuhe(schuhe);
}

module.exports = { zeigeSchuhe };
