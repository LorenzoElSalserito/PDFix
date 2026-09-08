/**
 * Operazione "stamp": sovrappone un'immagine — un logo, un timbro — alle pagine.
 *
 * L'immagine viene incorporata così com'è, JPEG o PNG, senza ricodifica: la
 * trasparenza di un PNG viene conservata dal formato stesso. Il riconoscimento
 * del tipo avviene sui byte iniziali e non sull'estensione, come per
 * l'operazione «Immagini in PDF».
 */

import { readFile } from 'node:fs/promises'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { detectImageFormat } from './images.js'
import { parsePageSelection } from '../pdf/pages.js'

/** Distanza dal bordo quando il timbro non è centrato, in punti (circa 8 mm). */
export const EDGE = 24

/**
 * Angolo in basso a sinistra dell'immagine sulla pagina.
 *
 * @param {string} position `centro` oppure alto/basso × sinistra/destra
 */
export function stampPosition(position, { width, height, imageWidth, imageHeight }) {
  if (position === 'centro') {
    return { x: (width - imageWidth) / 2, y: (height - imageHeight) / 2 }
  }
  const [vertical, horizontal] = String(position).split('-')
  return {
    x: horizontal === 'destra' ? width - EDGE - imageWidth : EDGE,
    y: vertical === 'alto' ? height - EDGE - imageHeight : EDGE,
  }
}

export default {
  ...operationDescriptor('stamp'),

  async run({ files, output, params, onProgress }) {
    const bytes = await readFile(params.image)
    const format = detectImageFormat(bytes)
    if (!format) throw new Error('Il file scelto non è un PNG né un JPG.')

    const document = await loadDocument(files[0])
    const image = format === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
    const ratio = image.height / image.width
    const opacity = Math.min(1, Math.max(0.05, Number(params.opacity) / 100))
    const indices = parsePageSelection(params.pages, document.getPageCount())

    for (const [step, index] of indices.entries()) {
      const page = document.getPage(index)
      const { width, height } = page.getSize()
      const imageWidth = width * (Number(params.scala) / 100)
      const imageHeight = imageWidth * ratio
      page.drawImage(image, {
        ...stampPosition(params.posizione, { width, height, imageWidth, imageHeight }),
        width: imageWidth,
        height: imageHeight,
        opacity,
      })
      if (step % 25 === 0) {
        onProgress?.({ index: step, total: indices.length, file: files[0], pages: step + 1 })
      }
    }

    const written = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      stamped: indices.length,
      bytes: written,
      pdfa: false,
      sources: 1,
    }
  },
}
