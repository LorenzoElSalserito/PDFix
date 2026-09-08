/**
 * Operazione "signature": la firma scansionata, appoggiata sul foglio.
 *
 * Non è una firma digitale e non pretende di esserlo: è l'immagine della
 * propria firma — un PNG o un JPG — messa nel punto in cui, su carta, si
 * firmerebbe. Serve ai moduli che chiedono una firma «autografa» e che nessuno
 * verificherà con un certificato.
 *
 * La posizione arriva in frazioni della pagina, non in punti: sono le stesse
 * frazioni che l'anteprima usa per disegnare il riquadro trascinabile, quindi
 * quello che l'utente vede è quello che il documento riceve, su qualunque
 * formato di foglio.
 */

import { readFile } from 'node:fs/promises'
import { degrees } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { detectImageFormat } from './images.js'

/** Rotazione della pagina normalizzata ai quattro quarti di giro. */
export function pageRotation(angle) {
  const turns = Math.round(Number(angle ?? 0) / 90) % 4
  return ((turns + 4) % 4) * 90
}

/**
 * Traduce un piazzamento visivo nei parametri di `drawImage`.
 *
 * L'utente colloca la firma su quello che vede: origine in alto a sinistra,
 * `y` verso il basso, pagina già ruotata dal visualizzatore. Lo spazio utente
 * del PDF ha l'origine in basso a sinistra e ignora `/Rotate`. Per le pagine
 * ruotate l'immagine va quindi ruotata in senso opposto e agganciata all'angolo
 * giusto, altrimenti comparirebbe coricata e fuori dal foglio.
 *
 * @param {{width: number, height: number, rotation: number}} page dimensioni non ruotate
 * @param {{x: number, y: number, width: number}} placement frazioni della pagina vista
 * @param {number} ratio altezza/larghezza dell'immagine
 * @returns {{x: number, y: number, width: number, height: number, rotate: number}}
 */
export function drawRect(page, placement, ratio) {
  const rotation = pageRotation(page.rotation)
  const quarter = rotation === 90 || rotation === 270
  // Dimensioni della pagina come la vede chi guarda.
  const visibleWidth = quarter ? page.height : page.width
  const visibleHeight = quarter ? page.width : page.height

  const width = visibleWidth * placement.width
  const height = width * ratio
  const left = visibleWidth * placement.x
  // `y` scende dall'alto: qui torna a salire dal basso, come nel PDF.
  const bottom = visibleHeight - visibleHeight * placement.y - height

  const corners = {
    0: { x: left, y: bottom, rotate: 0 },
    90: { x: page.width - bottom, y: left, rotate: 90 },
    180: { x: page.width - left, y: page.height - bottom, rotate: 180 },
    270: { x: bottom, y: page.height - left, rotate: -90 },
  }

  return { ...corners[rotation], width, height }
}

export default {
  ...operationDescriptor('signature'),

  async run({ files, output, params, onProgress }) {
    const bytes = await readFile(params.image)
    const format = detectImageFormat(bytes)
    if (!format) throw new Error('Il file scelto non è un PNG né un JPG.')

    const document = await loadDocument(files[0])
    const pageCount = document.getPageCount()
    const { page: pageNumber, ...placement } = params.placement
    if (pageNumber > pageCount) {
      throw new Error(`Pagina ${pageNumber} inesistente: il documento ne ha ${pageCount}.`)
    }

    const image = format === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
    const page = document.getPage(pageNumber - 1)
    const size = page.getSize()
    const rect = drawRect(
      { width: size.width, height: size.height, rotation: page.getRotation().angle },
      placement,
      image.height / image.width,
    )

    page.drawImage(image, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotate: degrees(rect.rotate),
      opacity: Math.min(1, Math.max(0.1, Number(params.opacity) / 100)),
    })
    onProgress?.({ index: 0, total: 1, file: files[0], pages: pageCount })

    const written = await saveDocument(document, output)
    return {
      output,
      pages: pageCount,
      signedPage: pageNumber,
      bytes: written,
      pdfa: false,
      sources: 1,
    }
  },
}
