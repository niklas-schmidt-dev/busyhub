import type { BusyInputEvent, ButtonKey, RawInput } from './types.ts'

/** A held button turns into a long press after this long. */
export const LONG_PRESS_MS = 400
/** A long press repeats at this interval until the button is released. */
export const REPEAT_MS = 150

export interface Clock {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const systemClock: Clock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface Hold {
  long: boolean
  timer: unknown
}

/**
 * Turns plain presses and releases into the events the bar's JS runtime emits: press, then short or long (with repeats), then release.
 * Back never becomes long: on the bar a long Back force-quits the app, so apps only see short.
 */
export class InputSynth {
  readonly #emit: (event: BusyInputEvent) => void
  readonly #clock: Clock
  readonly #held = new Map<ButtonKey, Hold>()

  constructor(emit: (event: BusyInputEvent) => void, clock: Clock = systemClock) {
    this.#emit = emit
    this.#clock = clock
  }

  feed(raw: RawInput): void {
    if (raw.kind === 'encoder') {
      const steps = Math.abs(Math.trunc(raw.delta))
      const delta = raw.delta > 0 ? 1 : -1
      const action = delta === 1 ? 'clockwise' : 'counterclockwise'
      for (let i = 0; i < steps; i++) this.#emit({ key: 'encoder', action, delta })
      return
    }

    const key = raw.button
    if (raw.action === 'press') {
      if (this.#held.has(key)) return
      const hold: Hold = { long: false, timer: undefined }
      this.#held.set(key, hold)
      this.#emit({ key, action: 'press' })
      if (key !== 'back') {
        const repeat = () => {
          this.#emit({ key, action: 'repeat' })
          hold.timer = this.#clock.set(repeat, REPEAT_MS)
        }
        hold.timer = this.#clock.set(() => {
          hold.long = true
          this.#emit({ key, action: 'long' })
          hold.timer = this.#clock.set(repeat, REPEAT_MS)
        }, LONG_PRESS_MS)
      }
      return
    }

    const hold = this.#held.get(key)
    if (!hold) return
    this.#held.delete(key)
    this.#clock.clear(hold.timer)
    if (!hold.long) this.#emit({ key, action: 'short' })
    this.#emit({ key, action: 'release' })
  }

  /** Forgets held buttons without emitting anything, e.g. when the app that listened is gone. */
  reset(): void {
    for (const hold of this.#held.values()) this.#clock.clear(hold.timer)
    this.#held.clear()
  }
}
