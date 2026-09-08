/**
 * Lettura e scrittura dei moduli AcroForm.
 *
 * pdf-lib gestisce i moduli standard del PDF; i moduli XFA — quelli generati da
 * Adobe LiveCycle — hanno una struttura completamente diversa e non sono
 * trattabili: vanno riconosciuti e rifiutati con un messaggio chiaro, invece di
 * produrre un file rotto in silenzio.
 */

import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
} from '@cantoo/pdf-lib'

/** Prefisso dei parametri generati dai campi: evita collisioni con quelli fissi. */
export const FIELD_PREFIX = 'campo:'

/**
 * Restituisce il modulo del documento, dopo i controlli che rendono inutile
 * proseguire.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} document
 * @param {{requireFields?: boolean}} [options]
 */
export function readForm(document, { requireFields = true } = {}) {
  const form = document.getForm()
  if (form.hasXFA()) {
    throw new Error('Il documento usa un modulo XFA, che PDFix non è in grado di trattare.')
  }
  const fields = form.getFields()
  if (requireFields && fields.length === 0) {
    throw new Error('Il documento non contiene campi compilabili.')
  }
  return { form, fields }
}

/**
 * Descrizione di un campo, indipendente da pdf-lib: è ciò che finisce nel file
 * JSON e ciò da cui si generano i parametri della finestra.
 *
 * @returns {{name: string, type: string, value: any, options?: string[]}}
 */
export function describeField(field) {
  const name = field.getName()
  if (field instanceof PDFTextField) {
    return { name, type: 'text', value: field.getText() ?? '' }
  }
  if (field instanceof PDFCheckBox) {
    return { name, type: 'boolean', value: field.isChecked() }
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return { name, type: 'choice', value: field.getSelected()[0] ?? '', options: field.getOptions() }
  }
  if (field instanceof PDFRadioGroup) {
    return { name, type: 'choice', value: field.getSelected() ?? '', options: field.getOptions() }
  }
  // Pulsanti e firme non si compilano: restano visibili nell'elenco, ma non
  // diventano parametri.
  return { name, type: 'altro', value: null }
}

/** Descrittore di parametro corrispondente a un campo compilabile. */
export function fieldParam(description) {
  const base = {
    key: `${FIELD_PREFIX}${description.name}`,
    label: description.name,
    default: description.value ?? '',
  }
  if (description.type === 'boolean') return { ...base, type: 'boolean', default: Boolean(description.value) }
  if (description.type === 'choice') {
    return {
      ...base,
      type: 'choice',
      options: [
        { value: '', label: '—' },
        ...description.options.map((option) => ({ value: option, label: option })),
      ],
    }
  }
  return { ...base, type: 'text' }
}

/**
 * Scrive nel campo il valore ricevuto dall'interfaccia.
 *
 * Un valore vuoto su un menu significa «non scegliere»: sovrascrivere con la
 * stringa vuota farebbe fallire `select`, che ammette solo le opzioni esistenti.
 */
export function applyValue(field, value) {
  if (field instanceof PDFTextField) {
    field.setText(String(value ?? ''))
    return true
  }
  if (field instanceof PDFCheckBox) {
    if (value) field.check()
    else field.uncheck()
    return true
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    const text = String(value ?? '')
    if (text === '') return false
    if (!field.getOptions().includes(text)) {
      throw new Error(`Valore non ammesso per «${field.getName()}»: ${text}.`)
    }
    field.select(text)
    return true
  }
  return false
}

/**
 * Ricalcola l'aspetto dei campi.
 *
 * Senza questo passaggio, un documento privo di appearance stream mostra i
 * campi vuoti in alcuni lettori anche dopo la compilazione.
 */
export async function refreshAppearances(document, form) {
  form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica))
}
