/**
 * Anteprima delle pagine di un PDF dentro l'interfaccia.
 *
 * Serve a un solo scopo: far vedere la pagina su cui si colloca la firma. Il
 * documento viene disegnato da pdf.js in un canvas, senza uscire dal computer
 * e senza passare dal motore — che sa scrivere PDF, non disegnarli.
 *
 * Il worker di pdf.js non può essere caricato da un file: la finestra vive su
 * `file://` e Chromium rifiuta uno script di worker con la stessa origine
 * opaca. Il codice del worker viene quindi incorporato nel bundle come testo e
 * avviato da un Blob, che invece è consentito.
 */

/**
 * pdf.js viene caricato solo quando serve davvero — cioè quando si apre la
 * finestra della firma — e nella variante «legacy», che non richiede le
 * ultime aggiunte del linguaggio: la stessa cartella `client/` viene montata
 * anche dai test dei componenti, dove il motore JavaScript è quello di Node.
 */
let loaded = null

async function pdfjsWithWorker() {
  if (loaded) return loaded
  loaded = (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.min.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw'),
    ])
    const blob = new Blob([worker.default], { type: 'text/javascript' })
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
    return pdfjs
  })()
  return loaded
}

/**
 * Apre un documento a partire dai suoi byte.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<{pageCount: number, renderPage: Function, destroy: Function}>}
 */
export async function openDocument(bytes) {
  const pdfjs = await pdfjsWithWorker()
  const task = pdfjs.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    // Nessuna valutazione di codice e nessuna richiesta di rete: l'anteprima
    // resta un disegno, non un ambiente di esecuzione.
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  })
  const document = await task.promise

  return {
    pageCount: document.numPages,

    /**
     * Disegna una pagina e ne restituisce l'immagine.
     *
     * Le dimensioni sono quelle viste dall'utente: il viewport di pdf.js tiene
     * già conto di `/Rotate`, come il piazzamento della firma.
     *
     * @param {number} number pagina, da 1
     * @param {number} width larghezza desiderata in pixel
     */
    async renderPage(number, width) {
      const page = await document.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.max(0.1, width / base.width) })

      const canvas = globalThis.document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
      page.cleanup()

      return { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    },

    /**
     * Chiude il documento e libera il worker: si passa dal task di
     * caricamento, che è l'oggetto che pdf.js garantisce distruggibile.
     */
    destroy() {
      return task.destroy()
    },
  }
}

/** Rapporto altezza/larghezza di un'immagine caricata da un URL. */
export function imageRatio(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalHeight / image.naturalWidth)
    image.onerror = () => reject(new Error('Immagine non leggibile.'))
    image.src = url
  })
}
