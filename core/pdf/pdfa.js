/**
 * Applicazione del profilo PDF/A-1b a un documento pdf-lib.
 *
 * Vengono impostati gli elementi che lo standard richiede a livello di
 * documento: versione dell'header, identificatore di file, OutputIntent con
 * profilo ICC incorporato e pacchetto XMP con `pdfaid:part`/`pdfaid:conformance`.
 * Le risorse ereditate dalle pagine sorgente (font, immagini) vengono copiate
 * cosi' come sono: se il documento di partenza incorpora i propri font, il
 * risultato e' conforme; in caso contrario resta la non conformita' del
 * sorgente, che nessuna riscrittura dei metadati puo' correggere.
 */

import { PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib'
import { createHash } from 'node:crypto'
import { srgbIccProfile, SRGB_PROFILE_NAME } from './srgb-icc.js'
import { buildXmpMetadata } from './metadata.js'

/**
 * PDF/A-1 e' definito sopra PDF 1.4: l'header non puo' dichiarare di piu'.
 * pdf-lib scrive sempre `%PDF-1.7`, quindi la versione viene riscritta sui byte
 * serializzati (vedi `saveDocument`): la riga ha lunghezza fissa, gli offset
 * della tabella xref restano validi.
 */
export const PDFA1_HEADER_VERSION = '1.4'

function fileIdentifier(seed) {
  const digest = createHash('md5').update(seed).digest('hex').toUpperCase()
  return PDFHexString.of(digest)
}

function attachOutputIntent(pdfDoc) {
  const context = pdfDoc.context
  const profile = srgbIccProfile()
  const profileStream = context.stream(profile, {
    N: PDFNumber.of(3),
    Alternate: PDFName.of('DeviceRGB'),
  })
  const profileRef = context.register(profileStream)

  const outputIntent = context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of(SRGB_PROFILE_NAME),
    OutputCondition: PDFString.of(SRGB_PROFILE_NAME),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of(SRGB_PROFILE_NAME),
    DestOutputProfile: profileRef,
  })

  pdfDoc.catalog.set(PDFName.of('OutputIntents'), context.obj([outputIntent]))
}

function attachXmpMetadata(pdfDoc, { title, producer, creator, date }) {
  const context = pdfDoc.context
  const xmp = buildXmpMetadata({ title, producer, creator, date })
  const metadataStream = context.stream(xmp, {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  })
  pdfDoc.catalog.set(PDFName.of('Metadata'), context.register(metadataStream))
}

/**
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {{title: string, producer: string, creator: string, date?: Date}} info
 */
export function applyPdfA1b(pdfDoc, { title, producer, creator, date = new Date() }) {
  attachOutputIntent(pdfDoc)
  attachXmpMetadata(pdfDoc, { title, producer, creator, date })

  const identifier = fileIdentifier(`${title}|${producer}|${date.toISOString()}`)
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([identifier, identifier])

  return pdfDoc
}
