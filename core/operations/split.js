/**
 * Operazione "split": divide un documento in più file.
 *
 * È l'unica operazione che produce più di un risultato, quindi chiede una
 * cartella invece di un file: i nomi vengono numerati con la stessa larghezza
 * per restare ordinati alfabeticamente.
 */

import path from 'node:path'
import { operationDescriptor } from '../catalog.js'
import { createDocument, loadDocument, saveDocument } from '../pdf/document.js'
import { splitGroups } from '../pdf/pages.js'

/** `parte-01.pdf`, `parte-02.pdf`, … con tanti zeri quanti servono. */
export function partName(baseName, index, total) {
  const width = String(total).length
  return `${baseName}-${String(index + 1).padStart(width, '0')}.pdf`
}

export default {
  ...operationDescriptor('split'),

  async run({ files, outputDir, params, onProgress }) {
    const source = await loadDocument(files[0])
    const groups = splitGroups(params.mode, params.ranges, source.getPageCount())
    const baseName = path.basename(files[0], path.extname(files[0]))

    const outputs = []
    let pages = 0
    let bytes = 0

    for (const [index, indices] of groups.entries()) {
      const target = await createDocument({ title: `${baseName} (parte ${index + 1})` })
      const copied = await target.copyPages(source, indices)
      for (const page of copied) target.addPage(page)

      const output = path.join(outputDir, partName(baseName, index, groups.length))
      bytes += await saveDocument(target, output)
      outputs.push(output)
      pages += copied.length
      onProgress?.({ index, total: groups.length, file: output, pages: copied.length })
    }

    return { output: outputDir, outputs, pages, bytes, pdfa: false, sources: 1, parts: outputs.length }
  },
}
