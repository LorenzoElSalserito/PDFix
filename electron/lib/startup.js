/**
 * Regole temporali dell'avvio.
 *
 * Vivono in un modulo a parte, senza dipendenze da Electron, per poter essere
 * verificate senza avviare un'applicazione grafica.
 */

/** Durata minima della schermata di avvio, in millisecondi. */
export const SPLASH_DURATION_MS = 3000

/**
 * Quanto manca alla fine dello splash.
 *
 * Se la finestra principale è pronta prima, si aspetta il tempo residuo; se ci
 * mette di più, non si aggiunge alcun ritardo.
 *
 * @param {number} elapsed millisecondi trascorsi dall'apertura dello splash
 * @param {number} [duration]
 * @returns {number} attesa residua, mai negativa
 */
export function remainingDelay(elapsed, duration = SPLASH_DURATION_MS) {
  return Math.max(0, duration - elapsed)
}

/** Dimensioni della schermata di avvio, in pixel. */
export const SPLASH_SIZE = { width: 420, height: 260 }

/**
 * Opzioni della finestra di avvio.
 *
 * L'icona è obbligatoria quanto quella della finestra principale: una finestra
 * senza icona esplicita eredita quella generica che il gestore di finestre
 * associa al comando che ha avviato il processo — sotto Linux, in sviluppo,
 * l'icona di uno script di shell. Con lo splash succedeva proprio questo.
 *
 * @param {object} options
 * @param {{width: number, height: number}} options.workArea area utile dello schermo
 * @param {string|null} [options.icon] percorso dell'icona, se disponibile
 * @returns {object} opzioni pronte per `new BrowserWindow(...)`
 */
export function splashWindowOptions({ workArea, icon = null }) {
  return {
    ...SPLASH_SIZE,
    x: Math.round((workArea.width - SPLASH_SIZE.width) / 2),
    y: Math.round((workArea.height - SPLASH_SIZE.height) / 2),
    title: 'PDFix',
    ...(icon ? { icon } : {}),
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      // La pagina è statica: nessun preload, nessun accesso a Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
