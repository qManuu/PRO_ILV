/**
 * VERSION 1 (Aufgabe 1)
 * Berechnet den Preis eines Museumstickets anhand des Alters.
 * Wörtlich nach der Anforderung umgesetzt:
 * "€15 for those over 18, €9 for those under 18"
 */

function calculate_ticket_price(alter) {
  if (alter > 18) {
    return 15;
  }
  return 9;
}

module.exports = { calculate_ticket_price };
