/**
 * Operazioni disponibili, lette dal catalogo del processo principale.
 *
 * I pulsanti dell'interfaccia sono generati da questo elenco: attivare o
 * disattivare una funzionalità nelle preferenze, o aggiungerne una nel
 * catalogo, cambia la barra dei comandi senza modifiche al componente.
 */

import { ref } from 'vue'
import { useBridge } from './useBridge.js'

/** Estensioni accettate quando il descrittore non dichiara nulla. */
const DEFAULT_EXTENSIONS = ['.pdf']

function extensionOf(document) {
  const name = String(document?.name ?? document?.path ?? '')
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function acceptedExtensions(operation) {
  return operation.inputExtensions ?? DEFAULT_EXTENSIONS
}

/** Tutti i documenti caricati sono di un tipo che l'operazione sa trattare? */
export function acceptsAll(operation, documents) {
  const accepted = acceptedExtensions(operation)
  return documents.every((document) => accepted.includes(extensionOf(document)))
}

/** Un'operazione è eseguibile con i documenti attualmente caricati? */
export function isRunnable(operation, documents) {
  const list = Array.isArray(documents) ? documents : []
  if (list.length < operation.minFiles) return false
  if (operation.maxFiles !== null && list.length > operation.maxFiles) return false
  return acceptsAll(operation, list)
}

/** Motivo per cui l'operazione non è eseguibile, da mostrare come tooltip. */
export function unavailableReason(operation, documents) {
  const list = Array.isArray(documents) ? documents : []
  if (list.length < operation.minFiles) {
    return `Servono almeno ${operation.minFiles} file (ne hai ${list.length}).`
  }
  if (operation.maxFiles !== null && list.length > operation.maxFiles) {
    return `Massimo ${operation.maxFiles} file per questa operazione (ne hai ${list.length}).`
  }
  if (!acceptsAll(operation, list)) {
    return `Questa operazione accetta solo file ${acceptedExtensions(operation).join(', ')}.`
  }
  return ''
}

/** L'operazione ha bisogno di parametri prima di partire? */
export function needsParams(operation) {
  return Array.isArray(operation.params) && operation.params.length > 0
}

export function useOperations() {
  const bridge = useBridge()
  const operations = ref([])

  async function refresh() {
    operations.value = (await bridge.operations()) ?? []
    return operations.value
  }

  return { operations, refresh }
}
