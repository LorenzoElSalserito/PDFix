/**
 * Ponte fra renderer e processo principale.
 *
 * Espone un'API esplicita e chiusa: il renderer non ha accesso a Node, al
 * filesystem né a `ipcRenderer`. Ogni funzione qui corrisponde a un canale
 * registrato in `electron/ipc`.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron')

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('pdfix', {
  // File
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  describeDroppedFiles: (files) =>
    ipcRenderer.invoke('files:describe', Array.from(files, (file) => webUtils.getPathForFile(file))),

  // Elaborazione
  run: (request) => ipcRenderer.invoke('pdf:run', request),
  diagnostics: () => ipcRenderer.invoke('engine:diagnostics'),
  operations: () => ipcRenderer.invoke('catalog:operations'),
  onProgress: (listener) => subscribe('pdf:progress', listener),

  // Preferenze
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    onChange: (listener) => subscribe('settings:changed', listener),
  },

  // Applicazione
  info: () => ipcRenderer.invoke('app:info'),
  reportBug: () => ipcRenderer.invoke('app:report-bug'),
  donate: () => ipcRenderer.invoke('app:donate'),

  // Menu applicativo
  onMenuAction: (listener) => subscribe('menu:action', listener),
  showAbout: () => ipcRenderer.send('app:about'),
})
