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
import { defaultParams, inputExtensionsOf, isParamVisible, maxFilesOf, outputModeOf } from './catalog.js'
import mergeOperation from './operations/merge.js'
import convertOperation from './operations/convert.js'
import extractOperation from './operations/extract.js'
import removeOperation from './operations/remove.js'
import rotateOperation from './operations/rotate.js'
import splitOperation from './operations/split.js'
import imagesOperation from './operations/images.js'
import watermarkOperation from './operations/watermark.js'
import numberingOperation from './operations/numbering.js'
import metadataOperation from './operations/metadata.js'
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
  imagesOperation,
  watermarkOperation,
  numberingOperation,
  metadataOperation,
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
      if (path.extname(request.output).toLowerCase() !== '.pdf') {
        throw new Error('Il file di destinazione deve avere estensione .pdf')
      }
    }
  }

  return { operation, params }
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
