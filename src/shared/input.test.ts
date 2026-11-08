import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { InputSynth, LONG_PRESS_MS, REPEAT_MS, type Clock } from './input.ts'
import type { BusyInputEvent } from './types.ts'

/** A clock that only moves when the test advances it. */
function fakeClock() {
  let now = 0
  let next = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const clock: Clock = {
    set(fn, ms) {
      const id = next++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clear(handle) {
      timers.delete(handle as number)
    },
  }
  const advance = (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = until
  }
  return { clock, advance }
}

function setup() {
  const events: BusyInputEvent[] = []
  const { clock, advance } = fakeClock()
  const synth = new InputSynth((e) => events.push(e), clock)
  return { events, synth, advance }
}

const actions = (events: BusyInputEvent[]) => events.map((e) => `${e.key}:${e.action}`)

test('a quick press is press, short, release', () => {
  const { events, synth, advance } = setup()
  synth.feed({ kind: 'button', button: 'ok', action: 'press' })
  advance(LONG_PRESS_MS - 1)
  synth.feed({ kind: 'button', button: 'ok', action: 'release' })
  assert.deepEqual(actions(events), ['ok:press', 'ok:short', 'ok:release'])
})

test('a held press turns long and repeats until released', () => {
  const { events, synth, advance } = setup()
  synth.feed({ kind: 'button', button: 'start', action: 'press' })
  advance(LONG_PRESS_MS + REPEAT_MS * 2)
  synth.feed({ kind: 'button', button: 'start', action: 'release' })
  advance(REPEAT_MS * 5)
  assert.deepEqual(actions(events), ['start:press', 'start:long', 'start:repeat', 'start:repeat', 'start:release'])
})

test('back is never long, so apps never see the force-quit gesture', () => {
  const { events, synth, advance } = setup()
  synth.feed({ kind: 'button', button: 'back', action: 'press' })
  advance(LONG_PRESS_MS * 3)
  synth.feed({ kind: 'button', button: 'back', action: 'release' })
  assert.deepEqual(actions(events), ['back:press', 'back:short', 'back:release'])
})

test('a wheel step of several clicks becomes one event per click', () => {
  const { events, synth } = setup()
  synth.feed({ kind: 'encoder', delta: -3 })
  synth.feed({ kind: 'encoder', delta: 1 })
  assert.deepEqual(
    events.map((e) => (e.key === 'encoder' ? e.delta : 0)),
    [-1, -1, -1, 1],
  )
  assert.equal(events[0]?.action, 'counterclockwise')
})

test('a release without a press and a second press while held are ignored', () => {
  const { events, synth } = setup()
  synth.feed({ kind: 'button', button: 'ok', action: 'release' })
  synth.feed({ kind: 'button', button: 'ok', action: 'press' })
  synth.feed({ kind: 'button', button: 'ok', action: 'press' })
  assert.deepEqual(actions(events), ['ok:press'])
})
