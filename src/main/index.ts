import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import appIcon from '../../assets/branding/busyhub-logo.png?asset'
import type { HubEvent, RawInput, RunMode, SettingsValues } from '../shared/types.ts'
import { Config } from './config.ts'
import { HUB_LOG, Hub } from './hub.ts'
import { DEFAULT_CATALOG_URL, RemoteCatalog } from './remote-catalog.ts'

const here = dirname(fileURLToPath(import.meta.url))
const isMac = process.platform === 'darwin'

const BAR_POLL_MS = 15_000
const RESCAN_DEBOUNCE_MS = 400
/** New and updated catalog apps show up without a restart. */
const CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000

// Official apps come from the online catalog. A release also ships a snapshot of it (scripts/build-catalog.ts) for
// a first start without a connection; in development the apps are built straight from the repository's apps/.
const official = app.isPackaged ? [] : [join(app.getAppPath(), 'apps')]
const snapshot = app.isPackaged ? join(process.resourcesPath, 'catalog') : null
const template = app.isPackaged ? join(process.resourcesPath, 'template') : join(app.getAppPath(), 'templates', 'starter')
// A fork or a local test server can serve its own catalog.
const catalogUrl = process.env.BUSYHUB_CATALOG_URL || DEFAULT_CATALOG_URL

let window: BrowserWindow | null = null

function send(event: HubEvent): void {
  window?.webContents.send('hub:event', event)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'BusyHub',
    icon: appIcon,
    backgroundColor: '#0b0b0c',
    // macOS draws the traffic lights over the app's own header; Windows and Linux keep their native title bar.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  // Links in app descriptions open in the browser, never inside the hub.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(here, '../renderer/index.html'))
  return win
}

// One BusyHub at a time: two would draw over each other on the same bar. A second launch focuses the first window.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

app.whenReady().then(async () => {
  if (isMac) app.dock?.setIcon(appIcon)
  const config = await Config.load(join(app.getPath('userData'), 'config.json'))
  const appsFolder = join(app.getPath('documents'), 'BusyHub', 'apps')
  mkdirSync(appsFolder, { recursive: true })
  let hub: Hub | undefined
  const catalog = new RemoteCatalog({
    url: catalogUrl,
    cacheDir: join(app.getPath('userData'), 'catalog'),
    bundledDir: snapshot,
    hubVersion: app.getVersion(),
    log: (level, text) => hub?.notice(level, text),
  })
  hub = new Hub(
    {
      official,
      appsFolder,
      packages: join(app.getPath('userData'), 'packages'),
      template,
      storage: join(app.getPath('userData'), 'storage'),
      worker: join(here, 'host-worker.js'),
    },
    config,
    catalog,
    send,
  )
  if (config.secretsReset) {
    hub.notice('warn', 'The saved bar password and secret settings could not be read on this install. Enter them again.')
  }

  // Adding or editing an app in any watched folder updates the marketplace without a restart.
  const watchers = new Map<string, FSWatcher>()
  let rescan: ReturnType<typeof setTimeout> | undefined
  const onChange = (_event: string, file: string | Buffer | null) => {
    if (typeof file === 'string' && /(^|[/\\])(node_modules|dist|\.git)([/\\]|$)/.test(file)) return
    clearTimeout(rescan)
    rescan = setTimeout(() => {
      try {
        hub.rescan()
      } catch (err) {
        send({ type: 'log', line: { appId: HUB_LOG, level: 'warn', text: String(err), at: Date.now() } })
      }
    }, RESCAN_DEBOUNCE_MS)
  }
  const syncWatchers = () => {
    const wanted = new Set(hub.watchedFolders())
    for (const [dir, watcher] of watchers) {
      if (!wanted.has(dir)) {
        watcher.close()
        watchers.delete(dir)
      }
    }
    for (const dir of wanted) {
      if (watchers.has(dir)) continue
      try {
        watchers.set(dir, watch(dir, { recursive: true }, onChange))
      } catch {
        // A folder that cannot be watched is still scanned on every refresh.
      }
    }
  }

  ipcMain.handle('hub:snapshot', () => hub.snapshot())
  ipcMain.handle('hub:refresh', () => hub.refresh())
  ipcMain.handle('hub:refreshCatalog', () => hub.refreshCatalog())
  ipcMain.handle('hub:download', (_e, id: string) => hub.download(id))
  ipcMain.handle('hub:connect', (_e, addr: string, password: string | null) => hub.connect(addr, password))
  ipcMain.handle('hub:streamConfig', () => hub.streamConfig())
  ipcMain.handle('hub:run', (_e, id: string, mode: RunMode) => hub.run(id, mode))
  ipcMain.handle('hub:stop', (_e, id: string) => hub.stop(id))
  ipcMain.handle('hub:install', (_e, id: string) => hub.install(id))
  ipcMain.handle('hub:uninstall', (_e, id: string) => hub.uninstall(id))
  ipcMain.handle('hub:values', (_e, id: string) => hub.values(id))
  ipcMain.handle('hub:saveValues', (_e, id: string, values: SettingsValues) => hub.saveValues(id, values))
  ipcMain.handle('hub:setMode', (_e, id: string, mode: RunMode) => hub.setMode(id, mode))
  ipcMain.handle('hub:createApp', async (_e, name: string) => {
    const id = await hub.createApp(name)
    syncWatchers()
    return id
  })
  ipcMain.handle('hub:addApp', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add an app folder',
      message: 'Choose a BUSY app project, or a folder that holds several. It stays where it is.',
      properties: ['openDirectory'],
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const id = await hub.addPath(path)
    syncWatchers()
    return id
  })
  ipcMain.handle('hub:importPackage', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import a package',
      properties: ['openFile'],
      filters: [{ name: 'BUSY app package', extensions: ['tgz'] }],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : hub.addPath(path)
  })
  ipcMain.handle('hub:forget', async (_e, id: string) => {
    await hub.forget(id)
    syncWatchers()
  })
  ipcMain.handle('hub:reveal', (_e, id: string) => {
    const dir = hub.appDir(id)
    if (dir) shell.showItemInFolder(dir)
  })
  ipcMain.handle('hub:openAppsFolder', () => shell.openPath(appsFolder).then(() => undefined))
  ipcMain.on('hub:input', (_e, raw: RawInput) => hub.input(raw))

  window = createWindow()
  window.on('closed', () => {
    window = null
  })

  void hub.refresh().then(syncWatchers)
  // The saved catalog shows at once; the online one replaces it when it arrives.
  void hub.refreshCatalog()
  const poll = setInterval(() => void hub.pollBar(), BAR_POLL_MS)
  const catalogPoll = setInterval(() => void hub.refreshCatalog(), CATALOG_REFRESH_MS)

  app.on('activate', () => {
    if (!window) {
      window = createWindow()
      window.on('closed', () => {
        window = null
      })
    }
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    // Runs on this computer drew on the bar; clear them before the process goes away.
    event.preventDefault()
    quitting = true
    clearInterval(poll)
    clearInterval(catalogPoll)
    for (const watcher of watchers.values()) watcher.close()
    // Clearing the bar should be quick; an unreachable bar must not keep BusyHub from quitting.
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000))
    void Promise.race([hub.shutdown(), timeout]).finally(() => app.quit())
  })
}).catch((err: unknown) => {
  dialog.showErrorBox('BusyHub could not start', err instanceof Error ? (err.stack ?? err.message) : String(err))
  app.exit(1)
})

// On macOS runs on this computer keep going with the window closed; the hub quits from the menu or Cmd+Q.
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
