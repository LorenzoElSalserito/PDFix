/**
 * Operazione "metadata": imposta le informazioni descrittive del documento.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'

/** Le parole chiave si scrivono separate da virgola e si salvano come elenco. */
export function parseKeywords(value) {
  return String(value ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== '')
}

export default {
  ...operationDescriptor('metadata'),

  async run({ files, output, params, onProgress }) {
    const document = await loadDocument(files[0])

    if (params.title !== undefined) document.setTitle(String(params.title))
    if (params.author !== undefined) document.setAuthor(String(params.author))
    if (params.subject !== undefined) document.setSubject(String(params.subject))
    document.setKeywords(parseKeywords(params.keywords))
    document.setModificationDate(new Date())
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output)
    return { output, pages: document.getPageCount(), bytes, pdfa: false, sources: 1 }
  },
}
