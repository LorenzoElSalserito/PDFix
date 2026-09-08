/**
 * Operazione "rotate": ruota le pagine indicate.
 *
 * La rotazione è relativa a quella già presente nella pagina: un documento
 * scansionato storto di 90° e ruotato di altri 90° finisce a 180°, come si
 * aspetta chi guarda il risultato.
 */

import { degrees } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { parsePageSelection } from '../pdf/pages.js'

/** Normalizza un angolo qualsiasi nell'intervallo 0–359. */
export function normalizeAngle(angle) {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360
}

export default {
  ...operationDescriptor('rotate'),

  async run({ files, output, params, onProgress }) {
    const document = await loadDocument(files[0])
    const indices = parsePageSelection(params.pages, document.getPageCount())
    const rotation = normalizeAngle(Number(params.angle))

    for (const index of indices) {
      const page = document.getPage(index)
      page.setRotation(degrees(normalizeAngle(page.getRotation().angle + rotation)))
    }
    onProgress?.({ index: 0, total: 1, file: files[0], pages: indices.length })

    const bytes = await saveDocument(document, output)
    return { output, pages: indices.length, bytes, pdfa: false, sources: 1, angle: rotation }
  },
}
