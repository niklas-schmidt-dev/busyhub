// The hub's core: the catalog, the bar connection, and every run on the bar or on this computer.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { InputSynth } from '../shared/input.ts'
import { resolveValues } from '../shared/settings.ts'
import type {
  AppEntry,
  BarStatus,
  BusyInputEvent,
  CatalogStatus,
  HubEvent,
  HubSnapshot,
  LogLine,
  RawInput,
  RunMode,
  RunState,
  RunStatus,
  SettingsValues,
} from '../shared/types.ts'
import { Bar, errorText } from './bar.ts'
import { buildProject, packageArtifacts, type Artifacts } from './builder.ts'
import { projectAppmeta, scan, withBarApps, withCatalog, type BarApp } from './catalog.ts'
import type { Config } from './config.ts'
import type { HostInit, HostToMain } from './host-protocol.ts'
import type { RemoteCatalog } from './remote-catalog.ts'
import { createProject, importPackage } from './scaffold.ts'

export interface HubPaths {
  /** Source folders of official apps: the repository's apps/ in development, nothing in a release. */
  official: string[]
  /** Where New app creates projects; always scanned. */
  appsFolder: string
  /** Where imported .tgz packages are unpacked; always scanned. */
  packages: string
  template: string
  /** localStorage files of host runs. */
  storage: string
  /** The bundled host-worker.js. */
  worker: string
}

const MAX_LOGS = 1000
/** Log lines that are not about one app. */
export const HUB_LOG = 'hub'

interface HostRun {
  worker: Worker
  listening: boolean
  stopping: boolean
  startedAt: number
}

export class Hub {
  readonly #paths: HubPaths
  readonly #config: Config
  readonly #catalog: RemoteCatalog
  readonly #emit: (event: HubEvent) => void
  #bar: Bar
  #status: BarStatus = { state: 'offline', error: 'Not checked yet' }
  #local: AppEntry[] = []
  #barApps: BarApp[] | null = null
  #apps: AppEntry[] = []
  readonly #runs = new Map<string, RunState>()
  readonly #hosts = new Map<string, HostRun>()
  readonly #busy = new Set<string>()
  readonly #logs: LogLine[] = []
  readonly #input = new InputSynth((event) => this.#deliver(event))

  constructor(paths: HubPaths, config: Config, catalog: RemoteCatalog, emit: (event: HubEvent) => void) {
    this.#paths = paths
    this.#config = config
    this.#catalog = catalog
    this.#emit = emit
    this.#bar = new Bar(config.barAddr, config.barPassword)
  }

  snapshot(): HubSnapshot {
    return {
      bar: { addr: this.#config.barAddr, hasPassword: this.#config.barPassword !== null },
      appsFolder: this.#paths.appsFolder,
      catalog: this.#catalog.status,
      status: this.#status,
      apps: this.#apps,
      runs: [...this.#runs.values()],
      logs: [...this.#logs],
      modes: this.#config.modes,
    }
  }

  streamConfig(): { addr: string; origin: string; password: string | null } {
    return { addr: this.#bar.base.host, origin: this.#bar.base.origin, password: this.#bar.password }
  }

  appDir(id: string): string | null {
    return this.#find(id).dir
  }

  /** Every folder the catalog reads, for the file watchers. */
  watchedFolders(): string[] {
    return [...this.#paths.official, this.#catalog.packagesDir, this.#paths.appsFolder, this.#paths.packages, ...this.#config.folders].filter((dir) =>
      existsSync(dir),
    )
  }

  /** Rescans the local catalog and asks the bar for its status and installed apps. */
  async refresh(): Promise<void> {
    this.rescan()
    await this.pollBar()
  }

  /** Rescans apps/ and packages/ only, e.g. after a file changed. */
  rescan(): void {
    const { apps, problems } = scan({
      // Source projects first, so in development they shadow the downloaded copies of the same apps.
      official: [...this.#paths.official, this.#catalog.packagesDir],
      local: [this.#paths.appsFolder, this.#paths.packages, ...this.#config.folders],
    })
    for (const problem of problems) this.#log(HUB_LOG, 'warn', `Skipped ${problem.path}: ${problem.error}`)
    this.#local = apps
    this.#publishApps()
  }

  async pollBar(): Promise<void> {
    const status = await this.#bar.status()
    if (status.state === 'online') {
      try {
        this.#barApps = await this.#bar.apps()
      } catch (err) {
        this.#log(HUB_LOG, 'warn', `Could not list the bar's apps: ${errorText(err)}`)
      }
    } else {
      this.#barApps = null
    }
    if (JSON.stringify(status) !== JSON.stringify(this.#status)) {
      this.#status = status
      this.#emit({ type: 'status', status })
    }
    this.#publishApps()
  }

  /** Checks the online catalog; offline, the saved copy or the snapshot BusyHub shipped with stays in use. */
  async refreshCatalog(): Promise<CatalogStatus> {
    const status = await this.#catalog.refresh()
    if (status.error) this.#log(HUB_LOG, 'warn', `Catalog not updated: ${status.error}. Showing ${status.state === 'bundled' ? 'the catalog that came with BusyHub' : 'the last catalog fetched'}.`)
    this.#emit({ type: 'catalog', status })
    this.#publishApps()
    return status
  }

  /** Downloads an official app, or its update, so it runs without a connection from then on. */
  async download(id: string): Promise<void> {
    await this.#guarded(id, () => this.#fetchFromCatalog(this.#find(id)))
  }

  async connect(addr: string, password: string | null): Promise<BarStatus> {
    // Constructing the client validates the address before anything is saved.
    const next = new Bar(addr, password === null ? this.#config.barPassword : password || null)
    await this.#config.setBar(addr.trim(), password)
    this.#bar = next
    await this.pollBar()
    return this.#status
  }

  async run(id: string, mode: RunMode): Promise<void> {
    const app = this.#find(id)
    if (!app.hub.modes.includes(mode)) throw new Error(`${app.name} cannot run ${mode === 'device' ? 'on the bar' : 'on this computer'}`)
    await this.#exclusive(id, mode, async () => {
      // The same app on both sides would draw under the same name.
      if (mode === 'device') await this.#stopHost(id)
      else if (this.#runs.get(id)?.mode === 'device' && this.#runs.get(id)?.status === 'running') await this.#bar.quit()

      if (mode === 'device') await this.#runOnBar(app)
      else await this.#runHere(app)
    })
  }

  async stop(id: string): Promise<void> {
    const run = this.#runs.get(id)
    if (this.#hosts.has(id)) {
      await this.#stopHost(id)
      return
    }
    await this.#exclusive(id, run?.mode ?? 'device', async () => {
      await this.#bar.quit()
      this.#setRun(id, 'device', 'stopped', 'Quit on the bar')
    })
  }

  async install(id: string): Promise<void> {
    const app = this.#find(id)
    await this.#exclusive(id, 'device', async () => {
      await this.#installOnBar(app)
      this.#setRun(id, 'device', 'stopped', `Installed v${app.version}`)
    })
  }

  async uninstall(id: string): Promise<void> {
    await this.#exclusive(id, 'device', async () => {
      await this.#bar.api.AppsRemove({ app_id: id })
      this.#setRun(id, 'device', 'stopped', 'Removed from the bar')
      this.#log(id, 'info', 'Removed from the bar; its settings stay on the bar.')
    })
    await this.pollBar()
  }

  values(id: string): SettingsValues {
    const app = this.#find(id)
    return resolveValues(app.settings, this.#config.values(id))
  }

  async saveValues(id: string, values: SettingsValues): Promise<void> {
    const app = this.#find(id)
    await this.#config.setValues(id, resolveValues(app.settings, values))
    if (this.#hosts.has(id)) this.#log(id, 'info', 'Saved. The run on this computer picks the new settings up on its next start.')
    if (app.onBar) {
      try {
        await this.#pushSettings(app)
        this.#log(id, 'info', 'Settings saved on the bar.')
      } catch (err) {
        this.#log(id, 'warn', `Saved here, but not on the bar: ${errorText(err)}`)
      }
    }
  }

  setMode(id: string, mode: RunMode): Promise<void> {
    return this.#config.setMode(id, mode)
  }

  async createApp(name: string): Promise<string> {
    const log = this.#logFor(HUB_LOG)
    const taken = new Set(this.#apps.map((app) => app.id))
    const id = await createProject(this.#paths.appsFolder, this.#paths.template, name, taken, log)
    this.rescan()
    return id
  }

  /** A .tgz is imported; a folder is linked where it is, whether it is one app or a folder of apps. */
  async addPath(path: string): Promise<string> {
    if (path.endsWith('.tgz')) {
      const id = await importPackage(path, this.#paths.packages, this.#logFor(HUB_LOG))
      this.rescan()
      return id
    }
    const before = new Set(this.#apps.map((app) => app.id))
    await this.#config.setFolders([...this.#config.folders, resolve(path)])
    this.rescan()
    const added = this.#apps.find((app) => !before.has(app.id) && app.dir !== null && (app.dir === resolve(path) || app.dir.startsWith(resolve(path) + sep)))
    if (!added) {
      await this.#config.setFolders(this.#config.folders.filter((dir) => dir !== resolve(path)))
      this.rescan()
      throw new Error(projectAppmeta(path) ? `${path} holds an app whose id is already in BusyHub` : `${path} holds no BUSY app (appmeta/manifest.json, directly or under src/)`)
    }
    this.#log(HUB_LOG, 'info', `Linked ${path}`)
    return added.id
  }

  async forget(id: string): Promise<void> {
    const app = this.#find(id)
    const download = app.official && app.dir !== null && app.dir.startsWith(resolve(this.#catalog.packagesDir) + sep)
    if ((app.official && !download) || !app.dir) throw new Error(`${app.name} is not a local app`)
    await this.#stopHost(id)
    if (download) {
      // The app stays in the catalog and can be downloaded again.
      rmSync(app.dir, { recursive: true, force: true })
    } else if (app.dir.startsWith(resolve(this.#paths.packages) + sep)) {
      rmSync(app.dir, { recursive: true, force: true })
    } else if (this.#config.folders.includes(app.dir)) {
      await this.#config.setFolders(this.#config.folders.filter((dir) => dir !== app.dir))
    } else {
      throw new Error(`${app.name} lives in ${app.dir}. Move or delete that folder to remove it.`)
    }
    this.#log(HUB_LOG, 'info', download ? `Removed the download of ${app.name}; it stays in the catalog.` : `Removed ${app.name} from BusyHub`)
    this.rescan()
  }

  /** A message for the hub's own log, e.g. about settings that could not be restored. */
  notice(level: LogLine['level'], text: string): void {
    this.#log(HUB_LOG, level, text)
  }

  input(raw: RawInput): void {
    this.#input.feed(raw)
  }

  /** Stops every run on this computer and clears what it drew; called when the hub quits. */
  async shutdown(): Promise<void> {
    await Promise.all([...this.#hosts.keys()].map((id) => this.#stopHost(id)))
  }

  async #runOnBar(app: AppEntry): Promise<void> {
    if (app.source !== 'bar') await this.#installOnBar(app)
    this.#setRun(app.id, 'device', 'starting', 'Launching on the bar')
    await this.#bar.launch(app.id)
    // The bar runs one app at a time, so whatever ran there before is gone.
    for (const run of this.#runs.values()) {
      if (run.mode === 'device' && run.status === 'running' && run.id !== app.id) {
        this.#setRun(run.id, 'device', 'stopped', 'Replaced on the bar')
      }
    }
    this.#setRun(app.id, 'device', 'running', 'On the bar')
    this.#log(app.id, 'info', 'Launched on the bar. Hold Back on the bar to quit it there.')
  }

  async #installOnBar(entry: AppEntry): Promise<void> {
    const artifacts = await this.#artifacts(entry, 'device')
    // A catalog app was just downloaded, so its settings schema is known only now.
    const app = this.#find(entry.id)
    this.#setRun(app.id, 'device', 'installing', 'Uploading to the bar')
    const installed = await this.#bar.install(readFileSync(artifacts.tgz))
    this.#log(app.id, 'info', `Installed v${installed.version} on the bar.`)
    await this.#pushSettings(app)
    await this.pollBar()
  }

  /** Sends settings only once they were edited here, so values changed in the bar's own web UI survive otherwise. */
  async #pushSettings(app: AppEntry): Promise<void> {
    const stored = this.#config.values(app.id)
    if (!app.settings || !stored) return
    await this.#bar.api.AppsSettingsSet({
      app_id: app.id,
      settings: { version: app.settings.version, values: resolveValues(app.settings, stored) },
    })
  }

  async #runHere(listed: AppEntry): Promise<void> {
    const { entry } = await this.#artifacts(listed, 'host')
    const app = this.#find(listed.id)
    this.#setRun(app.id, 'host', 'starting', 'Starting on this computer')
    const init: HostInit = {
      appId: app.id,
      entry,
      barOrigin: this.#bar.base.origin,
      password: this.#bar.password,
      settingsVersion: app.settings?.version ?? 1,
      values: resolveValues(app.settings, this.#config.values(app.id)),
      storageFile: join(this.#paths.storage, `${app.id}.json`),
    }
    const worker = new Worker(this.#paths.worker, { workerData: init })
    const host: HostRun = { worker, listening: false, stopping: false, startedAt: Date.now() }
    this.#hosts.set(app.id, host)
    let failure: string | null = null

    worker.on('message', (message: HostToMain) => {
      if (message.type === 'log') this.#log(app.id, message.level, message.text)
      else if (message.type === 'listening') host.listening = message.on
      else if (message.type === 'settings') void this.#config.setValues(app.id, resolveValues(app.settings, message.values))
    })
    worker.on('error', (err: unknown) => {
      failure = errorText(err)
      this.#log(app.id, 'error', err instanceof Error && err.stack ? err.stack : failure)
    })
    worker.on('exit', (code) => {
      if (this.#hosts.get(app.id) === host) this.#hosts.delete(app.id)
      if (host.listening) this.#input.reset()
      void this.#clearDisplay(app.id)
      if (host.stopping) this.#setRun(app.id, 'host', 'stopped', 'Stopped')
      else if (failure || code !== 0) this.#setRun(app.id, 'host', 'error', failure ?? `Exited with code ${code}`)
      else this.#setRun(app.id, 'host', 'stopped', 'The app quit')
    })
    this.#setRun(app.id, 'host', 'running', 'Running on this computer')
  }

  async #stopHost(id: string): Promise<void> {
    const host = this.#hosts.get(id)
    if (!host) return
    host.stopping = true
    await host.worker.terminate()
  }

  async #clearDisplay(id: string): Promise<void> {
    try {
      await this.#bar.api.DisplayClear({ application_name: id })
    } catch (err) {
      this.#log(id, 'warn', `Could not clear the bar's screen: ${errorText(err)}`)
    }
  }

  async #artifacts(app: AppEntry, mode: RunMode): Promise<Artifacts> {
    if (app.source === 'project' && app.dir) {
      this.#setRun(app.id, mode, 'building', 'Building with busy-cli')
      return buildProject(app.dir, app.id, this.#logFor(app.id))
    }
    if (app.source === 'package' && app.dir) return packageArtifacts(app.dir, app.id)
    if (app.source === 'catalog') {
      this.#setRun(app.id, mode, 'installing', 'Downloading from the catalog')
      await this.#fetchFromCatalog(app)
      const downloaded = this.#find(app.id)
      if (downloaded.source !== 'package' || !downloaded.dir) throw new Error(`${app.name} could not be downloaded`)
      return packageArtifacts(downloaded.dir, app.id)
    }
    throw new Error(`${app.name} exists only on the bar; there is nothing to build or install.`)
  }

  async #fetchFromCatalog(app: AppEntry): Promise<void> {
    // A run on this computer reads the files an update replaces.
    if (this.#hosts.has(app.id)) {
      this.#log(app.id, 'info', 'Stopping the run on this computer to update the app.')
      await this.#stopHost(app.id)
    }
    await this.#catalog.download(app.id, app.source === 'catalog' ? null : app.version)
    this.rescan()
  }

  /** Input goes to the most recently started run on this computer that listens, like the one app in front on the bar. */
  #deliver(event: BusyInputEvent): void {
    const target = [...this.#hosts.values()].filter((host) => host.listening).sort((a, b) => b.startedAt - a.startedAt)[0]
    target?.worker.postMessage({ type: 'input', event })
  }

  /** One step per app at a time; a failure shows as the app's run state. */
  async #exclusive(id: string, mode: RunMode, work: () => Promise<void>): Promise<void> {
    await this.#guarded(id, work, (message) => this.#setRun(id, mode, 'error', message))
  }

  async #guarded(id: string, work: () => Promise<void>, onError?: (message: string) => void): Promise<void> {
    if (this.#busy.has(id)) throw new Error('This app is busy with another step; wait for it to finish.')
    this.#busy.add(id)
    try {
      await work()
    } catch (err) {
      const message = errorText(err)
      onError?.(message)
      this.#log(id, 'error', message)
      throw new Error(message)
    } finally {
      this.#busy.delete(id)
    }
  }

  #find(id: string): AppEntry {
    const app = this.#apps.find((entry) => entry.id === id)
    if (!app) throw new Error(`No app with the id ${id}`)
    return app
  }

  #publishApps(): void {
    this.#apps = withBarApps(withCatalog(this.#local, this.#catalog.apps()), this.#barApps)
    this.#emit({ type: 'apps', apps: this.#apps })
  }

  #setRun(id: string, mode: RunMode, status: RunStatus, detail: string): void {
    this.#runs.set(id, { id, mode, status, detail, at: Date.now() })
    this.#emit({ type: 'runs', runs: [...this.#runs.values()] })
  }

  #logFor(appId: string) {
    return (level: LogLine['level'], text: string) => this.#log(appId, level, text)
  }

  #log(appId: string, level: LogLine['level'], text: string): void {
    const line: LogLine = { appId, level, text, at: Date.now() }
    this.#logs.push(line)
    if (this.#logs.length > MAX_LOGS) this.#logs.splice(0, this.#logs.length - MAX_LOGS)
    this.#emit({ type: 'log', line })
  }
}
