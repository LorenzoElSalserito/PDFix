/**
 * Canali IPC per la selezione dei file.
 */

import { dialog, ipcMain } from 'electron'
import path from 'node:path'
import { ACCEPTED_EXTENSIONS, describeFiles } from '../lib/pdf-files.js'
import { translator } from '../lib/strings.js'
import { fixtureOpenPaths } from '../lib/automation.js'

export function registerFileHandlers({ getWindow, settings }) {
  ipcMain.handle('files:choose', async () => {
    const fixtures = fixtureOpenPaths()
    if (fixtures) return describeFiles(fixtures)

    const state = settings.all()
    const t = translator(state.language)
    const result = await dialog.showOpenDialog(getWindow(), {
      title: t('dialog.open.title'),
      defaultPath: state.rememberLastFolder && state.lastFolder ? state.lastFolder : undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: t('dialog.open.documentsAndImages'),
          extensions: ACCEPTED_EXTENSIONS.map((extension) => extension.slice(1)),
        },
        { name: t('dialog.open.documents'), extensions: ['pdf'] },
        { name: t('dialog.open.images'), extensions: ['jpg', 'jpeg', 'png'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const files = describeFiles(result.filePaths)
    if (state.rememberLastFolder) settings.set({ lastFolder: path.dirname(result.filePaths[0]) })
    return files
  })

  // I file trascinati arrivano come percorsi risolti dal preload.
  ipcMain.handle('files:describe', (_event, filePaths) => describeFiles(filePaths))
}
