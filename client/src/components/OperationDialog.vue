<template>
  <div
    v-if="operation"
    data-testid="operation-dialog"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 p-2 sm:p-4 overflow-y-auto"
    @click.self="$emit('close')"
  >
    <div
      :class="[
        'bg-white dark:bg-slate-900 w-full max-h-[96vh] sm:max-h-[90vh] overflow-y-auto rounded-xl shadow-xl border border-transparent dark:border-slate-700',
        hasPlacement ? 'max-w-2xl' : 'max-w-lg',
      ]"
    >
      <header class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-slate-100">{{ operationLabel }}</h2>
        <p class="text-xs text-gray-500 dark:text-slate-400 mt-1">{{ operationDescription }}</p>
      </header>

      <div class="px-4 sm:px-6 py-4 space-y-4">
        <p
          v-if="inspecting"
          data-testid="operation-inspecting"
          class="text-sm text-gray-500 dark:text-slate-400"
        >
          {{ t('operation.inspecting') }}
        </p>
        <p
          v-else-if="inspectError"
          data-testid="operation-inspect-error"
          class="text-sm text-red-600 dark:text-red-400"
        >
          {{ inspectError }}
        </p>

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
            v-else-if="param.type === 'password'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            type="password"
            autocomplete="new-password"
            class="w-full sm:w-80 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
            :placeholder="param.placeholder"
            :value="values[param.key]"
            @input="update(param, $event.target.value)"
          />

          <textarea
            v-else-if="param.type === 'textarea'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            rows="5"
            class="w-full px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-mono bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:ring-blue-500 focus:border-blue-500"
            :placeholder="param.placeholder"
            :value="values[param.key]"
            @input="update(param, $event.target.value)"
          ></textarea>

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
              {{ optionLabel(param, option) }}
            </option>
          </select>

          <div v-else-if="param.type === 'file'" class="flex items-center gap-3">
            <button
              :id="`param-${param.key}`"
              :data-testid="`param-${param.key}`"
              type="button"
              class="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              @click="pickFile(param)"
            >
              {{ t('operation.browse') }}
            </button>
            <span
              :data-testid="`param-${param.key}-value`"
              class="text-sm text-gray-600 dark:text-slate-300 truncate"
            >
              {{ fileName(values[param.key]) || t('operation.noFile') }}
            </span>
          </div>

          <SignaturePlacer
            v-else-if="param.type === 'placement'"
            :id="`param-${param.key}`"
            :data-testid="`param-${param.key}`"
            :model-value="values[param.key]"
            :document-path="files[0] ?? ''"
            :image-path="values.image ?? ''"
            @update:model-value="update(param, $event)"
          />

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
          @click="$emit('confirm', plainValues())"
        >
          {{ operationLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, toRaw, watch } from 'vue'
import SignaturePlacer from './SignaturePlacer.vue'
import { isParamVisible } from '../lib/params.js'
import { useBridge } from '../composables/useBridge.js'
import { useI18n } from '../composables/useI18n.js'

const props = defineProps({
  operation: { type: Object, default: null },
  // Servono alle operazioni i cui parametri dipendono dal documento scelto.
  files: { type: Array, default: () => [] },
})

defineEmits(['close', 'confirm'])

const { t } = useI18n()
const bridge = useBridge()

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

/** Anche le voci di un elenco a discesa sono testo dell'interfaccia: si traducono. */
const optionLabel = (param, option) =>
  t(
    `params.${props.operation?.name}.${param.key}.options.${option.value}`,
    t(`params.${param.key}.options.${option.value}`, option.label),
  )

const values = ref({})

/** Parametri che non stanno nel catalogo perché dipendono dal documento. */
const dynamicParams = ref([])
const inspecting = ref(false)
const inspectError = ref('')

const defaultsOf = (params) =>
  Object.fromEntries((params ?? []).map((param) => [param.key, param.default]))

// Ogni apertura riparte dai valori predefiniti dichiarati nel catalogo: un
// intervallo di pagine scritto per un altro documento non deve sopravvivere.
// Se l'operazione lo dichiara, ai parametri fissi si aggiungono quelli letti
// dal documento — i campi di un modulo, per esempio.
watch(
  () => props.operation,
  async (operation) => {
    values.value = defaultsOf(operation?.params)
    dynamicParams.value = []
    inspectError.value = ''
    if (!operation?.inspect) return

    inspecting.value = true
    try {
      const result = await bridge.inspect({ operation: operation.name, files: [...props.files] })
      if (props.operation !== operation) return // finestra già cambiata
      if (result?.ok) {
        dynamicParams.value = result.params ?? []
        values.value = { ...values.value, ...defaultsOf(result.params) }
      } else {
        inspectError.value = result?.error || t('operation.inspectFailed')
      }
    } finally {
      inspecting.value = false
    }
  },
  { immediate: true },
)

const allParams = computed(() => [...(props.operation?.params ?? []), ...dynamicParams.value])

/** L'anteprima di una pagina vuole più larghezza del resto dei parametri. */
const hasPlacement = computed(() => allParams.value.some((param) => param.type === 'placement'))

const visibleParams = computed(() =>
  allParams.value.filter((param) => isParamVisible(param, values.value)),
)

/** Solo il nome del file scelto: il percorso intero non entra nella finestra. */
const fileName = (filePath) => (filePath ? String(filePath).split(/[\\/]/).pop() : '')

async function pickFile(param) {
  // L'elenco delle estensioni arriva da un descrittore reattivo: oltre il
  // confine IPC può viaggiare solo un array semplice, non il proxy di Vue.
  const chosen = await bridge.chooseFile([...(param.accept ?? [])])
  if (chosen) update(param, chosen)
}

function update(param, value) {
  values.value = { ...values.value, [param.key]: value }
}

/**
 * Valori pronti per il confine IPC.
 *
 * Oltre quel confine passa solo un oggetto semplice, e la reattività di Vue
 * avvolge anche gli oggetti annidati: il piazzamento della firma arriverebbe
 * come proxy e la chiamata fallirebbe con «An object could not be cloned».
 * `toRaw` scopre un solo livello, quindi la copia è profonda.
 */
function plainValues() {
  return JSON.parse(JSON.stringify(toRaw(values.value)))
}

/** Il valore di un `<select>` è sempre testo: qui torna del tipo dichiarato. */
function parseChoice(param, rawValue) {
  const match = param.options.find((option) => String(option.value) === rawValue)
  return match ? match.value : rawValue
}
</script>
