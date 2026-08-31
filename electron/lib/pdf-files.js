/**
 * Validazione e descrizione dei file scelti dall'utente.
 *
 * Il controllo avviene nel processo main, prima che un percorso raggiunga il
 * motore: il renderer non è mai la fonte di verità su cosa sia un file valido.
 * L'estensione da sola non basta — si leggono i primi byte, così un `.pdf` che
 * PDF non è viene fermato subito.
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS } from '../../core/catalog.js'

/** Firme riconosciute, in byte, per ogni tipo accettato. */
const SIGNATURES = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
}

/** Estensioni che l'applicazione sa aprire, in qualunque operazione. */
export const ACCEPTED_EXTENSIONS = ['.pdf', ...IMAGE_EXTENSIONS]

function readHeader(filePath, length) {
  let descriptor
  try {
    descriptor = openSync(filePath, 'r')
  } catch {
    return null
  }
  try {
    const header = Buffer.alloc(length)
    const read = readSync(descriptor, header, 0, length, 0)
    return read === length ? header : null
  } catch {
    return null
  } finally {
    closeSync(descriptor)
  }
}

/** Il file esiste e il suo contenuto corrisponde davvero all'estensione? */
export function isSupportedFile(filePath) {
  if (typeof filePath !== 'string') return false
  const extension = path.extname(filePath).toLowerCase()
  const signatures = SIGNATURES[extension]
  if (!signatures) return false

  const length = Math.max(...signatures.map((signature) => signature.length))
  const header = readHeader(filePath, length)
  if (!header) return false

  return signatures.some((signature) => signature.every((byte, index) => header[index] === byte))
}

/** Compatibilità: l'unico tipo che le operazioni storiche accettano. */
export function isPdfFile(filePath) {
  return path.extname(String(filePath)).toLowerCase() === '.pdf' && isSupportedFile(filePath)
}

/**
 * @param {string[]} filePaths
 * @returns {{path: string, name: string, size: number, kind: 'pdf'|'immagine'}[]}
 * @throws se un percorso non è un file supportato
 */
export function describeFiles(filePaths) {
  if (!Array.isArray(filePaths)) throw new Error('Elenco file non valido.')
  return filePaths.map((filePath) => {
    if (!isSupportedFile(filePath)) throw new Error(`File non valido o non supportato: ${filePath}`)
    const extension = path.extname(filePath).toLowerCase()
    return {
      path: filePath,
      name: path.basename(filePath),
      size: statSync(filePath).size,
      kind: extension === '.pdf' ? 'pdf' : 'immagine',
    }
  })
}
