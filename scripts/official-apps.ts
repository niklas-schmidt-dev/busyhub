// The official apps in apps/, read the same way the hub reads them. Shared by the check, build and README scripts.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseHub, parseManifest, parseSettings, projectAppmeta, type Manifest } from '../src/main/catalog.ts'
import type { HubMeta, SettingsSchema } from '../src/shared/types.ts'

export const ROOT = resolve(import.meta.dirname, '..')
export const APPS = join(ROOT, 'apps')
/** Official ids are busyhub.<folder>, and the firmware allows 32 characters. */
export const FOLDER = /^[a-z0-9][a-z0-9-]{0,23}$/

export interface OfficialApp {
  folder: string
  dir: string
  manifest: Manifest
  hub: HubMeta
  rawHub: Record<string, unknown> | null
  settings: SettingsSchema | null
  hasSettingsFile: boolean
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

export function officialFolders(): string[] {
  return readdirSync(APPS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

/** Reads one app; throws with a readable message when its manifest is missing or invalid. */
export function readOfficialApp(folder: string): OfficialApp {
  const dir = join(APPS, folder)
  const appmeta = projectAppmeta(dir)
  if (!appmeta) throw new Error('no src/appmeta/manifest.json')
  const manifest = parseManifest(readJson(join(appmeta, 'manifest.json')))
  const hubPath = join(dir, 'hub.json')
  const rawHub = existsSync(hubPath) ? (readJson(hubPath) as Record<string, unknown>) : null
  const settingsPath = join(appmeta, 'settings.json')
  const hasSettingsFile = existsSync(settingsPath)
  return {
    folder,
    dir,
    manifest,
    hub: parseHub(rawHub ?? undefined, manifest.id, ['device', 'host']),
    rawHub,
    settings: hasSettingsFile ? parseSettings(readJson(settingsPath)) : null,
    hasSettingsFile,
  }
}
