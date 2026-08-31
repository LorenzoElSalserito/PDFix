/**
 * Operazione "numbering": stampa il numero di pagina.
 */

import { StandardFonts, rgb } from 'pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { formatPageLabel } from '../pdf/pages.js'

/** Distanza dal bordo della pagina, in punti (circa 8 mm). */
export const MARGIN = 24

/**
 * Coordinate del numero di pagina.
 *
 * @param {string} position una delle sei combinazioni alto/basso × sinistra/centro/destra
 */
export function labelPosition(position, { width, height, textWidth, size }) {
  const [vertical, horizontal] = String(position).split('-')
  const x =
    horizontal === 'sinistra'
      ? MARGIN
      : horizontal === 'destra'
        ? width - MARGIN - textWidth
        : (width - textWidth) / 2
  const y = vertical === 'alto' ? height - MARGIN - size : MARGIN
  return { x, y }
}

export default {
  ...operationDescriptor('numbering'),

  async run({ files, output, params, onProgress }) {
    const size = Number(params.size)
    const start = Number(params.start)

    const document = await loadDocument(files[0])
    const font = await document.embedFont(StandardFonts.Helvetica)
    const pages = document.getPages()
    const total = pages.length + start - 1

    for (const [index, page] of pages.entries()) {
      const label = formatPageLabel(params.format, start + index, total)
      const { width, height } = page.getSize()
      const textWidth = font.widthOfTextAtSize(label, size)
      page.drawText(label, {
        ...labelPosition(params.position, { width, height, textWidth, size }),
        size,
        font,
        color: rgb(0.2, 0.2, 0.2),
      })
      if (index % 25 === 0) onProgress?.({ index, total: pages.length, file: files[0], pages: index + 1 })
    }

    const bytes = await saveDocument(document, output)
    return { output, pages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
