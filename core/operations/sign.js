/**
 * Operazione "sign": firma digitale del documento (profilo PAdES).
 *
 * Firmare non è cifrare. Si svolge in due tempi: prima si riserva nel file uno
 * spazio vuoto di dimensione fissa con un `/ByteRange` che dichiara quali byte
 * la firma coprirà, poi si calcola la firma CMS/PKCS#7 su quei byte e la si
 * scrive nello spazio riservato. L'ordine è obbligato, perché la firma copre
 * tutto il file tranne se stessa.
 *
 * Limiti dichiarati: nessuna marca temporale — richiederebbe un server TSA,
 * cioè la rete — e nessuna verifica della catena di certificazione. PDFix firma,
 * non convalida.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'
import { P12Signer } from '@signpdf/signer-p12'
import { SignPdf } from '@signpdf/signpdf'
import { operationDescriptor } from '../catalog.js'
import { loadDocument, serializeDocument } from '../pdf/document.js'

/**
 * Spazio riservato alla firma, in byte.
 *
 * Il valore predefinito della libreria (8 KB) basta per un certificato con una
 * catena breve; con catene lunghe la firma non ci sta e l'operazione fallisce,
 * quindi qui si riserva il doppio: costa 8 KB sul file, evita un errore che
 * l'utente non saprebbe come risolvere.
 */
const SIGNATURE_LENGTH = 16384

/**
 * Traduce in italiano gli errori delle librerie di firma.
 *
 * Sono messaggi rivolti a chi sviluppa: senza traduzione l'utente leggerebbe
 * «PKCS#12 MAC could not be verified» senza capire che ha sbagliato password.
 */
export function describeSigningError(error) {
  const message = String(error?.message || error)
  if (/mac could not be verified|invalid password/i.test(message)) {
    return 'Password del certificato errata: il file non è stato firmato.'
  }
  if (/Unable to read the file|asn1|Too few bytes|invalid/i.test(message) && /p12|pkcs/i.test(message)) {
    return 'Il file scelto non è un certificato PKCS#12 valido.'
  }
  if (/exceed|placeholder/i.test(message)) {
    return 'La firma non entra nello spazio riservato: il certificato ha una catena troppo lunga.'
  }
  return `Firma non riuscita: ${message}`
}

export default {
  ...operationDescriptor('sign'),

  async run({ files, output, params, onProgress }) {
    const passphrase = String(params.passphrase ?? '')

    // Il documento viene riscritto prima di firmarlo: lo spazio riservato si
    // inserisce con una revisione incrementale, che richiede una tabella xref
    // classica — quella che PDFix produce sempre.
    const document = await loadDocument(files[0])
    const normalized = Buffer.from(await serializeDocument(document))
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    try {
      const withPlaceholder = plainAddPlaceholder({
        pdfBuffer: normalized,
        reason: String(params.motivo ?? '').trim() || 'Sottoscrizione del documento',
        contactInfo: String(params.contatto ?? '').trim(),
        name: String(params.nome ?? '').trim(),
        location: String(params.luogo ?? '').trim(),
        signatureLength: SIGNATURE_LENGTH,
        appName: 'PDFix',
      })

      const certificate = await readFile(params.certificato)
      const signer = new P12Signer(certificate, { passphrase })
      // Si istanzia la classe invece di usare l'istanza predefinita del
      // pacchetto: sotto ESM quell'export arriva annidato in `default`, e la
      // forma esplicita non dipende dall'interoperabilità fra i due sistemi.
      const signed = await new SignPdf().sign(withPlaceholder, signer)
      await writeFile(output, signed)

      return {
        output,
        pages: document.getPageCount(),
        bytes: signed.length,
        signed: true,
        pdfa: false,
        sources: 1,
      }
    } catch (error) {
      throw new Error(describeSigningError(error))
    }
  },
}
