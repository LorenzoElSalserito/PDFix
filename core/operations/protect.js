/**
 * Operazione "protect": cifra il documento con una password.
 *
 * La cifratura è AES-256, il predefinito della libreria e l'unico algoritmo
 * raccomandato dallo standard: gli RC4 restano nella libreria solo per lettori
 * anteriori al 2005 e qui non sono raggiungibili.
 *
 * Due avvertenze che valgono più del codice: un PDF cifrato **non è più
 * PDF/A**, perché lo standard di archiviazione vieta la cifratura; e una
 * password dimenticata significa un documento perso, perché non c'è nessun
 * recupero possibile.
 */

import { operationDescriptor } from '../catalog.js'
import { loadDocument, saveDocument } from '../pdf/document.js'

/**
 * Permessi concessi a chi apre con la password d'uso.
 *
 * Sono limiti dichiarati nel documento, non barriere crittografiche: un lettore
 * che sceglie di ignorarli può farlo. Vanno presentati per quello che sono.
 */
export function permissionsFrom(params) {
  return {
    printing: params.stampa === 'no' ? false : params.stampa,
    copying: Boolean(params.copia),
    modifying: Boolean(params.modifica),
    annotating: Boolean(params.annotazioni),
    fillingForms: Boolean(params.moduli),
    contentAccessibility: true,
    documentAssembly: Boolean(params.modifica),
  }
}

export default {
  ...operationDescriptor('protect'),

  async run({ files, output, params, onProgress }) {
    const userPassword = String(params.userPassword ?? '')
    if (userPassword.trim() === '') {
      throw new Error('La password di apertura non può essere vuota.')
    }
    const ownerPassword = String(params.ownerPassword ?? '').trim() || userPassword

    const document = await loadDocument(files[0])
    onProgress?.({ index: 0, total: 1, file: files[0], pages: document.getPageCount() })

    document.encrypt({ userPassword, ownerPassword, permissions: permissionsFrom(params) })

    const bytes = await saveDocument(document, output)
    return {
      output,
      pages: document.getPageCount(),
      bytes,
      encrypted: true,
      pdfa: false,
      sources: 1,
    }
  },
}
