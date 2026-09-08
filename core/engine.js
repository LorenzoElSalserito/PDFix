/**
 * Registro delle operazioni ed esecutore del motore PDF.
 *
 * Il motore non conosce Electron: riceve una richiesta serializzabile e
 * restituisce un risultato serializzabile. Questo lo rende utilizzabile in tre
 * contesti — processo figlio dell'app, test unitari, uso da script — senza
 * modifiche.
 *
 * Aggiungere una funzionalità significa scrivere un modulo con un descrittore
 * e registrarlo: nessun altro file va toccato.
 */

import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import {
  defaultParams,
  inputExtensionsOf,
  isParamVisible,
  maxFilesOf,
  outputExtensionsOf,
  outputModeOf,
} from './catalog.js'
import mergeOperation from './operations/merge.js'
import convertOperation from './operations/convert.js'
import extractOperation from './operations/extract.js'
import removeOperation from './operations/remove.js'
import rotateOperation from './operations/rotate.js'
import splitOperation from './operations/split.js'
import nupOperation from './operations/nup.js'
import bookletOperation from './operations/booklet.js'
import resizeOperation from './operations/resize.js'
import cropOperation from './operations/crop.js'
import imagesOperation from './operations/images.js'
import watermarkOperation from './operations/watermark.js'
import stampOperation from './operations/stamp.js'
import batesOperation from './operations/bates.js'
import formFieldsOperation from './operations/formfields.js'
import formFillOperation from './operations/formfill.js'
import formFlattenOperation from './operations/formflatten.js'
import numberingOperation from './operations/numbering.js'
import attachOperation from './operations/attach.js'
import bookmarksOperation from './operations/bookmarks.js'
import splitBookmarksOperation from './operations/splitbookmarks.js'
import metadataOperation from './operations/metadata.js'
import protectOperation from './operations/protect.js'
import unprotectOperation from './operations/unprotect.js'
import signOperation from './operations/sign.js'
import signatureOperation from './operations/signature.js'
import optimizeOperation from './operations/optimize.js'
import diagnosticsOperation from './operations/diagnostics.js'

/** Operazioni distribuite con l'applicazione. */
export const builtinOperations = [
  mergeOperation,
  convertOperation,
  extractOperation,
  removeOperation,
  rotateOperation,
  splitOperation,
  nupOperation,
  bookletOperation,
  resizeOperation,
  cropOperation,
  imagesOperation,
  watermarkOperation,
  stampOperation,
  numberingOperation,
  batesOperation,
  formFieldsOperation,
  formFillOperation,
  formFlattenOperation,
  attachOperation,
  bookmarksOperation,
  splitBookmarksOperation,
  metadataOperation,
  protectOperation,
  unprotectOperation,
  signOperation,
  signatureOperation,
  optimizeOperation,
  diagnosticsOperation,
]

export function createRegistry(operations = builtinOperations) {
  const entries = new Map()

  const registry = {
    register(operation) {
      if (!operation?.name || typeof operation.run !== 'function') {
        throw new Error('Operazione non valida: servono "name" e "run".')
      }
      if (entries.has(operation.name)) {
        throw new Error(`Operazione già registrata: ${operation.name}`)
      }
      entries.set(operation.name, operation)
      return registry
    },

    has(name) {
      return entries.has(name)
    },

    get(name) {
      const operation = entries.get(name)
      if (!operation) throw new Error(`Operazione non valida: ${name}`)
      return operation
    },

    /** Descrittori esposti all'interfaccia, senza le funzioni. */
    describe() {
      return [...entries.values()]
        .filter((operation) => !operation.hidden)
        .map(({ run, ...descriptor }) => descriptor)
    },
  }

  for (const operation of operations) registry.register(operation)
  return registry
}

export const registry = createRegistry()

/**
 * Completa e verifica i parametri di una operazione.
 *
 * I valori mancanti prendono il valore predefinito del catalogo, quelli fuori
 * scala vengono rifiutati: il motore non deve mai fidarsi di ciò che arriva
 * dall'interfaccia.
 *
 * @returns {object} parametri normalizzati
 */
/** Frazione riportata nell'intervallo consentito. */
function clampFraction(value, { min = 0, max = 1, fallback }) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

/**
 * Piazzamento di un elemento sulla pagina, in frazioni della pagina stessa.
 *
 * Le frazioni non dipendono dal formato del foglio: la stessa firma finisce
 * nello stesso punto su un A4 e su una lettera, e l'anteprima mostrata
 * all'utente e il documento prodotto restano d'accordo.
 *
 * @param {{page?: number, x?: number, y?: number, width?: number}} value
 * @param {object} param descrittore, per il messaggio d'errore
 */
export function normalizePlacement(value, param = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`«${param.label ?? 'Posizione'}» non è un piazzamento valido.`)
  }
  const fallback = param.default ?? {}

  const page = Math.trunc(Number(value.page ?? fallback.page ?? 1))
  if (!Number.isFinite(page) || page < 1) {
    throw new Error(`«${param.label ?? 'Posizione'}»: numero di pagina non valido.`)
  }

  const width = clampFraction(value.width, { min: 0.01, max: 1, fallback: fallback.width ?? 0.3 })

  return {
    page,
    x: clampFraction(value.x, { fallback: fallback.x ?? 0 }),
    y: clampFraction(value.y, { fallback: fallback.y ?? 0 }),
    width,
  }
}

export function resolveParams(descriptor, provided = {}) {
  const values = { ...defaultParams(descriptor), ...(provided ?? {}) }

  for (const param of descriptor.params ?? []) {
    if (!isParamVisible(param, values)) continue
    const value = values[param.key]

    if (param.type === 'number') {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) throw new Error(`«${param.label}» deve essere un numero.`)
      if (param.min !== undefined && numeric < param.min) {
        throw new Error(`«${param.label}» non può essere minore di ${param.min}.`)
      }
      if (param.max !== undefined && numeric > param.max) {
        throw new Error(`«${param.label}» non può superare ${param.max}.`)
      }
      values[param.key] = numeric
      continue
    }

    if (param.type === 'choice') {
      const allowed = param.options.map((option) => option.value)
      if (!allowed.includes(value)) throw new Error(`Valore non ammesso per «${param.label}».`)
      continue
    }

    if (param.type === 'boolean') {
      values[param.key] = Boolean(value)
      continue
    }

    // Un piazzamento arriva dall'anteprima come frazioni della pagina: qui
    // viene riportato dentro i limiti invece di essere rifiutato, perche' un
    // trascinamento che esce di un capello dal bordo e' un gesto, non un
    // errore. Restano un errore la pagina inesistente e la larghezza nulla.
    if (param.type === 'placement') {
      values[param.key] = normalizePlacement(value, param)
      continue
    }

    if (param.type === 'file') {
      const filePath = value === undefined || value === null ? '' : String(value).trim()
      if (filePath === '') {
        if (param.required) throw new Error(`«${param.label}» è obbligatorio: scegli un file.`)
        values[param.key] = ''
        continue
      }
      const accepted = param.accept ?? []
      if (accepted.length > 0 && !accepted.includes(path.extname(filePath).toLowerCase())) {
        throw new Error(`«${param.label}» accetta solo file ${accepted.join(', ')}.`)
      }
      values[param.key] = filePath
      continue
    }

    const text = value === undefined || value === null ? '' : String(value)
    if (param.required && text.trim() === '') throw new Error(`«${param.label}» è obbligatorio.`)
    values[param.key] = text
  }

  return values
}

/**
 * Verifica la richiesta prima di eseguirla: numero e tipo di file ammessi dal
 * descrittore, leggibilità dei sorgenti, destinazione coerente con il tipo di
 * output dichiarato.
 *
 * @returns {Promise<{operation: object, params: object}>}
 */
export async function validateRequest(request, activeRegistry = registry) {
  const operation = activeRegistry.get(request?.operation)
  const files = Array.isArray(request?.files) ? request.files : []

  if (files.some((file) => typeof file !== 'string' || file.trim() === '')) {
    throw new Error('Elenco file non valido.')
  }
  if (files.length < operation.minFiles) {
    throw new Error(`«${operation.label}» richiede almeno ${operation.minFiles} file.`)
  }
  if (files.length > maxFilesOf(operation)) {
    throw new Error(`«${operation.label}» accetta al massimo ${operation.maxFiles} file.`)
  }

  const params = resolveParams(operation, request?.params)

  // I file scelti come parametro (un logo, un allegato) non stanno nell'elenco
  // dei documenti: la leggibilità va verificata lo stesso, e qui, non dentro
  // l'operazione.
  for (const param of operation.params ?? []) {
    if (param.type !== 'file' || !isParamVisible(param, params)) continue
    const filePath = params[param.key]
    if (!filePath) continue
    await access(filePath, constants.R_OK).catch(() => {
      throw new Error(`File non leggibile: ${filePath}`)
    })
  }

  if (operation.minFiles > 0) {
    const accepted = inputExtensionsOf(operation)
    for (const file of files) {
      if (!accepted.includes(path.extname(file).toLowerCase())) {
        throw new Error(`«${operation.label}» accetta solo file ${accepted.join(', ')}.`)
      }
      await access(file, constants.R_OK).catch(() => {
        throw new Error(`File non leggibile: ${file}`)
      })
    }

    if (outputModeOf(operation) === 'directory') {
      if (typeof request.outputDir !== 'string' || request.outputDir.trim() === '') {
        throw new Error('Cartella di destinazione mancante.')
      }
      await access(request.outputDir, constants.W_OK).catch(() => {
        throw new Error(`Cartella non scrivibile: ${request.outputDir}`)
      })
    } else {
      if (typeof request.output !== 'string' || request.output.trim() === '') {
        throw new Error('Percorso di destinazione mancante.')
      }
      const accepted = outputExtensionsOf(operation)
      if (!accepted.includes(path.extname(request.output).toLowerCase())) {
        throw new Error(`Il file di destinazione deve avere estensione ${accepted.join(' o ')}`)
      }
    }
  }

  return { operation, params }
}

/**
 * Chiede a un'operazione quali parametri servono per il documento scelto.
 *
 * Alcune operazioni non possono dichiarare i propri parametri nel catalogo:
 * compilare un modulo richiede un campo per ogni casella del PDF, che si sa
 * solo dopo aver aperto quel PDF. La forma restituita è la stessa dei parametri
 * del catalogo, così l'interfaccia li disegna senza sapere da dove vengono.
 *
 * @returns {Promise<{ok: boolean, params?: object[], error?: string}>}
 */
export async function inspectRequest(request, { registry: activeRegistry = registry } = {}) {
  try {
    const operation = activeRegistry.get(request?.operation)
    if (typeof operation.inspect !== 'function') {
      throw new Error(`«${operation.label}» non ha parametri da leggere dal documento.`)
    }
    const files = Array.isArray(request?.files) ? request.files : []
    if (files.length < operation.minFiles) {
      throw new Error(`«${operation.label}» richiede almeno ${operation.minFiles} file.`)
    }
    for (const file of files) {
      await access(file, constants.R_OK).catch(() => {
        throw new Error(`File non leggibile: ${file}`)
      })
    }
    return { ok: true, params: await operation.inspect({ files }) }
  } catch (error) {
    return { ok: false, error: error?.message || 'Impossibile leggere i parametri dal documento.' }
  }
}

/**
 * Esegue una richiesta e restituisce sempre una busta `{ok, ...}`: gli errori
 * non attraversano il confine di processo come eccezioni.
 *
 * @param {{operation: string, files?: string[], output?: string, outputDir?: string, pdfa?: boolean, params?: object}} request
 * @param {{registry?: object, onProgress?: Function}} [context]
 */
export async function runRequest(request, { registry: activeRegistry = registry, onProgress } = {}) {
  try {
    const { operation, params } = await validateRequest(request, activeRegistry)
    const result = await operation.run({
      files: request.files ?? [],
      output: request.output,
      outputDir: request.outputDir,
      pdfa: operation.forcesPdfA ? true : Boolean(request.pdfa),
      params,
      onProgress,
    })
    return { ok: true, operation: operation.name, ...result }
  } catch (error) {
    return { ok: false, error: error?.message || 'Errore sconosciuto durante l’elaborazione.' }
  }
}
