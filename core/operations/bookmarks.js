/**
 * Operazione "bookmarks": crea i segnalibri del documento.
 *
 * L'elenco arriva dall'utente come testo, una riga per voce: è il modo più
 * diretto per descrivere una struttura che il documento non contiene ancora. I
 * segnalibri esistenti vengono sostituiti, non affiancati: due alberi paralleli
 * non hanno senso.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { parseOutlineSpec, writeOutline } from '../pdf/outline.js'

export default {
  ...operationDescriptor('bookmarks'),

  async run({ files, output, params, onProgress }) {
    const document = await loadDocument(files[0])
    const entries = parseOutlineSpec(params.voci, document.getPageCount())
    const written = writeOutline(document, entries, { open: Boolean(params.apri) })
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      bookmarks: written,
      bytes,
      pdfa: false,
      sources: 1,
    }
  },
}
