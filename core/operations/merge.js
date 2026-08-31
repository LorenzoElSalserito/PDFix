/**
 * Operazione "merge": concatena più PDF in un unico documento, opzionalmente
 * marcato PDF/A-1b.
 */

import { operationDescriptor } from '../catalog.js'
import { appendPages, createDocument, PRODUCER, saveDocument } from '../pdf/document.js'
import { applyPdfA1b, PDFA1_HEADER_VERSION } from '../pdf/pdfa.js'

export default {
  ...operationDescriptor('merge'),

  async run({ files, output, pdfa = false, onProgress }) {
    const date = new Date()
    const title = pdfa ? 'Documento unito (PDF/A)' : 'Documento unito'
    const pdfDoc = await createDocument({ title, date })
    const pages = await appendPages(pdfDoc, files, onProgress)
    if (pdfa) applyPdfA1b(pdfDoc, { title, producer: PRODUCER, creator: PRODUCER, date })
    const bytes = await saveDocument(pdfDoc, output, pdfa ? { headerVersion: PDFA1_HEADER_VERSION } : {})
    return { output, pages, bytes, pdfa: Boolean(pdfa), sources: files.length }
  },
}
