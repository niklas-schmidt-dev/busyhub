import { device } from "@shared/device";
import { column, render, row, stack, type Node } from "@busy-app/busy-lib";
import manifest from "./appmeta/manifest.json";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

const WIDTH = 72;
const WHITE = "#FFFFFFFF";
const DIM = "#FFFFFF66";
const TRACK = "#FFFFFF26";
const OK = "#3DDC84FF";
const WARN = "#FFB03BFF";
const OVER = "#FF5A4FFF";
const LAST_KEY = "last";

interface Settings {
  url: string;
  token: string;
  field: string;
  label: string;
  budget: number;
  symbol: string;
  refreshMs: number;
}

type Reading =
  | { kind: "loading" }
  | { kind: "value"; amount: number }
  | { kind: "setup" }
  | { kind: "error"; message: string };

const str = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: number) => (typeof value === "number" && value > 0 ? value : fallback);

async function loadSettings(): Promise<Settings> {
  const { values } = await device.AppsSettingsGet({ app_id: APP });
  const source = (values.source ?? {}) as Record<string, unknown>;
  return {
    url: str(source.url, "").trim(),
    token: str(source.token, "").trim(),
    field: str(source.field, "total").trim(),
    label: str(values.label, "AI").slice(0, 6),
    budget: num(values.budget, 50),
    symbol: values.currency === "eur" ? "EUR " : "$",
    refreshMs: num(values.refresh_minutes, 5) * 60_000,
  };
}

/** Reads `a.b.0.c` out of parsed JSON; numbers in strings count too. */
function pick(data: unknown, path: string): number | null {
  let at: unknown = data;
  for (const key of path.split(".").filter(Boolean)) {
    if (typeof at !== "object" || at === null) return null;
    at = (at as Record<string, unknown>)[key];
  }
  const value = typeof at === "string" ? Number(at) : at;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function read(settings: Settings): Promise<Reading> {
  if (!settings.url) return { kind: "setup" };
  const res = await fetch(settings.url, {
    headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : {},
  });
  if (!res.ok) return { kind: "error", message: `HTTP ${res.status}` };
  const amount = pick(await res.json(), settings.field);
  return amount === null ? { kind: "error", message: "NO VALUE" } : { kind: "value", amount };
}

function money(amount: number, symbol: string): string {
  return `${symbol}${amount >= 1000 ? Math.round(amount) : amount.toFixed(2)}`;
}

function frame(settings: Settings, reading: Reading, last: number | null): Node {
  if (reading.kind === "setup") {
    return column({ justify: "center", align: "center", gap: 2 }, [
      { type: "text", id: "title", text: "SPEND METER", font: "bold", color: WHITE },
      { type: "text", id: "hint", text: "set a URL", font: "small", color: DIM },
    ]);
  }
  // While loading or after an error, the last good amount stays up.
  const amount = reading.kind === "value" ? reading.amount : last;
  const ratio = amount === null ? 0 : amount / settings.budget;
  const color = ratio >= 1 ? OVER : ratio >= 0.8 ? WARN : OK;
  const filled = Math.max(amount === null ? 0 : 1, Math.min(WIDTH, Math.round(ratio * WIDTH)));
  const detail =
    reading.kind === "error"
      ? reading.message
      : reading.kind === "loading"
        ? "..."
        : `of ${money(settings.budget, settings.symbol)}`;

  return column({ justify: "center", gap: 3, width: WIDTH }, [
    row({ gap: 3, align: "end", padding: { left: 1, right: 1 } }, [
      { type: "text", id: "label", text: settings.label, font: "small", color: DIM },
      { type: "text", id: "amount", text: amount === null ? "--" : money(amount, settings.symbol), font: "bold", color },
      { type: "text", id: "detail", text: detail, font: "small", color: reading.kind === "error" ? OVER : DIM },
    ]),
    // The budget as a 72-pixel bar: the track, and the spent part over it.
    stack({ width: WIDTH, height: 2, justify: "start", align: "start" }, [
      { type: "rectangle", id: "track", width: WIDTH, height: 2, fill: "solid", fill_colors: [TRACK] },
      { type: "rectangle", id: "bar", width: filled, height: 2, fill: "solid", fill_colors: [color] },
    ]),
  ]);
}

/** OK: refresh now. Back: quit. */
function main(): void {
  let settings: Settings | null = null;
  let reading: Reading = { kind: "loading" };
  let last: number | null = Number(localStorage.getItem(LAST_KEY)) || null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let loading = false;

  const report = (err: unknown) =>
    console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

  const draw = () => {
    if (stopped || !settings) return;
    const elements = render(frame(settings, reading, last));
    // A blinking status LED once the budget is used up.
    const over = reading.kind === "value" && reading.amount >= settings.budget;
    device
      .DisplayDraw({
        application_name: APP,
        priority: 50,
        elements,
        ...(over ? { led_notification_color: OVER } : {}),
      })
      .catch(report);
  };

  const refresh = async () => {
    if (!settings || loading) return;
    loading = true;
    try {
      reading = await read(settings);
      if (reading.kind === "value" && reading.amount !== last) {
        last = reading.amount;
        localStorage.setItem(LAST_KEY, String(last));
      }
    } catch (err) {
      reading = { kind: "error", message: "OFFLINE" };
      report(err);
    } finally {
      loading = false;
      draw();
    }
  };

  void loadSettings()
    .then((loaded) => {
      settings = loaded;
      if (!loaded.url) reading = { kind: "setup" };
      draw();
      void refresh();
      if (!stopped) timer = setInterval(() => void refresh(), loaded.refreshMs);
    })
    .catch(report);

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "ok" && event.action === "short") {
      void refresh();
    } else if (event.key === "back" && event.action === "short") {
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      setTimeout(unbind, 0);
    }
  });
}

main();
