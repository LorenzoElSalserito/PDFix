/**
 * Schema delle preferenze.
 *
 * È l'unica descrizione dei campi configurabili: il processo main lo usa per
 * validare e normalizzare i valori, il renderer per generare la finestra delle
 * impostazioni. Aggiungere una preferenza significa aggiungere una voce qui.
 */

import os from 'node:os'
import { OPTIONAL_OPERATIONS } from '../../core/catalog.js'
import { LANGUAGES } from './strings.js'

/** Limiti di memoria accettati per il processo di elaborazione, in MB. */
export const MEMORY_LIMIT_MIN_MB = 512
export const MEMORY_LIMIT_MAX_MB = 65536

/**
 * Limite calcolato quando la modalità automatica è attiva: metà della memoria
 * fisica, con un minimo di 1 GB e un tetto di 16 GB, arrotondata a 256 MB.
 *
 * @param {number} [totalBytes] memoria fisica totale, iniettabile nei test
 */
export function automaticMemoryLimitMb(totalBytes = os.totalmem()) {
  const halfMb = Math.round(totalBytes / 1024 / 1024 / 2)
  const clamped = Math.min(16384, Math.max(1024, halfMb))
  return Math.max(MEMORY_LIMIT_MIN_MB, Math.round(clamped / 256) * 256)
}

/** Fattori di zoom offerti dall'interfaccia, in percentuale. */
export const ZOOM_STEPS = [10, 25, 50, 75, 100, 125, 150]

/** Temi disponibili. `sistema` segue l'impostazione del sistema operativo. */
export const THEMES = ['sistema', 'chiaro', 'scuro']

/** Campi semplici, resi come controlli nella finestra delle preferenze. */
export const SETTINGS_FIELDS = [
  {
    key: 'language',
    type: 'choice',
    section: 'aspetto',
    label: 'Lingua',
    help: 'Lingua dell’interfaccia e delle finestre di sistema.',
    default: LANGUAGES[0],
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
    help: 'La modalità scura inverte i colori dell’interfaccia; «sistema» segue le preferenze del sistema operativo.',
    default: 'sistema',
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
    help: 'Ingrandisce o riduce tutta la finestra: utile su schermi molto piccoli o molto densi.',
    default: 100,
    options: ZOOM_STEPS.map((value) => ({ value, label: `${value}%` })),
  },
  {
    key: 'memoryLimitAuto',
    type: 'boolean',
    section: 'memoria',
    label: 'Calcola automaticamente il limite di memoria',
    help: 'Usa metà della memoria fisica disponibile, fra 1 GB e 16 GB.',
    default: true,
  },
  {
    key: 'memoryLimitMb',
    type: 'number',
    section: 'memoria',
    label: 'Limite di memoria per l’elaborazione',
    unit: 'MB',
    help: 'Heap massimo concesso al processo che unisce e converte i PDF. Documenti molto grandi richiedono valori più alti.',
    default: 4096,
    min: MEMORY_LIMIT_MIN_MB,
    max: MEMORY_LIMIT_MAX_MB,
    step: 256,
    disabledWhen: { key: 'memoryLimitAuto', equals: true },
  },
  {
    key: 'processTimeoutSec',
    type: 'number',
    section: 'memoria',
    label: 'Timeout elaborazione',
    unit: 's',
    help: 'Oltre questo tempo il processo di elaborazione viene interrotto.',
    default: 600,
    min: 30,
    max: 7200,
    step: 30,
  },
  {
    key: 'defaultPdfA',
    type: 'boolean',
    section: 'documenti',
    label: 'Attiva PDF/A per impostazione predefinita',
    help: 'Preseleziona la conversione in PDF/A-1b all’avvio.',
    default: false,
  },
  {
    key: 'rememberLastFolder',
    type: 'boolean',
    section: 'documenti',
    label: 'Ricorda l’ultima cartella usata',
    help: 'Le finestre di apertura e salvataggio ripartono dall’ultimo percorso scelto.',
    default: true,
  },
]

export const SETTINGS_SECTIONS = [
  { id: 'aspetto', label: 'Aspetto' },
  { id: 'memoria', label: 'Memoria ed elaborazione' },
  { id: 'documenti', label: 'Documenti' },
  { id: 'funzionalita', label: 'Funzionalità' },
]

/** Stato predefinito delle funzionalità attivabili. */
export function defaultFeatures() {
  return Object.fromEntries(OPTIONAL_OPERATIONS.map((operation) => [operation.name, true]))
}

export function defaultSettings() {
  const values = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.key, field.default]))
  return { ...values, features: defaultFeatures(), lastFolder: null }
}

function clampNumber(value, field, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(field.max, Math.max(field.min, Math.round(numeric)))
}

/**
 * Riporta un oggetto arbitrario a preferenze valide: valori sconosciuti
 * scartati, numeri fuori scala riportati nell'intervallo, campi mancanti
 * completati con i valori predefiniti.
 *
 * @param {object} input
 * @returns {object} preferenze normalizzate
 */
export function normalizeSettings(input) {
  const defaults = defaultSettings()
  const source = input && typeof input === 'object' ? input : {}
  const result = { ...defaults }

  for (const field of SETTINGS_FIELDS) {
    if (!(field.key in source)) continue
    const value = source[field.key]
    if (field.type === 'boolean') result[field.key] = Boolean(value)
    else if (field.type === 'number') result[field.key] = clampNumber(value, field, defaults[field.key])
    else if (field.type === 'choice') {
      // Un valore fuori elenco viene scartato: l'interfaccia non deve mai
      // ritrovarsi con un tema o uno zoom che non sa rendere.
      const allowed = field.options.map((option) => option.value)
      result[field.key] = allowed.includes(value) ? value : defaults[field.key]
    }
  }

  if (source.features && typeof source.features === 'object') {
    for (const operation of OPTIONAL_OPERATIONS) {
      if (operation.name in source.features) {
        result.features[operation.name] = Boolean(source.features[operation.name])
      }
    }
  }

  if (typeof source.lastFolder === 'string' && source.lastFolder.trim() !== '') {
    result.lastFolder = source.lastFolder
  }

  return result
}

/** Fattore di zoom da passare a Electron (1 = 100%). */
export function zoomFactorOf(settings) {
  const percent = Number(settings?.zoomPercent)
  return ZOOM_STEPS.includes(percent) ? percent / 100 : 1
}

/**
 * Limite di memoria effettivo in MB, tenuto conto della modalità automatica.
 *
 * @param {object} settings preferenze già normalizzate
 * @param {number} [totalBytes]
 */
export function effectiveMemoryLimitMb(settings, totalBytes = os.totalmem()) {
  return settings.memoryLimitAuto ? automaticMemoryLimitMb(totalBytes) : settings.memoryLimitMb
}
