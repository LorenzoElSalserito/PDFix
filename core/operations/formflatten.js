/**
 * Operazione "formflatten": congela un modulo compilato.
 *
 * I campi diventano contenuto disegnato: il documento resta identico a vedersi,
 * ma non è più modificabile e si apre allo stesso modo in qualunque lettore.
 * L'operazione è irreversibile, quindi lavora su una copia — il file originale
 * non viene mai toccato, come per tutte le operazioni di PDFix.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { readForm, refreshAppearances } from '../pdf/forms.js'

export default {
  ...operationDescriptor('formflatten'),

  async run({ files, output, onProgress }) {
    const document = await loadDocument(files[0])
    const { form, fields } = readForm(document)
    const flattened = fields.length

    await refreshAppearances(document, form)
    form.flatten()
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      flattened,
      bytes,
      pdfa: false,
      sources: 1,
    }
  },
}
