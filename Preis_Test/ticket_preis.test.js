/**
 * Unit Tests für calculate_ticket_price
 * Nutzt den eingebauten Test-Runner von Node.js (keine Installation nötig).
 * Die Testfälle stehen in testfaelle.json.
 *
 * Ausführen im Terminal:  node --test ticket_preis.test.js
 */

const { describe, test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Welche Version getestet wird:
//   "./ticket_preis_v1.js" = Funktion aus Aufgabe 1 (vor dem Fix)
//   "./ticket_preis.js"    = korrigierte Funktion aus Aufgabe 2
const { calculate_ticket_price } = require("./ticket_preis.js");

const testfaelle = JSON.parse(
  fs.readFileSync(path.join(__dirname, "testfaelle.json"), "utf-8")
);

for (const aufgabe of [1, 2]) {
  describe(`Aufgabe ${aufgabe}`, () => {
    testfaelle
      .filter((fall) => fall.aufgabe === aufgabe)
      .forEach((fall) => {
        test(`${fall.beschreibung} (Alter: ${fall.alter})`, () => {
          if (fall.erwartet === "Fehler") {
            assert.throws(() => calculate_ticket_price(fall.alter), /Ungültiges Alter/);
          } else {
            assert.strictEqual(calculate_ticket_price(fall.alter), fall.erwartet);
          }
        });
      });
  });
}
