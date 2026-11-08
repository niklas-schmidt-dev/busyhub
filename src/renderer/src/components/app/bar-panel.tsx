import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CornerUpLeftIcon,
  PlayIcon,
  PlugIcon,
} from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/reui/alert'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BarConfig, BarStatus, ButtonKey } from '../../../../shared/types.ts'
import { BarScreens, type StreamState } from './bar-screens'

/** The 32px icon buttons reach a 40px hit area without growing; with gap-2 the extended areas meet but never overlap. */
const HIT_AREA = 'relative before:absolute before:-inset-1'

/** A bar button that sends press on pointer down and release on pointer up, so holding it makes a long press. */
function HoldButton({ button, label, children }: { button: ButtonKey; label: string; children: ReactNode }) {
  const send = (action: 'press' | 'release') => window.hub.input({ kind: 'button', button, action })
  const isActivation = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter'
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={HIT_AREA}
            aria-label={label}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              send('press')
            }}
            onPointerUp={() => send('release')}
            onPointerCancel={() => send('release')}
            onKeyDown={(event) => {
              if (isActivation(event) && !event.repeat) send('press')
            }}
            onKeyUp={(event) => {
              if (isActivation(event)) send('release')
            }}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function WheelButton({ delta, label, children }: { delta: 1 | -1; label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={HIT_AREA}
            aria-label={label}
            onClick={() => window.hub.input({ kind: 'encoder', delta })}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function statusBadge(status: BarStatus | null, stream: StreamState) {
  if (!status) return <Badge variant="outline">Checking…</Badge>
  if (status.state === 'locked') return <Badge variant="warning-light">Password needed</Badge>
  if (status.state === 'offline') return <Badge variant="destructive-light">Offline</Badge>
  return <Badge variant="success-light">{stream === 'live' ? 'Live' : 'Online'}</Badge>
}

function describe(config: BarConfig | null, status: BarStatus | null): string {
  if (!config || !status) return 'Connecting…'
  if (status.state === 'online') {
    const battery = status.battery === null ? '' : ` · ${status.battery}%`
    return `${config.addr} · firmware ${status.firmware}${battery}`
  }
  return config.addr
}

export function BarPanel({
  config,
  status,
  onConnect,
}: {
  config: BarConfig | null
  status: BarStatus | null
  onConnect: () => void
}) {
  const [stream, setStream] = useState<StreamState>('off')
  const [streamProblem, setStreamProblem] = useState<string | null>(null)
  const online = status?.state === 'online'

  return (
    <Frame spacing="sm">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <FrameTitle className="flex items-center gap-2">
            {status?.state === 'online' ? status.name : 'BUSY Bar'}
            {statusBadge(status, stream)}
          </FrameTitle>
          <FrameDescription className="truncate text-xs tabular-nums">{describe(config, status)}</FrameDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onConnect}>
          <PlugIcon aria-hidden />
          Connection
        </Button>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        {status && status.state !== 'online' && (
          <Alert variant={status.state === 'locked' ? 'warning' : 'destructive'}>
            <PlugIcon aria-hidden />
            <AlertTitle>{status.state === 'locked' ? 'The bar wants its HTTP password' : 'The bar is not reachable'}</AlertTitle>
            <AlertDescription>
              {status.state === 'locked'
                ? 'HTTP access is password-protected. Enter the password from the bar’s web settings.'
                : status.error}
            </AlertDescription>
            <AlertAction>
              <Button size="xs" onClick={onConnect}>
                Connect
              </Button>
            </AlertAction>
          </Alert>
        )}
        {/* A new connection starts the screens over, so they never keep mirroring the previous address or password. */}
        <BarScreens
          key={config?.connection ?? 0}
          online={online}
          onStreamState={(state, reason) => {
            setStream(state)
            setStreamProblem(reason ?? null)
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="group" aria-label="Bar controls">
            <WheelButton delta={-1} label="Wheel left">
              <ChevronLeftIcon aria-hidden />
            </WheelButton>
            <HoldButton button="ok" label="OK (wheel press)">
              <CircleDotIcon aria-hidden />
            </HoldButton>
            <WheelButton delta={1} label="Wheel right">
              <ChevronRightIcon aria-hidden />
            </WheelButton>
            <HoldButton button="start" label="Start / Pause">
              <PlayIcon aria-hidden />
            </HoldButton>
            <HoldButton button="back" label="Back">
              <CornerUpLeftIcon aria-hidden />
            </HoldButton>
          </div>
          <p className="text-xs text-muted-foreground">
            {stream === 'error'
              ? `Live view unavailable${streamProblem ? ` (${streamProblem})` : ''}. The controls still reach apps running on this computer.`
              : 'These controls, and the bar’s own buttons, drive the newest app running on this computer.'}
          </p>
        </div>
      </FramePanel>
    </Frame>
  )
}
