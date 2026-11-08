import { device } from "@shared/device";
import type { RectangleElement } from "@busy-app/busy-lib";
import manifest from "./appmeta/manifest.json";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

const WIDTH = 72;
const HEIGHT = 16;
const SIZE = 6;
/** About 8 frames a second: smooth enough, and each frame is one HTTP request. */
const FRAME_MS = 125;
const TRAIL = 3;
const COLORS = ["#FF5A4F", "#FFB03B", "#3DDC84", "#4FC3F7", "#B388FF", "#FFFFFF"];

/** #RRGGBB or #RRGGBBAA as #RRGGBBAA with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  const rgb = /^#[0-9a-fA-F]{6}/.test(color) ? color.slice(0, 7) : COLORS[0];
  return `${rgb}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`.toUpperCase();
}

interface Point {
  x: number;
  y: number;
}

function ball(id: string, at: Point, color: string): RectangleElement {
  return {
    id,
    type: "rectangle",
    x: Math.round(at.x),
    y: Math.round(at.y),
    align: "top_left",
    width: SIZE,
    height: SIZE,
    radius: SIZE / 2,
    fill: "solid",
    fill_colors: [color],
  };
}

async function loadSettings(): Promise<{ color: string; speed: number }> {
  try {
    const { values } = await device.AppsSettingsGet({ app_id: APP });
    return {
      color: typeof values.color === "string" ? values.color : COLORS[0],
      speed: typeof values.speed === "number" ? values.speed : 2,
    };
  } catch {
    return { color: COLORS[0], speed: 2 };
  }
}

/** Wheel: speed. OK: next color. Start: pause. Back: quit. */
function main(): void {
  let color = COLORS[0];
  let speed = 2;
  let paused = false;
  let stopped = false;
  let drawing = false;
  const pos: Point = { x: 4, y: 3 };
  const dir = { x: 1, y: 0.6 };
  const trail: Point[] = [];

  const report = (err: unknown) =>
    console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

  const step = () => {
    trail.unshift({ ...pos });
    trail.length = Math.min(trail.length, TRAIL);
    pos.x += dir.x * speed;
    pos.y += dir.y * speed;
    if (pos.x <= 0 || pos.x >= WIDTH - SIZE) {
      dir.x = -dir.x;
      pos.x = Math.max(0, Math.min(WIDTH - SIZE, pos.x));
    }
    if (pos.y <= 0 || pos.y >= HEIGHT - SIZE) {
      dir.y = -dir.y;
      pos.y = Math.max(0, Math.min(HEIGHT - SIZE, pos.y));
    }
  };

  // A frame is skipped while the previous one is still on its way, so a slow link never builds a backlog.
  const draw = () => {
    if (drawing || stopped) return;
    drawing = true;
    const elements = [
      ...trail.map((at, i) => ball(`trail${i}`, at, withAlpha(color, 0.45 - i * 0.13))),
      ball("ball", pos, withAlpha(color, 1)),
    ];
    device
      .DisplayDraw({ application_name: APP, priority: 50, elements })
      .catch(report)
      .finally(() => {
        drawing = false;
      });
  };

  void loadSettings().then((settings) => {
    color = settings.color;
    speed = settings.speed;
  });

  const timer = setInterval(() => {
    if (paused) return;
    step();
    draw();
  }, FRAME_MS);

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      speed = Math.max(1, Math.min(5, speed + event.delta));
    } else if (event.key === "ok" && event.action === "short") {
      const next = (COLORS.indexOf(color.slice(0, 7).toUpperCase()) + 1) % COLORS.length;
      color = COLORS[next];
      draw();
    } else if (event.key === "start" && event.action === "short") {
      paused = !paused;
    } else if (event.key === "back" && event.action === "short") {
      stopped = true;
      clearInterval(timer);
      setTimeout(unbind, 0);
    }
  });
}

main();
