/**
 * Operazione "formfields": elenca i campi di un modulo.
 *
 * È l'unica operazione che non produce un PDF: un elenco di campi è un dato, e
 * il formato naturale di un dato è JSON. Serve a sapere cosa un modulo chiede
 * prima di compilarlo, e a riusare quell'elenco altrove.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { operationDescriptor } from '../catalog.js'
import { loadDocument } from '../pdf/document.js'
import { describeField, readForm } from '../pdf/forms.js'

export default {
  ...operationDescriptor('formfields'),

  async run({ files, output, onProgress }) {
    const document = await loadDocument(files[0])
    const { fields } = readForm(document)
    const described = fields.map(describeField)
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const report = {
      documento: path.basename(files[0]),
      pagine: document.getPageCount(),
      campi: described,
    }
    const text = `${JSON.stringify(report, null, 2)}\n`
    await writeFile(output, text, 'utf8')

    return {
      output,
      pages: document.getPageCount(),
      fields: described.length,
      bytes: Buffer.byteLength(text),
      pdfa: false,
      sources: 1,
    }
  },
}
