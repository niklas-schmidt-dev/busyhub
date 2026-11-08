// One connection to the BUSY Bar's HTTP API. busy-lib covers most calls; launching and quitting apps are not in it yet, so those go through request().
import { BusyBar } from '@busy-app/busy-lib'
import type { BarStatus } from '../shared/types.ts'
import type { BarApp } from './catalog.ts'

/** Uploading and unpacking a package takes far longer than a plain call (busy-cli uses the same limit). */
const INSTALL_TIMEOUT_MS = 120_000

export class BarError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Accepts `10.0.4.20`, `192.168.1.20` or a full http(s) URL; anything with a path is refused. */
export function parseBarAddr(addr: string): URL {
  const trimmed = addr.trim()
  const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`)
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('The bar address must be a host, without a path')
  return url
}

export class Bar {
  readonly base: URL
  readonly password: string | null
  readonly api: BusyBar

  constructor(addr: string, password: string | null) {
    this.base = parseBarAddr(addr)
    this.password = password
    this.api = new BusyBar({ addr: this.base.origin, timeout: 5000, ...(password ? { HTTPAccessPassword: password } : {}) })
  }

  /** Calls an endpoint busy-lib does not wrap yet. */
  async request(method: 'GET' | 'POST' | 'DELETE', path: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, this.base)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const res = await fetch(url, {
      method,
      headers: this.password ? { 'X-API-Token': this.password } : {},
      signal: AbortSignal.timeout(10_000),
    })
    const text = await res.text()
    if (!res.ok) throw new BarError(res.status, describe(res.status, text))
    return text ? JSON.parse(text) : null
  }

  async status(): Promise<BarStatus> {
    let api: string
    try {
      // The version needs no password, so it tells a locked bar from an unreachable one.
      ;({ api_semver: api } = await this.api.SystemVersionGet())
    } catch (err) {
      return { state: 'offline', error: errorText(err) }
    }
    try {
      const [{ name }, status] = await Promise.all([this.api.SettingsNameGet(), this.api.SystemStatusGet()])
      return {
        state: 'online',
        name,
        firmware: status.firmware?.version ?? 'unknown',
        api,
        battery: status.power?.battery_charge ?? null,
      }
    } catch (err) {
      if (statusOf(err) === 403) return { state: 'locked', api }
      return { state: 'offline', error: errorText(err) }
    }
  }

  async apps(): Promise<BarApp[]> {
    const { apps } = await this.api.AppsList()
    return apps.map(({ id, name, version, author, description }) => ({ id, name, version, author, description }))
  }

  async install(pkg: Buffer): Promise<{ id: string; version: string }> {
    const staged = await this.api.AppsStage({ file: pkg }, { timeout: INSTALL_TIMEOUT_MS })
    await this.api.AppsInstall({ install_key: staged.install_key }, { timeout: INSTALL_TIMEOUT_MS })
    return { id: staged.staged.id, version: staged.staged.version }
  }

  launch(id: string): Promise<unknown> {
    return this.request('POST', '/api/apps/launch', { app_id: id })
  }

  /** Quits whatever app runs on the bar; nothing running is not an error. */
  async quit(): Promise<void> {
    try {
      await this.request('POST', '/api/apps/quit')
    } catch (err) {
      if (!(err instanceof BarError && err.status === 409)) throw err
    }
  }
}

/** The HTTP status of a busy-lib or BarError failure, if it has one. */
export function statusOf(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') return err.status
  return null
}

export function errorText(err: unknown): string {
  if (statusOf(err) === 403) return 'The bar refused the request. Check the HTTP access password.'
  if (err instanceof Error) return err.name === 'TimeoutError' ? 'The bar did not answer in time.' : err.message
  return String(err)
}

function describe(status: number, body: string): string {
  let said: string | undefined
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    if (typeof parsed.error === 'string') said = parsed.error
  } catch {
    said = body.trim().slice(0, 200) || undefined
  }
  if (status === 403) return 'The bar refused the request. Check the HTTP access password.'
  return `The bar answered ${status}${said ? `: ${said}` : ''}`
}
