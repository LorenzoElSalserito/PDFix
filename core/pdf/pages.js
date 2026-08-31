/**
 * Selezione delle pagine.
 *
 * Le operazioni che agiscono su una parte del documento accettano tutte la
 * stessa sintassi — `1-3,7,10-12` — quindi interpretarla una volta sola evita
 * che due comandi si comportino in modo diverso davanti allo stesso testo.
 */

/** Intervallo aperto: `5-` significa "dalla quinta all'ultima". */
const RANGE = /^(\d+)\s*-\s*(\d*)$/
const SINGLE = /^\d+$/

/**
 * Converte una selezione testuale in indici di pagina (base zero).
 *
 * L'ordine scritto dall'utente viene rispettato: `3,1` restituisce la terza
 * pagina e poi la prima. I duplicati vengono mantenuti solo una volta, perché
 * nessuna operazione ha senso su una pagina ripetuta.
 *
 * @param {string} selection testo scritto dall'utente
 * @param {number} pageCount pagine del documento
 * @returns {number[]} indici base zero
 * @throws se la selezione è vuota, malformata o fuori dal documento
 */
export function parsePageSelection(selection, pageCount) {
  const text = String(selection ?? '').trim()
  if (text === '') throw new Error('Indica almeno una pagina (per esempio 1-3,7).')

  const indices = []
  const seen = new Set()

  const push = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > pageCount) {
      throw new Error(`Pagina ${pageNumber} inesistente: il documento ha ${pageCount} pagine.`)
    }
    const index = pageNumber - 1
    if (seen.has(index)) return
    seen.add(index)
    indices.push(index)
  }

  for (const rawPart of text.split(',')) {
    const part = rawPart.trim()
    if (part === '') continue

    if (SINGLE.test(part)) {
      push(Number(part))
      continue
    }

    const range = RANGE.exec(part)
    if (!range) throw new Error(`Selezione non valida: «${part}». Usa numeri e intervalli, come 1-3,7.`)

    const from = Number(range[1])
    const to = range[2] === '' ? pageCount : Number(range[2])
    if (to < from) throw new Error(`Intervallo rovesciato: «${part}».`)
    for (let pageNumber = from; pageNumber <= to; pageNumber++) push(pageNumber)
  }

  if (indices.length === 0) throw new Error('La selezione non contiene pagine.')
  return indices
}

/** Indici che restano dopo aver tolto quelli selezionati, in ordine crescente. */
export function complementOf(indices, pageCount) {
  const removed = new Set(indices)
  const kept = []
  for (let index = 0; index < pageCount; index++) {
    if (!removed.has(index)) kept.push(index)
  }
  return kept
}

/**
 * Suddivide le pagine in gruppi, uno per file prodotto.
 *
 * @param {'pagina'|'intervalli'} mode
 * @param {string} selection usata solo in modalità «intervalli»
 * @param {number} pageCount
 * @returns {number[][]}
 */
export function splitGroups(mode, selection, pageCount) {
  if (mode === 'pagina') {
    return Array.from({ length: pageCount }, (_, index) => [index])
  }

  const text = String(selection ?? '').trim()
  if (text === '') throw new Error('Indica gli intervalli da estrarre (per esempio 1-3,4-8).')

  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => parsePageSelection(part, pageCount))
}

/** Numero di pagina formattato per la numerazione automatica. */
export function formatPageLabel(format, pageNumber, total) {
  return format === 'n-di-tot' ? `${pageNumber} / ${total}` : String(pageNumber)
}
