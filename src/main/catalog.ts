// Finds apps: source projects in apps/, unpacked .tgz packages, and whatever is installed on the bar.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppEntry, HubMeta, RunMode, SettingsSchema } from '../shared/types.ts'

/** The firmware's own check for an app id (js_app_is_valid_id). */
export const APP_ID = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,31}$/

const SEMVER = /^\d+\.\d+\.\d+$/
const HEX = /^#[0-9a-fA-F]{6}$/
const ACCENTS = ['#FF5A4F', '#FFB03B', '#3DDC84', '#4FC3F7', '#B388FF', '#F06292', '#AED581']

export interface Manifest {
  id: string
  name: string
  version: string
  api_version: string
  description: string
  author: string
}

export function parseManifest(raw: unknown): Manifest {
  if (typeof raw !== 'object' || raw === null) throw new Error('manifest.json is not an object')
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !APP_ID.test(m.id)) throw new Error('manifest.id is missing or not a valid app id')
  if (typeof m.name !== 'string' || m.name === '') throw new Error('manifest.name is required')
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) throw new Error('manifest.version must be x.y.z')
  if (typeof m.api_version !== 'string' || !SEMVER.test(m.api_version)) throw new Error('manifest.api_version must be x.y.z')
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    api_version: m.api_version,
    description: typeof m.description === 'string' ? m.description : '',
    author: typeof m.author === 'string' ? m.author : '',
  }
}

/** A stable accent for apps that do not pick one. */
export function accentFor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ACCENTS[hash % ACCENTS.length] ?? ACCENTS[0]!
}

export function parseHub(raw: unknown, id: string, fallbackModes: RunMode[]): HubMeta {
  const h = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const modes = Array.isArray(h.modes) ? h.modes.filter((m): m is RunMode => m === 'device' || m === 'host') : []
  return {
    category: typeof h.category === 'string' && h.category ? h.category : 'Apps',
    tagline: typeof h.tagline === 'string' ? h.tagline : '',
    accent: typeof h.accent === 'string' && HEX.test(h.accent) ? h.accent : accentFor(id),
    modes: modes.length > 0 ? [...new Set(modes)] : fallbackModes,
  }
}

export function parseSettings(raw: unknown): SettingsSchema | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  if (typeof s.version !== 'number' || typeof s.fields !== 'object' || s.fields === null) return null
  return raw as SettingsSchema
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readOptionalJson(path: string): unknown {
  return existsSync(path) ? readJson(path) : undefined
}

function iconFrom(appmeta: string): string | null {
  const path = join(appmeta, 'icon_front_8x8.png')
  return existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : null
}

/** The appmeta/ folder of a project, the way busy-cli finds it: under src/ or at the root. */
export function projectAppmeta(root: string): string | null {
  for (const candidate of [join(root, 'src', 'appmeta'), join(root, 'appmeta')]) {
    if (existsSync(join(candidate, 'manifest.json'))) return candidate
  }
  return null
}

/** A package is a folder with package.tgz and the unpacked <id>/ next to it; a project is a busy-cli project. */
function detect(dir: string): { source: 'project' | 'package'; appmeta: string } | null {
  if (existsSync(join(dir, 'package.tgz'))) {
    for (const sub of subdirs(dir)) {
      const appmeta = join(sub, 'appmeta')
      if (existsSync(join(appmeta, 'manifest.json'))) return { source: 'package', appmeta }
    }
    return null
  }
  const appmeta = projectAppmeta(dir)
  return appmeta ? { source: 'project', appmeta } : null
}

function entryFrom(dir: string, official: boolean): AppEntry | null {
  const found = detect(dir)
  if (!found) return null
  const manifest = parseManifest(readJson(join(found.appmeta, 'manifest.json')))
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    source: found.source,
    official,
    dir,
    hub: parseHub(readOptionalJson(join(dir, 'hub.json')), manifest.id, ['device', 'host']),
    settings: parseSettings(readOptionalJson(join(found.appmeta, 'settings.json'))),
    icon: iconFrom(found.appmeta),
    onBar: null,
  }
}

export interface ScanSources {
  /** Folders whose subfolders are official apps: the repository's apps/ in development, the bundled builds in a release. */
  official: string[]
  /** Your folders: each is an app itself, or holds apps in its subfolders. Imported packages live in one of them. */
  local: string[]
}

export interface ScanResult {
  apps: AppEntry[]
  problems: Array<{ path: string; error: string }>
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_') && entry.name !== 'node_modules')
    .map((entry) => join(dir, entry.name))
}

/** Official apps come first; when two folders hold the same id, the first one wins and the other is reported. */
export function scan(sources: ScanSources): ScanResult {
  const apps = new Map<string, AppEntry>()
  const problems: ScanResult['problems'] = []

  const add = (dir: string, official: boolean) => {
    try {
      const entry = entryFrom(dir, official)
      if (!entry) return
      const existing = apps.get(entry.id)
      if (existing) throw new Error(`the id ${entry.id} is already used by ${existing.dir}`)
      apps.set(entry.id, entry)
    } catch (err) {
      problems.push({ path: dir, error: err instanceof Error ? err.message : String(err) })
    }
  }

  for (const root of sources.official) for (const dir of subdirs(root)) add(dir, true)
  for (const root of sources.local) {
    if (!existsSync(root)) continue
    // A linked folder is an app itself, or a folder of apps.
    if (detect(root)) add(root, false)
    else for (const dir of subdirs(root)) add(dir, false)
  }

  return { apps: [...apps.values()], problems }
}

export interface BarApp {
  id: string
  name: string
  version: string
  author: string
  description: string
}

/** Marks catalog apps that are on the bar and adds the bar's own apps, which can only be launched there. */
export function withBarApps(apps: AppEntry[], barApps: BarApp[] | null): AppEntry[] {
  if (!barApps) return apps
  const onBar = new Map(barApps.map((app) => [app.id, app]))
  const merged = apps.map((app) => {
    const installed = onBar.get(app.id)
    return { ...app, onBar: installed ? { version: installed.version } : null }
  })
  const known = new Set(apps.map((app) => app.id))
  for (const app of barApps) {
    if (known.has(app.id)) continue
    merged.push({
      id: app.id,
      name: app.name,
      version: app.version,
      description: app.description,
      author: app.author,
      source: 'bar',
      official: false,
      dir: null,
      hub: { category: 'Installed', tagline: '', accent: accentFor(app.id), modes: ['device'] },
      settings: null,
      icon: null,
      onBar: { version: app.version },
    })
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name))
}
