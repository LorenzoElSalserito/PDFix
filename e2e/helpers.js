/**
 * Utilita' condivise dai test end-to-end.
 *
 * I test avviano l'applicazione reale: stesso processo main, stesso preload,
 * stesso motore impacchettato. Solo le finestre di dialogo native del sistema
 * operativo vengono sostituite, tramite le variabili d'ambiente riconosciute da
 * `electron/lib/automation.js`.
 */

import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const fixtures = {
  first: path.join(repoRoot, 'test', 'fixtures', 'sample1.pdf'),
  second: path.join(repoRoot, 'test', 'fixtures', 'sample2.pdf'),
  jpg: path.join(repoRoot, 'test', 'fixtures', 'sample.jpg'),
  png: path.join(repoRoot, 'test', 'fixtures', 'sample.png'),
}

/**
 * Prepara un documento di più pagine da usare come sorgente nei test delle
 * operazioni. Viene costruito con il motore vero, così il test parte da un file
 * identico a quello che produrrebbe l'applicazione.
 *
 * @param {string} dir cartella in cui scrivere
 * @param {number} [copies] quante volte ripetere i due PDF di prova
 */
export async function buildMultiPagePdf(dir, copies = 2) {
  const { runRequest } = await import('../core/engine.js')
  const output = path.join(dir, 'sorgente.pdf')
  const files = Array.from({ length: copies }, () => [fixtures.first, fixtures.second]).flat()
  const result = await runRequest({ operation: 'merge', files, output })
  if (!result.ok) throw new Error(`preparazione fallita: ${result.error}`)
  return { output, pages: result.pages }
}

/** Numero di pagine di un PDF prodotto dall'applicazione. */
export async function pageCountOf(filePath) {
  const { PDFDocument } = await import('pdf-lib')
  const { readFileSync } = await import('node:fs')
  const document = await PDFDocument.load(readFileSync(filePath), { updateMetadata: false })
  return document.getPageCount()
}

/**
 * Avvia PDFix con preferenze isolate e dialog predefiniti.
 *
 * @param {object} options
 * @param {string[]} [options.openFiles] percorsi restituiti al posto del dialog di apertura
 * @param {string} [options.savePath]    percorso restituito al posto del dialog di salvataggio
 * @param {string} [options.saveDir]     cartella restituita alle operazioni multi-file
 * @param {string} [options.userDataDir] cartella preferenze da riusare fra due avvii
 */
/**
 * Restituisce la finestra dell'applicazione, ignorando lo splash.
 *
 * `firstWindow()` darebbe la schermata di avvio: i test devono pilotare quella
 * vera.
 */
export async function mainWindowOf(app, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const window = app.windows().find((candidate) => !candidate.url().includes('splash.html'))
    if (window) return window
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('finestra principale non comparsa')
}

export async function launchApp({
  openFiles = [fixtures.first, fixtures.second],
  savePath,
  saveDir,
  userDataDir,
  splashMs = 0,
} = {}) {
  const dataDir = userDataDir ?? mkdtempSync(path.join(tmpdir(), 'pdfix-e2e-'))
  const outputPath = savePath ?? path.join(dataDir, 'risultato.pdf')

  const app = await electron.launch({
    // L'eseguibile impacchettato, se indicato, permette di eseguire la stessa
    // suite contro l'artefatto di release invece che sui sorgenti.
    ...(process.env.PDFIX_E2E_EXECUTABLE ? { executablePath: process.env.PDFIX_E2E_EXECUTABLE } : {}),
    args: process.env.PDFIX_E2E_EXECUTABLE ? [] : [repoRoot],
    env: {
      ...process.env,
      PDFIX_USER_DATA: dataDir,
      PDFIX_E2E_FIXTURES: openFiles.join(path.delimiter),
      PDFIX_E2E_OUTPUT: outputPath,
      ...(saveDir ? { PDFIX_E2E_OUTPUT_DIR: saveDir } : {}),
      ...(splashMs === null ? {} : { PDFIX_SPLASH_MS: String(splashMs) }),
    },
  })

  const page = await mainWindowOf(app)
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    dataDir,
    outputPath,
    saveDir,
    async close({ keepData = false } = {}) {
      await app.close()
      if (!keepData && !userDataDir) rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** Carica i PDF di prova attraverso l'area di caricamento. */
export async function addFiles(page) {
  await page.getByTestId('uploader').click()
  await page.getByTestId('file-item').first().waitFor()
}
