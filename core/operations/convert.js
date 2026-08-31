/**
 * Operazione "convert": riscrive un singolo PDF come PDF/A-1b.
 */

import { operationDescriptor } from '../catalog.js'
import { appendPages, createDocument, PRODUCER, saveDocument } from '../pdf/document.js'
import { applyPdfA1b, PDFA1_HEADER_VERSION } from '../pdf/pdfa.js'

export default {
  ...operationDescriptor('convert'),

  async run({ files, output, onProgress }) {
    const date = new Date()
    const title = 'Documento PDF/A'
    const pdfDoc = await createDocument({ title, date })
    const pages = await appendPages(pdfDoc, files, onProgress)
    applyPdfA1b(pdfDoc, { title, producer: PRODUCER, creator: PRODUCER, date })
    const bytes = await saveDocument(pdfDoc, output, { headerVersion: PDFA1_HEADER_VERSION })
    return { output, pages, bytes, pdfa: true, sources: files.length }
  },
}
