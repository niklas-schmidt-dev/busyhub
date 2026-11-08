import { BadgeCheckIcon, LayoutGridIcon, PlusIcon, RefreshCwIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from 'cn'
import { Badge } from '@/components/reui/badge'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ago, day } from '@/lib/apps'
import type { AppEntry, CatalogStatus, RunState } from '../../../../shared/types.ts'
import { AppIcon } from './app-icon'
import { RunBadge } from './run-badge'

type Scope = 'all' | 'official' | 'mine' | 'bar' | 'running'

/** Where the official apps on screen come from, in a few words. */
function catalogLine(status: CatalogStatus): string {
  switch (status.state) {
    case 'live':
      return status.fetchedAt ? `Official catalog checked ${ago(status.fetchedAt)}` : 'Official catalog is current'
    case 'cached':
      return `Showing the catalog from ${day(status.generatedAt)}. Downloaded apps work as usual.`
    case 'bundled':
      return `Showing the catalog that came with BusyHub (${day(status.generatedAt)}).`
    case 'unavailable':
      return 'The official catalog could not be loaded yet.'
  }
}

/** The catalog's freshness, an Offline badge when it could not be reached, and a button to check again. */
function CatalogState({ status, onCheck }: { status: CatalogStatus; onCheck: () => Promise<void> }) {
  const [checking, setChecking] = useState(false)
  const offline = status.error !== null || status.state === 'unavailable'
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {offline && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="warning-light" />}>Offline</TooltipTrigger>
          <TooltipContent>{status.error ? `Could not reach the catalog: ${status.error}` : 'Not checked yet'}</TooltipContent>
        </Tooltip>
      )}
      <FrameDescription className="truncate text-xs" role="status">
        {catalogLine(status)}
      </FrameDescription>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Check the catalog for new apps and updates"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  await onCheck()
                } finally {
                  setChecking(false)
                }
              }}
            />
          }
        >
          <RefreshCwIcon aria-hidden className={cn(checking && 'motion-safe:animate-spin')} />
        </TooltipTrigger>
        <TooltipContent>Check for new apps and updates</TooltipContent>
      </Tooltip>
    </div>
  )
}

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'official', label: 'Official' },
  { value: 'mine', label: 'Mine' },
  { value: 'bar', label: 'On the bar' },
  { value: 'running', label: 'Running' },
]

const ALL_CATEGORIES = 'all'
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2'

function inScope(app: AppEntry, run: RunState | undefined, scope: Scope): boolean {
  switch (scope) {
    case 'official':
      return app.official
    case 'mine':
      return !app.official && app.source !== 'bar'
    case 'bar':
      return app.onBar !== null
    case 'running':
      return run?.status === 'running'
    default:
      return true
  }
}

function AppTile({
  app,
  run,
  selected,
  onSelect,
}: {
  app: AppEntry
  run: RunState | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Item
      variant="outline"
      render={<button type="button" aria-pressed={selected} onClick={onSelect} />}
      className={cn(
        'h-full cursor-pointer flex-nowrap items-start text-left transition-colors hover:bg-muted/50 active:bg-muted',
        selected && 'bg-muted hover:bg-muted',
      )}
    >
      <ItemMedia>
        <AppIcon app={app} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="w-full justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{app.name}</span>
            {app.official && (
              <BadgeCheckIcon className="size-3.5 shrink-0 text-muted-foreground" role="img" aria-label="Official app" />
            )}
          </span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">v{app.version}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-2 min-h-[2lh]">
          {app.hub.tagline || app.description || (app.source === 'bar' ? 'Installed on the bar.' : 'No description yet.')}
        </ItemDescription>
        <div className="flex min-h-5 flex-wrap items-center gap-1.5 pt-1">
          <RunBadge app={app} run={run} />
          <span className="text-xs text-muted-foreground">{app.hub.category}</span>
        </div>
      </ItemContent>
    </Item>
  )
}

export function Catalog({
  apps,
  runs,
  loading,
  selectedId,
  onSelect,
  onNew,
  catalog,
  onCheckCatalog,
}: {
  apps: AppEntry[]
  runs: RunState[]
  loading: boolean
  catalog: CatalogStatus | null
  onCheckCatalog: () => Promise<void>
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const categories = useMemo(() => [...new Set(apps.map((app) => app.hub.category))].sort(), [apps])

  const needle = query.trim().toLowerCase()
  const visible = apps.filter(
    (app) =>
      inScope(app, runById.get(app.id), scope) &&
      (category === ALL_CATEGORIES || app.hub.category === category) &&
      (!needle || [app.name, app.id, app.description, app.hub.tagline, app.hub.category].join(' ').toLowerCase().includes(needle)),
  )

  const reset = () => {
    setQuery('')
    setScope('all')
    setCategory(ALL_CATEGORIES)
  }

  return (
    <Frame spacing="sm">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <FrameTitle>Apps</FrameTitle>
          {catalog ? (
            <CatalogState status={catalog} onCheck={onCheckCatalog} />
          ) : (
            <FrameDescription className="text-xs">Loading the catalog…</FrameDescription>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[scope]}
            onValueChange={(value: string[]) => {
              const next = value[0] as Scope | undefined
              if (next) setScope(next)
            }}
            aria-label="Show"
          >
            {SCOPES.map((entry) => (
              <ToggleGroupItem key={entry.value} value={entry.value}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {categories.length > 1 && (
            <Select value={category} onValueChange={(value: string | null) => setCategory(value ?? ALL_CATEGORIES)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Category">
                <SelectValue>{category === ALL_CATEGORIES ? 'All categories' : category}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                  {categories.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <InputGroup className="w-48">
            <InputGroupAddon align="inline-start">
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search apps…"
              aria-label="Search apps"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
        </div>
      </FrameHeader>
      <FramePanel>
        {loading ? (
          <div className={GRID} aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[6.5rem] rounded-lg" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGridIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No apps yet</EmptyTitle>
              <EmptyDescription>
                Create one from the starter, or add a BUSY app folder. New apps show up here on their own.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={onNew}>
                <PlusIcon aria-hidden />
                New app
              </Button>
            </EmptyContent>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No apps match</EmptyTitle>
              <EmptyDescription>Try another word, or show all apps again.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={reset}>
                Show all apps
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className={GRID}>
            {visible.map((app) => (
              <AppTile
                key={app.id}
                app={app}
                run={runById.get(app.id)}
                selected={app.id === selectedId}
                onSelect={() => onSelect(app.id)}
              />
            ))}
          </div>
        )}
      </FramePanel>
    </Frame>
  )
}
