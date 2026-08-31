/**
 * Lingua corrente dell'interfaccia.
 *
 * È uno stato di modulo, non di componente: tutti i componenti leggono la
 * stessa lingua e si ridisegnano insieme quando cambia.
 */

import { computed, ref } from 'vue'
import { createTranslator, resolveLanguage } from '../i18n/index.js'

const language = ref('it')

export function useI18n() {
  const translator = computed(() => createTranslator(language.value))

  /**
   * @param {string} key chiave del dizionario
   * @param {string} [fallback] testo da usare se la chiave non esiste
   */
  const t = (key, fallback) => translator.value(key, fallback)

  const setLanguage = (value) => {
    language.value = resolveLanguage(value)
  }

  return { language, t, setLanguage }
}
