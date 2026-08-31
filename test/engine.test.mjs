/**
 * Test del motore PDF: registro delle operazioni, unione, conversione PDF/A e
 * generazione del profilo ICC. Eseguibili con `node --test test/`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRegistry, registry, runRequest, validateRequest } from '../core/engine.js'
import { OPERATIONS, maxFilesOf, operationDescriptor } from '../core/catalog.js'
import { srgbIccProfile } from '../core/pdf/srgb-icc.js'
import { buildXmpMetadata, escapeXml, xmpDate } from '../core/pdf/metadata.js'
import { patchHeaderVersion } from '../core/pdf/document.js'

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const sample1 = path.join(fixtures, 'sample1.pdf')
const sample2 = path.join(fixtures, 'sample2.pdf')

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-test-'))
  return { dir, output: path.join(dir, 'out.pdf'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const readOutput = (filePath) => readFileSync(filePath, 'latin1')

// ------------------------------------------------------------- catalogo -----

test('il catalogo espone descrittori completi', () => {
  for (const operation of OPERATIONS) {
    assert.equal(typeof operation.name, 'string')
    assert.equal(typeof operation.label, 'string')
    assert.equal(typeof operation.minFiles, 'number')
    assert.ok(operation.maxFiles === null || typeof operation.maxFiles === 'number')
  }
  assert.equal(maxFilesOf(operationDescriptor('merge')), Number.POSITIVE_INFINITY)
  assert.equal(maxFilesOf(operationDescriptor('convert')), 1)
  assert.throws(() => operationDescriptor('inesistente'), /Operazione non valida/)
})

test('il registro rifiuta operazioni malformate e duplicate', () => {
  const empty = createRegistry([])
  assert.throws(() => empty.register({ name: 'x' }), /servono "name" e "run"/)
  empty.register({ name: 'x', run: async () => ({}) })
  assert.throws(() => empty.register({ name: 'x', run: async () => ({}) }), /già registrata/)
  assert.equal(empty.has('x'), true)
})

test('describe() nasconde le operazioni interne e non espone funzioni', () => {
  const described = registry.describe()
  assert.equal(described.some((operation) => operation.name === 'diagnostics'), false)
  for (const atteso of ['merge', 'convert', 'extract', 'remove', 'rotate', 'split', 'images', 'watermark', 'numbering', 'metadata', 'optimize']) {
    assert.ok(described.some((operation) => operation.name === atteso), `${atteso} esposta all interfaccia`)
  }
  assert.ok(described.every((operation) => typeof operation.run === 'undefined'))
})

// ------------------------------------------------------------ validazione ---

test('la validazione applica i limiti dichiarati nel catalogo', async () => {
  await assert.rejects(validateRequest({ operation: 'merge', files: [sample1], output: '/tmp/a.pdf' }), /almeno 2 file/)
  await assert.rejects(
    validateRequest({ operation: 'convert', files: [sample1, sample2], output: '/tmp/a.pdf' }),
    /massimo 1 file/,
  )
  await assert.rejects(validateRequest({ operation: 'merge', files: [sample1, sample2] }), /destinazione mancante/)
  await assert.rejects(
    validateRequest({ operation: 'merge', files: [sample1, sample2], output: '/tmp/a.txt' }),
    /estensione \.pdf/,
  )
  await assert.rejects(
    validateRequest({ operation: 'merge', files: [sample1, '/percorso/inesistente.pdf'], output: '/tmp/a.pdf' }),
    /non leggibile/,
  )
})

test('gli errori tornano come busta ok:false, non come eccezioni', async () => {
  const result = await runRequest({ operation: 'sconosciuta', files: [] })
  assert.equal(result.ok, false)
  assert.match(result.error, /Operazione non valida/)
})

// ------------------------------------------------------------------ merge ---

test('merge concatena le pagine nell’ordine ricevuto', async () => {
  const { output, cleanup } = workspace()
  try {
    const progress = []
    const result = await runRequest({ operation: 'merge', files: [sample1, sample2], output }, {
      onProgress: (value) => progress.push(value),
    })
    assert.equal(result.ok, true)
    assert.equal(result.pages, 2)
    assert.equal(result.sources, 2)
    assert.equal(result.pdfa, false)
    assert.equal(progress.length, 2)
    assert.equal(progress[1].total, 2)
    assert.ok(readOutput(output).startsWith('%PDF-'))
  } finally {
    cleanup()
  }
})

test('merge in PDF/A produce OutputIntent, XMP e header 1.4', async () => {
  const { output, cleanup } = workspace()
  try {
    const result = await runRequest({ operation: 'merge', files: [sample1, sample2], output, pdfa: true })
    assert.equal(result.ok, true)
    assert.equal(result.pdfa, true)
    const content = readOutput(output)
    assert.ok(content.startsWith('%PDF-1.4'))
    assert.match(content, /GTS_PDFA1/)
    assert.match(content, /pdfaid:part>1</)
    assert.match(content, /pdfaid:conformance>B</)
    assert.match(content, /sRGB IEC61966-2\.1/)
  } finally {
    cleanup()
  }
})

// ---------------------------------------------------------------- convert ---

test('convert marca sempre PDF/A anche senza richiederlo', async () => {
  const { output, cleanup } = workspace()
  try {
    const result = await runRequest({ operation: 'convert', files: [sample1], output, pdfa: false })
    assert.equal(result.ok, true)
    assert.equal(result.pdfa, true)
    assert.ok(readOutput(output).startsWith('%PDF-1.4'))
  } finally {
    cleanup()
  }
})

test('un file danneggiato produce un errore comprensibile', async () => {
  const { dir, output, cleanup } = workspace()
  try {
    const broken = path.join(dir, 'rotto.pdf')
    const fs = await import('node:fs/promises')
    await fs.writeFile(broken, 'non è un pdf')
    const result = await runRequest({ operation: 'convert', files: [broken], output })
    assert.equal(result.ok, false)
    assert.match(result.error, /illeggibile|Impossibile leggere/)
  } finally {
    cleanup()
  }
})

// ----------------------------------------------------------- diagnostica ---

test('diagnostics riporta il limite di heap del processo', async () => {
  const result = await runRequest({ operation: 'diagnostics', files: [] })
  assert.equal(result.ok, true)
  assert.ok(result.heapLimitMb > 0)
  assert.ok(result.totalMemoryMb > 0)
})

// ------------------------------------------------------------------- ICC ---

test('il profilo ICC generato è strutturalmente valido', () => {
  const profile = Buffer.from(srgbIccProfile())
  assert.equal(profile.readUInt32BE(0), profile.length, 'la dimensione dichiarata coincide con quella reale')
  assert.equal(profile.subarray(36, 40).toString('latin1'), 'acsp')
  assert.equal(profile.subarray(16, 20).toString('latin1'), 'RGB ')
  assert.equal(profile.subarray(20, 24).toString('latin1'), 'XYZ ')

  const tagCount = profile.readUInt32BE(128)
  assert.equal(tagCount, 9)
  const tags = []
  for (let index = 0; index < tagCount; index++) {
    const base = 132 + index * 12
    const signature = profile.subarray(base, base + 4).toString('latin1')
    const offset = profile.readUInt32BE(base + 4)
    const size = profile.readUInt32BE(base + 8)
    assert.ok(offset + size <= profile.length, `tag ${signature} dentro il profilo`)
    tags.push(signature)
  }
  for (const required of ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'cprt']) {
    assert.ok(tags.includes(required), `tag ${required} presente`)
  }
})

test('il profilo ICC è deterministico', () => {
  assert.deepEqual(Buffer.from(srgbIccProfile()), Buffer.from(srgbIccProfile()))
})

// ------------------------------------------------------------------ XMP ---

test('l’XMP dichiara parte e conformità PDF/A e sfugge i caratteri XML', () => {
  const xmp = buildXmpMetadata({
    title: 'Titolo & <prova>',
    producer: 'PDFix',
    creator: 'PDFix',
    date: new Date('2026-08-30T10:00:00Z'),
  })
  assert.match(xmp, /<pdfaid:part>1<\/pdfaid:part>/)
  assert.match(xmp, /<pdfaid:conformance>B<\/pdfaid:conformance>/)
  assert.match(xmp, /Titolo &amp; &lt;prova&gt;/)
  assert.match(xmp, /<\?xpacket end="w"\?>$/)
  assert.equal(escapeXml(`"a"`), '&quot;a&quot;')
  assert.match(xmpDate(new Date(2026, 7, 30, 12, 0, 0)), /^2026-08-30T12:00:00[+-]\d{2}:\d{2}$/)
})

// --------------------------------------------------------------- header ---

test('la versione dell’header viene riscritta senza spostare byte', () => {
  const bytes = Buffer.from('%PDF-1.7\nresto del file')
  const patched = patchHeaderVersion(new Uint8Array(bytes), '1.4')
  assert.equal(Buffer.from(patched).toString('latin1').slice(0, 8), '%PDF-1.4')
  assert.equal(patched.length, bytes.length)
  assert.throws(() => patchHeaderVersion(new Uint8Array(Buffer.from('non un pdf')), '1.4'), /Header PDF inatteso/)
})
