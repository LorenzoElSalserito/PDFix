<template>
  <div
    v-if="open"
    data-testid="info-dialog"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 p-3 sm:p-4"
    @mousedown="armBackdrop"
    @click.self="closeFromBackdrop"
  >
    <div
      class="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl shadow-xl border border-transparent dark:border-slate-700 overflow-hidden"
    >
      <div class="px-6 py-6 flex flex-col items-center text-center gap-3">
        <img :src="icon" alt="" class="w-16 h-16 rounded-lg" />
        <div>
          <h2 class="text-lg font-semibold text-gray-800 dark:text-slate-100">PDFix</h2>
          <p data-testid="info-version" class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            {{ t('info.version') }} {{ info?.version ?? '—' }}
          </p>
        </div>

        <p data-testid="info-author" class="text-sm text-gray-700 dark:text-slate-200">
          {{ t('info.developedBy') }}
        </p>
        <p class="text-xs text-gray-500 dark:text-slate-400">{{ t('info.privacy') }}</p>

        <p v-if="info" class="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
          Electron {{ info.electron }} · Chromium {{ info.chrome }} · Node {{ info.node }}
        </p>
      </div>

      <div class="px-6 pb-6 space-y-2">
        <button
          data-testid="report-bug"
          class="w-full px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
          @click="$emit('report')"
        >
          {{ t('info.reportBug') }}
        </button>
        <p class="text-[11px] text-center text-gray-400 dark:text-slate-500">{{ t('info.reportHint') }}</p>

        <button
          data-testid="donate"
          class="w-full px-4 py-2 text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          @click="$emit('donate')"
        >
          {{ t('info.donate') }}
        </button>
        <p class="text-[11px] text-center text-gray-400 dark:text-slate-500">{{ t('info.donateHint') }}</p>
      </div>

      <footer class="px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
        <button
          data-testid="info-close"
          class="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          @click="$emit('close')"
        >
          {{ t('info.close') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import icon from '../assets/app-icon.png'
import { useI18n } from '../composables/useI18n.js'

defineProps({
  open: { type: Boolean, default: false },
  info: { type: Object, default: null },
})

const emit = defineEmits(['close', 'report', 'donate'])

const { t } = useI18n()

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
