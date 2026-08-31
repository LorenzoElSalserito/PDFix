/**
 * Operazione "remove": elimina le pagine indicate e conserva le altre
 * nell'ordine originale.
 */

import { operationDescriptor } from '../catalog.js'
import { createDocument, loadDocument, saveDocument } from '../pdf/document.js'
import { complementOf, parsePageSelection } from '../pdf/pages.js'

export default {
  ...operationDescriptor('remove'),

  async run({ files, output, params, onProgress }) {
    const source = await loadDocument(files[0])
    const pageCount = source.getPageCount()
    const removed = parsePageSelection(params.pages, pageCount)
    const kept = complementOf(removed, pageCount)

    if (kept.length === 0) {
      throw new Error('L’operazione eliminerebbe tutte le pagine: il documento resterebbe vuoto.')
    }

    const target = await createDocument({ title: 'Documento ridotto' })
    const pages = await target.copyPages(source, kept)
    for (const page of pages) target.addPage(page)
    onProgress?.({ index: 0, total: 1, file: files[0], pages: pages.length })

    const bytes = await saveDocument(target, output)
    return { output, pages: pages.length, bytes, pdfa: false, sources: 1, removed: removed.length }
  },
}
