/**
 * Operazione "crop": restringe l'area visibile delle pagine.
 *
 * Il ritaglio agisce sul CropBox: il contenuto fuori dal riquadro resta dentro
 * il file, semplicemente non viene più mostrato né stampato. Serve a inquadrare
 * una scansione storta o a togliere un bordo; **non** è un modo per nascondere
 * informazioni, perché il testo tagliato resta estraibile.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { PT_PER_MM } from '../pdf/layout.js'
import { parsePageSelection } from '../pdf/pages.js'

/**
 * Nuovo riquadro visibile, a partire da quello attuale.
 *
 * Si parte dal CropBox e non dal MediaBox: su un documento già ritagliato
 * ripartire dal foglio fisico annullerebbe il ritaglio precedente. L'origine
 * del riquadro non è sempre `(0, 0)`, quindi va sommata.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {{top: number, right: number, bottom: number, left: number}} trim in punti
 * @param {number} pageNumber usato solo nel messaggio d'errore
 */
export function croppedBox(box, trim, pageNumber) {
  const width = box.width - trim.left - trim.right
  const height = box.height - trim.top - trim.bottom
  if (width <= 0 || height <= 0) {
    throw new Error(`Il ritaglio non lascia nulla della pagina ${pageNumber}: riduci i margini.`)
  }
  return { x: box.x + trim.left, y: box.y + trim.bottom, width, height }
}

export default {
  ...operationDescriptor('crop'),

  async run({ files, output, params, onProgress }) {
    const trim = {
      top: Number(params.topMm) * PT_PER_MM,
      right: Number(params.rightMm) * PT_PER_MM,
      bottom: Number(params.bottomMm) * PT_PER_MM,
      left: Number(params.leftMm) * PT_PER_MM,
    }
    if (Object.values(trim).every((value) => value === 0)) {
      throw new Error('Indica almeno un margine da ritagliare.')
    }

    const document = await loadDocument(files[0])
    const indices = parsePageSelection(params.pages, document.getPageCount())

    for (const [step, index] of indices.entries()) {
      const page = document.getPage(index)
      const box = croppedBox(page.getCropBox(), trim, index + 1)
      page.setCropBox(box.x, box.y, box.width, box.height)
      if (step % 25 === 0) {
        onProgress?.({ index: step, total: indices.length, file: files[0], pages: step + 1 })
      }
    }

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      cropped: indices.length,
      bytes,
      pdfa: false,
      sources: 1,
    }
  },
}
