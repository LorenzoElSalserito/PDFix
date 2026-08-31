/**
 * Preferenze lato renderer.
 *
 * Lo schema arriva dal processo principale: la finestra delle impostazioni è
 * generata, non scritta a mano campo per campo.
 */

import { ref } from 'vue'
import { useBridge } from './useBridge.js'

export function useSettings() {
  const bridge = useBridge()
  const values = ref(null)
  const fields = ref([])
  const sections = ref([])
  const features = ref([])
  const effectiveMemoryLimitMb = ref(null)

  function apply(snapshot) {
    if (!snapshot) return null
    values.value = snapshot.values
    fields.value = snapshot.fields
    sections.value = snapshot.sections
    features.value = snapshot.features
    effectiveMemoryLimitMb.value = snapshot.effectiveMemoryLimitMb
    return snapshot
  }

  const load = async () => apply(await bridge.settings.get())
  const save = async (patch) => apply(await bridge.settings.set(patch))
  const reset = async () => apply(await bridge.settings.reset())

  /** Attiva o disattiva una funzionalità opzionale. */
  const setFeature = async (name, enabled) =>
    save({ features: { ...(values.value?.features ?? {}), [name]: enabled } })

  return { values, fields, sections, features, effectiveMemoryLimitMb, load, save, reset, setFeature }
}
