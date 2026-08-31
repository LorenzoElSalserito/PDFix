/**
 * Catalogo delle operazioni: unica fonte di verità sui metadati.
 *
 * Il file non importa nulla, così può essere letto dal processo main di
 * Electron (che non carica il motore PDF), dal motore stesso e — via IPC — dal
 * renderer. Aggiungere una funzionalità significa aggiungere un descrittore qui
 * e il modulo `run` corrispondente in `core/operations/`.
 */

/**
 * @typedef {object} OperationParam
 * @property {string} key                 nome del parametro nella richiesta
 * @property {'text'|'number'|'choice'|'boolean'} type
 * @property {string} label               etichetta mostrata nell'interfaccia
 * @property {string} [help]              spiegazione breve
 * @property {string} [placeholder]
 * @property {any} default                valore iniziale
 * @property {boolean} [required]         un testo vuoto non è accettato
 * @property {number} [min]               solo per `number`
 * @property {number} [max]               solo per `number`
 * @property {number} [step]              solo per `number`
 * @property {{value: any, label: string}[]} [options] solo per `choice`
 * @property {{key: string, equals: any}} [visibleWhen] mostrato solo a condizione
 */

/**
 * @typedef {object} OperationDescriptor
 * @property {string} name              identificatore usato nelle richieste
 * @property {string} label             etichetta mostrata nell'interfaccia
 * @property {string} description       testo esteso mostrato nelle preferenze
 * @property {number} minFiles          numero minimo di file richiesti
 * @property {number|null} maxFiles     massimo, `null` se illimitato
 * @property {boolean} supportsPdfA     l'operazione può produrre PDF/A
 * @property {boolean} forcesPdfA       l'operazione produce sempre PDF/A
 * @property {string} [defaultFileName] nome proposto nella finestra di salvataggio
 * @property {string[]} [inputExtensions] estensioni accettate (default: solo .pdf)
 * @property {'file'|'directory'} [outputMode] destinazione richiesta all'utente
 * @property {OperationParam[]} [params] parametri chiesti prima dell'esecuzione
 * @property {boolean} [hidden]         non compare nell'interfaccia né fra le funzionalità
 * @property {boolean} [optional]       può essere disattivata dalle preferenze
 */

/** Estensioni accettate quando il descrittore non dice altro. */
export const DEFAULT_INPUT_EXTENSIONS = ['.pdf']

/** Estensioni delle immagini gestite dall'operazione «Immagini in PDF». */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']

/** Parametro comune: selezione di pagine. */
function pagesParam(overrides = {}) {
  return {
    key: 'pages',
    type: 'text',
    label: 'Pagine',
    help: 'Numeri e intervalli separati da virgola: 1-3,7,10-. Vuoto o «1-» significa tutte.',
    placeholder: '1-3,7',
    default: '1-',
    required: true,
    ...overrides,
  }
}

/** @type {OperationDescriptor[]} */
export const OPERATIONS = [
  {
    name: 'merge',
    label: 'Unisci PDF',
    description: 'Concatena più documenti PDF in un unico file, nell’ordine scelto.',
    minFiles: 2,
    maxFiles: null,
    supportsPdfA: true,
    forcesPdfA: false,
    defaultFileName: 'documento_unito.pdf',
    optional: true,
  },
  {
    name: 'convert',
    label: 'Converti in PDF/A',
    description: 'Riscrive un documento con OutputIntent sRGB e metadati XMP PDF/A-1b.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: true,
    forcesPdfA: true,
    defaultFileName: 'documento_pdfa.pdf',
    optional: true,
  },
  {
    name: 'extract',
    label: 'Estrai pagine',
    description: 'Crea un nuovo documento con le sole pagine indicate, nell’ordine indicato.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'pagine_estratte.pdf',
    optional: true,
    params: [pagesParam({ default: '1', placeholder: '1-3,7' })],
  },
  {
    name: 'remove',
    label: 'Elimina pagine',
    description: 'Rimuove le pagine indicate e conserva tutte le altre.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_ridotto.pdf',
    optional: true,
    params: [pagesParam({ default: '1', label: 'Pagine da eliminare' })],
  },
  {
    name: 'rotate',
    label: 'Ruota pagine',
    description: 'Ruota le pagine indicate di 90, 180 o 270 gradi.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_ruotato.pdf',
    optional: true,
    params: [
      pagesParam(),
      {
        key: 'angle',
        type: 'choice',
        label: 'Rotazione',
        default: 90,
        options: [
          { value: 90, label: '90° orario' },
          { value: 180, label: '180°' },
          { value: 270, label: '90° antiorario' },
        ],
      },
    ],
  },
  {
    name: 'split',
    label: 'Dividi PDF',
    description: 'Divide un documento in più file, una pagina per file o per intervalli.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    outputMode: 'directory',
    defaultFileName: 'parte.pdf',
    optional: true,
    params: [
      {
        key: 'mode',
        type: 'choice',
        label: 'Criterio',
        default: 'pagina',
        options: [
          { value: 'pagina', label: 'Una pagina per file' },
          { value: 'intervalli', label: 'Per intervalli' },
        ],
      },
      {
        key: 'ranges',
        type: 'text',
        label: 'Intervalli',
        help: 'Un file per ogni gruppo: 1-3,4-8,9-.',
        placeholder: '1-3,4-8',
        default: '',
        visibleWhen: { key: 'mode', equals: 'intervalli' },
      },
    ],
  },
  {
    name: 'images',
    label: 'Immagini in PDF',
    description: 'Crea un documento PDF a partire da immagini JPG o PNG, una per pagina.',
    minFiles: 1,
    maxFiles: null,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'immagini.pdf',
    inputExtensions: IMAGE_EXTENSIONS,
    optional: true,
    params: [
      {
        key: 'pageSize',
        type: 'choice',
        label: 'Formato pagina',
        default: 'immagine',
        options: [
          { value: 'immagine', label: 'Come l’immagine' },
          { value: 'a4', label: 'A4 verticale' },
          { value: 'a4-orizzontale', label: 'A4 orizzontale' },
        ],
      },
      {
        key: 'marginMm',
        type: 'number',
        label: 'Margine',
        help: 'Millimetri di bordo bianco attorno all’immagine.',
        default: 0,
        min: 0,
        max: 50,
        step: 1,
        visibleWhen: { key: 'pageSize', equals: 'a4' },
      },
    ],
  },
  {
    name: 'watermark',
    label: 'Filigrana',
    description: 'Sovrappone un testo in diagonale su tutte le pagine del documento.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_filigranato.pdf',
    optional: true,
    params: [
      {
        key: 'text',
        type: 'text',
        label: 'Testo',
        placeholder: 'RISERVATO',
        default: 'RISERVATO',
        required: true,
      },
      { key: 'size', type: 'number', label: 'Dimensione', default: 48, min: 8, max: 200, step: 2 },
      { key: 'opacity', type: 'number', label: 'Opacità %', default: 20, min: 5, max: 100, step: 5 },
      { key: 'angle', type: 'number', label: 'Inclinazione °', default: 45, min: -90, max: 90, step: 5 },
    ],
  },
  {
    name: 'numbering',
    label: 'Numera pagine',
    description: 'Stampa il numero di pagina nella posizione scelta.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_numerato.pdf',
    optional: true,
    params: [
      {
        key: 'position',
        type: 'choice',
        label: 'Posizione',
        default: 'basso-centro',
        options: [
          { value: 'basso-sinistra', label: 'In basso a sinistra' },
          { value: 'basso-centro', label: 'In basso al centro' },
          { value: 'basso-destra', label: 'In basso a destra' },
          { value: 'alto-sinistra', label: 'In alto a sinistra' },
          { value: 'alto-centro', label: 'In alto al centro' },
          { value: 'alto-destra', label: 'In alto a destra' },
        ],
      },
      {
        key: 'format',
        type: 'choice',
        label: 'Formato',
        default: 'n',
        options: [
          { value: 'n', label: 'Solo numero' },
          { value: 'n-di-tot', label: 'Numero e totale' },
        ],
      },
      { key: 'start', type: 'number', label: 'Primo numero', default: 1, min: 0, max: 10000, step: 1 },
      { key: 'size', type: 'number', label: 'Dimensione', default: 10, min: 6, max: 48, step: 1 },
    ],
  },
  {
    name: 'metadata',
    label: 'Modifica metadati',
    description: 'Imposta titolo, autore, oggetto e parole chiave del documento.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_metadati.pdf',
    optional: true,
    params: [
      { key: 'title', type: 'text', label: 'Titolo', default: '', placeholder: 'Titolo del documento' },
      { key: 'author', type: 'text', label: 'Autore', default: '', placeholder: 'Nome e cognome' },
      { key: 'subject', type: 'text', label: 'Oggetto', default: '', placeholder: 'Argomento' },
      {
        key: 'keywords',
        type: 'text',
        label: 'Parole chiave',
        default: '',
        placeholder: 'contratto, 2026, allegato',
        help: 'Separate da virgola.',
      },
    ],
  },
  {
    name: 'optimize',
    label: 'Ottimizza PDF',
    description: 'Ricompatta la struttura del documento per ridurne la dimensione.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_ottimizzato.pdf',
    optional: true,
    params: [
      {
        key: 'stripMetadata',
        type: 'boolean',
        label: 'Rimuovi i metadati',
        help: 'Toglie titolo, autore e cronologia di produzione.',
        default: false,
      },
    ],
  },
  {
    name: 'diagnostics',
    label: 'Diagnostica motore',
    description: 'Riporta limite di heap, memoria di sistema e versioni del runtime.',
    minFiles: 0,
    maxFiles: 0,
    supportsPdfA: false,
    forcesPdfA: false,
    hidden: true,
    optional: false,
  },
]

/** Operazioni che l'utente può attivare o disattivare dalle preferenze. */
export const OPTIONAL_OPERATIONS = OPERATIONS.filter((operation) => operation.optional)

export function operationDescriptor(name) {
  const descriptor = OPERATIONS.find((operation) => operation.name === name)
  if (!descriptor) throw new Error(`Operazione non valida: ${name}`)
  return descriptor
}

/** Limite superiore effettivo: `null` nel catalogo significa "illimitato". */
export function maxFilesOf(descriptor) {
  return descriptor.maxFiles === null ? Number.POSITIVE_INFINITY : descriptor.maxFiles
}

/** Estensioni accettate in ingresso da una operazione. */
export function inputExtensionsOf(descriptor) {
  return descriptor.inputExtensions ?? DEFAULT_INPUT_EXTENSIONS
}

/** L'operazione scrive un file solo o riempie una cartella? */
export function outputModeOf(descriptor) {
  return descriptor.outputMode ?? 'file'
}

/** Valori iniziali dei parametri, come li propone l'interfaccia. */
export function defaultParams(descriptor) {
  return Object.fromEntries((descriptor.params ?? []).map((param) => [param.key, param.default]))
}

/** Un parametro è pertinente solo se la condizione dichiarata è soddisfatta. */
export function isParamVisible(param, values) {
  const rule = param.visibleWhen
  return !rule || values?.[rule.key] === rule.equals
}
