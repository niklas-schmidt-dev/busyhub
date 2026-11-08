// Runs a BUSY Bar JS app on this computer instead of on the bar.
//
// The app is the same build the bar runs, so this thread recreates what the JerryScript runtime gives it:
//   - fetch to localhost (the bar it thinks it runs on) goes to the real bar, with the HTTP access password;
//   - GET /api/apps/settings for this app is answered from the hub's stored values;
//   - listen('input', …) receives the hub's input events;
//   - localStorage is a JSON file in the hub's data folder.
// Like on the bar, the app ends once nothing keeps it busy: no timers, no pending requests, no input handler.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatWithOptions } from 'node:util'
import { parentPort, workerData } from 'node:worker_threads'
import type { BusyInputEvent, SettingsValues } from '../shared/types.ts'
import type { HostInit, HostToMain, MainToHost } from './host-protocol.ts'

if (!parentPort) throw new Error('host-worker must run as a worker thread')
const port = parentPort
const init = workerData as HostInit
const send = (message: HostToMain) => port.postMessage(message)

for (const [method, level] of [
  ['log', 'info'],
  ['info', 'info'],
  ['debug', 'info'],
  ['warn', 'warn'],
  ['error', 'error'],
] as const) {
  console[method] = (...args: unknown[]) => send({ type: 'log', level, text: formatWithOptions({ depth: 4 }, ...args) })
}

class FileStorage {
  readonly #file: string
  readonly #data = new Map<string, string>()

  constructor(file: string) {
    this.#file = file
    try {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      for (const [key, value] of Object.entries(stored)) this.#data.set(key, String(value))
    } catch {
      // No storage yet.
    }
  }

  get length(): number {
    return this.#data.size
  }

  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.#data.get(String(key)) ?? null
  }

  setItem(key: string, value: string): void {
    this.#data.set(String(key), String(value))
    this.#flush()
  }

  removeItem(key: string): void {
    if (this.#data.delete(String(key))) this.#flush()
  }

  clear(): void {
    this.#data.clear()
    this.#flush()
  }

  #flush(): void {
    mkdirSync(dirname(this.#file), { recursive: true })
    writeFileSync(this.#file, JSON.stringify(Object.fromEntries(this.#data)))
  }
}

let values: SettingsValues = init.values

const runtime = {
  localStorage: new FileStorage(init.storageFile),
  // What the template's shared/settings.ts reads; the documented way is GET /api/apps/settings, answered below.
  Settings: {
    load: async () => ({ version: init.settingsVersion, values }),
    save: async (next: SettingsValues) => {
      values = next
      send({ type: 'settings', values: next })
    },
  },
  listen,
}
for (const [name, value] of Object.entries(runtime)) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

let handler: ((event: BusyInputEvent) => void) | null = null

/** Same contract as the bar: one handler, and while it is attached the app keeps running. */
function listen(type: string, fn: (event: BusyInputEvent) => void): () => void {
  if (type !== 'input') throw new TypeError(`listen: unknown event type "${type}"`)
  if (handler) throw new TypeError('listen: a handler is already attached')
  handler = fn
  port.ref()
  send({ type: 'listening', on: true })
  let attached = true
  return () => {
    if (!attached) return
    attached = false
    handler = null
    port.unref()
    send({ type: 'listening', on: false })
  }
}

port.on('message', (message: MainToHost) => {
  if (message.type !== 'input' || !handler) return
  try {
    handler(message.event)
  } catch (err) {
    console.error('Input handler failed:', err)
  }
})
// Messages alone must not keep the app alive; listen() takes the reference while a handler is attached.
port.unref()

const bar = new URL(init.barOrigin)
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const realFetch = globalThis.fetch.bind(globalThis)

globalThis.fetch = async (input: string | URL | Request, options?: RequestInit): Promise<Response> => {
  const request = new Request(input, options)
  const url = new URL(request.url)
  // On the bar, localhost is the bar's own API on port 80. Other local ports stay on this computer, e.g. a dev server.
  const toBar = url.host === bar.host || (LOCAL_HOSTS.has(url.hostname) && (url.port === '' || url.port === '80'))
  if (!toBar) return realFetch(request)

  if (url.pathname === '/api/apps/settings' && request.method === 'GET' && url.searchParams.get('app_id') === init.appId) {
    return Response.json({ version: init.settingsVersion, values })
  }

  const headers = new Headers(request.headers)
  if (init.password) headers.set('X-API-Token', init.password)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return realFetch(new URL(url.pathname + url.search, bar), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    signal: request.signal,
  })
}

process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason))

try {
  await import(pathToFileURL(init.entry).href)
} catch (err) {
  console.error('The app failed to start:', err)
  process.exit(1)
}
