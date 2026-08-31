/**
 * Helper di basso livello per leggere, comporre e scrivere documenti PDF.
 * Tutta l'interazione con pdf-lib passa da qui, cosi' le operazioni restano
 * codice di dominio senza dettagli di libreria.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

export const PRODUCER = 'PDFix'

/**
 * PDF/A-1b non ammette object stream ne' cross-reference stream: la stessa
 * opzione viene usata anche per l'output ordinario, cosi' i due percorsi
 * producono file strutturalmente identici a meno dei metadati.
 *
 * L'unica eccezione e' l'ottimizzazione, che gli object stream li usa apposta
 * per ridurre la dimensione del file.
 */
const SAVE_OPTIONS = { useObjectStreams: false }

function describeLoadError(filePath, error) {
  const message = String(error?.message || error)
  if (/encrypted/i.test(message)) {
    return new Error(`PDF protetto da password: ${filePath}`)
  }
  if (/No PDF header found|Failed to parse/i.test(message)) {
    return new Error(`File PDF illeggibile o danneggiato: ${filePath}`)
  }
  return new Error(`Impossibile leggere ${filePath}: ${message}`)
}

/** Carica un PDF dal filesystem, normalizzando gli errori in messaggi leggibili. */
export async function loadDocument(filePath) {
  let bytes
  try {
    bytes = await readFile(filePath)
  } catch (error) {
    throw new Error(`File non leggibile: ${filePath}`)
  }
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (error) {
    throw describeLoadError(filePath, error)
  }
}

/** Crea un documento vuoto con i metadati di base gia' impostati. */
export async function createDocument({ title, creator = PRODUCER, date = new Date() }) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setProducer(PRODUCER)
  pdfDoc.setCreator(creator)
  pdfDoc.setTitle(title)
  pdfDoc.setCreationDate(date)
  pdfDoc.setModificationDate(date)
  return pdfDoc
}

/**
 * Copia tutte le pagine dei documenti sorgente nel documento di destinazione,
 * nell'ordine ricevuto.
 *
 * @param {import('pdf-lib').PDFDocument} target
 * @param {string[]} filePaths
 * @param {(progress: {index: number, total: number, file: string, pages: number}) => void} [onProgress]
 * @returns {Promise<number>} numero totale di pagine copiate
 */
export async function appendPages(target, filePaths, onProgress) {
  let copied = 0
  for (const [index, filePath] of filePaths.entries()) {
    const source = await loadDocument(filePath)
    const pages = await target.copyPages(source, source.getPageIndices())
    for (const page of pages) target.addPage(page)
    copied += pages.length
    onProgress?.({ index, total: filePaths.length, file: filePath, pages: pages.length })
  }
  return copied
}

/**
 * Riscrive la versione dichiarata nell'header PDF.
 *
 * pdf-lib emette sempre `%PDF-1.7`; PDF/A-1b richiede `%PDF-1.4`. La
 * sostituzione avviene su un singolo byte, quindi non sposta nulla e la tabella
 * xref resta coerente.
 */
export function patchHeaderVersion(bytes, version) {
  const header = Buffer.from(bytes.subarray(0, 8)).toString('latin1')
  if (!/^%PDF-1\.\d$/.test(header)) {
    throw new Error('Header PDF inatteso: impossibile impostare la versione.')
  }
  bytes[7] = version.charCodeAt(version.length - 1)
  return bytes
}

/**
 * Serializza il documento e lo scrive su disco.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {string} outputPath
 * @param {{headerVersion?: string, objectStreams?: boolean}} [options]
 * @returns {Promise<number>} dimensione in byte del file scritto
 */
export async function saveDocument(pdfDoc, outputPath, { headerVersion, objectStreams = false } = {}) {
  const bytes = await pdfDoc.save({ ...SAVE_OPTIONS, useObjectStreams: objectStreams })
  if (headerVersion) patchHeaderVersion(bytes, headerVersion)
  await writeFile(outputPath, bytes)
  return bytes.length
}
