/**
 * Traduzione dell'interfaccia.
 *
 * Nessuna libreria: due dizionari piatti e una funzione. Le chiavi assenti
 * ricadono sull'italiano e, se manca anche quello, sul testo che il processo
 * principale ha già fornito (etichette del catalogo, campi delle impostazioni):
 * una voce nuova nel catalogo compare tradotta se la chiave esiste, altrimenti
 * nella lingua originale — mai vuota.
 */

import it from './it.js'
import en from './en.js'

export const dictionaries = { it, en }

/** Lingue offerte dal selettore. */
export const LANGUAGES = [
  { value: 'it', label: 'Italiano', short: 'IT' },
  { value: 'en', label: 'English', short: 'EN' },
]

export function resolveLanguage(language) {
  return language in dictionaries ? language : 'it'
}

/**
 * @param {string} language
 * @returns {(key: string, fallback?: string) => string}
 */
export function createTranslator(language) {
  const dictionary = dictionaries[resolveLanguage(language)]
  return (key, fallback) => dictionary[key] ?? it[key] ?? fallback ?? key
}
