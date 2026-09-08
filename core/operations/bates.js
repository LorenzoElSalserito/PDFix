/**
 * Operazione "bates": numerazione progressiva di un fascicolo.
 *
 * Si distingue dalla numerazione ordinaria per una proprietà sola, ma decisiva
 * nell'uso legale: il contatore **non riparte** a ogni documento. Un fascicolo
 * di cinque file riceve una sequenza unica, così ogni pagina ha un
 * identificativo irripetibile a cui si può fare riferimento.
 */

import path from 'node:path'
import { StandardFonts, rgb } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { labelPosition } from './numbering.js'

/** Etichetta Bates: prefisso, numero a cifre fisse, suffisso. */
export function formatBates({ prefix = '', number, digits = 6, suffix = '' }) {
  return `${prefix}${String(Math.trunc(number)).padStart(digits, '0')}${suffix}`
}

/** Il font standard copre solo Latin-1: fuori da lì l'etichetta è illeggibile. */
export function assertLabelPart(value, label) {
  const text = String(value ?? '')
  if (text !== '' && !/^[\x20-\xFF]*$/.test(text)) {
    throw new Error(`«${label}» accetta solo caratteri latini.`)
  }
  return text
}

export default {
  ...operationDescriptor('bates'),

  async run({ files, outputDir, params, onProgress }) {
    const prefix = assertLabelPart(params.prefix, 'Prefisso')
    const suffix = assertLabelPart(params.suffix, 'Suffisso')
    const digits = Number(params.digits)
    const size = Number(params.size)

    let counter = Number(params.start)
    const outputs = []
    let pages = 0
    let bytes = 0

    for (const [index, file] of files.entries()) {
      const document = await loadDocument(file)
      const font = await document.embedFont(StandardFonts.Helvetica)

      for (const page of document.getPages()) {
        const label = formatBates({ prefix, number: counter++, digits, suffix })
        const { width, height } = page.getSize()
        page.drawText(label, {
          ...labelPosition(params.position, {
            width,
            height,
            textWidth: font.widthOfTextAtSize(label, size),
            size,
          }),
          size,
          font,
          color: rgb(0.2, 0.2, 0.2),
        })
        pages++
      }

      const baseName = path.basename(file, path.extname(file))
      const output = path.join(outputDir, `${baseName}_bates.pdf`)
      bytes += await saveDocument(document, output)
      outputs.push(output)
      onProgress?.({ index, total: files.length, file: output, pages: document.getPageCount() })
    }

    return {
      output: outputDir,
      outputs,
      pages,
      bytes,
      pdfa: false,
      sources: files.length,
      lastNumber: counter - 1,
    }
  },
}
