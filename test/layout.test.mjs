/**
 * Test della geometria di impaginazione.
 *
 * Sono funzioni pure su numeri: qui si verifica la matematica, mentre l'effetto
 * sui documenti veri è coperto dai test del motore in `operations.test.mjs`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PAGE_SIZES,
  PT_PER_MM,
  bookletOrder,
  cellAt,
  fitCentered,
  insetCell,
  placement,
  quarterTurn,
  sheetGrid,
  visualSize,
} from '../core/pdf/layout.js'

const round = (value) => Math.round(value * 100) / 100

test('un millimetro vale 72/25.4 punti', () => {
  assert.equal(round(PT_PER_MM * 10), 28.35)
  assert.equal(round(PAGE_SIZES.a4.width), 595.28)
  assert.equal(round(PAGE_SIZES.a4.height), 841.89)
})

test('la rotazione viene ridotta a uno dei quattro quarti', () => {
  assert.equal(quarterTurn(0), 0)
  assert.equal(quarterTurn(90), 90)
  assert.equal(quarterTurn(450), 90)
  assert.equal(quarterTurn(-90), 270)
  assert.equal(quarterTurn(-450), 270)
  assert.equal(quarterTurn(undefined), 0)
})

test('le dimensioni viste scambiano i lati sulle pagine coricate', () => {
  assert.deepEqual(visualSize({ width: 200, height: 100, rotation: 0 }), { width: 200, height: 100 })
  assert.deepEqual(visualSize({ width: 200, height: 100, rotation: 180 }), { width: 200, height: 100 })
  assert.deepEqual(visualSize({ width: 200, height: 100, rotation: 90 }), { width: 100, height: 200 })
  assert.deepEqual(visualSize({ width: 200, height: 100, rotation: 270 }), { width: 100, height: 200 })
})

test('fitCentered scala senza deformare e centra il risultato', () => {
  const fitted = fitCentered({ width: 200, height: 100 }, { width: 400, height: 400 })
  assert.equal(fitted.scale, 2, 'la scala è quella del lato più stretto')
  assert.equal(fitted.x, 0)
  assert.equal(fitted.y, 100, 'lo spazio in eccesso è diviso in due')
})

test('fitCentered può rifiutare di ingrandire', () => {
  const fitted = fitCentered({ width: 200, height: 100 }, { width: 400, height: 400 }, { allowEnlarge: false })
  assert.equal(fitted.scale, 1)
  assert.equal(fitted.x, 100)
  assert.equal(fitted.y, 150)
})

test('le celle seguono l ordine di lettura, con la riga 0 in alto', () => {
  const griglia = { columns: 2, rows: 2, width: 400, height: 200 }
  assert.deepEqual(cellAt(0, griglia), { x: 0, y: 100, width: 200, height: 100 })
  assert.deepEqual(cellAt(1, griglia), { x: 200, y: 100, width: 200, height: 100 })
  assert.deepEqual(cellAt(2, griglia), { x: 0, y: 0, width: 200, height: 100 })
  assert.deepEqual(cellAt(3, griglia), { x: 200, y: 0, width: 200, height: 100 })
})

test('il margine si toglie da entrambi i lati e non può divorare la cella', () => {
  assert.deepEqual(insetCell({ x: 10, y: 20, width: 100, height: 50 }, 5), {
    x: 15,
    y: 25,
    width: 90,
    height: 40,
  })
  assert.throws(() => insetCell({ x: 0, y: 0, width: 20, height: 20 }, 10), /margine/)
})

test('la collocazione compensa la rotazione della pagina sorgente', () => {
  const cella = { x: 0, y: 0, width: 400, height: 200 }
  const orizzontale = { width: 200, height: 100 }

  const dritta = placement({ ...orizzontale, rotation: 0 }, cella)
  assert.deepEqual([dritta.x, dritta.y, dritta.scale, dritta.rotate], [0, 0, 2, 0])

  // Ruotata di 90°: pdf-lib ruota attorno a (x, y), quindi l'origine va portata
  // sull'angolo che dopo la rotazione torna in basso a sinistra della cella.
  const quarto = placement({ ...orizzontale, rotation: 90 }, cella)
  assert.deepEqual([quarto.x, quarto.y, quarto.scale, quarto.rotate], [250, 0, 1, 90])

  const mezza = placement({ ...orizzontale, rotation: 180 }, cella)
  assert.deepEqual([mezza.x, mezza.y, mezza.scale, mezza.rotate], [400, 200, 2, 180])

  const treQuarti = placement({ ...orizzontale, rotation: 270 }, cella)
  assert.deepEqual([treQuarti.x, treQuarti.y, treQuarti.scale, treQuarti.rotate], [150, 200, 1, 270])
})

test('la collocazione resta dentro la cella qualunque sia la rotazione', () => {
  const cella = { x: 50, y: 30, width: 300, height: 400 }
  for (const rotation of [0, 90, 180, 270]) {
    const spot = placement({ width: 210, height: 297, rotation }, cella)
    // Angoli effettivamente occupati, ricostruiti dall'origine e dalla rotazione.
    const sinistra = spot.rotate === 90 || spot.rotate === 180 ? spot.x - spot.width : spot.x
    const basso = spot.rotate === 180 || spot.rotate === 270 ? spot.y - spot.height : spot.y
    assert.ok(sinistra >= cella.x - 0.001, `rotazione ${rotation}: sfora a sinistra`)
    assert.ok(basso >= cella.y - 0.001, `rotazione ${rotation}: sfora in basso`)
    assert.ok(sinistra + spot.width <= cella.x + cella.width + 0.001, `rotazione ${rotation}: sfora a destra`)
    assert.ok(basso + spot.height <= cella.y + cella.height + 0.001, `rotazione ${rotation}: sfora in alto`)
  }
})

test('il foglio del 2-up è orizzontale, quello del 4-up verticale', () => {
  const due = sheetGrid(2)
  assert.deepEqual([due.columns, due.rows], [2, 1])
  assert.ok(due.sheet.width > due.sheet.height)

  const quattro = sheetGrid(4)
  assert.deepEqual([quattro.columns, quattro.rows], [2, 2])
  assert.ok(quattro.sheet.height > quattro.sheet.width)
})

test('l imposizione a sella accoppia la prima pagina con l ultima', () => {
  assert.deepEqual(bookletOrder(8), [7, 0, 1, 6, 5, 2, 3, 4])
  assert.deepEqual(bookletOrder(4), [3, 0, 1, 2])
})

test('le pagine mancanti del libretto diventano facciate bianche', () => {
  const ordine = bookletOrder(5)
  assert.equal(ordine.length, 8, 'si arrotonda sempre al multiplo di quattro')
  assert.equal(ordine.filter((voce) => voce === null).length, 3)
  assert.deepEqual(
    ordine.filter((voce) => voce !== null).sort((a, b) => a - b),
    [0, 1, 2, 3, 4],
    'ogni pagina compare una volta sola',
  )
  assert.throws(() => bookletOrder(0), /non ha pagine/)
})
