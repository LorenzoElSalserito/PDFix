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
  certificate: path.join(repoRoot, 'test', 'fixtures', 'firma-test.p12'),
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

/**
 * Documento con un modulo AcroForm, per le operazioni sui moduli.
 *
 * Viene costruito qui invece di essere versionato come fixture: un PDF binario
 * nel repository invecchia in silenzio, mentre questo codice dice esattamente
 * quali campi contiene il documento su cui i test lavorano.
 */
export async function buildFormPdf(dir, name = 'modulo.pdf') {
  const { PDFDocument } = await import('@cantoo/pdf-lib')
  const { writeFileSync } = await import('node:fs')

  const document = await PDFDocument.create()
  const page = document.addPage([595.28, 841.89])
  const form = document.getForm()

  const nome = form.createTextField('nome')
  nome.setText('')
  nome.addToPage(page, { x: 50, y: 700, width: 220, height: 20 })

  const accetto = form.createCheckBox('accetto')
  accetto.addToPage(page, { x: 50, y: 660, width: 15, height: 15 })

  const output = path.join(dir, name)
  writeFileSync(output, await document.save())
  return output
}

/**
 * Immagine disegnata su una pagina, letta dal flusso di contenuto.
 *
 * È il modo per verificare *dove* è finita una firma: pdf-lib scrive uno
 * spostamento e una scala prima di `Do`, e quei numeri sono le coordinate in
 * punti sulla pagina. Confrontarli con il riquadro trascinato nell'anteprima
 * dice se quello che l'utente ha visto è quello che il documento ha ricevuto.
 *
 * @returns {Promise<{size: {width: number, height: number}, scale: number[]|null, translate: number[]|null}>}
 */
export async function drawnImageOn(filePath, pageIndex) {
  const { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } = await import('@cantoo/pdf-lib')
  const { readFileSync } = await import('node:fs')

  const document = await PDFDocument.load(readFileSync(filePath), { updateMetadata: false })
  const page = document.getPage(pageIndex)
  const contents = page.node.Contents()
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents]

  let text = ''
  for (const ref of refs) {
    const stream = document.context.lookup(ref)
    const raw = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
    text += new TextDecoder('latin1').decode(raw)
  }

  const matrices = [...text.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)]
    .map((match) => match.slice(1, 7).map(Number))

  return {
    size: page.getSize(),
    scale: matrices.findLast(([a, , , d]) => Math.abs(a) > 1.5 || Math.abs(d) > 1.5) ?? null,
    translate:
      matrices.findLast(([a, b, c, d, e, f]) => a === 1 && b === 0 && c === 0 && d === 1 && (e !== 0 || f !== 0)) ??
      null,
  }
}

/** Numero di pagine di un PDF prodotto dall'applicazione. */
export async function pageCountOf(filePath) {
  const { PDFDocument } = await import('@cantoo/pdf-lib')
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
 * @param {string} [options.paramFile]   file restituito ai parametri che ne chiedono uno
 * @param {string} [options.dropDir]     cartella su cui risolvere i file trascinati
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
  paramFile,
  dropDir,
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
      ...(paramFile ? { PDFIX_E2E_PARAM_FILE: paramFile } : {}),
      ...(dropDir ? { PDFIX_E2E_DROP_DIR: dropDir } : {}),
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

/**
 * Trascina dei file sull'area di caricamento.
 *
 * L'evento è quello vero — `DragEvent` con un `DataTransfer` che contiene dei
 * `File` — e attraversa tutto il percorso di produzione: componente, preload,
 * validazione nel processo principale. L'unico pezzo che non si può riprodurre
 * è il percorso su disco che il sistema operativo allega al file trascinato:
 * l'applicazione lo risolve per nome nella cartella indicata da `dropDir`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} names nomi dei file, come li vedrebbe il sistema
 */
export async function dropFiles(page, names) {
  await page.getByTestId('uploader').evaluate((element, dropped) => {
    const transfer = new DataTransfer()
    for (const name of dropped) {
      transfer.items.add(new File([new Uint8Array([0])], name, { type: 'application/octet-stream' }))
    }
    element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, names)
}

/** Simula l'ingresso o l'uscita del puntatore che trascina, senza rilasciare. */
export async function dragOverUploader(page, type = 'dragover') {
  await page.getByTestId('uploader').evaluate((element, eventType) => {
    element.dispatchEvent(
      new DragEvent(eventType, { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true }),
    )
  }, type)
}
