/**
 * Schermata di avvio.
 *
 * Serve a due cose insieme. La prima è dare un segnale immediato che
 * l'applicazione è partita: la finestra principale nasce nascosta e su
 * macchine lente può metterci qualche secondo. La seconda è dare al processo il
 * tempo di completare l'inizializzazione — motore, preferenze, primo disegno —
 * prima che l'utente possa interagire: la finestra vera compare solo quando è
 * pronta *e* i tre secondi di avvio sono trascorsi.
 */

import { BrowserWindow, screen } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { appRoot, windowIcon } from './paths.js'
import { SPLASH_DURATION_MS, remainingDelay, splashWindowOptions } from './startup.js'

export function createSplashWindow() {
  const splash = new BrowserWindow(
    splashWindowOptions({
      workArea: screen.getPrimaryDisplay().workAreaSize,
      icon: existsSync(windowIcon) ? windowIcon : null,
    }),
  )

  splash.loadFile(path.join(appRoot, 'electron', 'splash.html'))
  return splash
}

/**
 * Mostra lo splash, aspetta che la finestra principale sia pronta e almeno
 * `duration` millisecondi, poi passa la mano.
 *
 * @param {object} options
 * @param {() => import('electron').BrowserWindow} options.createWindow
 * @param {number} [options.duration]
 * @returns {Promise<import('electron').BrowserWindow>} la finestra principale
 */
export function startWithSplash({ createWindow, duration = SPLASH_DURATION_MS }) {
  const splash = createSplashWindow()
  const openedAt = Date.now()

  // `deferShow` impedisce alla finestra principale di comparire da sola: la
  // sequenza splash → applicazione deve restare ordinata.
  const window = createWindow({ deferShow: true })

  return new Promise((resolve) => {
    let handled = false
    const reveal = () => {
      if (handled) return
      handled = true
      setTimeout(() => {
        if (!splash.isDestroyed()) splash.destroy()
        if (!window.isDestroyed()) {
          window.show()
          window.focus()
        }
        resolve(window)
      }, remainingDelay(Date.now() - openedAt, duration)).unref?.()
    }

    // Qualunque delle due condizioni arrivi per prima va bene: `ready-to-show`
    // è la strada normale, il caricamento della pagina è la rete di sicurezza.
    window.once('ready-to-show', reveal)
    window.webContents.once('did-finish-load', reveal)
  })
}
