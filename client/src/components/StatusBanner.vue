<template>
  <div class="mt-4 space-y-3">
    <div
      v-if="progress"
      data-testid="status-progress"
      class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-800 dark:text-blue-200 text-sm"
    >
      {{ t('status.progressLabel') }} {{ progress.index + 1 }} {{ t('status.progressOf') }}
      {{ progress.total }} — {{ progress.pages }} {{ t('status.progressPages') }}
    </div>

    <div
      v-if="error"
      data-testid="status-error"
      class="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm break-words"
    >
      {{ error }}
    </div>

    <div
      v-if="success"
      data-testid="status-success"
      class="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg text-green-800 dark:text-green-200 text-sm break-words"
    >
      <p class="font-medium">
        {{ success.outputs ? t('status.savedIn') : t('status.saved') }} {{ success.output }}
      </p>
      <p class="text-green-700/80 dark:text-green-300/80 text-xs mt-1">
        {{ success.pages }} {{ t('status.pages') }} · {{ formatSize(success.bytes) }}
        <span v-if="success.pdfa"> · PDF/A-1b</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { formatSize } from '../lib/format.js'
import { useI18n } from '../composables/useI18n.js'

const { t } = useI18n()

defineProps({
  error: { type: String, default: '' },
  success: { type: Object, default: null },
  progress: { type: Object, default: null },
})
</script>
