// The official catalog as published to GitHub Pages: catalog.json next to a packages/ folder of .tgz files.
// scripts/build-catalog.ts writes it; the hub reads it. Everything here is pure, so both sides share it.
import type { RunMode } from '../shared/types.ts'
import { compareVersions } from '../shared/version.ts'
import { APP_ID } from './catalog.ts'

export const CATALOG_FORMAT = 1
/** The firmware accepts packages up to 100 MB; the catalog stays well below. */
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024
/** The first BusyHub that reads the online catalog. */
export const FIRST_CATALOG_HUB = '0.2.0'

export interface CatalogApp {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: string
  tagline: string
  accent: string
  modes: RunMode[]
  /** The lowest BusyHub version that can run this app. */
  minHubVersion: string
  /** The 8×8 front icon as a data URL. */
  icon: string | null
  /** The app's folder on GitHub. */
  source: string | null
  package: {
    /** Relative to catalog.json, always packages/<file>.tgz. */
    path: string
    sha256: string
    size: number
  }
}

export interface CatalogFeed {
  format: typeof CATALOG_FORMAT
  generatedAt: string
  commit: string | null
  apps: CatalogApp[]
}

const SEMVER = /^\d+\.\d+\.\d+$/
const SHA256 = /^[0-9a-f]{64}$/
const PACKAGE_PATH = /^packages\/[A-Za-z0-9._-]+\.tgz$/
const HEX = /^#[0-9a-fA-F]{6}$/
const ICON = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

const str = (value: unknown): value is string => typeof value === 'string'

function parseApp(raw: unknown): CatalogApp {
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object')
  const a = raw as Record<string, unknown>
  if (!str(a.id) || !APP_ID.test(a.id)) throw new Error('invalid id')
  if (!str(a.version) || !SEMVER.test(a.version)) throw new Error(`${a.id}: invalid version`)
  if (!str(a.name) || !a.name) throw new Error(`${a.id}: missing name`)
  const modes = Array.isArray(a.modes) ? a.modes.filter((m): m is RunMode => m === 'device' || m === 'host') : []
  if (modes.length === 0) throw new Error(`${a.id}: no modes`)
  const pkg = typeof a.package === 'object' && a.package !== null ? (a.package as Record<string, unknown>) : {}
  if (!str(pkg.path) || !PACKAGE_PATH.test(pkg.path)) throw new Error(`${a.id}: invalid package path`)
  if (!str(pkg.sha256) || !SHA256.test(pkg.sha256)) throw new Error(`${a.id}: invalid sha256`)
  if (typeof pkg.size !== 'number' || pkg.size <= 0 || pkg.size > MAX_PACKAGE_BYTES) throw new Error(`${a.id}: invalid size`)
  const minHub = str(a.minHubVersion) && SEMVER.test(a.minHubVersion) ? a.minHubVersion : FIRST_CATALOG_HUB
  return {
    id: a.id,
    name: a.name,
    version: a.version,
    description: str(a.description) ? a.description : '',
    author: str(a.author) ? a.author : '',
    category: str(a.category) && a.category ? a.category : 'Apps',
    tagline: str(a.tagline) ? a.tagline : '',
    accent: str(a.accent) && HEX.test(a.accent) ? a.accent : '#FF5A4F',
    modes: [...new Set(modes)],
    minHubVersion: minHub,
    icon: str(a.icon) && ICON.test(a.icon) ? a.icon : null,
    source: str(a.source) && a.source.startsWith('https://') ? a.source : null,
    package: { path: pkg.path, sha256: pkg.sha256, size: pkg.size },
  }
}

/** Reads catalog.json. Broken entries are skipped and named, so one bad app never hides the others. */
export function parseCatalog(raw: unknown): { feed: CatalogFeed; skipped: string[] } {
  if (typeof raw !== 'object' || raw === null) throw new Error('The catalog is not a JSON object')
  const c = raw as Record<string, unknown>
  if (c.format !== CATALOG_FORMAT) throw new Error(`Unsupported catalog format ${String(c.format)}; update BusyHub`)
  if (!Array.isArray(c.apps)) throw new Error('The catalog has no apps list')
  const apps: CatalogApp[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  for (const entry of c.apps) {
    try {
      const app = parseApp(entry)
      if (seen.has(app.id)) throw new Error(`${app.id}: listed twice`)
      seen.add(app.id)
      apps.push(app)
    } catch (err) {
      skipped.push(err instanceof Error ? err.message : String(err))
    }
  }
  return {
    feed: {
      format: CATALOG_FORMAT,
      generatedAt: str(c.generatedAt) ? c.generatedAt : '',
      commit: str(c.commit) ? c.commit : null,
      apps,
    },
    skipped,
  }
}

/** The apps this BusyHub can run; newer ones wait until BusyHub is updated. */
export function compatibleApps(feed: CatalogFeed, hubVersion: string): CatalogApp[] {
  return feed.apps.filter((app) => compareVersions(app.minHubVersion, hubVersion) <= 0)
}

/** Packages are only fetched from where the catalog itself lives, over HTTPS (plain HTTP only on this computer, for testing). */
export function packageUrl(catalogUrl: string, app: CatalogApp): URL {
  const base = new URL(catalogUrl)
  const url = new URL(app.package.path, base)
  if (url.origin !== base.origin) throw new Error(`${app.id}: the package is not on the catalog's host`)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error(`${app.id}: packages are only downloaded over HTTPS`)
  return url
}
