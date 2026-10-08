/**
 * VERSION 2 (Aufgabe 2, korrigiert)
 * Berechnet den Preis eines Museumstickets anhand des Alters.
 *
 * Regeln:
 *   - ab 18 Jahren (also auch genau 18): 15 €
 *   - unter 18 Jahren (0 bis 17):        9 €
 *   - negatives Alter oder keine Zahl:   Fehler
 */

function calculate_ticket_price(alter) {
  if (typeof alter !== "number" || Number.isNaN(alter)) {
    throw new Error("Ungültiges Alter: Bitte eine Zahl angeben.");
  }

  if (alter < 0) {
    throw new Error("Ungültiges Alter: Das Alter darf nicht negativ sein.");
  }

  if (alter >= 18) {
    return 15;
  }
  return 9;
}

module.exports = { calculate_ticket_price };
