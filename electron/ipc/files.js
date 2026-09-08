/**
 * Canali IPC per la selezione dei file.
 */

import { dialog, ipcMain } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { ACCEPTED_EXTENSIONS, describeFiles, isSupportedFile } from '../lib/pdf-files.js'
import { translator } from '../lib/strings.js'
import { fixtureDropDir, fixtureOpenPaths, fixtureParamFile } from '../lib/automation.js'

/** Limite oltre il quale l'anteprima non vale il trasferimento dei byte. */
const MAX_PREVIEW_MB = 100
const MAX_PREVIEW_BYTES = MAX_PREVIEW_MB * 1024 * 1024

/**
 * Un percorso assoluto resta tale; sotto test un nome nudo viene cercato nella
 * cartella indicata dall'automazione. `basename` esclude ogni risalita: quello
 * che arriva dal renderer non sceglie mai la cartella.
 */
function resolveDropped(filePath) {
  const dropDir = fixtureDropDir()
  if (!dropDir || typeof filePath !== 'string' || path.isAbsolute(filePath)) return filePath
  return path.join(dropDir, path.basename(filePath))
}

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

  /**
   * Sceglie un singolo file per un parametro di operazione — un logo, un
   * allegato — che non fa parte dell'elenco dei documenti da elaborare.
   */
  ipcMain.handle('files:choose-one', async (_event, accept) => {
    const fixture = fixtureParamFile()
    if (fixture) return fixture

    const state = settings.all()
    const t = translator(state.language)
    const extensions = (Array.isArray(accept) ? accept : [])
      .map((extension) => String(extension).replace(/^\./, ''))
      .filter(Boolean)

    const result = await dialog.showOpenDialog(getWindow(), {
      title: t('dialog.file.title'),
      properties: ['openFile'],
      ...(extensions.length > 0
        ? { filters: [{ name: t('dialog.file.filter'), extensions }] }
        : {}),
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  /**
   * Contenuto di un file, per l'anteprima nell'interfaccia.
   *
   * È l'unico caso in cui i byte di un documento arrivano al renderer: serve a
   * mostrare la pagina su cui l'utente colloca la firma. Il file deve essere
   * uno di quelli che l'applicazione sa aprire — l'estensione non basta, si
   * leggono i primi byte come per ogni altro percorso — e non deve essere
   * enorme, perché attraversa il confine di processo per intero.
   */
  ipcMain.handle('files:bytes', async (_event, filePath) => {
    if (!isSupportedFile(filePath)) throw new Error(`File non valido o non supportato: ${filePath}`)
    const { size } = await stat(filePath)
    if (size > MAX_PREVIEW_BYTES) {
      throw new Error(
        `Documento troppo grande per l'anteprima (${Math.round(size / 1024 / 1024)} MB, massimo ${MAX_PREVIEW_MB} MB).`,
      )
    }
    return readFile(filePath)
  })

  // I file trascinati arrivano come percorsi risolti dal preload.
  ipcMain.handle('files:describe', (_event, filePaths) =>
    describeFiles(Array.isArray(filePaths) ? filePaths.map(resolveDropped) : filePaths),
  )
}
