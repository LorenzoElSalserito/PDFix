<template>
  <section class="mt-8" data-testid="action-bar">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <nav class="flex flex-wrap items-center gap-1" data-testid="action-groups" :aria-label="t('actions.title')">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :data-testid="`action-group-${tab.id}`"
          :aria-pressed="tab.id === active ? 'true' : 'false'"
          :class="[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            tab.id === active
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-800 dark:hover:text-slate-100',
          ]"
          @click="active = tab.id"
        >
          {{ tab.label }}
          <span :class="['tabular-nums', tab.id === active ? 'opacity-60' : 'opacity-50']">{{ tab.count }}</span>
        </button>
      </nav>

      <label
        v-if="showPdfAToggle"
        data-testid="pdfa-field"
        :title="t('actions.pdfa')"
        :class="[
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors',
          pdfa
            ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
            : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600',
        ]"
      >
        <input
          data-testid="pdfa-toggle"
          type="checkbox"
          :checked="pdfa"
          class="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
          @change="$emit('update:pdfa', $event.target.checked)"
        />
        {{ t('actions.pdfaShort') }}
      </label>
    </div>

    <div v-if="visible.length > 0" data-testid="action-grid" class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="operation in visible"
        :key="operation.name"
        type="button"
        :data-testid="`action-${operation.name}`"
        :data-group="groupOf(operation)"
        :disabled="busy || !isRunnable(operation, documents)"
        :title="unavailableReason(operation, documents) || describe(operation)"
        :class="[
          'relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
          'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700',
          'enabled:shadow-sm disabled:opacity-45 disabled:cursor-not-allowed',
          'enabled:hover:border-blue-400 dark:enabled:hover:border-blue-500 enabled:hover:bg-blue-50/60 dark:enabled:hover:bg-slate-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950',
          running(operation) ? 'border-blue-500 dark:border-blue-500 bg-blue-50/60 dark:bg-slate-800' : '',
        ]"
        @click="$emit('run', operation)"
      >
        <span
          :class="[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            operation.forcesPdfA
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
              : 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400',
          ]"
          aria-hidden="true"
        >
          <svg v-if="running(operation)" class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
            <path stroke-linecap="round" stroke-linejoin="round" :d="icon(operation)" />
          </svg>
        </span>

        <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-slate-100">
          {{ running(operation) ? t('actions.processing') : label(operation) }}
        </span>

        <span
          v-if="operation.forcesPdfA"
          class="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
          :title="t('actions.pdfaAlways')"
        ></span>
      </button>
    </div>

    <p v-if="operations.length === 0" class="mt-4 text-sm text-amber-700 dark:text-amber-400" data-testid="no-operations">
      {{ t('actions.none') }}
    </p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { isRunnable, unavailableReason } from '../composables/useOperations.js'
import { GROUP_ICONS, groupOf, groupsPresentIn } from '../lib/groups.js'
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

/** Scheda selezionata: `all` mostra l'intero catalogo attivo. */
const ALL = 'all'
const active = ref(ALL)

// Le etichette arrivano dal catalogo in italiano: la traduzione le sostituisce
// quando esiste, altrimenti resta il testo originale.
const label = (operation) => t(`operations.${operation.name}.label`, operation.label)
const describe = (operation) => t(`operations.${operation.name}.description`, operation.description)
const icon = (operation) => GROUP_ICONS[groupOf(operation)]
const running = (operation) => props.busy && props.runningOperation === operation.name

const groups = computed(() => groupsPresentIn(props.operations))

const tabs = computed(() => [
  { id: ALL, label: t('groups.all'), count: props.operations.length },
  ...groups.value.map((group) => ({
    id: group.id,
    label: t(`groups.${group.id}`, group.id),
    count: group.count,
  })),
])

const visible = computed(() =>
  active.value === ALL
    ? props.operations
    : props.operations.filter((operation) => groupOf(operation) === active.value),
)

// Disattivare le funzionalità di un gruppo dalle preferenze può far sparire la
// scheda aperta: senza questo, la pulsantiera resterebbe vuota senza spiegarsi.
watch(groups, (available) => {
  if (active.value !== ALL && !available.some((group) => group.id === active.value)) active.value = ALL
})

// L'interruttore PDF/A ha senso solo se almeno un'operazione disponibile lo
// tratta come opzione, non come comportamento obbligatorio.
const showPdfAToggle = computed(() =>
  props.operations.some((operation) => operation.supportsPdfA && !operation.forcesPdfA),
)
</script>
