import { device } from "@shared/device";
import { column, render, type Node } from "@busy-app/busy-lib";
import manifest from "./appmeta/manifest.json";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

const WHITE = "#FFFFFFFF";
const SUBTLE_WHITE = "#FFFFFF80";
const COUNT_KEY = "count";

/** The screen is 72×16, so two short lines are about all that fits. */
function frame(title: string, count: number): Node {
  return column({ justify: "center", align: "center", gap: 2 }, [
    { type: "text", id: "title", text: title, font: "bold", color: WHITE },
    { type: "text", id: "count", text: String(count), font: "small", color: SUBTLE_WHITE },
  ]);
}

/** The title setting, or the app name while it is empty or unreadable. */
async function loadTitle(): Promise<string> {
  try {
    const { values } = await device.AppsSettingsGet({ app_id: APP });
    return typeof values.title === "string" && values.title ? values.title : manifest.name;
  } catch {
    return manifest.name;
  }
}

/**
 * Entry point, called at the end of the file: the device runs this script from top to bottom and starts nothing by itself.
 * Wheel: count up or down. OK: reset. Back: quit.
 */
function main(): void {
  let count = Number(localStorage.getItem(COUNT_KEY)) || 0;
  let title = manifest.name;
  let stopped = false;
  let drawing = false;
  let dirty = false;

  const report = (err: unknown) =>
    console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);

  // One request at a time: turning the wheel fast must not queue up draws.
  const draw = (): void => {
    if (stopped) return;
    if (drawing) {
      dirty = true;
      return;
    }
    drawing = true;
    device
      .DisplayDraw({ application_name: APP, priority: 50, elements: render(frame(title, count)) })
      .catch(report)
      .finally(() => {
        drawing = false;
        if (dirty) {
          dirty = false;
          draw();
        }
      });
  };

  draw();
  void loadTitle().then((loaded) => {
    title = loaded;
    draw();
  });

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      count += event.delta;
      draw();
    } else if (event.key === "ok" && event.action === "short") {
      count = 0;
      draw();
    } else if (event.key === "back" && event.action === "short") {
      stopped = true;
      // localStorage rewrites everything it holds, so it is written once, on the way out.
      localStorage.setItem(COUNT_KEY, String(count));
      // Not detached from inside the handler itself: with nothing else left the unbind stops the app on the spot.
      setTimeout(unbind, 0);
    }
  });
}

main();
