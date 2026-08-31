/**
 * Operazione "optimize": riscrive il documento compattandone la struttura.
 *
 * Gli oggetti indiretti vengono raccolti in object stream compressi: è la
 * riduzione che si può ottenere senza toccare il contenuto delle pagine, quindi
 * senza degradare immagini o testo.
 */

import { statSync } from 'node:fs'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'

export default {
  ...operationDescriptor('optimize'),

  async run({ files, output, params, onProgress }) {
    const originalBytes = statSync(files[0]).size
    const document = await loadDocument(files[0])

    if (params.stripMetadata) {
      document.setTitle('')
      document.setAuthor('')
      document.setSubject('')
      document.setKeywords([])
      document.setProducer('')
      document.setCreator('')
    }
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output, { objectStreams: true })
    return {
      output,
      pages: document.getPageCount(),
      bytes,
      originalBytes,
      savedBytes: Math.max(0, originalBytes - bytes),
      pdfa: false,
      sources: 1,
    }
  },
}
