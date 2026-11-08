// BusyHub's own updates, from the latest*.yml files on the GitHub releases (electron-builder's publish config).
// Where this copy can replace itself, an update downloads in the background and installs on the next quit, or right
// away when the user restarts for it. Where it can't (see update-mode.ts), BusyHub only says that a new version exists.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types.ts'
import type { Log } from './builder.ts'
import { teamIdentifier, updateMode, type UpdateMode } from './update-mode.ts'

const { autoUpdater } = electronUpdater
const RELEASES = 'https://github.com/niklas-schmidt-dev/busyhub/releases'

async function detectMode(): Promise<UpdateMode> {
  let teamId: string | null = null
  if (process.platform === 'darwin') {
    // process.execPath is BusyHub.app/Contents/MacOS/BusyHub; codesign describes the bundle on stderr.
    const bundle = join(process.execPath, '..', '..', '..')
    try {
      const { stderr } = await promisify(execFile)('codesign', ['-dv', '--verbose=2', bundle])
      teamId = teamIdentifier(stderr)
    } catch {
      // Unsigned: no Team ID.
    }
  }
  return updateMode(process.platform, {
    teamId,
    appImage: Boolean(process.env.APPIMAGE),
    packaged: existsSync(join(process.resourcesPath, 'package-type')),
  })
}

export class Updater {
  #status: UpdateStatus = { state: 'idle' }
  #checking = false
  readonly #mode: Promise<UpdateMode>
  readonly #emit: (status: UpdateStatus) => void
  readonly #log: Log

  constructor(emit: (status: UpdateStatus) => void, log: Log) {
    this.#emit = emit
    this.#log = log
    this.#mode = detectMode()
    autoUpdater.logger = null
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    // A local server can stand in for the GitHub releases, for testing, also in a development run.
    if (process.env.BUSYHUB_UPDATE_URL) {
      autoUpdater.forceDevUpdateConfig = !app.isPackaged
      autoUpdater.setFeedURL({ provider: 'generic', url: process.env.BUSYHUB_UPDATE_URL })
    }

    autoUpdater.on('update-available', (info) => {
      void this.#mode.then((mode) => {
        this.#set(
          mode === 'auto'
            ? { state: 'downloading', version: info.version, percent: 0 }
            : { state: 'manual', version: info.version, url: `${RELEASES}/tag/v${info.version}` },
        )
      })
    })
    autoUpdater.on('download-progress', (progress) => {
      if (this.#status.state === 'downloading') this.#set({ ...this.#status, percent: Math.floor(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.#log('info', `BusyHub ${info.version} is downloaded and installs when BusyHub restarts.`)
      this.#set({ state: 'ready', version: info.version })
    })
    autoUpdater.on('error', (err) => {
      // Offline checks fail quietly. A download that breaks off is tried again at the next check; an install that
      // fails, such as a canceled password prompt, stays ready to restart again.
      if (this.#status.state === 'downloading') {
        this.#log('warn', `Could not download BusyHub ${this.#status.version}: ${err.message}`)
        this.#set({ state: 'idle' })
      } else if (this.#status.state === 'ready') {
        this.#log('warn', `Could not install BusyHub ${this.#status.version}: ${err.message}`)
      }
    })
  }

  get status(): UpdateStatus {
    return this.#status
  }

  /** Asks the release feed for a newer version; downloads it where this install can update itself. */
  async check(): Promise<void> {
    // Development runs have no release to update to.
    if (!app.isPackaged && !process.env.BUSYHUB_UPDATE_URL) return
    if (this.#checking || this.#status.state === 'downloading' || this.#status.state === 'ready') return
    this.#checking = true
    try {
      autoUpdater.autoDownload = (await this.#mode) === 'auto'
      const result = await autoUpdater.checkForUpdates()
      // A broken download also arrives as the error event above; awaiting it here keeps its rejection handled.
      await result?.downloadPromise
    } catch {
      // No connection, or GitHub is down: the next check tries again.
    } finally {
      this.#checking = false
    }
  }

  /** Restarts into a downloaded update, or opens the release page where this copy can't update itself. */
  install(): void {
    if (this.#status.state === 'ready') autoUpdater.quitAndInstall()
    else if (this.#status.state === 'manual') void shell.openExternal(this.#status.url)
  }

  #set(status: UpdateStatus): void {
    this.#status = status
    this.#emit(status)
  }
}
