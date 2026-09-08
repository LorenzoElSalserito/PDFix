/**
 * Operazione "nup": dispone due o quattro pagine su ogni foglio.
 *
 * Le pagine sorgente vengono incorporate come disegni (`embedPages`), non
 * copiate: un'unica scansione del documento di partenza e una sola copia delle
 * risorse condivise. Annotazioni e campi modulo non sopravvivono — è il prezzo
 * dell'impaginazione, e vale per qualunque strumento faccia questa operazione.
 */

import { PDFDocument, degrees, rgb } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { PT_PER_MM, cellAt, insetCell, placement, sheetGrid } from '../pdf/layout.js'

/** Cornice sottile attorno a ogni pagina collocata: aiuta a tagliare diritto. */
const FRAME_COLOR = rgb(0.6, 0.6, 0.6)

export default {
  ...operationDescriptor('nup'),

  async run({ files, output, params, onProgress }) {
    const perSheet = Number(params.perFoglio)
    const margin = Number(params.marginMm) * PT_PER_MM
    const { columns, rows, sheet } = sheetGrid(perSheet)

    const source = await loadDocument(files[0])
    const pages = source.getPages()
    const target = await PDFDocument.create()
    const embedded = await target.embedPages(pages)

    let sheets = 0
    for (let start = 0; start < embedded.length; start += perSheet) {
      const canvas = target.addPage([sheet.width, sheet.height])
      sheets++

      for (let slot = 0; slot < perSheet && start + slot < embedded.length; slot++) {
        const cell = insetCell(
          cellAt(slot, { columns, rows, width: sheet.width, height: sheet.height }),
          margin,
        )
        const page = pages[start + slot]
        const spot = placement(
          { ...page.getSize(), rotation: page.getRotation().angle },
          cell,
        )
        canvas.drawPage(embedded[start + slot], {
          x: spot.x,
          y: spot.y,
          xScale: spot.scale,
          yScale: spot.scale,
          rotate: degrees(spot.rotate),
        })
        if (params.cornice) {
          canvas.drawRectangle({
            x: cell.x,
            y: cell.y,
            width: cell.width,
            height: cell.height,
            borderColor: FRAME_COLOR,
            borderWidth: 0.5,
          })
        }
      }

      onProgress?.({ index: start, total: embedded.length, file: files[0], pages: sheets })
    }

    const bytes = await saveDocument(target, output)
    return { output, pages: sheets, sourcePages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
