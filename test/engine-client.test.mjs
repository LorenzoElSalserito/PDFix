/**
 * Test del client del motore: limite di memoria applicato davvero al processo
 * figlio, timeout, propagazione dell'avanzamento e messaggi d'errore.
 *
 * Il motore usato qui e' il sorgente `core/child.js`, non il bundle: i test non
 * dipendono da una build precedente.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createEngineClient } from '../electron/lib/engine-client.js'
import { describeFiles, isPdfFile } from '../electron/lib/pdf-files.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const engineEntry = path.join(here, '..', 'core', 'child.js')
const sample1 = path.join(here, 'fixtures', 'sample1.pdf')
const sample2 = path.join(here, 'fixtures', 'sample2.pdf')

function client({ memory = 1024, timeout = 30_000 } = {}) {
  return createEngineClient({
    engineEntry,
    memoryLimitMb: () => memory,
    timeoutMs: () => timeout,
  })
}

test('il limite di memoria configurato arriva al processo di elaborazione', async () => {
  const engine = client({ memory: 640 })
  try {
    const result = await engine.run({ operation: 'diagnostics', files: [] })
    assert.equal(result.ok, true)
    assert.ok(result.execArgv.includes('--max-old-space-size=640'), 'il flag V8 e passato al figlio')
    // V8 aggiunge i semi-spazi della nuova generazione al tetto richiesto:
    // si verifica l'ordine di grandezza, non l'uguaglianza esatta.
    assert.ok(result.heapLimitMb >= 600 && result.heapLimitMb <= 900, `heap dichiarato: ${result.heapLimitMb} MB`)
  } finally {
    engine.dispose()
  }
})

test('cambiare il limite cambia il processo successivo', async () => {
  let memory = 512
  const engine = createEngineClient({
    engineEntry,
    memoryLimitMb: () => memory,
    timeoutMs: () => 30_000,
  })
  try {
    const first = await engine.run({ operation: 'diagnostics', files: [] })
    memory = 2048
    const second = await engine.run({ operation: 'diagnostics', files: [] })
    assert.ok(second.heapLimitMb > first.heapLimitMb, `${first.heapLimitMb} -> ${second.heapLimitMb}`)
  } finally {
    engine.dispose()
  }
})

test('un merge reale attraversa il confine di processo', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-client-'))
  const engine = client()
  try {
    const output = path.join(dir, 'unito.pdf')
    const progress = []
    const result = await engine.run(
      { operation: 'merge', files: [sample1, sample2], output, pdfa: true },
      { onProgress: (value) => progress.push(value) },
    )
    assert.equal(result.ok, true)
    assert.equal(result.pages, 2)
    assert.equal(progress.length, 2)
    assert.equal(engine.activeCount, 0, 'il processo figlio viene chiuso')
  } finally {
    engine.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('il timeout interrompe una elaborazione troppo lunga', async () => {
  const engine = createEngineClient({
    engineEntry,
    memoryLimitMb: () => 512,
    timeoutMs: () => 1,
  })
  try {
    const result = await engine.run({ operation: 'diagnostics', files: [] })
    assert.equal(result.ok, false)
    assert.match(result.error, /timeout/)
  } finally {
    engine.dispose()
  }
})

test('un motore inesistente non fa cadere l applicazione', async () => {
  const engine = createEngineClient({
    engineEntry: path.join(here, 'motore-che-non-esiste.js'),
    memoryLimitMb: () => 512,
    timeoutMs: () => 10_000,
  })
  try {
    const result = await engine.run({ operation: 'diagnostics', files: [] })
    assert.equal(result.ok, false)
    assert.ok(result.error.length > 0)
  } finally {
    engine.dispose()
  }
})

test('solo i file con la firma giusta vengono accettati', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-files-'))
  try {
    const fake = path.join(dir, 'falso.pdf')
    writeFileSync(fake, 'PK non sono un pdf')
    assert.equal(isPdfFile(sample1), true)
    assert.equal(isPdfFile(fake), false)
    assert.equal(isPdfFile(path.join(dir, 'assente.pdf')), false)
    assert.equal(isPdfFile(path.join(dir, 'documento.txt')), false)

    const described = describeFiles([sample1, sample2])
    assert.deepEqual(described.map((file) => file.name), ['sample1.pdf', 'sample2.pdf'])
    assert.ok(described[0].size > 0)
    assert.throws(() => describeFiles([fake]), /non valido o non supportato/)

    const immagine = path.join(here, 'fixtures', 'sample.jpg')
    assert.equal(isPdfFile(immagine), false, 'una immagine non e un PDF')
    assert.deepEqual(describeFiles([immagine, sample1]).map((file) => file.kind), ['immagine', 'pdf'])
    assert.throws(() => describeFiles('non un array'), /Elenco file non valido/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
