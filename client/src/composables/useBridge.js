/**
 * Accesso all'API esposta dal preload.
 *
 * Fuori da Electron (test unitari dei componenti, anteprima nel browser)
 * `window.pdfix` non esiste: viene restituito un sostituto inerte, così i
 * componenti restano montabili senza condizionali sparsi nel codice.
 */

const inertBridge = {
  chooseFiles: async () => [],
  describeDroppedFiles: async () => [],
  run: async () => ({ ok: false, error: 'Motore non disponibile fuori dall’applicazione.' }),
  diagnostics: async () => ({ ok: false, error: 'Motore non disponibile.' }),
  operations: async () => [],
  info: async () => ({ name: 'PDFix', version: '0.0.0', author: 'Lorenzo De Marco', license: 'AGPL-3.0-or-later' }),
  reportBug: async () => ({ ok: false }),
  donate: async () => ({ ok: false }),
  onProgress: () => () => {},
  settings: {
    get: async () => null,
    set: async () => null,
    reset: async () => null,
    onChange: () => () => {},
  },
  onMenuAction: () => () => {},
  showAbout: () => {},
}

export function useBridge() {
  return globalThis.window?.pdfix ?? inertBridge
}
