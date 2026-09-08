/**
 * Test delle operazioni di manipolazione introdotte con gli sprint 1 e 2.
 *
 * Ogni test scrive file veri e li rilegge: si verifica il risultato, non la
 * chiamata alla libreria.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib'

import { runRequest } from '../core/engine.js'
import { complementOf, formatPageLabel, parsePageSelection, splitGroups } from '../core/pdf/pages.js'
import { normalizeAngle } from '../core/operations/rotate.js'
import { partName } from '../core/operations/split.js'
import { parseKeywords } from '../core/operations/metadata.js'
import { assertPrintable, centeredOrigin } from '../core/operations/watermark.js'
import { labelPosition } from '../core/operations/numbering.js'
import { A4, detectImageFormat, fitInside } from '../core/operations/images.js'
import { targetSize } from '../core/operations/resize.js'
import { croppedBox } from '../core/operations/crop.js'
import { stampPosition } from '../core/operations/stamp.js'
import { drawRect, pageRotation } from '../core/operations/signature.js'
import { assertLabelPart, formatBates } from '../core/operations/bates.js'
import { describeField, fieldParam } from '../core/pdf/forms.js'
import { mimeTypeOf, relationshipOf } from '../core/operations/attach.js'
import {
  bookmarkGroups,
  outlineTargets,
  parseOutlineSpec,
  safeFileName,
} from '../core/pdf/outline.js'
import { permissionsFrom } from '../core/operations/protect.js'
import { describeSigningError } from '../core/operations/sign.js'
import forge from 'node-forge'
import { createHash } from 'node:crypto'
import { loadDocument } from '../core/pdf/document.js'
import { inspectRequest } from '../core/engine.js'
import { PAGE_SIZES, PT_PER_MM } from '../core/pdf/layout.js'

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const sample1 = path.join(fixtures, 'sample1.pdf')
const sample2 = path.join(fixtures, 'sample2.pdf')
const sampleJpg = path.join(fixtures, 'sample.jpg')
const samplePng = path.join(fixtures, 'sample.png')

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-ops-'))
  return { dir, out: (name) => path.join(dir, name), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Documento di prova con il numero di pagine richiesto. */
async function buildSource(space, pageCount = 4) {
  const output = space.out('sorgente.pdf')
  const sources = Array.from({ length: Math.ceil(pageCount / 2) }, (_, index) =>
    index % 2 === 0 ? sample1 : sample2,
  )
  const result = await runRequest({ operation: 'merge', files: [sample1, sample2, ...sources], output })
  assert.equal(result.ok, true, result.error)
  return { output, pages: result.pages }
}

const pagesOf = async (filePath) =>
  (await PDFDocument.load(readFileSync(filePath), { updateMetadata: false })).getPageCount()

// ------------------------------------------------------- selezione pagine ---

test('la selezione delle pagine accetta numeri, intervalli e code aperte', () => {
  assert.deepEqual(parsePageSelection('1', 5), [0])
  assert.deepEqual(parsePageSelection('1-3', 5), [0, 1, 2])
  assert.deepEqual(parsePageSelection('4-', 5), [3, 4])
  assert.deepEqual(parsePageSelection('3,1', 5), [2, 0], 'l ordine scritto viene rispettato')
  assert.deepEqual(parsePageSelection('1,1,2', 5), [0, 1], 'i duplicati si contano una volta sola')
  assert.deepEqual(parsePageSelection(' 2 - 3 , 5 ', 5), [1, 2, 4])
})

test('una selezione impossibile viene rifiutata con un messaggio comprensibile', () => {
  assert.throws(() => parsePageSelection('', 5), /almeno una pagina/)
  assert.throws(() => parsePageSelection('9', 5), /il documento ha 5 pagine/)
  assert.throws(() => parsePageSelection('3-1', 5), /rovesciato/)
  assert.throws(() => parsePageSelection('a-b', 5), /Selezione non valida/)
})

test('il complemento restituisce le pagine rimaste in ordine', () => {
  assert.deepEqual(complementOf([1, 3], 5), [0, 2, 4])
  assert.deepEqual(complementOf([], 3), [0, 1, 2])
  assert.deepEqual(complementOf([0, 1, 2], 3), [])
})

test('la divisione raggruppa le pagine secondo il criterio scelto', () => {
  assert.deepEqual(splitGroups('pagina', '', 3), [[0], [1], [2]])
  assert.deepEqual(splitGroups('intervalli', '1-2,3-', 4), [[0, 1], [2, 3]])
  assert.throws(() => splitGroups('intervalli', '', 4), /Indica gli intervalli/)
})

test('le funzioni di supporto delle operazioni si comportano come dichiarato', () => {
  assert.equal(normalizeAngle(450), 90)
  assert.equal(normalizeAngle(-90), 270)
  assert.equal(partName('documento', 0, 12), 'documento-01.pdf')
  assert.equal(partName('documento', 9, 12), 'documento-10.pdf')
  assert.deepEqual(parseKeywords(' a , b ,, c '), ['a', 'b', 'c'])
  assert.equal(formatPageLabel('n', 3, 10), '3')
  assert.equal(formatPageLabel('n-di-tot', 3, 10), '3 / 10')
  assert.throws(() => assertPrintable('测试'), /caratteri latini/)
})

// ------------------------------------------------------------- estrazione ---

test('extract tiene solo le pagine indicate, nell ordine indicato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const output = space.out('estratte.pdf')
    const result = await runRequest({
      operation: 'extract',
      files: [source.output],
      output,
      params: { pages: '3,1' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, 2)
    assert.equal(await pagesOf(output), 2)
  } finally {
    space.cleanup()
  }
})

test('remove conserva tutte le pagine tranne quelle scelte', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const output = space.out('ridotto.pdf')
    const result = await runRequest({
      operation: 'remove',
      files: [source.output],
      output,
      params: { pages: '1-2' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages - 2)
    assert.equal(result.removed, 2)
    assert.equal(await pagesOf(output), source.pages - 2)
  } finally {
    space.cleanup()
  }
})

test('remove rifiuta di svuotare il documento', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const result = await runRequest({
      operation: 'remove',
      files: [source.output],
      output: space.out('vuoto.pdf'),
      params: { pages: '1-' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /resterebbe vuoto/)
  } finally {
    space.cleanup()
  }
})

// --------------------------------------------------------------- rotazione ---

test('rotate somma la rotazione a quella gia presente nella pagina', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const primo = space.out('ruotato.pdf')
    assert.equal((await runRequest({ operation: 'rotate', files: [source.output], output: primo, params: { pages: '1-', angle: 90 } })).ok, true)

    const dopoUnGiro = await PDFDocument.load(readFileSync(primo), { updateMetadata: false })
    assert.equal(dopoUnGiro.getPage(0).getRotation().angle, 90)

    const secondo = space.out('ruotato2.pdf')
    assert.equal((await runRequest({ operation: 'rotate', files: [primo], output: secondo, params: { pages: '1', angle: 90 } })).ok, true)

    const dopoDueGiri = await PDFDocument.load(readFileSync(secondo), { updateMetadata: false })
    assert.equal(dopoDueGiri.getPage(0).getRotation().angle, 180)
    assert.equal(dopoDueGiri.getPage(1).getRotation().angle, 90, 'le altre pagine non vengono toccate')
  } finally {
    space.cleanup()
  }
})

// --------------------------------------------------------------- divisione ---

test('split scrive un file per pagina nella cartella scelta', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const dir = space.out('parti')
    rmSync(dir, { recursive: true, force: true })
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir)

    const result = await runRequest({
      operation: 'split',
      files: [source.output],
      outputDir: dir,
      params: { mode: 'pagina', ranges: '' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.parts, source.pages)
    assert.equal(result.outputs.length, source.pages)

    const prodotti = readdirSync(dir).sort()
    assert.equal(prodotti.length, source.pages)
    assert.equal(prodotti[0], `sorgente-${'1'.padStart(String(source.pages).length, '0')}.pdf`)
    for (const file of prodotti) assert.equal(await pagesOf(path.join(dir, file)), 1)
  } finally {
    space.cleanup()
  }
})

test('split per intervalli produce un file per gruppo', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const dir = space.out('gruppi')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir)

    const result = await runRequest({
      operation: 'split',
      files: [source.output],
      outputDir: dir,
      params: { mode: 'intervalli', ranges: '1-2,3-' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.parts, 2)
    assert.equal(await pagesOf(result.outputs[0]), 2)
    assert.equal(await pagesOf(result.outputs[1]), source.pages - 2)
  } finally {
    space.cleanup()
  }
})

test('split senza cartella di destinazione fallisce con un messaggio chiaro', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const result = await runRequest({ operation: 'split', files: [source.output], params: { mode: 'pagina' } })
    assert.equal(result.ok, false)
    assert.match(result.error, /Cartella di destinazione mancante/)
  } finally {
    space.cleanup()
  }
})

// ---------------------------------------------------------------- immagini ---

test('images riconosce i formati dai byte, non dall estensione', () => {
  assert.equal(detectImageFormat(readFileSync(sampleJpg)), 'jpg')
  assert.equal(detectImageFormat(readFileSync(samplePng)), 'png')
  assert.equal(detectImageFormat(readFileSync(sample1)), null)
})

test('images crea una pagina per immagine', async () => {
  const space = workspace()
  try {
    const output = space.out('immagini.pdf')
    const result = await runRequest({
      operation: 'images',
      files: [sampleJpg, samplePng],
      output,
      params: { pageSize: 'immagine', marginMm: 0 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, 2)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    const first = document.getPage(0).getSize()
    assert.equal(Math.round(first.width), 800, 'la pagina prende la misura dell immagine')
    assert.equal(Math.round(first.height), 600)
  } finally {
    space.cleanup()
  }
})

test('images impagina su A4 rispettando le proporzioni', async () => {
  const space = workspace()
  try {
    const output = space.out('a4.pdf')
    const result = await runRequest({
      operation: 'images',
      files: [sampleJpg],
      output,
      params: { pageSize: 'a4', marginMm: 10 },
    })
    assert.equal(result.ok, true, result.error)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    const size = document.getPage(0).getSize()
    assert.equal(Math.round(size.width), Math.round(A4.width))
    assert.equal(Math.round(size.height), Math.round(A4.height))
  } finally {
    space.cleanup()
  }
})

test('images rifiuta un PDF in ingresso', async () => {
  const space = workspace()
  try {
    const result = await runRequest({
      operation: 'images',
      files: [sample1],
      output: space.out('x.pdf'),
      params: { pageSize: 'immagine' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /accetta solo file \.jpg/)
  } finally {
    space.cleanup()
  }
})

test('il riquadro di inserimento mantiene le proporzioni ed e centrato', () => {
  const box = fitInside({ width: 1000, height: 500 }, { width: 600, height: 600 }, 0)
  assert.equal(box.width, 600)
  assert.equal(box.height, 300)
  assert.equal(box.x, 0)
  assert.equal(box.y, 150)
})

// -------------------------------------------------- filigrana e numerazione ---

test('watermark scrive il testo su ogni pagina', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('filigranato.pdf')
    const result = await runRequest({
      operation: 'watermark',
      files: [source.output],
      output,
      params: { text: 'RISERVATO', size: 48, opacity: 20, angle: 45 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages)
    assert.ok(statSync(output).size > statSync(source.output).size, 'il documento cresce del testo aggiunto')
  } finally {
    space.cleanup()
  }
})

test('watermark rifiuta un testo vuoto o non latino', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const vuoto = await runRequest({
      operation: 'watermark',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { text: '   ', size: 48, opacity: 20, angle: 0 },
    })
    assert.equal(vuoto.ok, false)
    assert.match(vuoto.error, /obbligatorio/)
  } finally {
    space.cleanup()
  }
})

test('il testo della filigrana viene centrato tenendo conto della rotazione', () => {
  const dritto = centeredOrigin({ width: 600, height: 800, textWidth: 200, textHeight: 40, angle: 0 })
  assert.equal(Math.round(dritto.x), 200)
  assert.equal(Math.round(dritto.y), 380)

  const inclinato = centeredOrigin({ width: 600, height: 800, textWidth: 200, textHeight: 40, angle: 90 })
  assert.equal(Math.round(inclinato.x), 320)
  assert.equal(Math.round(inclinato.y), 300)
})

test('numbering stampa il numero su tutte le pagine', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 3)
    const output = space.out('numerato.pdf')
    const result = await runRequest({
      operation: 'numbering',
      files: [source.output],
      output,
      params: { position: 'basso-centro', format: 'n-di-tot', start: 1, size: 10 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages)
  } finally {
    space.cleanup()
  }
})

test('la posizione del numero segue la combinazione scelta', () => {
  const geometry = { width: 600, height: 800, textWidth: 20, size: 10 }
  assert.deepEqual(labelPosition('basso-sinistra', geometry), { x: 24, y: 24 })
  assert.deepEqual(labelPosition('basso-destra', geometry), { x: 556, y: 24 })
  assert.deepEqual(labelPosition('alto-centro', geometry), { x: 290, y: 766 })
})

// ------------------------------------------------- metadati e ottimizzazione ---

test('metadata scrive titolo, autore, oggetto e parole chiave', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('metadati.pdf')
    const result = await runRequest({
      operation: 'metadata',
      files: [source.output],
      output,
      params: { title: 'Contratto', author: 'Lorenzo', subject: 'Prova', keywords: 'a, b' },
    })
    assert.equal(result.ok, true, result.error)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    assert.equal(document.getTitle(), 'Contratto')
    assert.equal(document.getAuthor(), 'Lorenzo')
    assert.equal(document.getSubject(), 'Prova')
    assert.deepEqual(document.getKeywords(), 'a b')
  } finally {
    space.cleanup()
  }
})

test('optimize riduce la dimensione e puo togliere i metadati', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const output = space.out('ottimizzato.pdf')
    const result = await runRequest({
      operation: 'optimize',
      files: [source.output],
      output,
      params: { stripMetadata: true },
    })
    assert.equal(result.ok, true, result.error)
    assert.ok(result.bytes < result.originalBytes, `${result.bytes} < ${result.originalBytes}`)
    assert.equal(result.savedBytes, result.originalBytes - result.bytes)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    assert.equal(document.getTitle(), '')
    assert.equal(await pagesOf(output), source.pages, 'nessuna pagina persa')
  } finally {
    space.cleanup()
  }
})

// ------------------------------------------------------ parametri e catalogo ---

test('i parametri fuori scala vengono rifiutati prima di toccare i file', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const risultato = await runRequest({
      operation: 'watermark',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { text: 'X', size: 5000, opacity: 20, angle: 0 },
    })
    assert.equal(risultato.ok, false)
    assert.match(risultato.error, /non può superare 200/)
  } finally {
    space.cleanup()
  }
})

test('un valore non previsto per una scelta viene rifiutato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const risultato = await runRequest({
      operation: 'rotate',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { pages: '1', angle: 45 },
    })
    assert.equal(risultato.ok, false)
    assert.match(risultato.error, /Valore non ammesso/)
  } finally {
    space.cleanup()
  }
})

test('i parametri mancanti prendono il valore predefinito del catalogo', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 3)
    const output = space.out('predefiniti.pdf')
    // «pages» non è indicato: il catalogo propone «1-», cioè tutte le pagine.
    const result = await runRequest({ operation: 'rotate', files: [source.output], output, params: {} })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages)
    assert.equal(result.angle, 90)
  } finally {
    space.cleanup()
  }
})


// -------------------------------------------------------- impaginazione -----

/** Dimensioni della pagina indicata, arrotondate al centesimo di punto. */
async function pageSize(filePath, index = 0) {
  const document = await PDFDocument.load(readFileSync(filePath), { updateMetadata: false })
  const { width, height } = document.getPage(index).getSize()
  return { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 }
}

test('il formato di destinazione segue la scelta dell utente', () => {
  const prima = { width: 200, height: 400, rotation: 0 }
  assert.deepEqual(targetSize('a4', prima), PAGE_SIZES.a4)
  assert.deepEqual(targetSize('a5', prima), PAGE_SIZES.a5)
  assert.deepEqual(targetSize('a4-orizzontale', prima), {
    width: PAGE_SIZES.a4.height,
    height: PAGE_SIZES.a4.width,
  })
  assert.deepEqual(targetSize('prima', prima), { width: 200, height: 400 })
  assert.deepEqual(
    targetSize('prima', { width: 200, height: 400, rotation: 90 }),
    { width: 400, height: 200 },
    'la prima pagina si misura come la si vede, rotazione compresa',
  )
  assert.throws(() => targetSize('sconosciuto', prima), /non riconosciuto/)
})

test('il ritaglio parte dal riquadro attuale e rifiuta di azzerare la pagina', () => {
  const box = { x: 10, y: 20, width: 100, height: 200 }
  assert.deepEqual(croppedBox(box, { top: 10, right: 5, bottom: 10, left: 5 }, 1), {
    x: 15,
    y: 30,
    width: 90,
    height: 180,
  })
  assert.throws(
    () => croppedBox(box, { top: 100, right: 0, bottom: 101, left: 0 }, 3),
    /pagina 3/,
    'il messaggio dice quale pagina è impossibile',
  )
})

test('«più pagine per foglio» riduce i fogli e li mette in orizzontale', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 5)
    const output = space.out('due-per-foglio.pdf')
    const result = await runRequest({
      operation: 'nup',
      files: [source.output],
      output,
      params: { perFoglio: 2, marginMm: 5, cornice: true },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, Math.ceil(source.pages / 2), 'due pagine sorgente per foglio')
    assert.equal(result.sourcePages, source.pages)
    assert.equal(await pagesOf(output), result.pages)

    const size = await pageSize(output)
    assert.deepEqual(size, { width: 841.89, height: 595.28 }, 'A4 orizzontale')
  } finally {
    space.cleanup()
  }
})

test('con quattro pagine per foglio il foglio resta verticale', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 6)
    const output = space.out('quattro-per-foglio.pdf')
    const result = await runRequest({
      operation: 'nup',
      files: [source.output],
      output,
      params: { perFoglio: 4, marginMm: 0, cornice: false },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, Math.ceil(source.pages / 4))
    assert.deepEqual(await pageSize(output), { width: 595.28, height: 841.89 })
  } finally {
    space.cleanup()
  }
})

test('un margine fuori scala viene rifiutato prima di elaborare', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    // Il catalogo ferma il margine a 30 mm: oltre, nessuna cella resterebbe
    // utile. La difesa sta nel motore, non nell'interfaccia.
    const result = await runRequest({
      operation: 'nup',
      files: [source.output],
      output: space.out('impossibile.pdf'),
      params: { perFoglio: 4, marginMm: 200, cornice: false },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /non può superare 30/)
  } finally {
    space.cleanup()
  }
})

test('il libretto produce facciate a coppie e completa fino al multiplo di quattro', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 5)
    const output = space.out('libretto.pdf')
    const result = await runRequest({
      operation: 'booklet',
      files: [source.output],
      output,
      params: { marginMm: 5 },
    })
    assert.equal(result.ok, true, result.error)
    // 5 pagine → 8 facciate → 2 fogli, ciascuno stampato su due lati.
    assert.equal(result.pages, 4)
    assert.equal(await pagesOf(output), 4)
    assert.deepEqual(await pageSize(output), { width: 841.89, height: 595.28 })
  } finally {
    space.cleanup()
  }
})

test('«uniforma formato» porta tutte le pagine alla stessa misura', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const output = space.out('uniformato.pdf')
    const result = await runRequest({
      operation: 'resize',
      files: [source.output],
      output,
      params: { formato: 'a5', marginMm: 0, ingrandisci: true },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages, 'nessuna pagina persa per strada')

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    for (const page of document.getPages()) {
      const { width, height } = page.getSize()
      assert.equal(Math.round(width * 100) / 100, PAGE_SIZES.a5.width)
      assert.equal(Math.round(height * 100) / 100, PAGE_SIZES.a5.height)
    }
  } finally {
    space.cleanup()
  }
})

test('«ritaglia margini» restringe il riquadro visibile senza toccare il foglio', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 3)
    const output = space.out('ritagliato.pdf')
    const result = await runRequest({
      operation: 'crop',
      files: [source.output],
      output,
      params: { pages: '1-2', topMm: 10, rightMm: 5, bottomMm: 10, leftMm: 5 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, source.pages, 'nessuna pagina viene eliminata')
    assert.equal(result.cropped, 2, 'solo le pagine indicate vengono ritagliate')

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    const ritagliata = document.getPage(0)
    const intatta = document.getPage(2)
    const media = ritagliata.getMediaBox()
    const crop = ritagliata.getCropBox()

    assert.equal(Math.round(media.width - crop.width), Math.round(10 * PT_PER_MM), 'tolti 5 mm per lato')
    assert.equal(Math.round(media.height - crop.height), Math.round(20 * PT_PER_MM))
    assert.equal(Math.round(crop.y), Math.round(10 * PT_PER_MM), 'il riquadro parte sopra il bordo')
    assert.equal(
      Math.round(intatta.getCropBox().height),
      Math.round(intatta.getMediaBox().height),
      'la pagina fuori selezione resta intera',
    )
  } finally {
    space.cleanup()
  }
})

test('un ritaglio senza margini non ha senso e viene rifiutato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const result = await runRequest({
      operation: 'crop',
      files: [source.output],
      output: space.out('nulla.pdf'),
      params: { pages: '1-', topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /almeno un margine/)
  } finally {
    space.cleanup()
  }
})


// ------------------------------------------------- timbri e numerazione -----

test('la posizione del timbro segue l angolo scelto', () => {
  const pagina = { width: 600, height: 800, imageWidth: 100, imageHeight: 50 }
  assert.deepEqual(stampPosition('centro', pagina), { x: 250, y: 375 })
  assert.deepEqual(stampPosition('basso-sinistra', pagina), { x: 24, y: 24 })
  assert.deepEqual(stampPosition('basso-destra', pagina), { x: 476, y: 24 })
  assert.deepEqual(stampPosition('alto-sinistra', pagina), { x: 24, y: 726 })
  assert.deepEqual(stampPosition('alto-destra', pagina), { x: 476, y: 726 })
})

test('l etichetta Bates ha sempre la stessa larghezza', () => {
  assert.equal(formatBates({ prefix: 'ACME-', number: 42, digits: 6 }), 'ACME-000042')
  assert.equal(formatBates({ number: 7, digits: 3, suffix: '/A' }), '007/A')
  assert.equal(formatBates({ number: 1234, digits: 2 }), '1234', 'un numero più lungo non viene troncato')
  assert.throws(() => assertLabelPart('Ω', 'Prefisso'), /caratteri latini/)
})

test('«filigrana con immagine» sovrappone il logo alle pagine scelte', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 3)
    const output = space.out('timbrato.pdf')
    const result = await runRequest({
      operation: 'stamp',
      files: [source.output],
      output,
      params: { image: samplePng, pages: '1-2', posizione: 'centro', scala: 40, opacity: 50 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.stamped, 2, 'solo le pagine indicate ricevono il timbro')
    assert.equal(result.pages, source.pages)
    // L'immagine incorporata pesa: il file cresce rispetto alla sorgente.
    assert.ok(result.bytes > statSync(source.output).size)
  } finally {
    space.cleanup()
  }
})

test('un file scelto come parametro viene verificato dal motore', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)

    const mancante = await runRequest({
      operation: 'stamp',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { image: '', pages: '1-', posizione: 'centro', scala: 40, opacity: 50 },
    })
    assert.equal(mancante.ok, false)
    assert.match(mancante.error, /obbligatorio/)

    const tipoSbagliato = await runRequest({
      operation: 'stamp',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { image: '/tmp/logo.txt', pages: '1-', posizione: 'centro', scala: 40, opacity: 50 },
    })
    assert.equal(tipoSbagliato.ok, false)
    assert.match(tipoSbagliato.error, /accetta solo file/)

    const inesistente = await runRequest({
      operation: 'stamp',
      files: [source.output],
      output: space.out('x.pdf'),
      params: {
        image: space.out('non-esiste.png'),
        pages: '1-',
        posizione: 'centro',
        scala: 40,
        opacity: 50,
      },
    })
    assert.equal(inesistente.ok, false)
    assert.match(inesistente.error, /non leggibile/)
  } finally {
    space.cleanup()
  }
})

test('la numerazione Bates prosegue da un documento all altro', async () => {
  const space = workspace()
  try {
    const primo = space.out('primo.pdf')
    const secondo = space.out('secondo.pdf')
    assert.equal((await runRequest({ operation: 'merge', files: [sample1, sample2, sample1], output: primo })).ok, true)
    assert.equal((await runRequest({ operation: 'merge', files: [sample1, sample2], output: secondo })).ok, true)

    const result = await runRequest({
      operation: 'bates',
      files: [primo, secondo],
      outputDir: space.dir,
      params: { prefix: 'ACME-', suffix: '', start: 1, digits: 4, position: 'basso-destra', size: 9 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pages, 5, 'tre pagine più due')
    assert.equal(result.lastNumber, 5, 'il contatore non riparte con il secondo file')
    assert.equal(result.outputs.length, 2)
    assert.ok(result.outputs.every((file) => existsSync(file)))
    assert.match(path.basename(result.outputs[0]), /^primo_bates\.pdf$/)
    assert.equal(await pagesOf(result.outputs[1]), 2)
  } finally {
    space.cleanup()
  }
})

// -------------------------------------------------------------- moduli -----

/** Documento con un modulo AcroForm, costruito con il motore delle prove. */
async function buildFormPdf(space, name = 'modulo.pdf') {
  const document = await PDFDocument.create()
  const page = document.addPage([595.28, 841.89])
  const form = document.getForm()

  const nome = form.createTextField('nome')
  nome.setText('')
  nome.addToPage(page, { x: 50, y: 700, width: 220, height: 20 })

  const accetto = form.createCheckBox('accetto')
  accetto.addToPage(page, { x: 50, y: 660, width: 15, height: 15 })

  const reparto = form.createDropdown('reparto')
  reparto.setOptions(['Vendite', 'Tecnico'])
  reparto.addToPage(page, { x: 50, y: 620, width: 150, height: 20 })

  const output = space.out(name)
  writeFileSync(output, await document.save())
  return output
}

test('i campi di un modulo vengono descritti per tipo', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const document = await PDFDocument.load(readFileSync(modulo), { updateMetadata: false })
    const descrizioni = document.getForm().getFields().map(describeField)
    const perNome = Object.fromEntries(descrizioni.map((campo) => [campo.name, campo]))

    assert.equal(perNome.nome.type, 'text')
    assert.equal(perNome.accetto.type, 'boolean')
    assert.equal(perNome.accetto.value, false)
    assert.equal(perNome.reparto.type, 'choice')
    assert.deepEqual(perNome.reparto.options, ['Vendite', 'Tecnico'])

    // Da una descrizione nasce un parametro con la stessa forma di quelli del
    // catalogo: è ciò che permette all'interfaccia di disegnarlo senza sapere
    // da dove viene.
    const parametro = fieldParam(perNome.reparto)
    assert.equal(parametro.key, 'campo:reparto')
    assert.equal(parametro.type, 'choice')
    assert.deepEqual(
      parametro.options.map((opzione) => opzione.value),
      ['', 'Vendite', 'Tecnico'],
    )
  } finally {
    space.cleanup()
  }
})

test('«leggi i campi» produce un JSON e rifiuta una destinazione PDF', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const output = space.out('campi.json')
    const result = await runRequest({ operation: 'formfields', files: [modulo], output })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.fields, 3)

    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.documento, 'modulo.pdf')
    assert.deepEqual(
      report.campi.map((campo) => campo.name).sort(),
      ['accetto', 'nome', 'reparto'],
    )

    const sbagliato = await runRequest({
      operation: 'formfields',
      files: [modulo],
      output: space.out('campi.pdf'),
    })
    assert.equal(sbagliato.ok, false)
    assert.match(sbagliato.error, /estensione \.json/)
  } finally {
    space.cleanup()
  }
})

test('un documento senza modulo viene riconosciuto e spiegato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const result = await runRequest({
      operation: 'formfields',
      files: [source.output],
      output: space.out('campi.json'),
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /non contiene campi compilabili/)
  } finally {
    space.cleanup()
  }
})

test('l ispezione restituisce un parametro per ogni campo compilabile', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const result = await inspectRequest({ operation: 'formfill', files: [modulo] })
    assert.equal(result.ok, true, result.error)
    assert.deepEqual(
      result.params.map((param) => param.key).sort(),
      ['campo:accetto', 'campo:nome', 'campo:reparto'],
    )

    const senzaModulo = await inspectRequest({
      operation: 'formfill',
      files: [(await buildSource(space, 1)).output],
    })
    assert.equal(senzaModulo.ok, false)
    assert.match(senzaModulo.error, /non contiene campi compilabili/)

    const nonIspezionabile = await inspectRequest({ operation: 'merge', files: [modulo] })
    assert.equal(nonIspezionabile.ok, false)
    assert.match(nonIspezionabile.error, /non ha parametri da leggere/)
  } finally {
    space.cleanup()
  }
})

test('«compila il modulo» scrive i valori nei campi giusti', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const output = space.out('compilato.pdf')
    const result = await runRequest({
      operation: 'formfill',
      files: [modulo],
      output,
      params: {
        'campo:nome': 'Lorenzo De Marco',
        'campo:accetto': true,
        'campo:reparto': 'Tecnico',
        appiattisci: false,
      },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.filled, 3)
    assert.equal(result.flattened, false)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    const form = document.getForm()
    assert.equal(form.getTextField('nome').getText(), 'Lorenzo De Marco')
    assert.equal(form.getCheckBox('accetto').isChecked(), true)
    assert.deepEqual(form.getDropdown('reparto').getSelected(), ['Tecnico'])
  } finally {
    space.cleanup()
  }
})

test('un valore fuori elenco viene rifiutato', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const result = await runRequest({
      operation: 'formfill',
      files: [modulo],
      output: space.out('x.pdf'),
      params: { 'campo:reparto': 'Inesistente', appiattisci: false },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /Valore non ammesso/)
  } finally {
    space.cleanup()
  }
})

test('«blocca il modulo» toglie i campi lasciando il contenuto', async () => {
  const space = workspace()
  try {
    const modulo = await buildFormPdf(space)
    const compilato = space.out('compilato.pdf')
    assert.equal(
      (
        await runRequest({
          operation: 'formfill',
          files: [modulo],
          output: compilato,
          params: { 'campo:nome': 'Prova', appiattisci: false },
        })
      ).ok,
      true,
    )

    const output = space.out('bloccato.pdf')
    const result = await runRequest({ operation: 'formflatten', files: [compilato], output })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.flattened, 3)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    assert.equal(document.getForm().getFields().length, 0, 'non restano campi modificabili')
    assert.equal(document.getPageCount(), 1)
  } finally {
    space.cleanup()
  }
})


// -------------------------------------------- allegati e archiviazione -----

test('il tipo MIME segue l estensione, con una risposta onesta per l ignoto', () => {
  assert.equal(mimeTypeOf('fattura.xml'), 'text/xml')
  assert.equal(mimeTypeOf('DATI.CSV'), 'text/csv')
  assert.equal(mimeTypeOf('allegato.pdf'), 'application/pdf')
  assert.equal(mimeTypeOf('archivio.7z'), 'application/octet-stream')
})

test('la relazione dichiarata evita il valore rotto della libreria', () => {
  assert.equal(relationshipOf('Data'), 'Data')
  assert.equal(relationshipOf('Source'), 'Source')
  // `FormData` in pdf-lib 1.17.1 vale «EncryptedPayload»: non deve essere
  // raggiungibile da nessuna scelta dell'interfaccia.
  assert.equal(relationshipOf('FormData'), 'Unspecified')
  assert.equal(relationshipOf(undefined), 'Unspecified')
})

test('«allega un file» produce un PDF/A-3b con l allegato dentro', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const allegato = space.out('fattura.xml')
    writeFileSync(allegato, '<?xml version="1.0"?><fattura numero="7"/>', 'utf8')

    const output = space.out('con-allegato.pdf')
    const result = await runRequest({
      operation: 'attach',
      files: [source.output],
      output,
      params: { file: allegato, relazione: 'Data', descrizione: 'Fattura elettronica' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.pdfa, true)
    assert.equal(result.pdfaPart, 3)
    assert.equal(result.attachment, 'fattura.xml')

    // Il file viene salvato senza object stream: la struttura è ispezionabile
    // direttamente sui byte, ed è così che si dimostra la conformità senza un
    // validatore esterno.
    const raw = readFileSync(output).toString('latin1')
    assert.match(raw, /\/EmbeddedFiles/, 'la tabella dei nomi contiene il file')
    assert.match(raw, /\/AFRelationship\s*\/Data/, 'la relazione è dichiarata')
    assert.match(raw, /\/AF\b/, 'il catalogo elenca il file associato')
    assert.match(raw, /\/UF/, 'il nome è presente anche in forma Unicode')
    assert.match(raw, /pdfaid:part>3</, 'l XMP dichiara la parte 3')
    assert.match(raw, /pdfaid:conformance>B</)
    assert.match(raw, /GTS_PDFA1/, 'l OutputIntent resta quello richiesto')
    assert.ok(raw.startsWith('%PDF-1.7'), 'PDF/A-3 sta sopra PDF 1.7, non 1.4')
  } finally {
    space.cleanup()
  }
})

// ---------------------------------------------------------- segnalibri -----

test('l elenco dei segnalibri accetta una riga per voce', () => {
  const testo = ['1: Introduzione', '  ', '3: Capitolo primo'].join('\n')
  assert.deepEqual(parseOutlineSpec(testo, 5), [
    { title: 'Introduzione', pageIndex: 0 },
    { title: 'Capitolo primo', pageIndex: 2 },
  ])
})

test('un elenco malformato viene rifiutato con il motivo', () => {
  assert.throws(() => parseOutlineSpec('Introduzione', 5), /Riga non valida/)
  assert.throws(() => parseOutlineSpec('9: Fuori', 5), /il documento ne ha 5/)
  assert.throws(() => parseOutlineSpec('2:   ', 5), /Manca il titolo/)
  assert.throws(() => parseOutlineSpec('   ', 5), /almeno un segnalibro/)
})

test('i gruppi arrivano fino al segnalibro successivo', () => {
  const targets = [
    { title: 'A', pageIndex: 0 },
    { title: 'B', pageIndex: 2 },
  ]
  assert.deepEqual(bookmarkGroups(targets, 5), [
    { title: 'A', indices: [0, 1] },
    { title: 'B', indices: [2, 3, 4] },
  ])
})

test('il nome del file ricavato dal titolo è usabile su qualunque sistema', () => {
  assert.equal(safeFileName('Capitolo 1: prove/verifiche', 'parte'), 'Capitolo 1- prove-verifiche')
  assert.equal(safeFileName('   ', 'parte'), 'parte')
  assert.equal(safeFileName('...', 'parte'), 'parte')
  assert.ok(safeFileName('x'.repeat(200), 'parte').length <= 60)
})

test('«crea segnalibri» scrive un indice che si rilegge', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const output = space.out('con-segnalibri.pdf')
    const voci = ['1: Introduzione', '3: Capitolo secondo'].join('\n')

    const result = await runRequest({
      operation: 'bookmarks',
      files: [source.output],
      output,
      params: { voci, apri: true },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.bookmarks, 2)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    assert.deepEqual(outlineTargets(document), [
      { title: 'Introduzione', pageIndex: 0 },
      { title: 'Capitolo secondo', pageIndex: 2 },
    ])
  } finally {
    space.cleanup()
  }
})

test('i titoli con accenti sopravvivono al giro di scrittura e rilettura', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('accenti.pdf')
    const result = await runRequest({
      operation: 'bookmarks',
      files: [source.output],
      output,
      params: { voci: '1: Perché è così', apri: false },
    })
    assert.equal(result.ok, true, result.error)

    const document = await PDFDocument.load(readFileSync(output), { updateMetadata: false })
    assert.deepEqual(outlineTargets(document), [{ title: 'Perché è così', pageIndex: 0 }])
  } finally {
    space.cleanup()
  }
})

test('«dividi per segnalibro» produce un file per voce, intitolato come la voce', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 4)
    const conIndice = space.out('indice.pdf')
    const voci = ['1: Contratto', '3: Allegato tecnico'].join('\n')
    assert.equal(
      (
        await runRequest({
          operation: 'bookmarks',
          files: [source.output],
          output: conIndice,
          params: { voci, apri: true },
        })
      ).ok,
      true,
    )

    const parti = path.join(space.dir, 'parti')
    mkdirSync(parti)
    const result = await runRequest({
      operation: 'splitbookmarks',
      files: [conIndice],
      outputDir: parti,
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.parts, 2)
    assert.deepEqual(readdirSync(parti).sort(), ['Allegato tecnico.pdf', 'Contratto.pdf'])
    assert.equal(await pagesOf(path.join(parti, 'Contratto.pdf')), 2)
    assert.equal(await pagesOf(path.join(parti, 'Allegato tecnico.pdf')), 2)
    assert.equal(result.pages, 4, 'nessuna pagina si perde nella divisione')
  } finally {
    space.cleanup()
  }
})

test('un documento senza segnalibri non si può dividere per segnalibro', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const parti = path.join(space.dir, 'vuoto')
    mkdirSync(parti)
    const result = await runRequest({
      operation: 'splitbookmarks',
      files: [source.output],
      outputDir: parti,
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /non ha segnalibri/)
    assert.deepEqual(readdirSync(parti), [], 'nessun file prodotto a metà')
  } finally {
    space.cleanup()
  }
})


// -------------------------------------------------- password e permessi -----

test('i permessi tradotti seguono le scelte dell utente', () => {
  const concessi = permissionsFrom({
    stampa: 'highResolution',
    copia: true,
    modifica: true,
    annotazioni: true,
    moduli: true,
  })
  assert.equal(concessi.printing, 'highResolution')
  assert.equal(concessi.copying, true)
  assert.equal(concessi.modifying, true)
  assert.equal(concessi.documentAssembly, true)

  const negati = permissionsFrom({ stampa: 'no', copia: false, modifica: false })
  assert.equal(negati.printing, false, '«no» diventa il booleano falso, non la stringa')
  assert.equal(negati.copying, false)
  // L'accessibilità resta sempre concessa: negarla non protegge nulla e
  // impedisce l'uso a chi si affida a un lettore assistivo.
  assert.equal(negati.contentAccessibility, true)
})

test('«proteggi con password» produce un file che senza password non si apre', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('protetto.pdf')
    const result = await runRequest({
      operation: 'protect',
      files: [source.output],
      output,
      params: {
        userPassword: 'apriti-sesamo',
        ownerPassword: '',
        stampa: 'highResolution',
        copia: false,
        modifica: false,
        annotazioni: false,
        moduli: true,
      },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.encrypted, true)

    const raw = readFileSync(output).toString('latin1')
    assert.match(raw, /\/Encrypt/, 'il dizionario di cifratura è nel file')
    assert.ok(!raw.includes('apriti-sesamo'), 'la password non compare in chiaro nel documento')

    await assert.rejects(loadDocument(output), /protetto da password/)
    const aperto = await loadDocument(output, { password: 'apriti-sesamo' })
    assert.equal(aperto.getPageCount(), source.pages)
  } finally {
    space.cleanup()
  }
})

test('una password vuota viene rifiutata prima di scrivere il file', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const output = space.out('vuota.pdf')
    const result = await runRequest({
      operation: 'protect',
      files: [source.output],
      output,
      params: { userPassword: '   ', stampa: 'no', copia: false, modifica: false },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /obbligatorio|non può essere vuota/)
    assert.equal(existsSync(output), false, 'nessun file a metà')
  } finally {
    space.cleanup()
  }
})

test('«togli la protezione» restituisce un documento apribile senza password', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 3)
    const protetto = space.out('protetto.pdf')
    assert.equal(
      (
        await runRequest({
          operation: 'protect',
          files: [source.output],
          output: protetto,
          params: {
            userPassword: 'segreta',
            ownerPassword: 'padrona',
            stampa: 'no',
            copia: false,
            modifica: false,
            annotazioni: false,
            moduli: false,
          },
        })
      ).ok,
      true,
    )

    const libero = space.out('libero.pdf')
    const result = await runRequest({
      operation: 'unprotect',
      files: [protetto],
      output: libero,
      params: { password: 'segreta' },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.encrypted, false)
    assert.equal(result.pages, source.pages)

    assert.ok(!readFileSync(libero).toString('latin1').includes('/Encrypt'))
    const riletto = await loadDocument(libero)
    assert.equal(riletto.getPageCount(), source.pages)
  } finally {
    space.cleanup()
  }
})

test('una password sbagliata lo dice, senza ripeterla nel messaggio', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const protetto = space.out('protetto.pdf')
    assert.equal(
      (
        await runRequest({
          operation: 'protect',
          files: [source.output],
          output: protetto,
          params: { userPassword: 'giusta', stampa: 'no', copia: false, modifica: false },
        })
      ).ok,
      true,
    )

    const result = await runRequest({
      operation: 'unprotect',
      files: [protetto],
      output: space.out('mai.pdf'),
      params: { password: 'sbagliata' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /Password errata/)
    assert.ok(!result.error.includes('sbagliata'), 'il messaggio non riporta ciò che è stato digitato')
    assert.equal(existsSync(space.out('mai.pdf')), false)
  } finally {
    space.cleanup()
  }
})


// ------------------------------------------------------ firma digitale -----

const certificato = path.join(fixtures, 'firma-test.p12')

/**
 * Verifica una firma leggendo il file, senza fidarsi di ciò che ha risposto
 * l'operazione: estrae l'intervallo firmato, ricalcola l'impronta dei byte
 * coperti e la confronta con quella dentro la struttura CMS.
 */
function verificaFirma(filePath) {
  const raw = readFileSync(filePath)
  const text = raw.toString('latin1')

  const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(text)
  assert.ok(range, 'il documento dichiara un ByteRange')
  const [start1, length1, start2, length2] = range.slice(1).map(Number)

  const coperti = Buffer.concat([
    raw.subarray(start1, start1 + length1),
    raw.subarray(start2, start2 + length2),
  ])
  assert.equal(
    coperti.length,
    raw.length - (start2 - (start1 + length1)),
    'la firma copre tutto il file tranne lo spazio che la contiene',
  )

  const contents = /\/Contents\s*<([0-9A-Fa-f]+)>/.exec(text)
  assert.ok(contents, 'lo spazio della firma esiste')
  const hex = contents[1].replace(/(00)+$/, '')
  assert.ok(hex.length > 0, 'lo spazio riservato è stato riempito')

  const message = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(Buffer.from(hex, 'hex').toString('binary')),
  )
  const commonName = message.certificates[0].subject.getField('CN').value

  // Impronta dichiarata dentro gli attributi autenticati (OID messageDigest).
  const digestAttribute = message.rawCapture.authenticatedAttributes
    .map((attribute) => forge.asn1.derToOid(attribute.value[0].value))
    .indexOf(forge.pki.oids.messageDigest)
  assert.ok(digestAttribute >= 0, 'la struttura CMS dichiara l impronta del documento')
  const dichiarata = Buffer.from(
    message.rawCapture.authenticatedAttributes[digestAttribute].value[1].value[0].value,
    'binary',
  ).toString('hex')

  return {
    commonName,
    impronteCoincidono: dichiarata === createHash('sha256').update(coperti).digest('hex'),
  }
}

test('i messaggi della firma spiegano il problema in italiano', () => {
  assert.match(
    describeSigningError(new Error('PKCS#12 MAC could not be verified. Invalid password?')),
    /Password del certificato errata/,
  )
  assert.match(
    describeSigningError(new Error('Cannot read p12: invalid ASN.1')),
    /non è un certificato PKCS#12 valido/,
  )
  assert.match(
    describeSigningError(new Error('Signature exceeds placeholder')),
    /non entra nello spazio riservato/,
  )
  assert.match(describeSigningError(new Error('altro guasto')), /Firma non riuscita: altro guasto/)
})

test('«firma digitalmente» produce un documento firmato e verificabile', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('firmato.pdf')
    const result = await runRequest({
      operation: 'sign',
      files: [source.output],
      output,
      params: {
        certificato,
        passphrase: 'prova',
        nome: 'Lorenzo De Marco',
        motivo: 'Sottoscrizione',
        luogo: 'Roma',
        contatto: '',
      },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.signed, true)
    assert.equal(result.pages, source.pages)

    const raw = readFileSync(output).toString('latin1')
    assert.match(raw, /\/Type\s*\/Sig/, 'il campo firma è nel documento')
    assert.match(raw, /\/SubFilter\s*\/adbe\.pkcs7\.detached/, 'profilo PAdES di base')
    assert.match(raw, /\/Reason/)

    const verifica = verificaFirma(output)
    assert.equal(verifica.commonName, 'PDFix Test', 'la firma porta il certificato usato')
    assert.equal(verifica.impronteCoincidono, true, 'l impronta firmata è quella del documento')
  } finally {
    space.cleanup()
  }
})

test('la password sbagliata del certificato non produce nessun file', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const output = space.out('mai-firmato.pdf')
    const result = await runRequest({
      operation: 'sign',
      files: [source.output],
      output,
      params: { certificato, passphrase: 'sbagliata', nome: '', motivo: '', luogo: '', contatto: '' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /Password del certificato errata/)
    assert.ok(!result.error.includes('sbagliata'), 'il messaggio non ripete ciò che è stato digitato')
    assert.equal(existsSync(output), false)
  } finally {
    space.cleanup()
  }
})

test('un file che non è un certificato viene riconosciuto', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const finto = space.out('finto.p12')
    writeFileSync(finto, readFileSync(path.join(fixtures, 'sample.png')))

    const result = await runRequest({
      operation: 'sign',
      files: [source.output],
      output: space.out('mai.pdf'),
      params: { certificato: finto, passphrase: 'prova', nome: '', motivo: '', luogo: '', contatto: '' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /Firma non riuscita|certificato PKCS#12/)
  } finally {
    space.cleanup()
  }
})

test('il certificato è un file scelto dall utente e viene verificato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const result = await runRequest({
      operation: 'sign',
      files: [source.output],
      output: space.out('mai.pdf'),
      params: { certificato: space.out('assente.p12'), passphrase: '', nome: '', motivo: '', luogo: '', contatto: '' },
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /non leggibile/)
  } finally {
    space.cleanup()
  }
})

// ------------------------------------------------------ firma su foglio -----

/** Testo del flusso di contenuto di una pagina, decompresso. */
async function pageContent(filePath, pageIndex) {
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
  return { text, size: page.getSize() }
}

/**
 * Trasformazioni applicate all'ultima immagine disegnata: pdf-lib scrive uno
 * spostamento e una scala prima di `Do`, ed è lì che si legge dove l'immagine è
 * finita davvero.
 */
function lastImagePlacement(text) {
  const matrices = [...text.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)]
    .map((match) => match.slice(1, 7).map(Number))
  const scale = matrices.findLast(([a, , , d]) => Math.abs(a) > 1.5 || Math.abs(d) > 1.5)
  const translate = matrices.findLast(([a, b, c, d, e, f]) => a === 1 && b === 0 && c === 0 && d === 1 && (e !== 0 || f !== 0))
  return { scale, translate }
}

test('drawRect colloca la firma dove l utente la vede, su pagina non ruotata', () => {
  const rect = drawRect({ width: 600, height: 800, rotation: 0 }, { x: 0.5, y: 0.25, width: 0.2 }, 0.5)

  assert.equal(rect.width, 120, 'un quinto della larghezza')
  assert.equal(rect.height, 60, 'altezza dal rapporto dell immagine')
  assert.equal(rect.x, 300)
  // y scende dall'alto: 800 - 200 (bordo superiore) - 60 (altezza)
  assert.equal(rect.y, 540)
  assert.equal(rect.rotate, 0)
})

test('drawRect segue la pagina ruotata invece di coricare la firma', () => {
  const placement = { x: 0.5, y: 0.25, width: 0.2 }
  const ratio = 0.5

  // Con /Rotate 90 il foglio si vede orizzontale: la larghezza della firma è
  // una frazione del lato lungo, cioè dell'altezza non ruotata.
  const ruotata = drawRect({ width: 600, height: 800, rotation: 90 }, placement, ratio)
  assert.equal(ruotata.width, 160)
  assert.equal(ruotata.height, 80)
  assert.equal(ruotata.rotate, 90)
  // L'angolo di aggancio è sul bordo destro della pagina non ruotata.
  assert.equal(ruotata.x, 600 - (600 - 150 - 80))
  assert.equal(ruotata.y, 400)

  assert.equal(drawRect({ width: 600, height: 800, rotation: 180 }, placement, ratio).rotate, 180)
  assert.equal(drawRect({ width: 600, height: 800, rotation: 270 }, placement, ratio).rotate, -90)
})

test('una rotazione fuori standard viene ricondotta al quarto di giro', () => {
  assert.equal(pageRotation(0), 0)
  assert.equal(pageRotation(90), 90)
  assert.equal(pageRotation(-90), 270)
  assert.equal(pageRotation(450), 90)
  assert.equal(pageRotation(undefined), 0)
})

test('«firma su foglio» applica l immagine nel punto scelto della pagina scelta', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)
    const output = space.out('firmato.pdf')
    const result = await runRequest({
      operation: 'signature',
      files: [source.output],
      output,
      params: { image: samplePng, placement: { page: 2, x: 0.5, y: 0.7, width: 0.25 }, opacity: 100 },
    })
    assert.equal(result.ok, true, result.error)
    assert.equal(result.signedPage, 2)
    assert.equal(result.pages, source.pages)

    const { text, size } = await pageContent(output, 1)
    const { scale, translate } = lastImagePlacement(text)
    const larghezza = size.width * 0.25

    assert.ok(scale, 'l immagine viene disegnata sulla pagina scelta')
    assert.ok(Math.abs(scale[0] - larghezza) < 0.01, `larghezza ${scale[0]} ≈ ${larghezza}`)
    assert.ok(Math.abs(translate[4] - size.width * 0.5) < 0.01, 'ascissa dal piazzamento')
    const attesaY = size.height - size.height * 0.7 - larghezza
    assert.ok(Math.abs(translate[5] - attesaY) < 0.01, `ordinata ${translate[5]} ≈ ${attesaY}`)

    // La prima pagina resta intatta: la firma sta solo dove è stata messa.
    const prima = await pageContent(output, 0)
    assert.equal(lastImagePlacement(prima.text).scale, undefined)
  } finally {
    space.cleanup()
  }
})

test('«firma su foglio» accetta anche un JPEG e l opacità', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const output = space.out('firmato.pdf')
    const result = await runRequest({
      operation: 'signature',
      files: [source.output],
      output,
      params: { image: sampleJpg, placement: { page: 1, x: 0.1, y: 0.1, width: 0.4 }, opacity: 40 },
    })
    assert.equal(result.ok, true, result.error)

    const { text } = await pageContent(output, 0)
    assert.match(text, /\/GS-\d+ gs/, 'l opacità viaggia in uno stato grafico')
  } finally {
    space.cleanup()
  }
})

test('«firma su foglio» rifiuta una pagina inesistente e un file che non è un immagine', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 2)

    const oltre = await runRequest({
      operation: 'signature',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { image: samplePng, placement: { page: 99, x: 0.1, y: 0.1, width: 0.3 }, opacity: 100 },
    })
    assert.equal(oltre.ok, false)
    assert.match(oltre.error, /Pagina 99 inesistente/)

    const senzaImmagine = await runRequest({
      operation: 'signature',
      files: [source.output],
      output: space.out('x.pdf'),
      params: { image: '', placement: { page: 1, x: 0.1, y: 0.1, width: 0.3 }, opacity: 100 },
    })
    assert.equal(senzaImmagine.ok, false)
    assert.match(senzaImmagine.error, /obbligatorio/)
  } finally {
    space.cleanup()
  }
})

test('un piazzamento fuori dai bordi viene riportato dentro, non rifiutato', async () => {
  const space = workspace()
  try {
    const source = await buildSource(space, 1)
    const output = space.out('firmato.pdf')
    const result = await runRequest({
      operation: 'signature',
      files: [source.output],
      output,
      // Il trascinamento può uscire di un capello: è un gesto, non un errore.
      params: { image: samplePng, placement: { page: 1, x: 1.4, y: -0.3, width: 3 }, opacity: 100 },
    })
    assert.equal(result.ok, true, result.error)

    const { text, size } = await pageContent(output, 0)
    const { scale, translate } = lastImagePlacement(text)
    assert.ok(Math.abs(scale[0] - size.width) < 0.01, 'la larghezza si ferma alla pagina')
    assert.ok(Math.abs(translate[4] - size.width) < 0.01, 'l ascissa si ferma al bordo')
  } finally {
    space.cleanup()
  }
})
