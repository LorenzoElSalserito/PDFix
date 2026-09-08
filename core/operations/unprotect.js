/**
 * Operazione "unprotect": toglie la protezione da un documento cifrato.
 *
 * Serve la password: senza, il documento non si apre nemmeno. Non c'è nessuna
 * scorciatoia, ed è esattamente ciò che rende utile la protezione.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'

export default {
  ...operationDescriptor('unprotect'),

  async run({ files, output, params, onProgress }) {
    const password = String(params.password ?? '')
    if (password.trim() === '') {
      throw new Error('Indica la password con cui il documento è stato protetto.')
    }

    // Aprire con la password decifra il documento: da qui in poi è un
    // documento qualunque, e salvarlo produce un file senza protezione.
    const document = await loadDocument(files[0], { password })
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      bytes,
      encrypted: false,
      pdfa: false,
      sources: 1,
    }
  },
}
