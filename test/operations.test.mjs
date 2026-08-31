/**
 * Test delle operazioni di manipolazione introdotte con gli sprint 1 e 2.
 *
 * Ogni test scrive file veri e li rilegge: si verifica il risultato, non la
 * chiamata alla libreria.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

import { runRequest } from '../core/engine.js'
import { complementOf, formatPageLabel, parsePageSelection, splitGroups } from '../core/pdf/pages.js'
import { normalizeAngle } from '../core/operations/rotate.js'
import { partName } from '../core/operations/split.js'
import { parseKeywords } from '../core/operations/metadata.js'
import { assertPrintable, centeredOrigin } from '../core/operations/watermark.js'
import { labelPosition } from '../core/operations/numbering.js'
import { A4, detectImageFormat, fitInside } from '../core/operations/images.js'

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
