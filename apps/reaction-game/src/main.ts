import { device } from "@shared/device";
import type { RectangleElement, TextElement } from "@busy-app/busy-lib";
import manifest from "./appmeta/manifest.json";
import schema from "./appmeta/settings.json";
// The rules kids change: texts, the random wait and the praise. Everything below runs the game.
import { TEXTE, lob, wartezeit } from "./regeln";

/** The name the app draws under; the bar removes everything drawn under it when the app quits. */
const APP = manifest.id;

/** The Start/Pause button starts a round and is the one to hit after LOS!. */
const REACTION_KEY = "start";
/** A second press within this time is the same press arriving twice, not a new one. */
const DOUBLE_PRESS_MS = 100;
/** A result stays at least this long once it is on screen, so a quick extra press doesn't skip it. */
const RESULT_PAUSE_MS = 600;

const WIDTH = 72;
const HEIGHT = 16;
const WHITE = "#FFFFFFFF";
const BLACK = "#000000FF";
const NONE = "#00000000";

// ─── Settings ────────────────────────────────────────────────────────────────

interface Settings {
  waitMin: number;
  waitMax: number;
  colorWait: string;
  colorGo: string;
  colorEarly: string;
}

/** A #RRGGBB setting as the #RRGGBBAA the display takes. */
function opaque(color: unknown, fallback: string): string {
  const rgb = typeof color === "string" && /^#[0-9a-fA-F]{6}/.test(color) ? color.slice(0, 7) : fallback;
  return `${rgb}FF`.toUpperCase();
}

const DEFAULTS: Settings = {
  waitMin: schema.fields.wait_min.default,
  waitMax: schema.fields.wait_max.default,
  colorWait: opaque(null, schema.fields.color_wait.default),
  colorGo: opaque(null, schema.fields.color_go.default),
  colorEarly: opaque(null, schema.fields.color_early.default),
};

async function loadSettings(): Promise<Settings> {
  try {
    const { values } = await device.AppsSettingsGet({ app_id: APP });
    const ms = (value: unknown, fallback: number) => (typeof value === "number" && value >= 0 ? value : fallback);
    const a = ms(values.wait_min, DEFAULTS.waitMin);
    const b = ms(values.wait_max, DEFAULTS.waitMax);
    return {
      // Limits entered the wrong way round still make a range.
      waitMin: Math.min(a, b),
      waitMax: Math.max(a, b),
      colorWait: opaque(values.color_wait, DEFAULTS.colorWait.slice(0, 7)),
      colorGo: opaque(values.color_go, DEFAULTS.colorGo.slice(0, 7)),
      colorEarly: opaque(values.color_early, DEFAULTS.colorEarly.slice(0, 7)),
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── Screens: what the 72×16 front display shows in each state ───────────────

/**
 * Every screen is the same three elements. The bar keeps an element until one with the same id is drawn again,
 * so a screen that left one out would show the previous screen's.
 * Color is never the only signal: each state has its own word, LOS! fills the screen, ZU FRUEH gets a frame.
 */
type Screen = [RectangleElement, TextElement, TextElement];

function background(fill: string, frame: string): RectangleElement {
  return {
    id: "background",
    type: "rectangle",
    x: 0,
    y: 0,
    align: "top_left",
    width: WIDTH,
    height: HEIGHT,
    fill: "solid",
    fill_colors: [fill],
    border_width: 1,
    border_color: frame,
  };
}

function label(id: string, text: string, font: TextElement["font"], color: string, x: number, align: TextElement["align"]): TextElement {
  return { id, type: "text", text, font, color, x, y: HEIGHT / 2, align };
}

const centered = (text: string, font: TextElement["font"], color: string): Screen => [
  background(NONE, NONE),
  label("main", text, font, color, WIDTH / 2, "center"),
  label("note", "", "small", NONE, 0, "mid_left"),
];

const readyScreen = (): Screen => centered(TEXTE.start, "normal", WHITE);

const waitingScreen = (s: Settings): Screen => centered(TEXTE.warten, "bold", s.colorWait);

const goScreen = (s: Settings): Screen => [
  background(s.colorGo, s.colorGo),
  label("main", TEXTE.los, "extra_large", BLACK, WIDTH / 2, "center"),
  label("note", "", "small", NONE, 0, "mid_left"),
];

const earlyScreen = (s: Settings): Screen => [
  background(NONE, s.colorEarly),
  label("main", TEXTE.zuFrueh, "bold", s.colorEarly, WIDTH / 2, "center"),
  label("note", "", "small", NONE, 0, "mid_left"),
];

/** The time ends at the same spot every round, the praise starts right of it. */
const resultScreen = (s: Settings, ms: number): Screen => [
  background(NONE, NONE),
  label("main", `${ms} ms`, "normal", WHITE, 42, "mid_right"),
  label("note", lob(ms), "small", s.colorGo, 46, "mid_left"),
];

// ─── Drawing ─────────────────────────────────────────────────────────────────

/**
 * Sends one screen at a time, in order. A screen asked for while another is on its way waits, and a newer one replaces it.
 * onDone runs once the bar has answered for the screen, with ok false if it refused it; never for a screen that was
 * replaced before it was sent.
 */
function createDisplay(report: (err: unknown) => void) {
  let sending = false;
  let stopped = false;
  let next: { screen: Screen; onDone?: (ok: boolean) => void } | null = null;

  const flush = (): void => {
    if (sending || stopped || !next) return;
    const { screen, onDone } = next;
    next = null;
    sending = true;
    device
      .DisplayDraw({ application_name: APP, priority: 50, elements: screen })
      .then(
        () => {
          if (!stopped) onDone?.(true);
        },
        (err: unknown) => {
          report(err);
          if (!stopped) onDone?.(false);
        },
      )
      .finally(() => {
        sending = false;
        flush();
      });
  };

  return {
    show(screen: Screen, onDone?: (ok: boolean) => void): void {
      next = { screen, onDone };
      flush();
    },
    stop(): void {
      stopped = true;
      next = null;
    },
  };
}

// ─── Game ────────────────────────────────────────────────────────────────────

/**
 * ready → waiting → go → result, or waiting → early when Start comes before LOS!.
 * From ready, result and early, Start begins the next round. Back quits from anywhere.
 */
type State = "ready" | "waiting" | "go" | "result" | "early";

function main(): void {
  let settings = DEFAULTS;
  let state: State = "ready";
  /** Counts rounds, so a timer or a draw from an earlier round can tell it is stale. */
  let round = 0;
  let goTimer: ReturnType<typeof setTimeout> | undefined;
  let goAt = 0;
  let ignoreUntil = 0;
  let stopped = false;

  const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);
  const display = createDisplay(report);

  const cancelGo = (): void => {
    clearTimeout(goTimer);
    goTimer = undefined;
  };

  const startRound = (): void => {
    cancelGo();
    round += 1;
    const thisRound = round;
    state = "waiting";
    display.show(waitingScreen(settings));
    goTimer = setTimeout(() => {
      goTimer = undefined;
      if (round !== thisRound || state !== "waiting") return;
      display.show(goScreen(settings), (ok) => {
        // The clock starts once the bar has LOS! on screen; until then a press is too early.
        if (!ok || round !== thisRound || state !== "waiting") return;
        state = "go";
        goAt = Date.now();
      });
    }, wartezeit(settings.waitMin, settings.waitMax));
  };

  // Presses wait until the result is on screen, then a little longer, so a slow draw can't cut it short.
  const showResult = (screen: Screen): void => {
    ignoreUntil = Infinity;
    display.show(screen, () => {
      ignoreUntil = Date.now() + RESULT_PAUSE_MS;
    });
  };

  const press = (at: number): void => {
    if (at < ignoreUntil) return;
    ignoreUntil = at + DOUBLE_PRESS_MS;
    switch (state) {
      case "waiting":
        cancelGo();
        state = "early";
        showResult(earlyScreen(settings));
        break;
      case "go":
        state = "result";
        showResult(resultScreen(settings, at - goAt));
        break;
      default:
        startRound();
    }
  };

  const quit = (): void => {
    stopped = true;
    cancelGo();
    display.stop();
    // Not from inside the handler itself: removing the last listener stops the app on the spot.
    setTimeout(unbind, 0);
  };

  // ─── Input ─────────────────────────────────────────────────────────────────

  const unbind = listen("input", (event) => {
    // Read the clock first: the reaction ends when the button goes down.
    const at = Date.now();
    if (stopped) return;
    // Only "press" counts. Holding the button sends "long" and "repeat", letting go sends "release": none start anything.
    if (event.key === REACTION_KEY && event.action === "press") press(at);
    else if (event.key === "back" && event.action === "short") quit();
  });

  display.show(readyScreen());
  void loadSettings().then((loaded) => {
    settings = loaded;
  });
}

main();
