/**
 * Operazione "resize": porta tutte le pagine allo stesso formato.
 *
 * Serve dopo un'unione di documenti di provenienze diverse, dove convivono A4,
 * A5 e formati di scansione irregolari. Il contenuto viene scalato in modo
 * proporzionale e centrato: non viene mai deformato né tagliato.
 */

import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { PAGE_SIZES, PT_PER_MM, placement, visualSize } from '../pdf/layout.js'

/**
 * Formato di destinazione richiesto dall'utente.
 *
 * «prima» prende le dimensioni viste della prima pagina, rotazione compresa:
 * è il caso d'uso «rendi tutto uguale a com'è già l'inizio del documento».
 *
 * @param {string} choice
 * @param {{width: number, height: number, rotation: number}} firstPage
 */
export function targetSize(choice, firstPage) {
  if (choice === 'prima') {
    const size = visualSize(firstPage)
    return { width: size.width, height: size.height }
  }
  if (choice === 'a4-orizzontale') {
    return { width: PAGE_SIZES.a4.height, height: PAGE_SIZES.a4.width }
  }
  const size = PAGE_SIZES[choice]
  if (!size) throw new Error(`Formato non riconosciuto: ${choice}.`)
  return { ...size }
}

export default {
  ...operationDescriptor('resize'),

  async run({ files, output, params, onProgress }) {
    const margin = Number(params.marginMm) * PT_PER_MM
    const allowEnlarge = Boolean(params.ingrandisci)

    const source = await loadDocument(files[0])
    const pages = source.getPages()
    const first = pages[0]
    const size = targetSize(String(params.formato), {
      ...first.getSize(),
      rotation: first.getRotation().angle,
    })

    const target = await PDFDocument.create()
    const embedded = await target.embedPages(pages)

    for (const [index, page] of pages.entries()) {
      const canvas = target.addPage([size.width, size.height])
      const cell = {
        x: margin,
        y: margin,
        width: size.width - margin * 2,
        height: size.height - margin * 2,
      }
      if (cell.width <= 0 || cell.height <= 0) {
        throw new Error('Il margine è più grande del formato scelto: riducilo.')
      }

      const spot = placement({ ...page.getSize(), rotation: page.getRotation().angle }, cell, {
        allowEnlarge,
      })
      canvas.drawPage(embedded[index], {
        x: spot.x,
        y: spot.y,
        xScale: spot.scale,
        yScale: spot.scale,
        rotate: degrees(spot.rotate),
      })

      if (index % 25 === 0) {
        onProgress?.({ index, total: pages.length, file: files[0], pages: index + 1 })
      }
    }

    const bytes = await saveDocument(target, output)
    return { output, pages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
