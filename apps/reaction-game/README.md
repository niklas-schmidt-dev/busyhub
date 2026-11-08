# Reaktionsspiel

A reaction game in German, made to change together with kids who have never programmed. Press Start, wait while the bar says WARTE, and hit Start again the moment LOS! appears. The bar shows your time and a word of praise. Press too early and it says ZU FRUEH.

| Control | Does |
| --- | --- |
| Start | Starts a round; after LOS!, stops the clock |
| Back | Quit |

| Screen | Means |
| --- | --- |
| `DRUECK START` | Ready for a round |
| `WARTE` | Wait. Pressing now is too early |
| `LOS!` on a green screen | Press Start now |
| `234 ms BLITZ` | Your time and the praise |
| `ZU FRUEH` in a red frame | You pressed before LOS! |

Each state has its own word, and LOS! and ZU FRUEH also differ in shape (filled screen, frame), so color is never the only clue. The bar's fonts have no umlauts, hence FRUEH.

The back display is for whoever runs the game, since the players face the front: it counts down to LOS! in tenths of a second and shows the wait chance picked, then the result in milliseconds, or how many seconds too early Start was pressed.

**Settings:** the shortest and longest wait in milliseconds, and the colors of WARTE, LOS! and ZU FRUEH.

## Change it

[`src/regeln.ts`](src/regeln.ts) holds the rules to change with kids: the texts, the random wait and the praise. They are three marked spots (MITMACHEN 1 to 3), commented in German. [`src/main.ts`](src/main.ts) runs the game: settings, screens, drawing, the game's state and the buttons, in that order.

[ANLEITUNG.md](ANLEITUNG.md) is a guide in German for running it with a group: preparation, controls, the three changes and the programming idea behind each.

## How exact is the time?

The clock starts when the bar confirms that LOS! is on its screen and stops when Start goes down (the press, not the release). Reading the clock is the first thing the button handler does, in whole milliseconds.

- **On the bar** the confirmation and the button stay on the device. In five test rounds a program pressed Start over the bar's API 12 to 15 ms after it saw LOS! in the bar's screen buffer; the game showed 12 to 35 ms. The program only looks at the screen every 20 to 30 ms, so this shows the game is right to within a few tens of milliseconds, not more exactly.
- **On this computer** the confirmation travels back to the computer first, so the clock starts late. Presses about 60 ms after LOS! showed as 22 to 48 ms. It works, but play on the bar.
- Not measured: how long the LEDs take to light after the screen buffer changes, and how long the button takes to register. Both add a little.

People react in roughly 200 to 300 ms, so these differences don't change who wins. Compare times from the same mode only.

A press that arrives twice within 100 ms counts once, holding Start never starts a round, and a result stays at least 0.6 s, so a quick extra press can't skip it.

Runs on the bar or on your computer.
