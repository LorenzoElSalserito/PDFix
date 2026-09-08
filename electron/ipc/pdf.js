/**
 * Canale IPC dell'elaborazione PDF.
 *
 * Il main sceglie la destinazione, verifica i file e delega tutto il lavoro al
 * processo del motore. Nessuna elaborazione avviene qui: la finestra resta
 * reattiva anche su documenti da centinaia di megabyte.
 */

import { dialog, ipcMain } from 'electron'
import path from 'node:path'
import {
  OPERATIONS,
  inputExtensionsOf,
  operationDescriptor,
  outputExtensionsOf,
  outputModeOf,
} from '../../core/catalog.js'
import { describeFiles } from '../lib/pdf-files.js'
import { fixtureSaveDir, fixtureSavePath } from '../lib/automation.js'
import { translator } from '../lib/strings.js'

function defaultOutputPath({ descriptor, files, state, pdfa }) {
  const fileName =
    pdfa && descriptor.supportsPdfA && descriptor.name === 'merge'
      ? 'documento_unito_pdfa.pdf'
      : descriptor.defaultFileName
  const folder =
    state.rememberLastFolder && state.lastFolder ? state.lastFolder : path.dirname(files[0] ?? '.')
  return path.join(folder, fileName)
}

/** Chiede all'utente dove salvare, secondo il tipo di output dell'operazione. */
async function chooseDestination({ descriptor, files, state, pdfa, window }) {
  const t = translator(state.language)

  if (outputModeOf(descriptor) === 'directory') {
    const forced = fixtureSaveDir()
    if (forced) return { outputDir: forced }

    const result = await dialog.showOpenDialog(window, {
      title: t('dialog.directory.title'),
      defaultPath: state.rememberLastFolder && state.lastFolder ? state.lastFolder : undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { outputDir: result.filePaths[0] }
  }

  // Quasi tutte le operazioni scrivono un PDF, ma non tutte: il filtro e
  // l'estensione aggiunta d'ufficio seguono il descrittore, non una costante.
  const accepted = outputExtensionsOf(descriptor)
  const isPdf = accepted.includes('.pdf')

  const forced = fixtureSavePath()
  const choice = forced
    ? { canceled: false, filePath: forced }
    : await dialog.showSaveDialog(window, {
        title: t('dialog.save.title'),
        defaultPath: defaultOutputPath({ descriptor, files, state, pdfa }),
        filters: [
          {
            name: isPdf ? t('dialog.save.filter') : t('dialog.save.filterData'),
            extensions: accepted.map((extension) => extension.slice(1)),
          },
        ],
      })
  if (choice.canceled || !choice.filePath) return { canceled: true }

  const chosen = choice.filePath
  const hasAccepted = accepted.some((extension) => chosen.toLowerCase().endsWith(extension))
  return { output: hasAccepted ? chosen : `${chosen}${accepted[0]}` }
}

export function registerPdfHandlers({ getWindow, settings, engine }) {
  ipcMain.handle('pdf:run', async (event, request) => {
    const descriptor = operationDescriptor(request?.operation)
    if (descriptor.optional && !settings.isFeatureEnabled(descriptor.name)) {
      return { ok: false, error: `Funzionalità disattivata nelle impostazioni: ${descriptor.label}.` }
    }

    const files = Array.isArray(request?.files) ? request.files : []
    try {
      const described = describeFiles(files)
      const accepted = inputExtensionsOf(descriptor)
      const rejected = described.find(
        (file) => !accepted.includes(path.extname(file.path).toLowerCase()),
      )
      if (rejected) {
        return { ok: false, error: `«${descriptor.label}» accetta solo file ${accepted.join(', ')}.` }
      }
    } catch (error) {
      return { ok: false, error: error.message }
    }

    const state = settings.all()
    const pdfa = descriptor.forcesPdfA ? true : Boolean(request?.pdfa)
    const destination = await chooseDestination({
      descriptor,
      files,
      state,
      pdfa,
      window: getWindow(),
    })
    if (destination.canceled) return { ok: true, canceled: true }

    if (state.rememberLastFolder) {
      settings.set({ lastFolder: destination.outputDir ?? path.dirname(destination.output) })
    }

    return engine.run(
      { operation: descriptor.name, files, pdfa, params: request?.params ?? {}, ...destination },
      { onProgress: (progress) => event.sender.send('pdf:progress', progress) },
    )
  })

  /**
   * Parametri che dipendono dal documento scelto: l'interfaccia li chiede prima
   * di mostrare la finestra dei valori.
   */
  ipcMain.handle('pdf:inspect', async (_event, request) => {
    const descriptor = operationDescriptor(request?.operation)
    if (descriptor.optional && !settings.isFeatureEnabled(descriptor.name)) {
      return { ok: false, error: `Funzionalità disattivata nelle impostazioni: ${descriptor.label}.` }
    }
    const files = Array.isArray(request?.files) ? request.files : []
    return engine.inspect({ operation: descriptor.name, files })
  })

  // Diagnostica: gira nello stesso tipo di processo dell'elaborazione, quindi
  // riporta il limite di memoria realmente in vigore.
  ipcMain.handle('engine:diagnostics', () => engine.run({ operation: 'diagnostics', files: [] }))

  ipcMain.handle('catalog:all', () => OPERATIONS)
}
