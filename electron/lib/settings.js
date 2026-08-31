/**
 * Persistenza delle preferenze su file JSON.
 *
 * La scrittura è atomica (file temporaneo + rename): un'interruzione non lascia
 * mai un file di configurazione troncato. Un file corrotto o illeggibile non è
 * un errore fatale: si riparte dai valori predefiniti.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defaultSettings, effectiveMemoryLimitMb, normalizeSettings } from './settings-schema.js'

/**
 * @param {{filePath: string}} options percorso del file di configurazione
 */
export function createSettingsStore({ filePath }) {
  const listeners = new Set()
  let current = load()

  function load() {
    try {
      return normalizeSettings(JSON.parse(readFileSync(filePath, 'utf8')))
    } catch {
      return defaultSettings()
    }
  }

  function persist(next) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(temporary, filePath)
  }

  function commit(next) {
    const previous = current
    current = next
    persist(current)
    for (const listener of listeners) listener(current, previous)
    return current
  }

  return {
    filePath,

    /** Copia delle preferenze correnti. */
    all() {
      return structuredClone(current)
    },

    get(key) {
      return structuredClone(current)[key]
    },

    /** Applica un insieme parziale di modifiche, normalizzandolo. */
    set(patch) {
      return commit(normalizeSettings({ ...current, ...patch }))
    },

    /** Riporta tutte le preferenze ai valori predefiniti. */
    reset() {
      return commit(defaultSettings())
    },

    /** Limite di memoria realmente applicato al processo di elaborazione. */
    memoryLimitMb() {
      return effectiveMemoryLimitMb(current)
    },

    /** Una funzionalità opzionale è attiva? */
    isFeatureEnabled(name) {
      return current.features[name] !== false
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
