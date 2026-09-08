/**
 * Operazione "formfill": compila i campi di un modulo.
 *
 * I parametri non possono stare nel catalogo — dipendono da quali campi ha il
 * documento scelto — quindi l'operazione li dichiara a richiesta con `inspect`,
 * e l'interfaccia li disegna come se fossero parametri qualunque.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'
import { FIELD_PREFIX, applyValue, describeField, fieldParam, readForm, refreshAppearances } from '../pdf/forms.js'

export default {
  ...operationDescriptor('formfill'),

  /** Un parametro per ogni campo compilabile del documento. */
  async inspect({ files }) {
    const document = await loadDocument(files[0])
    const { fields } = readForm(document)
    const fillable = fields.map(describeField).filter((field) => field.type !== 'altro')
    if (fillable.length === 0) {
      throw new Error('Il documento ha solo campi non compilabili (pulsanti o firme).')
    }
    return fillable.map(fieldParam)
  },

  async run({ files, output, params, onProgress }) {
    const document = await loadDocument(files[0])
    const { form, fields } = readForm(document)
    const byName = new Map(fields.map((field) => [field.getName(), field]))

    let filled = 0
    for (const [key, value] of Object.entries(params)) {
      if (!key.startsWith(FIELD_PREFIX)) continue
      const field = byName.get(key.slice(FIELD_PREFIX.length))
      if (!field) continue
      if (applyValue(field, value)) filled++
    }

    await refreshAppearances(document, form)
    if (params.appiattisci) form.flatten()
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      filled,
      flattened: Boolean(params.appiattisci),
      bytes,
      pdfa: false,
      sources: 1,
    }
  },
}
