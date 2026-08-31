/**
 * Creazione della finestra principale.
 *
 * Il renderer gira isolato: niente Node, contesto separato, sandbox attiva.
 * L'unica superficie esposta è quella dichiarata nel preload.
 */

import { BrowserWindow, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { preloadScript, rendererIndex, windowIcon } from './paths.js'

/**
 * Dimensione minima supportata: l'interfaccia deve restare usabile su uno
 * schermo 800×600, che è il fondo scala dichiarato.
 */
export const MIN_WINDOW_SIZE = { width: 800, height: 600 }

/**
 * Dimensione iniziale: comoda sui monitor grandi, ma mai più grande dell'area
 * di lavoro disponibile — su uno schermo 800×600 la finestra si adatta invece
 * di nascere fuori misura.
 */
export function initialWindowSize(workArea) {
  return {
    width: Math.max(MIN_WINDOW_SIZE.width, Math.min(1080, workArea.width)),
    height: Math.max(MIN_WINDOW_SIZE.height, Math.min(780, workArea.height)),
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.devServerUrl]
 * @param {number} [options.zoomFactor]
 * @param {boolean} [options.deferShow] la finestra viene mostrata da chi chiama
 *   (lo splash), non appena pronta
 */
export function createMainWindow({ devServerUrl, zoomFactor = 1, deferShow = false } = {}) {
  const { width, height } = initialWindowSize(screen.getPrimaryDisplay().workAreaSize)
  const window = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: '#f8fafc',
    title: 'PDFix',
    // La barra dei menu di Chromium non serve: ogni comando è nell'interfaccia.
    autoHideMenuBar: true,
    ...(existsSync(windowIcon) ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: preloadScript,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Chromium rallenta timer e ridisegni quando la finestra e' coperta o
      // lo schermo e' bloccato: per un'applicazione che l'utente lascia in
      // secondo piano durante un'elaborazione lunga e' un comportamento
      // sbagliato, e rende non deterministici anche i test end-to-end.
      backgroundThrottling: false,
    },
  })

  // La finestra nasce nascosta per evitare il lampo di pagina bianca. Di
  // norma la si mostra al primo disegno utile, ma `ready-to-show` dipende dal
  // compositore: con lo schermo bloccato, o su sessioni grafiche minime, puo'
  // non arrivare mai e l'applicazione resterebbe invisibile. Il caricamento
  // della pagina e' il ripiego che garantisce comunque la comparsa.
  const reveal = () => {
    if (deferShow) return
    if (!window.isDestroyed() && !window.isVisible()) window.show()
  }
  window.once('ready-to-show', reveal)

  window.webContents.on('did-finish-load', () => {
    // Lo zoom va riapplicato a ogni caricamento: un reload azzererebbe il valore.
    window.webContents.setZoomFactor(zoomFactor)
    reveal()
  })

  // Nessuna navigazione fuori dall'app: i link esterni vanno al browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (devServerUrl) window.loadURL(devServerUrl)
  else window.loadFile(rendererIndex)

  return window
}
