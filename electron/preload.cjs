/**
 * Ponte fra renderer e processo principale.
 *
 * Espone un'API esplicita e chiusa: il renderer non ha accesso a Node, al
 * filesystem né a `ipcRenderer`. Ogni funzione qui corrisponde a un canale
 * registrato in `electron/ipc`.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron')

/**
 * Percorso di un file trascinato nella finestra.
 *
 * `webUtils.getPathForFile` è l'unico modo per risalire dal `File` del renderer
 * al file su disco. Quando l'oggetto non viene dal sistema operativo — un
 * `File` costruito da uno script — restituisce stringa vuota: in quel caso si
 * passa il solo nome, che il processo principale rifiuta come percorso non
 * valido invece di ricevere un vuoto muto.
 */
function pathOfDroppedFile(file) {
  return webUtils.getPathForFile(file) || file.name
}

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('pdfix', {
  // File
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  describeDroppedFiles: (files) =>
    ipcRenderer.invoke('files:describe', Array.from(files, pathOfDroppedFile)),
  chooseFile: (accept) => ipcRenderer.invoke('files:choose-one', accept),
  // Byte di un file gia' scelto, per l'anteprima: il renderer non legge dal
  // disco, li riceve dal processo principale che li ha validati.
  readFileBytes: (filePath) => ipcRenderer.invoke('files:bytes', filePath),

  // Elaborazione
  run: (request) => ipcRenderer.invoke('pdf:run', request),
  inspect: (request) => ipcRenderer.invoke('pdf:inspect', request),
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
