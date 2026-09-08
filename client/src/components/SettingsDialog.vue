<template>
  <div
    v-if="open"
    data-testid="settings-dialog"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 p-2 sm:p-4 overflow-y-auto"
    @mousedown="armBackdrop"
    @click.self="closeFromBackdrop"
  >
    <div
      class="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[96vh] sm:max-h-[90vh] overflow-y-auto rounded-xl shadow-xl border border-transparent dark:border-slate-700"
    >
      <header
        class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10"
      >
        <h2 class="text-lg font-semibold text-gray-800 dark:text-slate-100">{{ t('settings.title') }}</h2>
        <button
          data-testid="settings-close"
          class="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 rounded"
          :title="t('settings.close')"
          @click="$emit('close')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div v-if="draft" class="px-4 sm:px-6 py-4 sm:py-5 space-y-6 sm:space-y-8">
        <section v-for="section in valueSections" :key="section.id" class="space-y-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            {{ t(`sections.${section.id}`, section.label) }}
          </h3>

          <div v-for="field in fieldsOf(section.id)" :key="field.key" class="space-y-1">
            <label class="flex items-start gap-3" :class="isDisabled(field) ? 'opacity-50' : ''">
              <input
                v-if="field.type === 'boolean'"
                :data-testid="`field-${field.key}`"
                type="checkbox"
                class="mt-1 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                :checked="draft[field.key]"
                :disabled="isDisabled(field)"
                @change="updateField(field, $event.target.checked)"
              />
              <span class="flex-1">
                <span class="text-sm font-medium text-gray-800 dark:text-slate-100">
                  {{ fieldLabel(field) }}
                </span>
                <span v-if="field.help" class="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {{ fieldHelp(field) }}
                </span>
              </span>
            </label>

            <div v-if="field.type === 'number'" class="flex flex-wrap items-center gap-2 sm:gap-3">
              <input
                :data-testid="`field-${field.key}`"
                type="number"
                class="w-36 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-800/50"
                :min="field.min"
                :max="field.max"
                :step="field.step"
                :disabled="isDisabled(field)"
                :value="draft[field.key]"
                @input="updateField(field, Number($event.target.value))"
              />
              <span class="text-xs text-gray-500 dark:text-slate-400">
                {{ field.unit }} · {{ t('settings.range') }} {{ field.min }}–{{ field.max }}
              </span>
            </div>

            <select
              v-if="field.type === 'choice'"
              :data-testid="`field-${field.key}`"
              class="w-48 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
              :disabled="isDisabled(field)"
              :value="draft[field.key]"
              @change="updateField(field, parseChoice(field, $event.target.value))"
            >
              <option v-for="option in field.options" :key="String(option.value)" :value="option.value">
                {{ optionLabel(field, option) }}
              </option>
            </select>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            {{ t('settings.features') }}
          </h3>
          <label v-for="feature in features" :key="feature.name" class="flex items-start gap-3">
            <input
              :data-testid="`feature-${feature.name}`"
              type="checkbox"
              class="mt-1 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              :checked="draft.features[feature.name] !== false"
              @change="updateFeature(feature, $event.target.checked)"
            />
            <span class="flex-1">
              <span class="text-sm font-medium text-gray-800 dark:text-slate-100">
                {{ t(`operations.${feature.name}.label`, feature.label) }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {{ t(`operations.${feature.name}.description`, feature.description) }}
              </span>
            </span>
          </label>
        </section>

        <section class="space-y-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            {{ t('settings.engine') }}
          </h3>
          <p class="text-sm text-gray-700 dark:text-slate-200">
            {{ t('settings.engineLimit') }}
            <span data-testid="settings-effective-memory" class="font-medium">
              {{ formatMemory(effectiveMemoryLimitMb) }}
            </span>
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <button
              data-testid="diagnostics-run"
              class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
              @click="$emit('diagnose')"
            >
              {{ t('settings.measure') }}
            </button>
            <span v-if="diagnostics" data-testid="diagnostics-heap" class="text-sm text-gray-700 dark:text-slate-200">
              {{ t('settings.heap') }} {{ diagnostics.heapLimitMb }} MB · {{ t('settings.memory') }}
              {{ diagnostics.totalMemoryMb }} MB
            </span>
          </div>
        </section>
      </div>

      <footer
        class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-white dark:bg-slate-900"
      >
        <button
          data-testid="settings-reset"
          class="text-sm text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          @click="$emit('reset')"
        >
          {{ t('settings.reset') }}
        </button>
        <div class="flex gap-3 ml-auto">
          <button
            class="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            @click="$emit('close')"
          >
            {{ t('settings.cancel') }}
          </button>
          <button
            data-testid="settings-save"
            class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            @click="$emit('save', serializedDraft())"
          >
            {{ t('settings.save') }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { formatMemory } from '../lib/format.js'
import { useI18n } from '../composables/useI18n.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  values: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  features: { type: Array, default: () => [] },
  effectiveMemoryLimitMb: { type: Number, default: null },
  diagnostics: { type: Object, default: null },
})

const emit = defineEmits(['close', 'save', 'reset', 'diagnose'])

const { t } = useI18n()

// Le etichette dei campi arrivano dal processo principale: la traduzione le
// sostituisce per chiave, con il testo originale come riserva.
const fieldLabel = (field) => t(`settingsFields.${field.key}.label`, field.label)
const fieldHelp = (field) => t(`settingsFields.${field.key}.help`, field.help)
const optionLabel = (field, option) =>
  field.key === 'theme' ? t(`themes.${option.value}`, option.label) : option.label

// Si lavora su una copia: annullare deve lasciare le preferenze intatte.
const draft = ref(null)

watch(
  () => [props.open, props.values],
  () => {
    if (props.open && props.values) draft.value = clone(props.values)
  },
  { immediate: true },
)

const fieldsOf = (sectionId) => props.fields.filter((field) => field.section === sectionId)

// Le sezioni senza campi (per esempio "Funzionalità") sono rese a parte.
const valueSections = computed(() => props.sections.filter((section) => fieldsOf(section.id).length > 0))

/**
 * Aggiorna la copia di lavoro. Sostituire l'oggetto rende esplicito il cambio
 * di stato e garantisce il ridisegno dei campi che dipendono da altri campi.
 */
function updateField(field, value) {
  draft.value = { ...draft.value, [field.key]: value }
}

function updateFeature(feature, enabled) {
  draft.value = { ...draft.value, features: { ...draft.value.features, [feature.name]: enabled } }
}

/** Il valore di un `<select>` è sempre testo: qui torna del tipo dichiarato. */
function parseChoice(field, rawValue) {
  const match = field.options.find((option) => String(option.value) === rawValue)
  return match ? match.value : rawValue
}

function isDisabled(field) {
  const rule = field.disabledWhen
  return Boolean(rule && draft.value?.[rule.key] === rule.equals)
}

// Le preferenze sono per definizione serializzabili: la copia via JSON evita
// di inviare oltre il confine IPC il proxy reattivo di Vue.
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function serializedDraft() {
  return clone(draft.value)
}

/**
 * Lo sfondo chiude la finestra solo se il gesto è cominciato sullo sfondo:
 * un trascinamento — o una selezione di testo — che finisce fuori dal pannello
 * non è la richiesta di chiudere.
 */
const startedOnBackdrop = ref(false)

function armBackdrop(event) {
  startedOnBackdrop.value = event.target === event.currentTarget
}

function closeFromBackdrop() {
  if (startedOnBackdrop.value) emit('close')
}
</script>
