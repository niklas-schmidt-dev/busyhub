// The contract between the main process, the preload bridge and the renderer.

/** Where an app runs: installed on the bar, or as a script on this Mac that drives the bar over HTTP. */
export type RunMode = 'device' | 'host'

/** How the hub gets an app's build: from a source project, from a built .tgz package, or not at all (it only exists on the bar). */
export type AppSource = 'project' | 'package' | 'bar'

/** Marketplace metadata from an app's optional hub.json. */
export interface HubMeta {
  category: string
  tagline: string
  /** #RRGGBB, used for the card and the fallback icon. */
  accent: string
  /** The modes this app supports; the first one is the default. */
  modes: RunMode[]
}

interface FieldBase {
  label: string
  description?: string
}

export interface GeoDefault {
  mode: 'auto' | 'fixed'
  name?: string
  lat?: number
  lon?: number
}

/** One entry of appmeta/settings.json, as the firmware's settings schema describes it. */
export type SettingsField =
  | (FieldBase & { type: 'boolean'; default: boolean })
  | (FieldBase & { type: 'integer'; default: number; min?: number; max?: number; step?: number })
  | (FieldBase & { type: 'string'; default: string; min_length?: number; max_length?: number; sensitive?: boolean })
  | (FieldBase & { type: 'enum'; default: string; options: Array<{ value: string; label: string }> })
  | (FieldBase & { type: 'color'; default: string })
  | (FieldBase & { type: 'time'; default: string })
  | (FieldBase & { type: 'geolocation'; default: GeoDefault })
  | (FieldBase & { type: 'group'; fields: Record<string, SettingsField> })

export interface SettingsSchema {
  format_version: 1
  version: number
  fields: Record<string, SettingsField>
}

/** Setting values keyed by field id; groups are nested objects. */
export type SettingsValues = { [key: string]: unknown }

export interface AppEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  source: AppSource
  /** Part of BusyHub's own catalog (apps/ in the repository), as opposed to your local apps. */
  official: boolean
  /** The project root, or the folder a package was unpacked to. Null for apps that exist only on the bar. */
  dir: string | null
  hub: HubMeta
  settings: SettingsSchema | null
  /** The 8×8 front icon as a data URL, when the app has one. */
  icon: string | null
  /** Set when an app with this id is installed on the bar. */
  onBar: { version: string } | null
}

export type RunStatus = 'building' | 'installing' | 'starting' | 'running' | 'stopped' | 'error'

export interface RunState {
  id: string
  mode: RunMode
  status: RunStatus
  detail: string
  at: number
}

export type BarStatus =
  | { state: 'online'; name: string; firmware: string; api: string; battery: number | null }
  | { state: 'locked'; api: string }
  | { state: 'offline'; error: string }

export interface BarConfig {
  addr: string
  hasPassword: boolean
}

export interface LogLine {
  appId: string
  level: 'info' | 'warn' | 'error'
  text: string
  at: number
}

export type ButtonKey = 'ok' | 'start' | 'back'

/** Input as the bar's state stream and the on-screen controls report it: plain presses, releases and wheel steps. */
export type RawInput =
  | { kind: 'button'; button: ButtonKey; action: 'press' | 'release' }
  | { kind: 'encoder'; delta: number }

/** Input as the BUSY Bar JS runtime hands it to listen('input', …). */
export type BusyInputEvent =
  | { key: 'encoder'; action: 'clockwise' | 'counterclockwise'; delta: 1 | -1 }
  | { key: ButtonKey; action: 'press' | 'release' | 'short' | 'long' | 'repeat' }

export interface HubSnapshot {
  bar: BarConfig
  /** Where New app creates projects. */
  appsFolder: string
  status: BarStatus
  apps: AppEntry[]
  runs: RunState[]
  logs: LogLine[]
  modes: Record<string, RunMode>
}

export type HubEvent =
  | { type: 'apps'; apps: AppEntry[] }
  | { type: 'runs'; runs: RunState[] }
  | { type: 'status'; status: BarStatus }
  | { type: 'log'; line: LogLine }

/** What the preload script exposes as window.hub. */
export interface HubApi {
  snapshot(): Promise<HubSnapshot>
  refresh(): Promise<void>
  /** Saves the bar address; a null password keeps the stored one, an empty string removes it. */
  connect(addr: string, password: string | null): Promise<BarStatus>
  /** Address and password for the renderer's live state stream. */
  streamConfig(): Promise<{ addr: string; password: string | null }>
  run(id: string, mode: RunMode): Promise<void>
  stop(id: string): Promise<void>
  install(id: string): Promise<void>
  uninstall(id: string): Promise<void>
  values(id: string): Promise<SettingsValues>
  saveValues(id: string, values: SettingsValues): Promise<void>
  setMode(id: string, mode: RunMode): Promise<void>
  createApp(name: string): Promise<string>
  /** Opens a folder dialog; the folder is linked where it is. Resolves to the new app's id, or null when cancelled. */
  addApp(): Promise<string | null>
  /** Opens a file dialog for a .tgz package built by busy-cli. */
  importPackage(): Promise<string | null>
  /** Removes a local app from BusyHub: unlinks its folder or deletes the imported package. Files in a linked folder stay. */
  forget(id: string): Promise<void>
  reveal(id: string): Promise<void>
  openAppsFolder(): Promise<void>
  /** process.platform of the main process, for window chrome. */
  platform: string
  input(raw: RawInput): void
  onEvent(listener: (event: HubEvent) => void): () => void
}
