/**
 * Applicazione del tema chiaro/scuro.
 *
 * Tailwind commuta i colori sulla presenza della classe `dark` nell'elemento
 * radice: qui si decide quando metterla. Con il tema «sistema» la scelta segue
 * `prefers-color-scheme` e cambia da sola se l'utente cambia impostazione al
 * sistema operativo mentre PDFix è aperto.
 */

import { onUnmounted, ref } from 'vue'

export const DARK_CLASS = 'dark'

/** Il tema richiesto si traduce in "scuro sì o no"? */
export function isDarkTheme(theme, prefersDark) {
  if (theme === 'scuro') return true
  if (theme === 'chiaro') return false
  return Boolean(prefersDark)
}

export function useTheme() {
  const current = ref('sistema')
  const dark = ref(false)
  const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null

  function paint() {
    dark.value = isDarkTheme(current.value, query?.matches)
    const root = globalThis.document?.documentElement
    if (!root) return
    root.classList.toggle(DARK_CLASS, dark.value)
    // Fa combaciare i controlli nativi (barre di scorrimento, campi) con il tema.
    root.style.colorScheme = dark.value ? 'dark' : 'light'
  }

  function apply(theme) {
    current.value = theme ?? 'sistema'
    paint()
  }

  const onSystemChange = () => {
    if (current.value === 'sistema') paint()
  }

  query?.addEventListener?.('change', onSystemChange)
  onUnmounted(() => query?.removeEventListener?.('change', onSystemChange))

  return { apply, dark, current }
}
