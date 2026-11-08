import { Display, LocalStateStream, ScreenRenderer, convertL4toRGBA, type ProcessedFrame } from '@busy-app/busy-lib'
import { useEffect, useRef, useState, type WheelEvent } from 'react'
import { cn } from 'cn'
import type { ButtonKey, RawInput } from '../../../../shared/types.ts'

const FRONT = { width: 72, height: 16 }
const BACK = { width: 160, height: 80 }
/** The back screen as /api/screen sends it: 4-bit gray, two pixels per byte. */
const BACK_BYTES = (BACK.width * BACK.height) / 2
/** The state stream carries only the front screen, so the back is fetched this often while the window is visible. */
const BACK_POLL_MS = 200
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
 * Mirrors the bar's two screens and forwards the bar's own button and wheel input to runs on this computer.
 * The front and the input come from the bar's state stream, the back from polling /api/screen (firmware 1.3.1 streams
 * only the front). Both run only while the bar is online; the password stays in the main process until they ask for it.
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
    const polling = new AbortController()
    report.current('connecting')

    const draw = (frame: ProcessedFrame) => {
      if (!frame.data) return
      // Screen is left out for the front display, protobuf's default.
      if ((frame.screen ?? 0) === 0 && front.current) {
        ScreenRenderer.renderFrame(Display.FRONT, { canvas: front.current, data: frame.data, width: frame.width ?? 0, height: frame.height ?? 0 })
        setHasFrame(true)
      }
    }

    // Firmware 1.3.1 sends the pixels base64-encoded although it says image/bmp; raw bytes are taken as they are.
    const drawBack = (body: Uint8Array) => {
      const ctx = back.current?.getContext('2d')
      if (!ctx) return
      const packed = body.length === BACK_BYTES ? body : Uint8Array.from(atob(new TextDecoder().decode(body).trim()), (c) => c.charCodeAt(0))
      if (packed.length !== BACK_BYTES) return
      const rgba = new Uint8ClampedArray(convertL4toRGBA(packed, BACK.width, BACK.height))
      ctx.putImageData(new ImageData(rgba, BACK.width, BACK.height), 0, 0)
    }

    // One request at a time, and none while the window is hidden: the bar answers requests one after another.
    const pollBack = async (origin: string, password: string | null) => {
      const url = new URL('/api/screen?display=1', origin)
      const headers: Record<string, string> = password ? { 'X-API-Token': password } : {}
      while (!cancelled) {
        if (document.visibilityState === 'visible') {
          try {
            const res = await fetch(url, { headers, signal: polling.signal })
            if (res.ok) drawBack(new Uint8Array(await res.arrayBuffer()))
          } catch {
            // A missed frame is fine; the next poll draws the screen again.
          }
        }
        await new Promise((resolve) => setTimeout(resolve, BACK_POLL_MS))
      }
    }

    void window.hub.streamConfig().then(async ({ addr, origin, password }) => {
      if (cancelled) return
      void pollBack(origin, password)
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
      polling.abort()
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
