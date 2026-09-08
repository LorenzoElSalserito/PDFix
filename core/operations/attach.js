/**
 * Operazione "attach": incorpora un file nel PDF e lo dichiara come allegato.
 *
 * L'uscita è sempre PDF/A-3b, perché è l'unica parte dello standard che ammette
 * allegati di qualunque tipo: è il formato che l'archiviazione a norma chiede
 * per un documento accompagnato dai suoi dati strutturati — la fattura
 * elettronica con il proprio XML, per esempio.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AFRelationship } from '@cantoo/pdf-lib'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, PRODUCER, saveDocument } from '../pdf/document.js'
import { applyPdfA, headerVersionFor } from '../pdf/pdfa.js'

/** Parte dello standard: solo la 3 ammette allegati non PDF/A. */
const PDFA_PART = 3

/**
 * Tipo MIME dedotto dall'estensione.
 *
 * Non serve indovinare: se il tipo è sconosciuto, `application/octet-stream` è
 * la risposta corretta e i lettori si comportano di conseguenza.
 */
export function mimeTypeOf(fileName) {
  const types = {
    '.xml': 'text/xml',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.zip': 'application/zip',
  }
  return types[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Relazione dichiarata fra allegato e documento.
 *
 * `FormData` esiste nell'enumerazione di pdf-lib ma vale `EncryptedPayload`: è
 * un difetto della libreria installata, quindi quel valore non viene offerto.
 */
export function relationshipOf(choice) {
  const allowed = {
    Data: AFRelationship.Data,
    Source: AFRelationship.Source,
    Supplement: AFRelationship.Supplement,
    Alternative: AFRelationship.Alternative,
  }
  return allowed[choice] ?? AFRelationship.Unspecified
}

export default {
  ...operationDescriptor('attach'),

  async run({ files, output, params, onProgress }) {
    const attachmentPath = params.file
    const bytes = await readFile(attachmentPath)
    const name = path.basename(attachmentPath)

    const document = await loadDocument(files[0])
    const date = new Date()
    const title = document.getTitle() || path.basename(files[0], path.extname(files[0]))

    document.setProducer(PRODUCER)
    document.setModificationDate(date)

    await document.attach(bytes, name, {
      mimeType: mimeTypeOf(name),
      description: String(params.descrizione ?? '').trim() || name,
      creationDate: date,
      modificationDate: date,
      afRelationship: relationshipOf(params.relazione),
    })
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    applyPdfA(document, {
      title,
      producer: PRODUCER,
      creator: PRODUCER,
      date,
      part: PDFA_PART,
      conformance: 'B',
    })

    const written = await saveDocument(document, output, {
      headerVersion: headerVersionFor(PDFA_PART),
    })

    return {
      output,
      pages: document.getPageCount(),
      attachment: name,
      attachmentBytes: bytes.length,
      bytes: written,
      pdfa: true,
      pdfaPart: PDFA_PART,
      sources: 1,
    }
  },
}
