import { Display, LocalStateStream, ScreenRenderer, type ProcessedFrame } from '@busy-app/busy-lib'
import { useEffect, useRef, useState, type WheelEvent } from 'react'
import { cn } from 'cn'
import type { ButtonKey, RawInput } from '../../../../shared/types.ts'

const FRONT = { width: 72, height: 16 }
const BACK = { width: 160, height: 80 }
/** Wheel ticks on the preview are batched so a trackpad flick does not fire hundreds of steps. */
const WHEEL_STEP_PX = 40

// Protobuf leaves default values out, so a missing button is OK (0) and a missing action is a press (0).
const BUTTONS: Record<number, ButtonKey> = { 0: 'ok', 1: 'back', 2: 'start' }

interface StreamInput {
  buttonEvent?: { button?: number | null; action?: number | null } | null
  encoderEvent?: { delta?: number | null } | null
}

function toRaw(input: StreamInput): RawInput | null {
  if (input.encoderEvent) {
    const delta = input.encoderEvent.delta ?? 0
    return delta ? { kind: 'encoder', delta } : null
  }
  if (input.buttonEvent) {
    const button = BUTTONS[input.buttonEvent.button ?? 0]
    if (!button) return null
    return { kind: 'button', button, action: (input.buttonEvent.action ?? 0) === 1 ? 'release' : 'press' }
  }
  return null
}

export type StreamState = 'off' | 'connecting' | 'live' | 'error'

/**
 * Mirrors the bar's two screens from its state stream and forwards the bar's own button and wheel input to runs on this computer.
 * The stream runs only while the bar is online; the password stays in the main process until the stream asks for it.
 */
export function BarScreens({
  online,
  onStreamState,
}: {
  online: boolean
  onStreamState: (state: StreamState, reason?: string) => void
}) {
  const front = useRef<HTMLCanvasElement>(null)
  const back = useRef<HTMLCanvasElement>(null)
  const wheel = useRef(0)
  const [hasFrame, setHasFrame] = useState(false)
  const report = useRef(onStreamState)
  report.current = onStreamState

  useEffect(() => {
    if (!online) {
      report.current('off')
      return
    }
    let stream: LocalStateStream | null = null
    let cancelled = false
    report.current('connecting')

    const draw = (frame: ProcessedFrame) => {
      if (!frame.data) return
      const width = frame.width ?? 0
      const height = frame.height ?? 0
      // Screen is left out for the front display, protobuf's default.
      if ((frame.screen ?? 0) === 0 && front.current) {
        ScreenRenderer.renderFrame(Display.FRONT, { canvas: front.current, data: frame.data, width, height })
        setHasFrame(true)
      } else if (back.current && width === BACK.width && height === BACK.height) {
        const ctx = back.current.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.data), width, height), 0, 0)
      }
    }

    void window.hub.streamConfig().then(async ({ addr, password }) => {
      if (cancelled) return
      stream = new LocalStateStream({ addr, ...(password ? { HTTPAccessPassword: password } : {}) })
      try {
        await stream.start({
          dataCallback: (state) => {
            for (const update of state.updates ?? []) {
              if (update.frame) draw(update.frame)
              const raw = update.input ? toRaw(update.input) : null
              if (raw) window.hub.input(raw)
            }
          },
          errorCallback: (err) => report.current('error', err.message),
        })
        if (!cancelled) report.current('live')
      } catch (err) {
        if (!cancelled) report.current('error', err instanceof Error ? err.message : String(err))
      }
    })

    return () => {
      cancelled = true
      void stream?.stop().catch(() => undefined)
    }
  }, [online])

  // Scrolling over the front screen turns the wheel, like the bar's encoder.
  const onWheel = (event: WheelEvent) => {
    wheel.current += event.deltaY
    while (Math.abs(wheel.current) >= WHEEL_STEP_PX) {
      const delta = wheel.current > 0 ? 1 : -1
      wheel.current -= delta * WHEEL_STEP_PX
      window.hub.input({ kind: 'encoder', delta })
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-4">
      <figure className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          onWheel={onWheel}
          className="relative isolate aspect-[72/16] w-full min-w-64 overflow-hidden rounded-lg bg-black shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
        >
          {/* The unlit LED grid, purely decorative. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none [background-image:radial-gradient(circle,rgb(255_255_255/0.07)_32%,transparent_36%)] [background-size:calc(100%/72)_calc(100%/16)]"
          />
          <canvas
            ref={front}
            width={FRONT.width * 8}
            height={FRONT.height * 8}
            aria-label="Front screen of the bar"
            className={cn('relative size-full', !hasFrame && 'opacity-0')}
          />
        </div>
        <figcaption className="text-xs text-muted-foreground">Front · 72×16 RGB · scroll to turn the wheel</figcaption>
      </figure>
      <figure className="flex w-40 shrink-0 flex-col gap-1.5">
        <canvas
          ref={back}
          width={BACK.width}
          height={BACK.height}
          aria-label="Back screen of the bar"
          className="aspect-[2/1] w-full rounded-lg bg-black [image-rendering:pixelated] shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
        />
        <figcaption className="text-xs text-muted-foreground">Back · 160×80</figcaption>
      </figure>
    </div>
  )
}
