# Reaktionsspiel: Anleitung für den Zukunftstag

Ein kleines Spiel für die BUSY Bar, mit dem Kinder ohne Vorkenntnisse sehen: Ich ändere eine Regel im Code, und die Bar verhält sich danach anders. Alles läuft über BusyHub und ein USB-Kabel, am Tag selbst ohne Internet.

## Vorbereitung (zu Hause, mit Internet)

1. **Repository holen und installieren.** Das lädt busy-cli und alles andere, was zum Bauen nötig ist. Danach geht es offline.

   ```sh
   git clone https://github.com/niklas-schmidt-dev/busyhub.git
   cd busyhub
   pnpm install
   ```

2. **Spiel in BusyHub einbinden.** BusyHub öffnen, **Add folder…** klicken und den Ordner `busyhub/apps/reaction-game` wählen. Das Spiel erscheint unter **Your apps**. BusyHub baut es von nun an aus diesem Ordner, also aus dem Code, den die Kinder ändern.

   > Lade das Reaktionsspiel **nicht** zusätzlich aus dem Katalog herunter. Beide Versionen haben dieselbe App-ID; BusyHub zeigt dann nur die heruntergeladene, und Änderungen am Code kommen nicht mehr auf die Bar. Falls es passiert ist: beim Spiel **Remove download** klicken.

3. **Bar per USB anschliessen.** Über USB hat die Bar die Adresse `10.0.4.20` und braucht kein Passwort; BusyHub findet sie von selbst. WLAN ist nicht nötig.

4. **Einmal durchspielen.** Reaktionsspiel wählen, **On the bar** wählen, **Run** drücken, eine Runde spielen. Dann das WLAN des Laptops ausschalten und noch einmal **Run** drücken: Wenn das klappt, klappt es auch am Tag.

5. **Editor bereitlegen.** Die Kinder ändern nur `src/regeln.ts`. **Show in Finder** in BusyHub öffnet den Ordner; ein Editor mit Farben für Code (zum Beispiel VS Code) macht Tippfehler leichter sichtbar.

6. **Zurücksetzen zwischen zwei Gruppen:**

   ```sh
   git restore apps/reaction-game/src/regeln.ts
   ```

   Die Einstellungen setzt **Defaults** im Settings-Bereich von BusyHub zurück.

Mitnehmen: Laptop mit Netzteil, BUSY Bar, USB-C-Kabel.

## Starten und bedienen

In BusyHub: **Reaktionsspiel** → **On the bar** → **Run**. BusyHub baut das Spiel, installiert es auf der Bar und startet es. Die Bar zeigt `DRUECK START`.

| Taste | Was passiert |
| --- | --- |
| **Start** (Start/Pause) | Startet eine Runde. Nach `LOS!` stoppt sie die Zeit. |
| **Zurück** | Beendet das Spiel. Gedrückt halten beendet jede App. |

Ablauf einer Runde: `WARTE` (gelb) → nach einer zufälligen Pause `LOS!` (ganzer Bildschirm grün) → Start drücken → Zeit und Lob, zum Beispiel `234 ms GUT`. Wer während `WARTE` drückt, sieht `ZU FRUEH` in einem roten Rahmen. Mit Start geht es in die nächste Runde.

Nach dem Beenden zeigt die Bar ihr Menü; dort startet **Start** das Spiel wieder. Nach einer Code-Änderung immer **Run** in BusyHub drücken, sonst läuft auf der Bar noch die alte Version.

Spielt auf der Bar, nicht **On this computer**: Dort misst das Spiel ungenauer (siehe unten).

## Zum Einstieg: Zustände

Bevor jemand etwas ändert, lohnt ein Blick auf den Ablauf. Das Spiel ist immer in genau einem **Zustand**, und jeder Zustand hat sein eigenes Bild:

```
DRUECK START ─Start─▶ WARTE ─Zeit um─▶ LOS! ─Start─▶ Ergebnis
                        │
                        └─Start─▶ ZU FRUEH

Ergebnis oder ZU FRUEH ─Start─▶ WARTE   (nächste Runde)
```

Dieselbe Taste macht je nach Zustand etwas anderes: In `WARTE` heisst Start «zu früh», in `LOS!` heisst Start «Zeit stoppen». Das ist die Programmieridee **Zustand**. Im Code steht sie in `src/main.ts` bei `type State`.

## Drei Änderungen für die Kinder

Jede Änderung: Datei ändern oder Einstellung speichern, **Run** drücken, ausprobieren.

### 1. Wartezeit verändern: Zufall

- **Ohne Code:** In BusyHub unter **Settings** die Werte *Wartezeit von* und *Wartezeit bis* ändern, **Save**, dann **Run**. Zum Beispiel 500 bis 1000 ms: Das Spiel wird hektisch.
- **Im Code:** In `src/regeln.ts` bei **MITMACHEN 2** die Zeile mit `return` durch `return 2000;` ersetzen. Jetzt kommt `LOS!` immer nach genau 2 Sekunden.
- **Frage an die Kinder:** Könnt ihr jetzt mogeln? (Ja: man zählt mit und drückt im richtigen Moment.)
- **Programmieridee: Zufall.** `Math.random()` liefert jedes Mal eine andere Zahl. Erst der Zufall macht das Spiel fair. Dazu kommt die **Variable**: `kuerzeste` und `laengste` sind Namen für Werte, die aus den Einstellungen kommen.

### 2. Farben ändern: Werte und Farbcodes

- **Ohne Code:** Unter **Settings** die Farben für WARTE, LOS! und ZU FRUEH wählen, **Save**, **Run**.
- **Zum Entdecken:** Der Farbwähler zeigt Codes wie `#3DDC84`. Das sind drei Zahlen hintereinander: Rot `3D`, Grün `DC`, Blau `84`, jeweils von `00` bis `FF`. Wer `#FF0000` eintippt, bekommt reines Rot.
- **Frage an die Kinder:** Was passiert, wenn LOS! und WARTE dieselbe Farbe haben? (Man erkennt den Unterschied trotzdem: am Wort, und weil LOS! den ganzen Bildschirm füllt. Gut für Menschen, die Farben schlecht unterscheiden.)
- **Programmieridee: Variable und Wert.** Das Programm fragt nur «welche Farbe hat WARTE?»; welcher Wert dahintersteckt, steht in den Einstellungen. Ein Wert ändern, das Programm bleibt gleich.

### 3. Eigene Nachrichten: Texte und Bedingung

- **Texte:** In `src/regeln.ts` bei **MITMACHEN 1** die Wörter ändern, zum Beispiel `"WARTE"` in `"PSST"` oder `"LOS!"` in `"JETZT!"`.
- **Lob:** Bei **MITMACHEN 3** die Grenzen (250, 400) oder die Wörter ändern. Oder ganz oben `if (millisekunden < 150) return "WOW";` einfügen. Danach dieselbe Zeile ganz unten probieren: Sie wirkt nie, weil vorher schon eine andere Zeile passt.
- **Fragen an die Kinder:** Wie schnell muss man für «BLITZ» sein? Wer schafft «WOW»?
- **Programmieridee: Bedingung.** `if` heisst «wenn»: Wenn die Zeit kleiner als 250 ist, dann «BLITZ». Die Reihenfolge der Bedingungen zählt.
- **Grenzen der Hardware:** Die Anzeige ist 72 Pixel breit; zu lange Wörter werden abgeschnitten, beim Lob passen etwa 5 Buchstaben. Die Schrift der Bar kennt keine Umlaute: `Ü` erscheint als Kästchen, deshalb `FRUEH`. Beides lässt sich gut ausprobieren und erklären.

## Wenn etwas nicht klappt

- **Run zeigt «Failed»:** Meist ein Tippfehler in `regeln.ts`, etwa ein fehlendes Anführungszeichen. Die rote Box nennt nur den Befehl; die Stelle steht weiter unten unter **Logs**, mit Datei, Zeile und einem Pfeil:

  ```
  [builtin:vite-transform] Unterminated string
      ╭─[ src/regeln.ts:19:11 ]
   19 │   warten: "WARTE,
  ```

  Das ist eine gute Gelegenheit zu zeigen, dass der Computer genau sagt, wo er nicht weiterweiss. Korrigieren und wieder **Run**, oder rückgängig machen (Cmd+Z) bzw. `git restore` wie oben. Auf der Bar bleibt so lange die letzte funktionierende Version installiert.
- **Die Bar zeigt noch das Alte:** Nach jeder Änderung **Run** drücken.
- **Die Bar zeigt ein Kästchen:** Ein Umlaut im Text. `UE`, `AE`, `OE` schreiben.
- **BusyHub findet die Bar nicht:** USB-Kabel prüfen; unter **Connection** muss `10.0.4.20` stehen.

## Wie genau ist die Zeit?

Die Uhr startet, wenn die Bar bestätigt, dass `LOS!` auf dem Bildschirm steht, und stoppt beim Herunterdrücken der Taste (nicht beim Loslassen).

- **Auf der Bar:** In vier Testrunden drückte ein Programm die Taste etwa 15 ms, nachdem `LOS!` im Bildspeicher der Bar stand. Das Spiel zeigte 12 bis 31 ms. Ein Teil davon ist der Weg des Testprogramms zur Taste; der Fehler des Spiels selbst bleibt also bei etwa 15 ms.
- **Auf dem Computer:** Die Bestätigung muss erst über USB zurück, die Uhr startet zu spät. Drücke etwa 60 ms nach `LOS!` zeigte das Spiel als 22 bis 48 ms an.
- **Nicht gemessen:** wie lange die LEDs nach dem Bildspeicher zum Leuchten brauchen und wie lange die Taste zum Erkennen braucht. Beides kommt noch etwas dazu.

Menschen reagieren in etwa 200 bis 300 ms. Die Unterschiede ändern nichts daran, wer schneller ist. Zeiten unter etwa 100 ms sind geraten, nicht reagiert: Das ist eine gute Frage für eine Erweiterung.

## Ideen für später

Noch nicht gebaut, nur notiert. Jede passt in dieselbe Struktur: neue Regeln in `regeln.ts`, neue Zustände in `main.ts`.

- **STOP-Falle:** Manchmal kommt statt `LOS!` ein rotes `STOP`, und wer dann drückt, verliert. Ein neuer Zustand plus eine Zufallsregel. Gut als nächster Schritt.
- **Mehrere Runden mit Punkten:** Fünf Runden, die beste Zeit oder ein Punktestand. Neu: eine Variable, die über Runden hinweg zählt.
- **Schwierigkeit über das Drehrad:** Das Drehrad stellt die Wartezeit ein, die Anzeige zeigt die Stufe.
- **Zu schnell ist geraten:** Zeiten unter 100 ms zählen als `ZU FRUEH`. Eine Bedingung mehr.
- **Codeknacker:** Ein eigenes Spiel als neue App: die Bar denkt sich eine Zahl, das Drehrad rät, die Bar antwortet «hoeher» oder «tiefer».

Eine neue App entsteht am einfachsten als Kopie dieses Ordners, mit neuer ID in `src/appmeta/manifest.json` und `package.json`. Was sich dabei wiederholt, etwa das Zeichnen mit festen Element-IDs oder das Filtern doppelter Tastendrücke, lohnt sich erst dann als gemeinsamer Baustein, wenn zwei Spiele es wirklich gleich brauchen.
