// The official catalog online, and what keeps it usable without a connection:
//   1. the last catalog.json this computer fetched, saved in the data folder;
//   2. every app downloaded from it, kept as a package that runs with no network at all;
//   3. the snapshot each BusyHub release ships (catalog.json and its packages), for a first start offline.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CatalogStatus } from '../shared/types.ts'
import type { Log } from './builder.ts'
import { compareVersions } from '../shared/version.ts'
import { MAX_PACKAGE_BYTES, compatibleApps, packageUrl, parseCatalog, type CatalogApp, type CatalogFeed } from './catalog-feed.ts'
import { unpackPackage } from './scaffold.ts'

export const DEFAULT_CATALOG_URL = 'https://niklas-schmidt-dev.github.io/busyhub/catalog.json'

const CATALOG_TIMEOUT_MS = 15_000
const PACKAGE_TIMEOUT_MS = 60_000

export interface CatalogOptions {
  url: string
  /** The data folder's catalog/: the last fetched catalog.json, its ETag, and downloaded apps in packages/. */
  cacheDir: string
  /** The snapshot a release ships: catalog.json and packages/. Null in development. */
  bundledDir: string | null
  hubVersion: string
  log: Log
}

interface CacheState {
  etag: string | null
  fetchedAt: number | null
}

function readFeed(file: string): CatalogFeed | null {
  try {
    return parseCatalog(JSON.parse(readFileSync(file, 'utf8'))).feed
  } catch {
    return null
  }
}

/** Turns fetch failures into words for the window: no connection, a timeout, or what the server said. */
export function describeFailure(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') return 'the catalog did not answer in time'
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) return 'no connection to the catalog'
  return err instanceof Error ? err.message : String(err)
}

function checkBytes(bytes: Buffer, app: CatalogApp): void {
  if (bytes.length !== app.package.size) throw new Error(`${app.name}: the download has ${bytes.length} bytes, the catalog says ${app.package.size}`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== app.package.sha256) throw new Error(`${app.name}: the download does not match the catalog's checksum`)
}

export class RemoteCatalog {
  readonly #options: CatalogOptions
  #feed: CatalogFeed | null = null
  /** Where #feed came from: fetched in this session, the saved copy, or the release's snapshot. */
  #origin: 'remote' | 'cache' | 'bundle' | null = null
  #bundled: CatalogFeed | null = null
  #state: CacheState = { etag: null, fetchedAt: null }
  #error: string | null = null
  #refreshing: Promise<CatalogStatus> | null = null

  constructor(options: CatalogOptions) {
    this.#options = options
    mkdirSync(this.packagesDir, { recursive: true })
    // Unpacking swaps folders in at the end; a crash before that leaves only these behind.
    for (const entry of readdirSync(this.packagesDir)) {
      if (entry.startsWith('.unpack-')) rmSync(join(this.packagesDir, entry), { recursive: true, force: true })
    }
    try {
      this.#state = { etag: null, fetchedAt: null, ...(JSON.parse(readFileSync(this.#file('state.json'), 'utf8')) as Partial<CacheState>) }
    } catch {
      // Nothing fetched yet.
    }
    const cached = readFeed(this.#file('catalog.json'))
    this.#bundled = options.bundledDir ? readFeed(join(options.bundledDir, 'catalog.json')) : null
    // An updated BusyHub can ship a newer snapshot than the last catalog this computer fetched.
    if (cached && (!this.#bundled || cached.generatedAt >= this.#bundled.generatedAt)) {
      this.#feed = cached
      this.#origin = 'cache'
    } else if (this.#bundled) {
      this.#feed = this.#bundled
      this.#origin = 'bundle'
    }
  }

  /** Where downloaded official apps live; the hub scans it like any folder of packages. */
  get packagesDir(): string {
    return join(this.#options.cacheDir, 'packages')
  }

  get status(): CatalogStatus {
    const state = !this.#feed ? 'unavailable' : this.#origin === 'remote' ? 'live' : this.#origin === 'cache' ? 'cached' : 'bundled'
    return {
      state,
      url: this.#options.url,
      generatedAt: this.#feed?.generatedAt || null,
      fetchedAt: this.#state.fetchedAt,
      error: this.#error,
    }
  }

  /** The listed apps this BusyHub can run. */
  apps(): CatalogApp[] {
    return this.#feed ? compatibleApps(this.#feed, this.#options.hubVersion) : []
  }

  /** Fetches the catalog; when that fails, whatever was shown stays, and the status says why. Concurrent calls share one request. */
  refresh(): Promise<CatalogStatus> {
    this.#refreshing ??= this.#fetch().finally(() => {
      this.#refreshing = null
    })
    return this.#refreshing
  }

  /**
   * Downloads an app into packagesDir and returns the version installed. The snapshot BusyHub shipped with is used
   * when it holds the very same package, and as the fallback when the catalog cannot be reached, but only when it is
   * newer than the `installed` version: a failed update never takes an app back to an older one.
   */
  async download(id: string, installed: string | null = null): Promise<{ version: string; fromSnapshot: boolean }> {
    const { log } = this.#options
    // Only what the catalog lists now is installed; an app taken out of it stays out, even if an old snapshot has it.
    const listed = this.apps().find((app) => app.id === id)
    if (!listed) throw new Error(`${id} is not in the catalog`)
    const bundled = this.#bundled ? compatibleApps(this.#bundled, this.#options.hubVersion).find((app) => app.id === id) : undefined

    const work = mkdtempSync(join(tmpdir(), 'busyhub-download-'))
    try {
      let chosen: CatalogApp = listed
      let tgz: string
      let fromSnapshot = false
      if (bundled?.package.sha256 === listed.package.sha256) {
        tgz = this.#snapshotPackage(bundled)
        fromSnapshot = true
      } else {
        try {
          tgz = await this.#fetchPackage(listed, work)
        } catch (err) {
          if (!bundled || (installed !== null && compareVersions(bundled.version, installed) <= 0)) {
            throw new Error(`Could not download ${listed.name}: ${describeFailure(err)}`)
          }
          log('warn', `Could not download ${listed.name} ${listed.version} (${describeFailure(err)}). Using ${bundled.version}, which came with BusyHub.`)
          tgz = this.#snapshotPackage(bundled)
          chosen = bundled
          fromSnapshot = true
        }
      }

      const hubJson = { category: chosen.category, tagline: chosen.tagline, accent: chosen.accent, modes: chosen.modes }
      await unpackPackage(tgz, this.packagesDir, log, {
        expect: { id: chosen.id, version: chosen.version },
        extraFiles: { 'hub.json': `${JSON.stringify(hubJson, null, 2)}\n` },
      })
      log('info', `Downloaded ${chosen.name} ${chosen.version}${fromSnapshot ? ' from the copy that came with BusyHub' : ''}.`)
      return { version: chosen.version, fromSnapshot }
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  async #fetch(): Promise<CatalogStatus> {
    const { url, cacheDir, log } = this.#options
    try {
      const saved = this.#file('catalog.json')
      const headers: Record<string, string> = {}
      if (this.#state.etag && existsSync(saved)) headers['If-None-Match'] = this.#state.etag
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
      if (res.status === 304) {
        const feed = readFeed(saved)
        if (!feed) {
          // The saved copy went missing or bad; the next check fetches it whole.
          this.#state.etag = null
          throw new Error('the saved catalog could not be read')
        }
        this.#feed = feed
      } else {
        if (!res.ok) throw new Error(`the catalog answered HTTP ${res.status}`)
        const text = await res.text()
        const { feed, skipped } = parseCatalog(JSON.parse(text))
        for (const reason of skipped) log('warn', `Skipped a catalog entry: ${reason}`)
        mkdirSync(cacheDir, { recursive: true })
        writeFileSync(`${saved}.tmp`, text)
        renameSync(`${saved}.tmp`, saved)
        this.#feed = feed
        this.#state.etag = res.headers.get('etag')
      }
      this.#origin = 'remote'
      this.#state.fetchedAt = Date.now()
      this.#error = null
      writeFileSync(this.#file('state.json'), JSON.stringify(this.#state))
    } catch (err) {
      this.#error = describeFailure(err)
      // What was fetched earlier in this session is the saved copy now.
      if (this.#origin === 'remote') this.#origin = 'cache'
    }
    return this.status
  }

  async #fetchPackage(app: CatalogApp, dir: string): Promise<string> {
    const res = await fetch(packageUrl(this.#options.url, app), { signal: AbortSignal.timeout(PACKAGE_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (Number(res.headers.get('content-length') ?? 0) > MAX_PACKAGE_BYTES) throw new Error('the package is too large')
    const bytes = Buffer.from(await res.arrayBuffer())
    checkBytes(bytes, app)
    const file = join(dir, `${app.id}.tgz`)
    writeFileSync(file, bytes)
    return file
  }

  /** A package from the release's snapshot, checked against the snapshot's own catalog.json. */
  #snapshotPackage(app: CatalogApp): string {
    const { bundledDir } = this.#options
    if (!bundledDir) throw new Error(`${app.name} is not in the snapshot that came with BusyHub`)
    const file = join(bundledDir, app.package.path)
    checkBytes(readFileSync(file), app)
    return file
  }

  #file(name: string): string {
    return join(this.#options.cacheDir, name)
  }
}
