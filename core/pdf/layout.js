/**
 * Geometria dell'impaginazione.
 *
 * Le operazioni che ridispongono pagine dentro fogli — più pagine per foglio,
 * libretto, formato uniforme — condividono lo stesso problema: inscrivere un
 * rettangolo dentro un altro senza deformarlo, sapendo che l'origine degli assi
 * del PDF è in basso a sinistra.
 *
 * Il modulo non importa pdf-lib: sono funzioni pure su numeri, quindi si
 * verificano senza costruire documenti.
 */

/** Un millimetro in punti tipografici: l'unità del PDF è 1/72 di pollice. */
export const PT_PER_MM = 72 / 25.4

/** Formati di pagina in punti, orientamento verticale. */
export const PAGE_SIZES = {
  a3: { width: 841.89, height: 1190.55 },
  a4: { width: 595.28, height: 841.89 },
  a5: { width: 419.53, height: 595.28 },
  letter: { width: 612, height: 792 },
}

/** Rotazione ridotta a uno dei quattro quarti, anche da valori negativi. */
export function quarterTurn(rotation) {
  const normalized = ((Math.round(Number(rotation) || 0) % 360) + 360) % 360
  return normalized - (normalized % 90)
}

/**
 * Dimensioni «viste» di una pagina, tenendo conto della rotazione dichiarata.
 *
 * `embedPage` di pdf-lib incorpora il contenuto ignorando `/Rotate`: senza
 * questa correzione una pagina ruotata finisce coricata dentro il foglio.
 */
export function visualSize({ width, height, rotation = 0 }) {
  const quarter = quarterTurn(rotation)
  return quarter === 90 || quarter === 270 ? { width: height, height: width } : { width, height }
}

/**
 * Scala e traslazione per centrare un rettangolo dentro un altro senza
 * deformarlo.
 *
 * @param {{width: number, height: number}} source
 * @param {{width: number, height: number}} cell
 * @param {{allowEnlarge?: boolean}} [options] se falso la scala non supera 1
 */
export function fitCentered(source, cell, { allowEnlarge = true } = {}) {
  const raw = Math.min(cell.width / source.width, cell.height / source.height)
  const scale = allowEnlarge ? raw : Math.min(raw, 1)
  return {
    scale,
    x: (cell.width - source.width * scale) / 2,
    y: (cell.height - source.height * scale) / 2,
  }
}

/**
 * Posizione della cella i-esima di una griglia.
 *
 * L'indice segue l'ordine di lettura — sinistra→destra, alto→basso — mentre la
 * y del PDF cresce verso l'alto: la riga 0 è quella con la y maggiore.
 */
export function cellAt(index, { columns, rows, width, height }) {
  const column = index % columns
  const row = Math.floor(index / columns)
  const cellWidth = width / columns
  const cellHeight = height / rows
  return {
    x: column * cellWidth,
    y: height - (row + 1) * cellHeight,
    width: cellWidth,
    height: cellHeight,
  }
}

/** Cella rimpicciolita di un margine su ogni lato. */
export function insetCell(cell, margin) {
  const width = cell.width - margin * 2
  const height = cell.height - margin * 2
  if (width <= 0 || height <= 0) {
    throw new Error('Il margine è più grande dello spazio disponibile: riducilo.')
  }
  return { x: cell.x + margin, y: cell.y + margin, width, height }
}

/**
 * Argomenti di `drawPage` per collocare una pagina dentro una cella.
 *
 * pdf-lib ruota il contenuto attorno al punto `(x, y)` passato: dopo una
 * rotazione l'oggetto si estende in direzioni diverse, quindi l'origine va
 * spostata sull'angolo che, ruotato, torna in basso a sinistra della cella.
 * Le quattro combinazioni sono verificate dai test.
 *
 * @param {{width: number, height: number, rotation?: number}} source dimensioni non ruotate
 * @param {{x: number, y: number, width: number, height: number}} cell
 * @param {{allowEnlarge?: boolean}} [options]
 * @returns {{x: number, y: number, scale: number, rotate: number, width: number, height: number}}
 */
export function placement(source, cell, options = {}) {
  const quarter = quarterTurn(source.rotation)
  const visual = visualSize(source)
  const fitted = fitCentered(visual, cell, options)
  const left = cell.x + fitted.x
  const bottom = cell.y + fitted.y
  const drawnWidth = visual.width * fitted.scale
  const drawnHeight = visual.height * fitted.scale

  return {
    x: left + (quarter === 90 || quarter === 180 ? drawnWidth : 0),
    y: bottom + (quarter === 180 || quarter === 270 ? drawnHeight : 0),
    scale: fitted.scale,
    rotate: quarter,
    width: drawnWidth,
    height: drawnHeight,
  }
}

/** Griglia e formato del foglio per l'operazione «più pagine per foglio». */
export function sheetGrid(perSheet) {
  if (perSheet === 4) {
    return { columns: 2, rows: 2, sheet: { ...PAGE_SIZES.a4 } }
  }
  return { columns: 2, rows: 1, sheet: { width: PAGE_SIZES.a4.height, height: PAGE_SIZES.a4.width } }
}

/**
 * Ordine delle pagine per l'imposizione a sella.
 *
 * I fogli si piegano a metà e si infilano uno dentro l'altro: sul fronte del
 * foglio n stanno l'ultima pagina disponibile e la prima, sul retro la seconda
 * e la penultima, e così restringendo. Le pagine mancanti per arrivare a un
 * multiplo di quattro diventano facciate bianche.
 *
 * @param {number} pageCount
 * @returns {(number|null)[]} indici a coppie: fronte, retro, fronte, retro…
 */
export function bookletOrder(pageCount) {
  if (pageCount < 1) throw new Error('Il documento non ha pagine.')
  const total = Math.ceil(pageCount / 4) * 4
  const order = []
  for (let sheet = 0; sheet < total / 4; sheet++) {
    order.push(total - 1 - 2 * sheet, 2 * sheet)
    order.push(2 * sheet + 1, total - 2 - 2 * sheet)
  }
  return order.map((index) => (index < pageCount ? index : null))
}
