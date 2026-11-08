// Die Regeln des Reaktionsspiels. Hier darfst du ändern und ausprobieren!
//
// So geht's: Ändere eine Stelle, speichere die Datei und drücke in BusyHub auf «Run».
// BusyHub baut das Spiel neu und schickt es auf die BUSY Bar. Dann gleich ausprobieren.
//
// Farben und Wartezeiten stellst du in BusyHub bei «Settings» ein, ganz ohne Code.

// ───────────────────────────────────────────────────────────────────────────
// MITMACHEN 1: Texte (Variablen)
//
// Eine Variable ist ein Name für einen Wert. TEXTE.warten ist zum Beispiel "WARTE".
// Ändere die Wörter zwischen den Anführungszeichen, zum Beispiel "WARTE" in "PSST".
//
// Achtung: Die Anzeige ist nur 72 Pixel breit. Zu lange Wörter werden abgeschnitten.
// Und die Bar kennt keine Umlaute: Schreibe UE statt Ü, AE statt Ä, OE statt Ö.
// ───────────────────────────────────────────────────────────────────────────
export const TEXTE = {
  start: "DRUECK START",
  warten: "WARTE",
  los: "LOS!",
  zuFrueh: "ZU FRUEH",
};

// ───────────────────────────────────────────────────────────────────────────
// MITMACHEN 2: Zufall
//
// So lange zeigt die Bar «WARTE», bevor «LOS!» kommt. Die Zeit ist in Millisekunden:
// 1000 ms sind 1 Sekunde.
//
// Math.random() ist eine Zufallszahl zwischen 0 und 1. Deshalb ist die Wartezeit
// jedes Mal anders, irgendwo zwischen «kuerzeste» und «laengste».
//
// Probiere: Ersetze die Zeile mit «return» durch   return 2000;
// Jetzt wartet die Bar immer genau 2 Sekunden. Kannst du jetzt mogeln?
// ───────────────────────────────────────────────────────────────────────────
export function wartezeit(kuerzeste: number, laengste: number): number {
  return kuerzeste + Math.random() * (laengste - kuerzeste);
}

// ───────────────────────────────────────────────────────────────────────────
// MITMACHEN 3: Bedingung (wenn … dann …)
//
// Nach jeder Runde zeigt die Bar ein Lob neben deiner Zeit.
// «if» heisst «wenn»: Wenn die Zeit kleiner als 250 ms ist, dann gibt es «BLITZ».
// Die Bar prüft die Zeilen von oben nach unten und nimmt die erste, die passt.
//
// Ändere die Grenzen (250, 400) oder die Wörter. Oder füge ganz oben eine Zeile dazu:
//   if (millisekunden < 150) return "WOW";
// Warum ganz oben? Probiere es auch einmal ganz unten aus.
// Höchstens 5 Buchstaben, sonst passt das Lob nicht mehr auf die Anzeige.
// ───────────────────────────────────────────────────────────────────────────
export function lob(millisekunden: number): string {
  if (millisekunden < 250) return "BLITZ";
  if (millisekunden < 400) return "GUT";
  return "OK";
}
