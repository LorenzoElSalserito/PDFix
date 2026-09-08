/**
 * Segnalibri: lettura e scrittura dell'outline del documento.
 *
 * pdf-lib non offre un'API di alto livello per i segnalibri, quindi gli oggetti
 * vengono scritti direttamente. La struttura è una lista doppiamente
 * concatenata di dizionari appesa al catalogo: la radice punta al primo e
 * all'ultimo elemento, ogni voce al precedente, al successivo e al padre.
 */

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFString } from '@cantoo/pdf-lib'

/** Separatore fra numero di pagina e titolo nell'elenco scritto dall'utente. */
const SPEC_SEPARATOR = ':'

/**
 * Interpreta l'elenco scritto dall'utente, una riga per segnalibro nella forma
 * `numero pagina: titolo`.
 *
 * @param {string} text
 * @param {number} pageCount
 * @returns {{title: string, pageIndex: number}[]}
 */
export function parseOutlineSpec(text, pageCount) {
  const entries = []
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue

    const separator = line.indexOf(SPEC_SEPARATOR)
    if (separator < 1) {
      throw new Error(`Riga non valida: «${line}». Usa la forma «3: Titolo».`)
    }
    const written = line.slice(0, separator).trim()
    const pageNumber = Number(written)
    const title = line.slice(separator + 1).trim()

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new Error(`Pagina ${written} inesistente: il documento ne ha ${pageCount}.`)
    }
    if (title === '') throw new Error(`Manca il titolo del segnalibro per la pagina ${pageNumber}.`)

    entries.push({ title, pageIndex: pageNumber - 1 })
  }

  if (entries.length === 0) {
    throw new Error('Indica almeno un segnalibro, per esempio «1: Introduzione».')
  }
  return entries
}

/**
 * Scrive l'outline nel documento, sostituendo quello eventualmente presente.
 *
 * Il riferimento della radice serve prima di creare le voci — ognuna ha
 * `Parent` — quindi si prenota con `nextRef()` e si assegna alla fine.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} document
 * @param {{title: string, pageIndex: number}[]} entries
 * @param {{open?: boolean}} [options] pannello dei segnalibri già aperto
 */
export function writeOutline(document, entries, { open = true } = {}) {
  const context = document.context
  const rootRef = context.nextRef()
  const refs = entries.map(() => context.nextRef())

  entries.forEach((entry, index) => {
    const page = document.getPage(entry.pageIndex)
    context.assign(
      refs[index],
      context.obj({
        // Esadecimale con BOM: i titoli con accenti restano leggibili in tutti
        // i lettori, mentre una stringa letterale li limiterebbe a Latin-1.
        Title: PDFHexString.fromText(entry.title),
        Parent: rootRef,
        // `/XYZ null null null` significa «vai alla pagina e lascia stare
        // posizione e ingrandimento»: `/Fit` imporrebbe lo zoom del lettore.
        Dest: context.obj([page.ref, PDFName.of('XYZ'), null, null, null]),
        ...(index > 0 ? { Prev: refs[index - 1] } : {}),
        ...(index < entries.length - 1 ? { Next: refs[index + 1] } : {}),
      }),
    )
  })

  context.assign(
    rootRef,
    context.obj({
      Type: PDFName.of('Outlines'),
      First: refs[0],
      Last: refs[refs.length - 1],
      // Il segno di Count dice al lettore se mostrare l'albero aperto o chiuso.
      Count: PDFNumber.of(open ? entries.length : -entries.length),
    }),
  )

  document.catalog.set(PDFName.of('Outlines'), rootRef)
  return entries.length
}

/** Testo di un titolo, qualunque codifica abbia usato chi ha scritto il PDF. */
function titleOf(value) {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
  return value ? String(value) : ''
}

/**
 * Pagina a cui punta una voce di outline.
 *
 * La destinazione può essere diretta (`/Dest`) o dentro un'azione (`/A` con
 * `/D`); in entrambi i casi il primo elemento dell'array è il riferimento della
 * pagina. Le destinazioni con nome — una stringa invece di un array — vivono
 * nella tabella dei nomi: qui non si risolvono, e la voce viene saltata invece
 * di far fallire l'intera operazione.
 */
function destinationPage(context, entry, indexByRef) {
  const direct = context.lookupMaybe(entry.get(PDFName.of('Dest')), PDFArray)
  const action = context.lookupMaybe(entry.get(PDFName.of('A')), PDFDict)
  const destination =
    direct ?? (action ? context.lookupMaybe(action.get(PDFName.of('D')), PDFArray) : undefined)
  if (!destination || destination.size() === 0) return null

  const index = indexByRef.get(String(destination.get(0)))
  return index === undefined ? null : index
}

/**
 * Segnalibri di primo livello, in ordine di documento.
 *
 * I livelli annidati vengono ignorati: dividere un documento seguendo un albero
 * profondo produrrebbe file sovrapposti, non una suddivisione.
 *
 * @returns {{title: string, pageIndex: number}[]}
 */
export function outlineTargets(document) {
  const context = document.context
  const root = context.lookupMaybe(document.catalog.get(PDFName.of('Outlines')), PDFDict)
  if (!root) return []

  const indexByRef = new Map(document.getPages().map((page, index) => [String(page.ref), index]))
  const targets = []
  const seen = new Set()

  let ref = root.get(PDFName.of('First'))
  while (ref) {
    const key = String(ref)
    if (seen.has(key)) break // una catena circolare non deve diventare un ciclo infinito
    seen.add(key)

    const entry = context.lookupMaybe(ref, PDFDict)
    if (!entry) break

    const pageIndex = destinationPage(context, entry, indexByRef)
    if (pageIndex !== null) {
      targets.push({ title: titleOf(entry.get(PDFName.of('Title'))), pageIndex })
    }
    ref = entry.get(PDFName.of('Next'))
  }

  return targets.sort((first, second) => first.pageIndex - second.pageIndex)
}

/** Nome di file ricavato da un titolo, utilizzabile su qualunque sistema. */
export function safeFileName(title, fallback) {
  const cleaned = String(title ?? '')
    // Vietati su Windows e scomodi ovunque: si sostituiscono con un trattino,
    // non si tolgono, così due titoli diversi restano nomi diversi.
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 60)
  return cleaned === '' ? fallback : cleaned
}

/**
 * Gruppi di pagine delimitati dai segnalibri: ogni gruppo arriva fino alla
 * pagina che precede il segnalibro successivo.
 */
export function bookmarkGroups(targets, pageCount) {
  return targets.map((target, index) => {
    const end = index + 1 < targets.length ? targets[index + 1].pageIndex : pageCount
    const indices = []
    for (let page = target.pageIndex; page < end; page++) indices.push(page)
    return { title: target.title, indices }
  })
}
