<template>
  <div class="mt-6" data-testid="file-list">
    <div class="flex items-baseline justify-between mb-3">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-slate-200">
        {{ t('files.title') }} ({{ documents.length }})
      </h2>
      <button
        v-if="documents.length"
        data-testid="clear-files"
        class="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        @click="$emit('clear')"
      >
        {{ t('files.clear') }}
      </button>
    </div>

    <draggable
      :list="documents"
      item-key="id"
      handle=".drag-handle"
      ghost-class="opacity-30"
      animation="200"
      @update:modelValue="$emit('update:documents', $event)"
    >
      <template #item="{ element, index }">
        <div
          data-testid="file-item"
          class="flex items-center gap-2 sm:gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 sm:px-4 py-3 mb-2 shadow-sm hover:shadow transition-shadow"
        >
          <div class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
            :title="t('files.drag')"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </div>

          <div class="hidden sm:flex flex-shrink-0 w-8 h-8 bg-red-50 dark:bg-red-950/50 rounded items-center justify-center">
            <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clip-rule="evenodd"
              />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <p data-testid="file-name" class="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
              {{ index + 1 }}. {{ element.name }}
            </p>
            <p class="text-xs text-gray-400 dark:text-slate-500">{{ formatSize(element.size) }}</p>
          </div>

          <button
            data-testid="remove-file"
            class="flex-shrink-0 p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
            :title="t('files.remove')"
            @click="$emit('remove', element.id)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup>
import draggable from 'vuedraggable'
import { formatSize } from '../lib/format.js'
import { useI18n } from '../composables/useI18n.js'

defineProps({
  documents: { type: Array, required: true },
})

defineEmits(['update:documents', 'remove', 'clear'])

const { t } = useI18n()
</script>
