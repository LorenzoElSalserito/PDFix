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
 * @property {'text'|'textarea'|'password'|'number'|'choice'|'boolean'|'file'|'placement'} type
 * @property {string} label               etichetta mostrata nell'interfaccia
 * @property {string} [help]              spiegazione breve
 * @property {string} [placeholder]
 * @property {any} default                valore iniziale
 * @property {boolean} [required]         un testo vuoto non è accettato
 * @property {number} [min]               solo per `number`
 * @property {number} [max]               solo per `number`
 * @property {number} [step]              solo per `number`
 * @property {{value: any, label: string}[]} [options] solo per `choice`
 * @property {string[]} [accept]         estensioni ammesse, solo per `file`
 * @property {{key: string, equals: any}} [visibleWhen] mostrato solo a condizione
 */

/**
 * @typedef {object} OperationDescriptor
 * @property {string} name              identificatore usato nelle richieste
 * @property {string} label             etichetta mostrata nell'interfaccia
 * @property {string} [group]           gruppo della pulsantiera, fra OPERATION_GROUPS
 * @property {string} description       testo esteso mostrato nelle preferenze
 * @property {number} minFiles          numero minimo di file richiesti
 * @property {number|null} maxFiles     massimo, `null` se illimitato
 * @property {boolean} supportsPdfA     l'operazione può produrre PDF/A
 * @property {boolean} forcesPdfA       l'operazione produce sempre PDF/A
 * @property {string} [defaultFileName] nome proposto nella finestra di salvataggio
 * @property {string[]} [inputExtensions] estensioni accettate (default: solo .pdf)
 * @property {'file'|'directory'} [outputMode] destinazione richiesta all'utente
 * @property {string[]} [outputExtensions] estensioni ammesse per il file prodotto
 * @property {boolean} [inspect]        i parametri dipendono dal documento scelto
 * @property {OperationParam[]} [params] parametri chiesti prima dell'esecuzione
 * @property {boolean} [hidden]         non compare nell'interfaccia né fra le funzionalità
 * @property {boolean} [optional]       può essere disattivata dalle preferenze
 */

/** Estensioni accettate quando il descrittore non dice altro. */
export const DEFAULT_INPUT_EXTENSIONS = ['.pdf']

/** Estensione del file prodotto, quando il descrittore non dice altro. */
export const DEFAULT_OUTPUT_EXTENSIONS = ['.pdf']

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

/**
 * Gruppi della pulsantiera, nell'ordine in cui compaiono.
 *
 * Ventisei comandi affiancati sono un muro: l'interfaccia li divide per
 * intento — cosa si vuole ottenere dal documento — e il raggruppamento vive
 * qui, accanto ai descrittori, perche' aggiungere una funzionalita' significhi
 * toccare un solo file.
 */
export const OPERATION_GROUPS = [
  { id: 'documento', label: 'Documento' },
  { id: 'pagine', label: 'Pagine' },
  { id: 'impaginazione', label: 'Impaginazione' },
  { id: 'contenuto', label: 'Contenuto' },
  { id: 'moduli', label: 'Moduli' },
  { id: 'sicurezza', label: 'Sicurezza' },
]

/** @type {OperationDescriptor[]} */
export const OPERATIONS = [
  {
    name: 'merge',
    group: 'documento',
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
    group: 'documento',
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
    group: 'pagine',
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
    group: 'pagine',
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
    group: 'pagine',
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
    group: 'documento',
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
    name: 'nup',
    group: 'impaginazione',
    label: 'Più pagine per foglio',
    description: 'Dispone due o quattro pagine su ogni foglio, per stampare meno carta.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_impaginato.pdf',
    optional: true,
    params: [
      {
        key: 'perFoglio',
        type: 'choice',
        label: 'Pagine per foglio',
        default: 2,
        options: [
          { value: 2, label: '2 (foglio orizzontale)' },
          { value: 4, label: '4 (foglio verticale)' },
        ],
      },
      {
        key: 'marginMm',
        type: 'number',
        label: 'Margine',
        help: 'Millimetri di spazio bianco attorno a ogni pagina collocata.',
        default: 5,
        min: 0,
        max: 30,
        step: 1,
      },
      {
        key: 'cornice',
        type: 'boolean',
        label: 'Disegna una cornice attorno a ogni pagina',
        help: 'Utile per tagliare diritto dopo la stampa.',
        default: false,
      },
    ],
  },
  {
    name: 'booklet',
    group: 'impaginazione',
    label: 'Libretto',
    description: 'Impagina il documento per la rilegatura a punto metallico: fogli piegati a metà.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_libretto.pdf',
    optional: true,
    params: [
      {
        key: 'marginMm',
        type: 'number',
        label: 'Margine',
        help: 'Stampa i fogli fronte/retro sul lato corto, poi piegali a metà.',
        default: 5,
        min: 0,
        max: 30,
        step: 1,
      },
    ],
  },
  {
    name: 'resize',
    group: 'pagine',
    label: 'Uniforma formato',
    description: 'Porta tutte le pagine allo stesso formato, scalando il contenuto senza deformarlo.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_uniformato.pdf',
    optional: true,
    params: [
      {
        key: 'formato',
        type: 'choice',
        label: 'Formato di destinazione',
        default: 'a4',
        options: [
          { value: 'a4', label: 'A4 verticale' },
          { value: 'a4-orizzontale', label: 'A4 orizzontale' },
          { value: 'a5', label: 'A5 verticale' },
          { value: 'a3', label: 'A3 verticale' },
          { value: 'letter', label: 'Letter' },
          { value: 'prima', label: 'Come la prima pagina' },
        ],
      },
      {
        key: 'marginMm',
        type: 'number',
        label: 'Margine',
        default: 0,
        min: 0,
        max: 30,
        step: 1,
      },
      {
        key: 'ingrandisci',
        type: 'boolean',
        label: 'Ingrandisci le pagine più piccole',
        help: 'Disattivalo per non sgranare le scansioni a bassa risoluzione.',
        default: true,
      },
    ],
  },
  {
    name: 'crop',
    group: 'pagine',
    label: 'Ritaglia margini',
    description:
      'Restringe l’area visibile delle pagine. Il contenuto tagliato resta nel file: serve a inquadrare, non a nascondere.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_ritagliato.pdf',
    optional: true,
    params: [
      pagesParam({ default: '1-' }),
      { key: 'topMm', type: 'number', label: 'Margine alto', default: 0, min: 0, max: 100, step: 1 },
      { key: 'rightMm', type: 'number', label: 'Margine destro', default: 0, min: 0, max: 100, step: 1 },
      { key: 'bottomMm', type: 'number', label: 'Margine basso', default: 0, min: 0, max: 100, step: 1 },
      { key: 'leftMm', type: 'number', label: 'Margine sinistro', default: 0, min: 0, max: 100, step: 1 },
    ],
  },
  {
    name: 'images',
    group: 'documento',
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
    group: 'contenuto',
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
    name: 'stamp',
    group: 'contenuto',
    label: 'Filigrana con immagine',
    description: 'Sovrappone un logo o un timbro alle pagine scelte, con posizione e trasparenza regolabili.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_timbrato.pdf',
    optional: true,
    params: [
      {
        key: 'image',
        type: 'file',
        label: 'Immagine',
        help: 'Un file PNG o JPG. La trasparenza dei PNG viene conservata.',
        accept: ['.png', '.jpg', '.jpeg'],
        default: '',
        required: true,
      },
      pagesParam({ default: '1-' }),
      {
        key: 'posizione',
        type: 'choice',
        label: 'Posizione',
        default: 'centro',
        options: [
          { value: 'centro', label: 'Al centro' },
          { value: 'basso-sinistra', label: 'In basso a sinistra' },
          { value: 'basso-destra', label: 'In basso a destra' },
          { value: 'alto-sinistra', label: 'In alto a sinistra' },
          { value: 'alto-destra', label: 'In alto a destra' },
        ],
      },
      {
        key: 'scala',
        type: 'number',
        label: 'Larghezza %',
        help: 'Percentuale della larghezza della pagina occupata dall’immagine.',
        default: 30,
        min: 5,
        max: 100,
        step: 5,
      },
      {
        key: 'opacity',
        type: 'number',
        label: 'Opacità %',
        help: 'Un’immagine già chiara con opacità bassa diventa invisibile.',
        default: 30,
        min: 5,
        max: 100,
        step: 5,
      },
    ],
  },
  {
    name: 'signature',
    group: 'contenuto',
    label: 'Firma su foglio',
    description:
      'Applica al documento la tua firma scansionata — un PNG o un JPG — nel punto, nella pagina e nella dimensione che scegli guardando l’anteprima.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_firmato.pdf',
    optional: true,
    params: [
      {
        key: 'image',
        type: 'file',
        label: 'Immagine della firma',
        help: 'Un PNG con sfondo trasparente dà il risultato migliore: il foglio resta visibile sotto il tratto.',
        accept: ['.png', '.jpg', '.jpeg'],
        default: '',
        required: true,
      },
      {
        key: 'placement',
        type: 'placement',
        label: 'Posizione sulla pagina',
        help: 'Trascina la firma sull’anteprima; gli angoli la ridimensionano, le frecce la spostano di poco.',
        // Frazioni della pagina, con origine in alto a sinistra come la vede
        // chi guarda: in basso a destra, la dimensione tipica di una firma.
        default: { page: 1, x: 0.55, y: 0.78, width: 0.3 },
      },
      {
        key: 'opacity',
        type: 'number',
        label: 'Opacità %',
        help: 'Sotto il 100% la firma lascia intravedere il testo che copre.',
        default: 100,
        min: 10,
        max: 100,
        step: 5,
      },
    ],
  },
  {
    name: 'bates',
    group: 'contenuto',
    label: 'Numerazione Bates',
    description:
      'Numera le pagine di più documenti con una sequenza unica e continua, come richiede l’uso legale.',
    minFiles: 1,
    maxFiles: null,
    supportsPdfA: false,
    forcesPdfA: false,
    outputMode: 'directory',
    defaultFileName: 'documento_bates.pdf',
    optional: true,
    params: [
      {
        key: 'prefix',
        type: 'text',
        label: 'Prefisso',
        default: '',
        placeholder: 'ACME-',
        required: false,
      },
      { key: 'suffix', type: 'text', label: 'Suffisso', default: '', required: false },
      { key: 'start', type: 'number', label: 'Primo numero', default: 1, min: 0, max: 1000000, step: 1 },
      {
        key: 'digits',
        type: 'number',
        label: 'Cifre',
        help: 'Gli zeri iniziali tengono la sequenza ordinata anche in ordine alfabetico.',
        default: 6,
        min: 1,
        max: 12,
        step: 1,
      },
      {
        key: 'position',
        type: 'choice',
        label: 'Posizione',
        default: 'basso-destra',
        options: [
          { value: 'basso-sinistra', label: 'In basso a sinistra' },
          { value: 'basso-centro', label: 'In basso al centro' },
          { value: 'basso-destra', label: 'In basso a destra' },
          { value: 'alto-sinistra', label: 'In alto a sinistra' },
          { value: 'alto-centro', label: 'In alto al centro' },
          { value: 'alto-destra', label: 'In alto a destra' },
        ],
      },
      { key: 'size', type: 'number', label: 'Dimensione', default: 9, min: 6, max: 48, step: 1 },
    ],
  },
  {
    name: 'formfields',
    group: 'moduli',
    label: 'Leggi i campi del modulo',
    description: 'Elenca i campi compilabili del documento e li salva in un file JSON.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    outputExtensions: ['.json'],
    defaultFileName: 'campi_modulo.json',
    optional: true,
  },
  {
    name: 'formfill',
    group: 'moduli',
    label: 'Compila il modulo',
    description: 'Chiede un valore per ogni campo del documento e produce il modulo compilato.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'modulo_compilato.pdf',
    optional: true,
    inspect: true,
    params: [
      {
        key: 'appiattisci',
        type: 'boolean',
        label: 'Blocca i campi dopo la compilazione',
        help: 'I valori diventano contenuto fisso: non saranno più modificabili.',
        default: false,
      },
    ],
  },
  {
    name: 'formflatten',
    group: 'moduli',
    label: 'Blocca il modulo',
    description:
      'Trasforma i campi compilati in contenuto fisso. Il documento resta uguale a vedersi, ma non è più modificabile.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'modulo_bloccato.pdf',
    optional: true,
  },
  {
    name: 'numbering',
    group: 'contenuto',
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
    name: 'attach',
    group: 'contenuto',
    label: 'Allega un file',
    description:
      'Incorpora un file nel documento e lo dichiara come allegato, producendo un PDF/A-3b per l’archiviazione a norma.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: true,
    forcesPdfA: true,
    defaultFileName: 'documento_con_allegato.pdf',
    optional: true,
    params: [
      {
        key: 'file',
        type: 'file',
        label: 'File da allegare',
        help: 'Qualunque tipo: PDF/A-3 è la parte dello standard che lo consente.',
        default: '',
        required: true,
      },
      {
        key: 'relazione',
        type: 'choice',
        label: 'Relazione con il documento',
        default: 'Data',
        options: [
          { value: 'Data', label: 'Dati strutturati (per esempio XML di fattura)' },
          { value: 'Source', label: 'Documento sorgente' },
          { value: 'Supplement', label: 'Materiale aggiuntivo' },
          { value: 'Alternative', label: 'Versione alternativa' },
        ],
      },
      {
        key: 'descrizione',
        type: 'text',
        label: 'Descrizione',
        default: '',
        placeholder: 'A cosa serve il file allegato',
      },
    ],
  },
  {
    name: 'bookmarks',
    group: 'contenuto',
    label: 'Crea segnalibri',
    description: 'Costruisce l’indice navigabile del documento a partire da un elenco di pagine e titoli.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_con_segnalibri.pdf',
    optional: true,
    params: [
      {
        key: 'voci',
        type: 'textarea',
        label: 'Segnalibri',
        help: 'Una riga per voce, nella forma «3: Titolo del capitolo».',
        placeholder: '1: Introduzione\n5: Capitolo primo',
        default: '',
        required: true,
      },
      {
        key: 'apri',
        type: 'boolean',
        label: 'Mostra il pannello dei segnalibri già aperto',
        default: true,
      },
    ],
  },
  {
    name: 'splitbookmarks',
    group: 'documento',
    label: 'Dividi per segnalibro',
    description:
      'Produce un file per ogni segnalibro di primo livello, intitolato come il segnalibro stesso.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    outputMode: 'directory',
    defaultFileName: 'parte.pdf',
    optional: true,
  },
  {
    name: 'metadata',
    group: 'contenuto',
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
    name: 'protect',
    group: 'sicurezza',
    label: 'Proteggi con password',
    description:
      'Cifra il documento in AES-256. Serve la password per aprirlo; una password dimenticata non è recuperabile.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_protetto.pdf',
    optional: true,
    params: [
      {
        key: 'userPassword',
        type: 'password',
        label: 'Password di apertura',
        help: 'Senza questa password il documento non si apre. Non è recuperabile: annotala.',
        default: '',
        required: true,
      },
      {
        key: 'ownerPassword',
        type: 'password',
        label: 'Password del proprietario',
        help: 'Toglie ogni limite a chi la conosce. Se vuota, vale quella di apertura.',
        default: '',
      },
      {
        key: 'stampa',
        type: 'choice',
        label: 'Stampa',
        default: 'highResolution',
        options: [
          { value: 'highResolution', label: 'Consentita, alta qualità' },
          { value: 'lowResolution', label: 'Consentita, bassa qualità' },
          { value: 'no', label: 'Non consentita' },
        ],
      },
      { key: 'copia', type: 'boolean', label: 'Consenti di copiare il testo', default: false },
      { key: 'modifica', type: 'boolean', label: 'Consenti di modificare il documento', default: false },
      { key: 'annotazioni', type: 'boolean', label: 'Consenti annotazioni e commenti', default: false },
      { key: 'moduli', type: 'boolean', label: 'Consenti di compilare i moduli', default: true },
    ],
  },
  {
    name: 'unprotect',
    group: 'sicurezza',
    label: 'Togli la protezione',
    description: 'Produce una copia senza cifratura, a partire dalla password con cui è stata applicata.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_libero.pdf',
    optional: true,
    params: [
      {
        key: 'password',
        type: 'password',
        label: 'Password del documento',
        default: '',
        required: true,
      },
    ],
  },
  {
    name: 'sign',
    group: 'sicurezza',
    label: 'Firma digitalmente',
    description:
      'Applica una firma digitale PAdES con il tuo certificato PKCS#12. Senza marca temporale: non richiede alcuna connessione.',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_firmato.pdf',
    // Non esposta: la firma digitale a norma richiede un certificato valido e
    // una spiegazione che l'interfaccia non dà ancora. Il motore resta al suo
    // posto, coperto dai test, e la funzione torna visibile togliendo `hidden`.
    hidden: true,
    params: [
      {
        key: 'certificato',
        type: 'file',
        label: 'Certificato',
        help: 'Il file .p12 o .pfx che contiene il certificato e la chiave privata.',
        accept: ['.p12', '.pfx'],
        default: '',
        required: true,
      },
      {
        key: 'passphrase',
        type: 'password',
        label: 'Password del certificato',
        default: '',
      },
      { key: 'nome', type: 'text', label: 'Nome del firmatario', default: '' },
      {
        key: 'motivo',
        type: 'text',
        label: 'Motivo',
        default: '',
        placeholder: 'Sottoscrizione del documento',
      },
      { key: 'luogo', type: 'text', label: 'Luogo', default: '' },
      { key: 'contatto', type: 'text', label: 'Contatto', default: '' },
    ],
  },
  {
    name: 'optimize',
    group: 'documento',
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

/**
 * Estensioni ammesse per il file prodotto.
 *
 * Quasi tutte le operazioni scrivono un PDF, ma non tutte: leggere i campi di
 * un modulo produce un elenco, e il formato naturale di un elenco è JSON.
 */
export function outputExtensionsOf(descriptor) {
  return descriptor.outputExtensions ?? DEFAULT_OUTPUT_EXTENSIONS
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

/** Gruppo di una operazione; l'ultimo gruppo raccoglie quelle senza etichetta. */
export function groupOf(descriptor) {
  const declared = descriptor?.group
  return OPERATION_GROUPS.some((group) => group.id === declared)
    ? declared
    : OPERATION_GROUPS[OPERATION_GROUPS.length - 1].id
}
