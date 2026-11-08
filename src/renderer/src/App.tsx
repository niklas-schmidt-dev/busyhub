import { FolderPlusIcon, MousePointerClickIcon, PackagePlusIcon, PlusIcon } from 'lucide-react'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppDetail } from '@/components/app/app-detail'
import { BarPanel } from '@/components/app/bar-panel'
import { Catalog } from '@/components/app/catalog'
import { ConnectDialog } from '@/components/app/connect-dialog'
import { NewAppDialog } from '@/components/app/new-app-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { errorMessage, useHubState } from '@/lib/hub'
import brandLogo from '../../../assets/branding/busyhub-logo-128.png'
import type { RunMode } from '../../shared/types.ts'

export function App() {
  const [state, reload] = useHubState()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [modes, setModes] = useState<Record<string, RunMode>>({})

  const apps = state?.apps ?? []
  const selected = apps.find((app) => app.id === selectedId) ?? null

  // Start on the first of your own apps, once the catalog has loaded.
  useEffect(() => {
    if (selectedId === null && apps.length > 0) setSelectedId((apps.find((app) => app.source !== 'bar') ?? apps[0])?.id ?? null)
  }, [apps, selectedId])

  useEffect(() => {
    if (state) setModes(state.modes)
  }, [state?.modes])

  // A locked bar asks for its password once per session; after that the bar panel's alert offers it.
  const askedForPassword = useRef(false)
  useEffect(() => {
    if (state?.status.state !== 'locked' || askedForPassword.current) return
    askedForPassword.current = true
    setConnectOpen(true)
  }, [state?.status.state])

  const modeFor = (id: string, fallback: RunMode): RunMode => {
    const stored = modes[id]
    const app = apps.find((entry) => entry.id === id)
    return stored && app?.hub.modes.includes(stored) ? stored : fallback
  }

  const add = async (pick: () => Promise<string | null>) => {
    try {
      const id = await pick()
      if (id) {
        toast.success(`Added ${id}`)
        setSelectedId(id)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="grid h-svh grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground antialiased">
      {/* On macOS the traffic lights sit in this header, so it leaves room for them and drags the window. */}
      <header
        className={cn(
          'flex items-center justify-between gap-4 border-b py-3 pr-4',
          window.hub.platform === 'darwin' ? 'pl-24 [-webkit-app-region:drag]' : 'pl-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={brandLogo} alt="" width={40} height={40} className="size-10 shrink-0" draggable={false} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-sm font-semibold tracking-tight">BusyHub</h1>
            <p className="truncate text-xs text-muted-foreground">Your BUSY Bar apps, run on the bar or from this computer.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <Button variant="ghost" size="sm" onClick={() => void add(window.hub.importPackage)}>
            <PackagePlusIcon aria-hidden />
            Import package…
          </Button>
          <Button variant="outline" size="sm" onClick={() => void add(window.hub.addApp)}>
            <FolderPlusIcon aria-hidden />
            Add folder…
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <PlusIcon aria-hidden />
            New app
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <main className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
          <BarPanel config={state?.bar ?? null} status={state?.status ?? null} onConnect={() => setConnectOpen(true)} />
          <Catalog
            apps={apps}
            runs={state?.runs ?? []}
            loading={state === null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNew={() => setNewOpen(true)}
          />
        </main>
        <aside className="min-h-0 min-w-0 overflow-y-auto border-l p-4" aria-label="Selected app">
          {selected && state ? (
            <AppDetail
              key={selected.id}
              app={selected}
              run={state.runs.find((run) => run.id === selected.id)}
              mode={modeFor(selected.id, selected.hub.modes[0] ?? 'device')}
              logs={state.logs}
              barOnline={state.status.state === 'online'}
              onModeChange={(mode) => {
                setModes((prev) => ({ ...prev, [selected.id]: mode }))
                void window.hub.setMode(selected.id, mode)
              }}
            />
          ) : (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MousePointerClickIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Pick an app</EmptyTitle>
                <EmptyDescription>Its controls, settings and logs show up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </aside>
      </div>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} config={state?.bar ?? null} onConnected={() => void reload()} />
      <NewAppDialog open={newOpen} onOpenChange={setNewOpen} onCreated={setSelectedId} />
    </div>
  )
}
