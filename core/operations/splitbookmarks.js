/**
 * Operazione "splitbookmarks": divide un documento seguendo i suoi segnalibri.
 *
 * Ogni segnalibro di primo livello apre una parte, che arriva fino alla pagina
 * precedente il segnalibro successivo. È la divisione che serve quando un
 * fascicolo unico contiene documenti distinti già intitolati: i nomi dei file
 * prodotti vengono dai titoli, non da un contatore anonimo.
 */

import path from 'node:path'
import { operationDescriptor } from '../catalog.js'
import { createDocument, loadDocument, saveDocument } from '../pdf/document.js'
import { bookmarkGroups, outlineTargets, safeFileName } from '../pdf/outline.js'

export default {
  ...operationDescriptor('splitbookmarks'),

  async run({ files, outputDir, onProgress }) {
    const source = await loadDocument(files[0])
    const targets = outlineTargets(source)
    if (targets.length === 0) {
      throw new Error('Il documento non ha segnalibri di primo livello da cui ricavare le parti.')
    }

    const groups = bookmarkGroups(targets, source.getPageCount()).filter(
      (group) => group.indices.length > 0,
    )
    const baseName = path.basename(files[0], path.extname(files[0]))

    const outputs = []
    const used = new Set()
    let pages = 0
    let bytes = 0

    for (const [index, group] of groups.entries()) {
      const target = await createDocument({ title: group.title })
      const copied = await target.copyPages(source, group.indices)
      for (const page of copied) target.addPage(page)

      // Due segnalibri possono avere lo stesso titolo: il numero d'ordine
      // rende comunque univoco il nome del file.
      const label = safeFileName(group.title, `${baseName}-${index + 1}`)
      const unique = used.has(label) ? `${label}-${index + 1}` : label
      used.add(unique)

      const output = path.join(outputDir, `${unique}.pdf`)
      bytes += await saveDocument(target, output)
      outputs.push(output)
      pages += copied.length
      onProgress?.({ index, total: groups.length, file: output, pages: copied.length })
    }

    return {
      output: outputDir,
      outputs,
      pages,
      bytes,
      pdfa: false,
      sources: 1,
      parts: outputs.length,
    }
  },
}
