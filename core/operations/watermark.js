/**
 * Operazione "watermark": sovrappone un testo in diagonale a ogni pagina.
 *
 * Il testo viene disegnato con un font standard non incorporato: è la scelta
 * corretta per una filigrana, che deve pesare quanto niente, ma è anche il
 * motivo per cui il risultato non è dichiarabile PDF/A. Chi ha bisogno di
 * entrambe le cose applica prima la filigrana e poi la conversione.
 */

import { StandardFonts, degrees, rgb } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'

/** Il font standard copre solo Latin-1: il resto diventa illeggibile. */
export function assertPrintable(text) {
  if (!/^[\x20-\xFF]+$/.test(text)) {
    throw new Error('La filigrana accetta solo caratteri latini.')
  }
  return text
}

/**
 * Posizione in cui centrare il testo ruotato.
 *
 * pdf-lib disegna il testo a partire dall'angolo in basso a sinistra e lo
 * ruota attorno a quel punto: per vederlo centrato bisogna spostare l'origine
 * indietro di mezza larghezza, lungo la direzione di rotazione.
 */
export function centeredOrigin({ width, height, textWidth, textHeight, angle }) {
  const radians = (angle * Math.PI) / 180
  return {
    x: width / 2 - (textWidth / 2) * Math.cos(radians) + (textHeight / 2) * Math.sin(radians),
    y: height / 2 - (textWidth / 2) * Math.sin(radians) - (textHeight / 2) * Math.cos(radians),
  }
}

export default {
  ...operationDescriptor('watermark'),

  async run({ files, output, params, onProgress }) {
    const text = assertPrintable(String(params.text ?? '').trim())
    const size = Number(params.size)
    const angle = Number(params.angle)
    const opacity = Math.min(1, Math.max(0.05, Number(params.opacity) / 100))

    const document = await loadDocument(files[0])
    const font = await document.embedFont(StandardFonts.HelveticaBold)
    const textWidth = font.widthOfTextAtSize(text, size)
    const textHeight = font.heightAtSize(size)

    const pages = document.getPages()
    for (const [index, page] of pages.entries()) {
      const { width, height } = page.getSize()
      const origin = centeredOrigin({ width, height, textWidth, textHeight, angle })
      page.drawText(text, {
        ...origin,
        size,
        font,
        color: rgb(0.45, 0.45, 0.45),
        opacity,
        rotate: degrees(angle),
      })
      if (index % 25 === 0) onProgress?.({ index, total: pages.length, file: files[0], pages: index + 1 })
    }

    const bytes = await saveDocument(document, output)
    return { output, pages: pages.length, bytes, pdfa: false, sources: 1 }
  },
}
