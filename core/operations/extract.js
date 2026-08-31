/**
 * Operazione "extract": costruisce un nuovo documento con le sole pagine
 * indicate, nell'ordine in cui sono state indicate.
 */

import { operationDescriptor } from '../catalog.js'
import { createDocument, loadDocument, saveDocument } from '../pdf/document.js'
import { parsePageSelection } from '../pdf/pages.js'

export default {
  ...operationDescriptor('extract'),

  async run({ files, output, params, onProgress }) {
    const source = await loadDocument(files[0])
    const indices = parsePageSelection(params.pages, source.getPageCount())

    const target = await createDocument({ title: 'Pagine estratte' })
    const pages = await target.copyPages(source, indices)
    for (const page of pages) target.addPage(page)
    onProgress?.({ index: 0, total: 1, file: files[0], pages: pages.length })

    const bytes = await saveDocument(target, output)
    return { output, pages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
