/**
 * Percorsi dell'applicazione, risolti una sola volta.
 *
 * In sviluppo la radice è la cartella del progetto; impacchettata, è la radice
 * dell'archivio asar. In entrambi i casi i file prodotti dalla build vivono
 * sotto `dist/`, quindi non serve distinguere i due casi.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const rendererIndex = path.join(appRoot, 'dist', 'renderer', 'index.html')

/**
 * Il motore è impacchettato come CommonJS: `fork()` deve poterlo caricare anche
 * quando si trova dentro l'archivio asar.
 */
export const engineEntry = path.join(appRoot, 'dist', 'engine', 'engine.cjs')

export const preloadScript = path.join(appRoot, 'electron', 'preload.cjs')

export const windowIcon = path.join(appRoot, 'build', 'icon.png')
