<template>
  <div class="mt-6">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">
      File caricati ({{ files.length }})
    </h2>
    <draggable
      :list="files"
      item-key="id"
      handle=".drag-handle"
      ghost-class="opacity-30"
      animation="200"
      @update:modelValue="$emit('update:files', $event)"
    >
      <template #item="{ element, index }">
        <div
          class="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 mb-2 shadow-sm hover:shadow transition-shadow"
        >
          <div class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </div>

          <div class="flex-shrink-0 w-8 h-8 bg-red-50 rounded flex items-center justify-center">
            <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clip-rule="evenodd"
              />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">
              {{ index + 1 }}. {{ element.name }}
            </p>
            <p class="text-xs text-gray-400">
              {{ formatSize(element.size) }}
              <span v-if="element.preview">
                &mdash; {{ element.preview.pages }} pagin{{ element.preview.pages === 1 ? 'a' : 'e' }}
              </span>
            </p>
          </div>

          <button
            @click="$emit('remove', element.id)"
            class="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Rimuovi"
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

defineProps({
  files: { type: Array, required: true },
})

defineEmits(['update:files', 'remove'])

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>
