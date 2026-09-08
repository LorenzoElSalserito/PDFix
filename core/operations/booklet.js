/**
 * Operazione "booklet": imposizione a sella.
 *
 * I fogli stampati fronte/retro vengono piegati a metà e infilati uno dentro
 * l'altro: perché la lettura risulti ordinata, sul foglio esterno devono
 * finire l'ultima pagina e la prima, su quello successivo la seconda e la
 * penultima, e così restringendo. L'ordine è calcolato da `bookletOrder`.
 */

import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { PT_PER_MM, bookletOrder, cellAt, insetCell, placement, sheetGrid } from '../pdf/layout.js'

/** Due facciate per foglio, sempre affiancate: il libretto è un 2-up ordinato. */
const SLOTS_PER_SHEET = 2

export default {
  ...operationDescriptor('booklet'),

  async run({ files, output, params, onProgress }) {
    const margin = Number(params.marginMm) * PT_PER_MM
    const { columns, rows, sheet } = sheetGrid(SLOTS_PER_SHEET)

    const source = await loadDocument(files[0])
    const pages = source.getPages()
    const order = bookletOrder(pages.length)

    const target = await PDFDocument.create()
    const embedded = await target.embedPages(pages)

    let sheets = 0
    for (let start = 0; start < order.length; start += SLOTS_PER_SHEET) {
      const canvas = target.addPage([sheet.width, sheet.height])
      sheets++

      for (let slot = 0; slot < SLOTS_PER_SHEET; slot++) {
        const index = order[start + slot]
        if (index === null || index === undefined) continue // facciata bianca

        const cell = insetCell(
          cellAt(slot, { columns, rows, width: sheet.width, height: sheet.height }),
          margin,
        )
        const page = pages[index]
        const spot = placement({ ...page.getSize(), rotation: page.getRotation().angle }, cell)
        canvas.drawPage(embedded[index], {
          x: spot.x,
          y: spot.y,
          xScale: spot.scale,
          yScale: spot.scale,
          rotate: degrees(spot.rotate),
        })
      }

      onProgress?.({ index: start, total: order.length, file: files[0], pages: sheets })
    }

    const bytes = await saveDocument(target, output)
    return { output, pages: sheets, sourcePages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
