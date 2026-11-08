import { useCallback, useEffect, useState } from 'react'
import type { HubEvent, HubSnapshot, UpdateStatus } from '../../../shared/types.ts'

const MAX_LOGS = 1000

function apply(state: HubSnapshot, event: HubEvent): HubSnapshot {
  switch (event.type) {
    case 'apps':
      return { ...state, apps: event.apps }
    case 'runs':
      return { ...state, runs: event.runs }
    case 'status':
      return { ...state, status: event.status }
    case 'catalog':
      return { ...state, catalog: event.status }
    case 'log':
      return { ...state, logs: [...state.logs.slice(-(MAX_LOGS - 1)), event.line] }
    case 'update':
      return state
  }
}

/** BusyHub's own update; it lives beside the hub's state, so a check that finished before the window opened still shows. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    const off = window.hub.onEvent((event) => {
      if (event.type === 'update') setStatus(event.status)
    })
    void window.hub.updateStatus().then(setStatus)
    return off
  }, [])
  return status
}

/** The hub's state, kept current by the main process's events; null until the first snapshot arrives. */
export function useHubState(): [HubSnapshot | null, () => Promise<void>] {
  const [state, setState] = useState<HubSnapshot | null>(null)

  const reload = useCallback(async () => {
    setState(await window.hub.snapshot())
  }, [])

  useEffect(() => {
    const off = window.hub.onEvent((event) => setState((prev) => (prev ? apply(prev, event) : prev)))
    void reload()
    return off
  }, [reload])

  return [state, reload]
}

/** Electron wraps errors thrown in the main process; this keeps the hub's own message. */
export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
