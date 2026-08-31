<template>
  <div class="mt-6 space-y-4" data-testid="action-bar">
    <label
      v-if="showPdfAToggle"
      class="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200 cursor-pointer w-fit"
    >
      <input
        data-testid="pdfa-toggle"
        type="checkbox"
        :checked="pdfa"
        class="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
        @change="$emit('update:pdfa', $event.target.checked)"
      />
      {{ t('actions.pdfa') }}
    </label>

    <div class="flex flex-wrap gap-3">
      <button
        v-for="operation in operations"
        :key="operation.name"
        :data-testid="`action-${operation.name}`"
        :disabled="busy || !isRunnable(operation, documents)"
        :title="unavailableReason(operation, documents) || describe(operation)"
        :class="[
          'px-4 sm:px-6 py-2.5 font-medium rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          operation.forcesPdfA ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700',
        ]"
        @click="$emit('run', operation)"
      >
        <span v-if="busy && runningOperation === operation.name" class="flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ t('actions.processing') }}
        </span>
        <span v-else>{{ label(operation) }}</span>
      </button>
    </div>

    <p v-if="operations.length === 0" class="text-sm text-amber-700 dark:text-amber-400" data-testid="no-operations">
      {{ t('actions.none') }}
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { isRunnable, unavailableReason } from '../composables/useOperations.js'
import { useI18n } from '../composables/useI18n.js'

const props = defineProps({
  operations: { type: Array, required: true },
  documents: { type: Array, required: true },
  pdfa: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  runningOperation: { type: String, default: '' },
})

defineEmits(['run', 'update:pdfa'])

const { t } = useI18n()

// Le etichette arrivano dal catalogo in italiano: la traduzione le sostituisce
// quando esiste, altrimenti resta il testo originale.
const label = (operation) => t(`operations.${operation.name}.label`, operation.label)
const describe = (operation) => t(`operations.${operation.name}.description`, operation.description)

// L'interruttore PDF/A ha senso solo se almeno un'operazione disponibile lo
// tratta come opzione, non come comportamento obbligatorio.
const showPdfAToggle = computed(() =>
  props.operations.some((operation) => operation.supportsPdfA && !operation.forcesPdfA),
)
</script>
