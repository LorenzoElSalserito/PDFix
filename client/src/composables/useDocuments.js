/**
 * Stato dell'elenco documenti.
 *
 * L'elenco è l'unico stato condiviso fra caricamento, riordino ed esecuzione
 * delle operazioni; tenerlo qui evita che i componenti se lo passino a catena.
 */

import { computed, ref } from 'vue'

let sequence = 0
const nextId = () => `doc-${++sequence}`

export function useDocuments() {
  const documents = ref([])

  /** Aggiunge i descrittori restituiti dal main, saltando i duplicati. */
  function add(entries) {
    const known = new Set(documents.value.map((document) => document.path))
    const added = []
    for (const entry of entries ?? []) {
      if (!entry?.path || known.has(entry.path)) continue
      known.add(entry.path)
      const document = { id: nextId(), path: entry.path, name: entry.name, size: entry.size }
      documents.value.push(document)
      added.push(document)
    }
    return added
  }

  function remove(id) {
    documents.value = documents.value.filter((document) => document.id !== id)
  }

  function clear() {
    documents.value = []
  }

  function replace(list) {
    documents.value = list
  }

  const paths = computed(() => documents.value.map((document) => document.path))
  const count = computed(() => documents.value.length)
  const totalSize = computed(() => documents.value.reduce((sum, document) => sum + (document.size || 0), 0))

  return { documents, add, remove, clear, replace, paths, count, totalSize }
}
