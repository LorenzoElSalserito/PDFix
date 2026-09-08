/**
 * Doppio dell'API esposta dal preload, usato dai test dei componenti.
 *
 * Registra le chiamate ricevute, cosi' i test verificano che il renderer parli
 * con il processo principale nel modo atteso senza avviare Electron.
 */

import { vi } from 'vitest'

export const SETTINGS_SNAPSHOT = {
  values: {
    language: 'it',
    theme: 'chiaro',
    zoomPercent: 100,
    memoryLimitAuto: false,
    memoryLimitMb: 4096,
    processTimeoutSec: 600,
    defaultPdfA: false,
    rememberLastFolder: true,
    features: { merge: true, convert: true },
    lastFolder: null,
  },
  fields: [
    {
      key: 'language',
      type: 'choice',
      section: 'aspetto',
      label: 'Lingua',
      options: [
        { value: 'it', label: 'Italiano' },
        { value: 'en', label: 'English' },
      ],
    },
    {
      key: 'theme',
      type: 'choice',
      section: 'aspetto',
      label: 'Tema',
      help: 'chiaro o scuro',
      options: [
        { value: 'sistema', label: 'Come il sistema' },
        { value: 'chiaro', label: 'Chiaro' },
        { value: 'scuro', label: 'Scuro' },
      ],
    },
    {
      key: 'zoomPercent',
      type: 'choice',
      section: 'aspetto',
      label: 'Zoom dell’interfaccia',
      options: [
        { value: 50, label: '50%' },
        { value: 100, label: '100%' },
        { value: 150, label: '150%' },
      ],
    },
    { key: 'memoryLimitAuto', type: 'boolean', section: 'memoria', label: 'Automatico', help: 'aiuto' },
    {
      key: 'memoryLimitMb',
      type: 'number',
      section: 'memoria',
      label: 'Limite di memoria',
      unit: 'MB',
      min: 512,
      max: 65536,
      step: 256,
      disabledWhen: { key: 'memoryLimitAuto', equals: true },
    },
  ],
  sections: [
    { id: 'aspetto', label: 'Aspetto' },
    { id: 'memoria', label: 'Memoria ed elaborazione' },
    { id: 'funzionalita', label: 'Funzionalita' },
  ],
  features: [
    { name: 'merge', label: 'Unisci PDF', description: 'unisce' },
    { name: 'convert', label: 'Converti in PDF/A', description: 'converte' },
    { name: 'extract', label: 'Estrai pagine', description: 'estrae' },
  ],
  effectiveMemoryLimitMb: 4096,
}

export const OPERATIONS = [
  {
    name: 'extract',
    group: 'pagine',
    label: 'Estrai pagine',
    description: 'estrae',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'pagine_estratte.pdf',
    params: [
      {
        key: 'pages',
        type: 'text',
        label: 'Pagine',
        help: 'Numeri e intervalli',
        placeholder: '1-3,7',
        default: '1',
        required: true,
      },
    ],
  },
  {
    name: 'images',
    group: 'documento',
    label: 'Immagini in PDF',
    description: 'converte immagini',
    minFiles: 1,
    maxFiles: null,
    supportsPdfA: false,
    forcesPdfA: false,
    inputExtensions: ['.jpg', '.jpeg', '.png'],
    defaultFileName: 'immagini.pdf',
    params: [
      {
        key: 'pageSize',
        type: 'choice',
        label: 'Formato pagina',
        default: 'immagine',
        options: [
          { value: 'immagine', label: 'Come l immagine' },
          { value: 'a4', label: 'A4 verticale' },
        ],
      },
      {
        key: 'marginMm',
        type: 'number',
        label: 'Margine',
        default: 0,
        min: 0,
        max: 50,
        step: 1,
        visibleWhen: { key: 'pageSize', equals: 'a4' },
      },
    ],
  },
  {
    name: 'stamp',
    group: 'contenuto',
    label: 'Filigrana con immagine',
    description: 'timbra',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_timbrato.pdf',
    params: [
      {
        key: 'image',
        type: 'file',
        label: 'Immagine',
        accept: ['.png', '.jpg'],
        default: '',
        required: true,
      },
      { key: 'scala', type: 'number', label: 'Larghezza %', default: 30, min: 5, max: 100, step: 5 },
    ],
  },
  {
    name: 'formfill',
    group: 'moduli',
    label: 'Compila il modulo',
    description: 'compila',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'modulo_compilato.pdf',
    inspect: true,
    params: [
      { key: 'appiattisci', type: 'boolean', label: 'Blocca i campi', default: false },
    ],
  },
  {
    name: 'signature',
    group: 'contenuto',
    label: 'Firma su foglio',
    description: 'firma il foglio',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: false,
    forcesPdfA: false,
    defaultFileName: 'documento_firmato.pdf',
    params: [
      { key: 'image', type: 'file', label: 'Immagine della firma', accept: ['.png', '.jpg'], default: '', required: true },
      { key: 'placement', type: 'placement', label: 'Posizione sulla pagina', default: { page: 1, x: 0.55, y: 0.78, width: 0.3 } },
      { key: 'opacity', type: 'number', label: 'Opacità %', default: 100, min: 10, max: 100, step: 5 },
    ],
  },
  {
    name: 'merge',
    group: 'documento',
    label: 'Unisci PDF',
    description: 'unisce',
    minFiles: 2,
    maxFiles: null,
    supportsPdfA: true,
    forcesPdfA: false,
    defaultFileName: 'documento_unito.pdf',
  },
  {
    name: 'convert',
    group: 'documento',
    label: 'Converti in PDF/A',
    description: 'converte',
    minFiles: 1,
    maxFiles: 1,
    supportsPdfA: true,
    forcesPdfA: true,
    defaultFileName: 'documento_pdfa.pdf',
  },
]

export function installBridge(overrides = {}) {
  const listeners = { progress: [], menu: [], settings: [] }

  // Il processo principale restituisce sempre lo stato aggiornato dopo un
  // salvataggio: il doppio si comporta allo stesso modo, altrimenti i test
  // verificherebbero un'applicazione che nella realtà non esiste.
  let snapshot = structuredClone(SETTINGS_SNAPSHOT)
  const bridge = {
    chooseFiles: vi.fn(async () => [
      { path: '/tmp/a.pdf', name: 'a.pdf', size: 1024 },
      { path: '/tmp/b.pdf', name: 'b.pdf', size: 2048 },
    ]),
    describeDroppedFiles: vi.fn(async () => [{ path: '/tmp/c.pdf', name: 'c.pdf', size: 512 }]),
    chooseFile: vi.fn(async () => '/tmp/loghi/logo.png'),
    readFileBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
    run: vi.fn(async () => ({ ok: true, output: '/tmp/out.pdf', pages: 3, bytes: 4096, pdfa: false })),
    diagnostics: vi.fn(async () => ({ ok: true, heapLimitMb: 4096, totalMemoryMb: 16000 })),
    inspect: vi.fn(async () => ({
      ok: true,
      params: [
        { key: 'campo:nome', type: 'text', label: 'nome', default: '' },
        { key: 'campo:accetto', type: 'boolean', label: 'accetto', default: false },
      ],
    })),
    info: vi.fn(async () => ({
      name: 'PDFix',
      version: '1.2.3',
      author: 'Lorenzo De Marco',
      license: 'AGPL-3.0-or-later',
      electron: '43.0.0',
      chrome: '130',
      node: '20.19.2',
      platform: 'linux x64',
    })),
    reportBug: vi.fn(async () => ({ ok: true, url: 'mailto:...' })),
    donate: vi.fn(async () => ({ ok: true, url: 'https://www.paypal.com/paypalme/lorenzodemarco92' })),
    operations: vi.fn(async () => OPERATIONS),
    onProgress: vi.fn((listener) => {
      listeners.progress.push(listener)
      return () => {}
    }),
    settings: {
      get: vi.fn(async () => snapshot),
      set: vi.fn(async (patch) => {
        snapshot = { ...snapshot, values: { ...snapshot.values, ...patch } }
        return snapshot
      }),
      reset: vi.fn(async () => {
        snapshot = structuredClone(SETTINGS_SNAPSHOT)
        return snapshot
      }),
      onChange: vi.fn((listener) => {
        listeners.settings.push(listener)
        return () => {}
      }),
    },
    onMenuAction: vi.fn((listener) => {
      listeners.menu.push(listener)
      return () => {}
    }),
    showAbout: vi.fn(),
    ...overrides,
  }
  globalThis.window.pdfix = bridge
  return { bridge, listeners }
}
