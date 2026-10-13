# Schuhwerk: Umsetzung der Requirements (Gruppe J)

Starten: `node server.js`, danach `http://localhost:3000` im Browser öffnen.
Beim ersten Start werden Demodaten im Ordner `daten/` angelegt. Zum Zurücksetzen den Ordner löschen und den Server neu starten.

| Demo-Konto | Passwort | Zeigt |
|---|---|---|
| inhaber@schuhwerk.at | inhaber123 | Dashboard, Bestand, Verkäufe, Warnungen |
| anna@beispiel.at | anna123 | Stammkundin mit 10 % Treuerabatt und Vorbestellung |
| max@beispiel.at | max123 | Seit über 2 Monaten inaktiv, hat einen 15-%-Gutschein bekommen |

## Funktionale Requirements

| Requirement | Umsetzung | So testen |
|---|---|---|
| Schuhe übersichtlich darstellen und online vorbestellen, innerhalb von 300 ms | Shop mit Kategorien, Filtern und Suche. Kommende Modelle haben den Knopf "Jetzt vorbestellen". Der Server misst jede API-Antwort (`server.js`, `merkeAntwortzeit`). | Kategorie "Demnächst" öffnen und als Anna vorbestellen. Im Dashboard steht die gemessene Antwortzeit mit dem Ziel unter 300 ms. |
| Gekaufte und vorbestellte Schuhe speichern, ab Mindestanzahl Preisreduktion bis max. 10 % | Konten mit Login (`/api/login`). Bestellungen und Vorbestellungen werden gespeichert. Ab 3 Paaren 5 %, ab 6 Paaren 10 % (`shop_logik.js`, `treueVon`). | Als Anna anmelden: Preise sind grün um 10 % reduziert, "Mein Konto" zeigt den Fortschritt. |
| Inhaber sieht Stückzahl jedes Schuhs und Verkaufsdaten der letzten 3 Monate | Dashboard mit Bestandstabelle, Verkäufen pro Modell und Umsatz pro Monat (`inhaberUebersicht`, `verkaufsstatistik`). | Als Inhaber anmelden. |
| Bei Stückzahl unter 20 % Nachricht beim Login mit Empfehlung nachzubestellen | Warnungen oben im Dashboard plus Hinweis direkt nach dem Login, jeweils mit Knopf zum Nachbestellen (`statusVon`, `knappGrenze`). | Als Inhaber anmelden: Alpine Boot Winter (5 von 30) wird als knapp gemeldet. |
| Mehr als 100 Vorbestellungen: Preis +5 %, darunter automatisch wieder Normalpreis | Der Preis wird bei jeder Anfrage aus der aktuellen Zahl der Vorbestellungen berechnet (`berechnePreis`). | Summit Peak hat 101 Vorbestellungen und kostet 198,45 € statt 189 €. Als Anna die eigene Vorbestellung stornieren: 100 Vorbestellungen, Preis wieder 189 €. |
| Kein Login seit mehr als 2 Monaten: Erinnerungs-E-Mail mit 15 % Rabattcode | Prüfung beim Serverstart und dann stündlich (`pruefeErinnerungen`). Der Code wird im Konto gespeichert und ist an der Kasse einlösbar. | Als Max anmelden: Gutschein im Konto, an der Kasse "anwenden". Die E-Mail steht im Dashboard unter "Postausgang" und in `daten/emails.json`. |
| Ausverkaufte Schuhe automatisch aus dem Sortiment nehmen und Kauf blockieren | Schuhe mit Bestand 0 werden nicht mehr ausgeliefert, der Server lehnt Bestellungen ab (`sortimentFuer`, `erstelleBestellung`). | Urban Slip-On ist ausverkauft und fehlt im Shop. Im Dashboard nachbestellen: Er ist sofort wieder da. |

## Nicht-funktionale Requirements

| Requirement | Umsetzung |
|---|---|
| Rabattierte Schuhe grün kennzeichnen | Reduzierte Preise sind grün mit durchgestrichenem Normalpreis und grünem Rabatt-Etikett (Aktionsrabatt, Treuerabatt, Gutschein). |
| Startseite nach Release-Datum sortiert, aktualisiert sich bei neuen Schuhen automatisch | Jeder Schuh hat ein `release_datum`. Die Startseite sortiert danach und liest die Daten bei jedem Aufruf neu. Im Dashboard über "Neuen Schuh anlegen" testen. |
| Bilder der Schuhe in 1000 × 1000 Pixel | Die Produktbilder werden als Vektorgrafik mit 1000 × 1000 Pixel erzeugt. Auf der Produktseite gibt es "Bild in Originalgröße ansehen". Auf kleineren Bildschirmen wird das Bild verkleinert, damit es ganz sichtbar bleibt. |

## Hinweise

- Die E-Mails werden simuliert, weil für echten Versand ein Mailserver mit Zugangsdaten nötig wäre.
- Es gibt keine echte Zahlung.
- Bestand und neue Schuhe werden direkt in `schuhe.json` gespeichert.
