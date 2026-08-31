/**
 * Operazione "images": costruisce un PDF a partire da immagini.
 *
 * Le immagini vengono incorporate così come sono — JPEG resta JPEG, PNG resta
 * PNG — senza ricodifica: il documento non perde qualità e l'operazione non ha
 * bisogno di alcuna libreria grafica.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { operationDescriptor } from '../catalog.js'
import { createDocument, saveDocument } from '../pdf/document.js'

/** A4 in punti tipografici (72 dpi). */
export const A4 = { width: 595.28, height: 841.89 }

/** Un millimetro in punti. */
export const MM = 72 / 25.4

/** Riconosce il formato dai byte iniziali, non dall'estensione. */
export function detectImageFormat(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  return null
}

/**
 * Riquadro in cui inscrivere l'immagine mantenendone le proporzioni.
 *
 * @returns {{width: number, height: number, x: number, y: number}}
 */
export function fitInside(image, page, margin) {
  const available = { width: page.width - margin * 2, height: page.height - margin * 2 }
  const scale = Math.min(available.width / image.width, available.height / image.height, 1)
  const width = image.width * scale
  const height = image.height * scale
  return {
    width,
    height,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
  }
}

export default {
  ...operationDescriptor('images'),

  async run({ files, output, params, onProgress }) {
    const document = await createDocument({ title: 'Documento da immagini' })
    const margin = Number(params.marginMm ?? 0) * MM

    for (const [index, filePath] of files.entries()) {
      const bytes = await readFile(filePath).catch(() => {
        throw new Error(`File non leggibile: ${filePath}`)
      })

      const format = detectImageFormat(bytes)
      if (!format) throw new Error(`Formato immagine non riconosciuto: ${path.basename(filePath)}`)

      const image = format === 'jpg' ? await document.embedJpg(bytes) : await document.embedPng(bytes)

      if (params.pageSize === 'immagine') {
        const page = document.addPage([image.width, image.height])
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
      } else {
        const size = params.pageSize === 'a4-orizzontale' ? { width: A4.height, height: A4.width } : A4
        const page = document.addPage([size.width, size.height])
        page.drawImage(image, fitInside(image, size, margin))
      }

      onProgress?.({ index, total: files.length, file: filePath, pages: 1 })
    }

    const bytes = await saveDocument(document, output)
    return { output, pages: document.getPageCount(), bytes, pdfa: false, sources: files.length }
  },
}
