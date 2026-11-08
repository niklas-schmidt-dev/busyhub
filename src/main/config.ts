// Persists the bar address, the HTTP access password and per-app settings in the app's data folder.
// The password and setting values can hold secrets, so they are encrypted with the OS keychain (safeStorage).
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'
import type { RunMode, SettingsValues } from '../shared/types.ts'

/** The bar's address over USB; over Wi-Fi it has its own address on the network. */
export const DEFAULT_BAR_ADDR = '10.0.4.20'

interface Secrets {
  barPassword: string | null
  values: Record<string, SettingsValues>
}

interface StoredConfig {
  version: 1
  barAddr: string
  modes: Record<string, RunMode>
  /** Linked app folders, in addition to the default apps folder. */
  folders?: string[]
  /** Secrets as safeStorage ciphertext in base64, or plain JSON when the OS offers no encryption. */
  secrets: string | null
  secretsPlain?: boolean
}

export class Config {
  readonly #file: string
  #barAddr = DEFAULT_BAR_ADDR
  #modes: Record<string, RunMode> = {}
  #folders: string[] = []
  #secrets: Secrets = { barPassword: null, values: {} }
  /** Writes run one after another, so an older snapshot never lands after a newer one. */
  #writes: Promise<void> = Promise.resolve()
  /** Set when stored secrets could not be decrypted on load. */
  secretsReset = false

  private constructor(file: string) {
    this.#file = file
  }

  static async load(file: string): Promise<Config> {
    const config = new Config(file)
    if (!existsSync(file)) return config
    const stored = JSON.parse(await readFile(file, 'utf8')) as StoredConfig
    config.#barAddr = stored.barAddr || DEFAULT_BAR_ADDR
    config.#modes = stored.modes ?? {}
    config.#folders = stored.folders ?? []
    if (stored.secrets) {
      try {
        const json = stored.secretsPlain
          ? stored.secrets
          : (await safeStorage.decryptStringAsync(Buffer.from(stored.secrets, 'base64'))).result
        const secrets = JSON.parse(json) as Partial<Secrets>
        config.#secrets = { barPassword: secrets.barPassword ?? null, values: secrets.values ?? {} }
      } catch (err) {
        // The keychain key belongs to one app identity: a reinstall with another signature, or a development
        // build, cannot read it. The password and secret settings are then asked for again.
        console.warn(`Stored secrets could not be decrypted and were reset: ${err instanceof Error ? err.message : String(err)}`)
        config.secretsReset = true
      }
    }
    return config
  }

  get barAddr(): string {
    return this.#barAddr
  }

  get barPassword(): string | null {
    return this.#secrets.barPassword
  }

  get modes(): Record<string, RunMode> {
    return { ...this.#modes }
  }

  setBar(addr: string, password: string | null): Promise<void> {
    this.#barAddr = addr
    if (password !== null) this.#secrets.barPassword = password === '' ? null : password
    return this.#save()
  }

  get folders(): string[] {
    return [...this.#folders]
  }

  setFolders(folders: string[]): Promise<void> {
    this.#folders = [...new Set(folders)]
    return this.#save()
  }

  values(id: string): SettingsValues | undefined {
    return this.#secrets.values[id]
  }

  setValues(id: string, values: SettingsValues): Promise<void> {
    this.#secrets.values[id] = values
    return this.#save()
  }

  setMode(id: string, mode: RunMode): Promise<void> {
    this.#modes[id] = mode
    return this.#save()
  }

  #save(): Promise<void> {
    // The snapshot is taken now; the write waits for the ones before it.
    const json = JSON.stringify(this.#secrets)
    const base = { version: 1 as const, barAddr: this.#barAddr, modes: { ...this.#modes }, folders: [...this.#folders] }
    this.#writes = this.#writes.then(async () => {
      const encrypted = await safeStorage.isAsyncEncryptionAvailable()
      const stored: StoredConfig = {
        ...base,
        secrets: encrypted ? (await safeStorage.encryptStringAsync(json)).toString('base64') : json,
        ...(encrypted ? {} : { secretsPlain: true }),
      }
      await mkdir(dirname(this.#file), { recursive: true })
      await writeFile(this.#file, JSON.stringify(stored, null, 2), { mode: 0o600 })
    })
    return this.#writes
  }
}
