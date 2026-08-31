<template>
  <div
    v-if="operation"
    data-testid="operation-dialog"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 p-2 sm:p-4 overflow-y-auto"
    @click.self="$emit('close')"
  >
    <div
      class="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[96vh] sm:max-h-[90vh] overflow-y-auto rounded-xl shadow-xl border border-transparent dark:border-slate-700"
    >
      <header class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-slate-100">{{ operationLabel }}</h2>
        <p class="text-xs text-gray-500 dark:text-slate-400 mt-1">{{ operationDescription }}</p>
      </header>

      <div class="px-4 sm:px-6 py-4 space-y-4">
        <div v-for="param in visibleParams" :key="param.key" class="space-y-1">
          <label
            class="block text-sm font-medium text-gray-800 dark:text-slate-100"
            :for="`param-${param.key}`"
          >
            {{ paramLabel(param) }}
          </label>

          <input
            v-if="param.type === 'text'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            type="text"
            class="w-full px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
            :placeholder="param.placeholder"
            :value="values[param.key]"
            @input="update(param, $event.target.value)"
          />

          <input
            v-else-if="param.type === 'number'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            type="number"
            class="w-40 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
            :min="param.min"
            :max="param.max"
            :step="param.step"
            :value="values[param.key]"
            @input="update(param, Number($event.target.value))"
          />

          <select
            v-else-if="param.type === 'choice'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            class="w-full sm:w-64 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
            :value="values[param.key]"
            @change="update(param, parseChoice(param, $event.target.value))"
          >
            <option v-for="option in param.options" :key="String(option.value)" :value="option.value">
              {{ option.label }}
            </option>
          </select>

          <label v-else-if="param.type === 'boolean'" class="flex items-center gap-2">
            <input
              :id="`param-${param.key}`"
              :data-testid="`param-${param.key}`"
              type="checkbox"
              class="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              :checked="values[param.key]"
              @change="update(param, $event.target.checked)"
            />
            <span class="text-sm text-gray-700 dark:text-slate-300">
              {{ paramHelp(param) || paramLabel(param) }}
            </span>
          </label>

          <p v-if="param.help && param.type !== 'boolean'" class="text-xs text-gray-500 dark:text-slate-400">
            {{ paramHelp(param) }}
          </p>
        </div>
      </div>

      <footer
        class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3"
      >
        <button
          data-testid="operation-cancel"
          class="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          @click="$emit('close')"
        >
          {{ t('operation.cancel') }}
        </button>
        <button
          data-testid="operation-confirm"
          class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          @click="$emit('confirm', { ...values })"
        >
          {{ operationLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { isParamVisible } from '../lib/params.js'
import { useI18n } from '../composables/useI18n.js'

const props = defineProps({
  operation: { type: Object, default: null },
})

defineEmits(['close', 'confirm'])

const { t } = useI18n()

const operationLabel = computed(() =>
  props.operation ? t(`operations.${props.operation.name}.label`, props.operation.label) : '',
)
const operationDescription = computed(() =>
  props.operation ? t(`operations.${props.operation.name}.description`, props.operation.description) : '',
)

/**
 * I parametri condivisi fra più operazioni (la selezione di pagine) hanno una
 * chiave generica; quelli specifici una chiave con il nome dell'operazione.
 */
const paramLabel = (param) =>
  t(`params.${props.operation?.name}.${param.key}.label`, t(`params.${param.key}.label`, param.label))
const paramHelp = (param) =>
  t(`params.${props.operation?.name}.${param.key}.help`, t(`params.${param.key}.help`, param.help))

const values = ref({})

// Ogni apertura riparte dai valori predefiniti dichiarati nel catalogo: un
// intervallo di pagine scritto per un altro documento non deve sopravvivere.
watch(
  () => props.operation,
  (operation) => {
    values.value = Object.fromEntries((operation?.params ?? []).map((param) => [param.key, param.default]))
  },
  { immediate: true },
)

const visibleParams = computed(() =>
  (props.operation?.params ?? []).filter((param) => isParamVisible(param, values.value)),
)

function update(param, value) {
  values.value = { ...values.value, [param.key]: value }
}

/** Il valore di un `<select>` è sempre testo: qui torna del tipo dichiarato. */
function parseChoice(param, rawValue) {
  const match = param.options.find((option) => String(option.value) === rawValue)
  return match ? match.value : rawValue
}
</script>
