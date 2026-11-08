import { ScrollTextIcon, SearchIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { LogLine } from '../../../../shared/types.ts'

type Level = 'all' | LogLine['level']

const LEVELS: Array<{ value: Level; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
]

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const LEVEL_TEXT: Record<LogLine['level'], string> = {
  info: 'text-foreground',
  warn: 'text-warning-foreground dark:text-warning',
  error: 'text-destructive',
}

/** The selected app's build output, console and hub messages, newest at the bottom. */
export function LogsPanel({ lines }: { lines: LogLine[] }) {
  const [level, setLevel] = useState<Level>('all')
  const [query, setQuery] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)

  const counts = { all: lines.length, info: 0, warn: 0, error: 0 }
  for (const line of lines) counts[line.level]++
  const needle = query.trim().toLowerCase()
  const visible = lines.filter((line) => (level === 'all' || line.level === level) && (!needle || line.text.toLowerCase().includes(needle)))
  const latest = visible.at(-1)?.at

  // Stays at the newest line unless you scrolled up to read.
  useLayoutEffect(() => {
    const el = viewport.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [visible.length, latest])

  return (
    <Frame spacing="sm">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <FrameTitle>Logs</FrameTitle>
          <FrameDescription className="text-xs tabular-nums">
            {visible.length} of {lines.length} lines
          </FrameDescription>
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[level]}
          onValueChange={(value: string[]) => {
            const next = value[0] as Level | undefined
            if (next) setLevel(next)
          }}
          aria-label="Log level"
        >
          {LEVELS.map((entry) => (
            <ToggleGroupItem key={entry.value} value={entry.value} className="gap-1.5">
              {entry.label}
              <span className="text-xs text-muted-foreground tabular-nums">{counts[entry.value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput type="search" placeholder="Search logs…" aria-label="Search logs" value={query} onChange={(event) => setQuery(event.target.value)} />
        </InputGroup>
        <div
          ref={viewport}
          tabIndex={0}
          role="log"
          aria-label="Log lines"
          onScroll={(event) => {
            const el = event.currentTarget
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-72 overflow-y-auto overscroll-contain rounded-lg bg-muted/40 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollTextIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>{lines.length === 0 ? 'No logs yet' : 'No matching lines'}</EmptyTitle>
                <EmptyDescription>
                  {lines.length === 0 ? 'Builds, installs and what the app prints show up here.' : 'Try another level or search.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol className="flex flex-col py-2">
              {visible.map((line, index) => (
                <li key={`${line.at}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-0.5">
                  <time className="text-muted-foreground tabular-nums select-none" dateTime={new Date(line.at).toISOString()}>
                    {TIME.format(line.at)}
                  </time>
                  <span className={cn('break-words whitespace-pre-wrap', LEVEL_TEXT[line.level])}>
                    {line.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </FramePanel>
    </Frame>
  )
}
