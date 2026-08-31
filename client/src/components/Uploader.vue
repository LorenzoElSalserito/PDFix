<template>
  <div
    data-testid="uploader"
    :class="[
      'border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-colors cursor-pointer select-none',
      dragging
        ? 'border-blue-500 bg-blue-50 dark:bg-slate-800'
        : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-slate-800',
      disabled ? 'opacity-50 pointer-events-none' : '',
    ]"
    @dragover.prevent="setDragging(true)"
    @dragleave.prevent="setDragging(false)"
    @drop.prevent="onDrop"
    @click="emit('choose')"
  >
    <svg class="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
      />
    </svg>
    <p class="mt-3 text-sm text-gray-600 dark:text-slate-300">
      <span class="font-semibold text-blue-600 dark:text-blue-400">{{ t('uploader.action') }}</span>
      {{ t('uploader.or') }}
    </p>
    <p class="mt-1 text-xs text-gray-400 dark:text-slate-500">{{ t('uploader.hint') }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '../composables/useI18n.js'

defineProps({
  disabled: { type: Boolean, default: false },
})

const { t } = useI18n()
const emit = defineEmits(['choose', 'dropped'])
const dragging = ref(false)

function setDragging(value) {
  dragging.value = value
}

function onDrop(event) {
  setDragging(false)
  const dropped = event.dataTransfer?.files
  if (dropped?.length) emit('dropped', dropped)
}
</script>
