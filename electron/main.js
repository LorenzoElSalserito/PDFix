/**
 * Processo principale di PDFix.
 *
 * Compiti: creare la finestra, installare il menu, esporre i canali IPC e
 * tenere in piedi il client del motore PDF. Ogni responsabilità vive in un
 * modulo di `electron/lib`; questo file si limita a comporli.
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { engineEntry } from './lib/paths.js'
import { createSettingsStore } from './lib/settings.js'
import { zoomFactorOf } from './lib/settings-schema.js'
import { createEngineClient } from './lib/engine-client.js'
import { createMainWindow } from './lib/window.js'
import { startWithSplash } from './lib/splash.js'
import { translator } from './lib/strings.js'
import { installApplicationMenu } from './lib/menu.js'
import { isAutomated, overriddenUserDataDir, splashDurationOverride } from './lib/automation.js'
import { registerIpc } from './ipc/index.js'

const HOMEPAGE = 'https://github.com/LorenzoElSalserito/PDFix'

// Il nome vale anche fuori dal pacchetto: senza, in sviluppo il gestore di
// finestre etichetta l'applicazione con il comando che l'ha avviata — sotto
// Linux uno script di shell, con la relativa icona generica.
app.setName('PDFix')

// Sotto test la finestra puo' restare coperta o lo schermo bloccato: Chromium
// smetterebbe di comporre i frame e ogni interazione simulata resterebbe in
// attesa. Questi interruttori valgono solo per l'automazione.
if (isAutomated()) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

// Deve avvenire prima di `app.whenReady()`: i test end-to-end isolano così le
// preferenze dalla configurazione reale dell'utente.
const userDataOverride = overriddenUserDataDir()
if (userDataOverride) app.setPath('userData', userDataOverride)

// Una sola istanza: la seconda riporta in primo piano quella già aperta.
if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow = null
const getWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)

const settings = createSettingsStore({ filePath: path.join(app.getPath('userData'), 'settings.json') })

const engine = createEngineClient({
  engineEntry,
  memoryLimitMb: () => settings.memoryLimitMb(),
  timeoutMs: () => settings.all().processTimeoutSec * 1000,
})

function showAboutDialog() {
  const translate = translator(settings.all().language)
  dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: translate('about.title'),
    message: `PDFix ${app.getVersion()}`,
    detail: [
      translate('about.summary'),
      translate('about.privacy'),
      '',
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
      translate('about.author'),
    ].join('\n'),
    buttons: [translate('about.close')],
  })
}

app.on('second-instance', () => {
  const window = getWindow()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

// Il dialog "Informazioni" è nativo: il renderer si limita a richiederlo.
ipcMain.on('app:about', showAboutDialog)

app.whenReady().then(() => {
  registerIpc({
    getWindow,
    settings,
    engine,
    onChange: () => {
      const window = getWindow()
      if (!window) return
      // Lo zoom appartiene alla finestra, non alla pagina: va applicato qui.
      window.webContents.setZoomFactor(zoomFactorOf(settings.all()))
      window.webContents.send('settings:changed', settings.all())
    },
  })

  installApplicationMenu({ getWindow, homepage: HOMEPAGE, settings })


  const windowOptions = (extra = {}) => ({
    devServerUrl: process.env.PDFIX_DEV_SERVER_URL,
    zoomFactor: zoomFactorOf(settings.all()),
    ...extra,
  })

  // L'applicazione compare dopo lo splash: tre secondi in cui il processo
  // finisce di inizializzarsi e l'utente vede che qualcosa sta partendo.
  startWithSplash({
    createWindow: (extra) => (mainWindow = createMainWindow(windowOptions(extra))),
    ...(splashDurationOverride() === null ? {} : { duration: splashDurationOverride() }),
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(windowOptions())
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => engine.dispose())
