import {
  ArchiveXIcon,
  CloudDownloadIcon,
  FolderOpenIcon,
  LaptopIcon,
  MonitorUpIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
  TvMinimalIcon,
  UnlinkIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { appOrigin, hasUpdate } from '@/lib/apps'
import { compareVersions } from '../../../../shared/version.ts'
import { errorMessage } from '@/lib/hub'
import type { AppEntry, LogLine, RunMode, RunState } from '../../../../shared/types.ts'
import { AppIcon } from './app-icon'
import { LedLoader } from './led-loader'
import { LogsPanel } from './logs-panel'
import { RunBadge } from './run-badge'
import { SettingsForm } from './settings-form'

const BUSY_STATES = new Set(['building', 'installing', 'starting'])
const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const REVEAL_LABEL: Record<string, string> = { darwin: 'Show in Finder', win32: 'Show in Explorer' }

const PENDING: Record<string, string> = {
  run: 'Starting',
  stop: 'Stopping',
  install: 'Installing on the bar',
  uninstall: 'Removing from the bar',
  download: 'Downloading',
  forget: 'Removing',
}

function origin(app: AppEntry): string {
  if (appOrigin(app) === 'busy') return 'BUSY app'
  if (app.source === 'bar') return 'Only on the bar'
  if (app.official && app.catalog?.latest === null) return 'Official BusyHub app · no longer in the catalog'
  if (app.official) return 'Official BusyHub app'
  if (app.source === 'package') return 'Imported package'
  return `Local project · ${app.dir?.split(/[/\\]/).at(-1) ?? ''}`
}

export function AppDetail({
  app,
  run,
  mode,
  logs,
  barOnline,
  onModeChange,
}: {
  app: AppEntry
  run: RunState | undefined
  mode: RunMode
  logs: LogLine[]
  barOnline: boolean
  onModeChange: (mode: RunMode) => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const working = pending !== null || (run !== undefined && BUSY_STATES.has(run.status))
  const running = run?.status === 'running'
  const canHost = app.hub.modes.includes('host')
  const canBar = app.hub.modes.includes('device')

  const lines = useMemo(() => logs.filter((line) => line.appId === app.id), [logs, app.id])
  const local = !app.official && app.source !== 'bar'
  // A downloaded official app; a source project in development has nothing to remove.
  const downloaded = app.official && app.source === 'package'
  const update = hasUpdate(app)
  // An official app is downloaded before anything else can happen with it.
  const notDownloaded = app.source === 'catalog'
  const barLabel = !app.onBar
    ? 'Install on the bar'
    : compareVersions(app.version, app.onBar.version) > 0
      ? 'Update on the bar'
      : 'Reinstall on the bar'

  const act = async (label: string, work: () => Promise<void>) => {
    setPending(label)
    try {
      await work()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Frame spacing="sm">
        <FrameHeader className="flex-row items-center gap-3">
          <AppIcon app={app} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <FrameTitle className="flex items-center gap-2 text-base tracking-tight">
              <span className="truncate">{app.name}</span>
              <RunBadge app={app} run={run} />
            </FrameTitle>
            <FrameDescription className="text-xs text-pretty tabular-nums">
              v{app.version}
              {app.author ? ` · ${app.author}` : ''} · {origin(app)}
            </FrameDescription>
          </div>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-4">
          {app.description && <p className="text-sm text-muted-foreground">{app.description}</p>}

          {app.source !== 'bar' && !notDownloaded && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Run</span>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[mode]}
                onValueChange={(value: string[]) => {
                  const next = value[0]
                  if (next === 'device' || next === 'host') onModeChange(next)
                }}
                aria-label="Where the app runs"
              >
                <ToggleGroupItem value="device" disabled={!canBar}>
                  <TvMinimalIcon aria-hidden />
                  On the bar
                </ToggleGroupItem>
                <ToggleGroupItem value="host" disabled={!canHost}>
                  <LaptopIcon aria-hidden />
                  On this computer
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {mode === 'device'
                  ? 'Builds, installs and launches it on the bar. It keeps running without this computer; one app at a time.'
                  : 'Runs the same build here and draws on the bar over the network. Keeps secrets on this computer and runs next to other apps.'}
              </p>
            </div>
          )}

          {notDownloaded ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={working} onClick={() => void act('download', () => window.hub.download(app.id))}>
                  <CloudDownloadIcon aria-hidden />
                  Download
                </Button>
              </div>
              {!working && <p className="text-xs text-muted-foreground">Downloads once from the catalog. After that it runs without a connection.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {running ? (
                  <Button disabled={working} onClick={() => void act('stop', () => window.hub.stop(app.id))}>
                    <SquareIcon aria-hidden />
                    Stop
                  </Button>
                ) : (
                  <Button
                    disabled={working || !barOnline}
                    onClick={() => void act('run', () => window.hub.run(app.id, app.source === 'bar' ? 'device' : mode))}
                  >
                    <PlayIcon aria-hidden />
                    {app.source === 'bar' ? 'Launch on the bar' : 'Run'}
                  </Button>
                )}
                {app.source !== 'bar' && canBar && (
                  <Button variant="outline" disabled={working || !barOnline} onClick={() => void act('install', () => window.hub.install(app.id))}>
                    <MonitorUpIcon aria-hidden />
                    {barLabel}
                  </Button>
                )}
                {update && (
                  <Button variant="outline" disabled={working} onClick={() => void act('download', () => window.hub.download(app.id))}>
                    <CloudDownloadIcon aria-hidden />
                    Update to v{app.catalog?.latest}
                  </Button>
                )}
              </div>
              {(app.onBar || app.dir || local || downloaded) && (
                <div className="flex flex-wrap items-center gap-1">
                  {app.onBar && (
                    <Button variant="ghost" size="sm" disabled={working || !barOnline} onClick={() => void act('uninstall', () => window.hub.uninstall(app.id))}>
                      <Trash2Icon aria-hidden />
                      Remove from bar
                    </Button>
                  )}
                  {app.dir && (
                    <Button variant="ghost" size="sm" onClick={() => void window.hub.reveal(app.id)}>
                      <FolderOpenIcon aria-hidden />
                      {REVEAL_LABEL[window.hub.platform] ?? 'Show in folder'}
                    </Button>
                  )}
                  {local && (
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => void act('forget', () => window.hub.forget(app.id))}>
                      <UnlinkIcon aria-hidden />
                      Remove from BusyHub
                    </Button>
                  )}
                  {downloaded && (
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => void act('forget', () => window.hub.forget(app.id))}>
                      <ArchiveXIcon aria-hidden />
                      Remove download
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {working && (
            <LedLoader label={run && BUSY_STATES.has(run.status) ? run.detail : (PENDING[pending ?? ''] ?? 'Working')} />
          )}
          {!working && run?.status === 'error' && (
            <Alert variant="destructive">
              <AlertTitle>The last run failed</AlertTitle>
              <AlertDescription>{run.detail}</AlertDescription>
            </Alert>
          )}
          {!working && run && run.status !== 'error' && (
            <p className="text-xs text-muted-foreground" role="status">
              {run.detail} · {TIME.format(run.at)}
            </p>
          )}
        </FramePanel>
      </Frame>

      {app.settings && Object.keys(app.settings.fields).length > 0 && <SettingsForm app={app} schema={app.settings} />}

      <LogsPanel lines={lines} />
    </div>
  )
}
