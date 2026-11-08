// Messages between the main process and a host app's worker thread.
import type { BusyInputEvent, SettingsValues } from '../shared/types.ts'

export interface HostInit {
  appId: string
  /** Absolute path of the built scripts/main.js. */
  entry: string
  /** Origin of the bar's HTTP API, e.g. http://10.0.4.20. */
  barOrigin: string
  password: string | null
  settingsVersion: number
  values: SettingsValues
  /** JSON file that backs the app's localStorage. */
  storageFile: string
}

export type MainToHost = { type: 'input'; event: BusyInputEvent }

export type HostToMain =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'listening'; on: boolean }
  | { type: 'settings'; values: SettingsValues }
