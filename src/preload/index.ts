import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HubApi, HubEvent } from '../shared/types.ts'

const api: HubApi = {
  snapshot: () => ipcRenderer.invoke('hub:snapshot'),
  refresh: () => ipcRenderer.invoke('hub:refresh'),
  connect: (addr, password) => ipcRenderer.invoke('hub:connect', addr, password),
  streamConfig: () => ipcRenderer.invoke('hub:streamConfig'),
  run: (id, mode) => ipcRenderer.invoke('hub:run', id, mode),
  stop: (id) => ipcRenderer.invoke('hub:stop', id),
  install: (id) => ipcRenderer.invoke('hub:install', id),
  uninstall: (id) => ipcRenderer.invoke('hub:uninstall', id),
  values: (id) => ipcRenderer.invoke('hub:values', id),
  saveValues: (id, values) => ipcRenderer.invoke('hub:saveValues', id, values),
  setMode: (id, mode) => ipcRenderer.invoke('hub:setMode', id, mode),
  createApp: (name) => ipcRenderer.invoke('hub:createApp', name),
  addApp: () => ipcRenderer.invoke('hub:addApp'),
  importPackage: () => ipcRenderer.invoke('hub:importPackage'),
  forget: (id) => ipcRenderer.invoke('hub:forget', id),
  reveal: (id) => ipcRenderer.invoke('hub:reveal', id),
  openAppsFolder: () => ipcRenderer.invoke('hub:openAppsFolder'),
  platform: process.platform,
  input: (raw) => ipcRenderer.send('hub:input', raw),
  onEvent(listener) {
    const handler = (_event: IpcRendererEvent, payload: HubEvent) => listener(payload)
    ipcRenderer.on('hub:event', handler)
    return () => ipcRenderer.off('hub:event', handler)
  },
}

contextBridge.exposeInMainWorld('hub', api)
