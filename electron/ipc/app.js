/**
 * Canali IPC dell'applicazione in sé: informazioni sulla versione,
 * segnalazione di un problema e pagina delle donazioni.
 */

import { app, ipcMain, shell } from 'electron'
import os from 'node:os'
import { translator } from '../lib/strings.js'
import { CONTACT_EMAIL, buildBugReportUrl } from '../lib/bug-report.js'
import { DONATION_URL } from '../lib/donation.js'

/** Dati che descrivono l'installazione, utili in una segnalazione. */
export function applicationInfo() {
  return {
    name: 'PDFix',
    version: app.getVersion(),
    author: 'Lorenzo De Marco',
    license: 'AGPL-3.0-or-later',
    contact: CONTACT_EMAIL,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch} (${os.release()})`,
  }
}

export function registerAppHandlers({ settings }) {
  ipcMain.handle('app:info', () => applicationInfo())

  ipcMain.handle('app:report-bug', async () => {
    const translate = translator(settings.all().language)
    const url = buildBugReportUrl(applicationInfo(), translate)
    await shell.openExternal(url)
    return { ok: true, url }
  })

  ipcMain.handle('app:donate', async () => {
    await shell.openExternal(DONATION_URL)
    return { ok: true, url: DONATION_URL }
  })
}
