<template>
  <div
    :class="[
      'border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer',
      dragging
        ? 'border-blue-500 bg-blue-50'
        : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50',
      disabled ? 'opacity-50 pointer-events-none' : '',
    ]"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="openFileDialog"
  >
    <svg
      class="mx-auto h-12 w-12 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
      />
    </svg>
    <p class="mt-3 text-sm text-gray-600">
      <span class="font-semibold text-blue-600">Clicca per caricare</span>
      oppure trascina qui i tuoi PDF
    </p>
    <p class="mt-1 text-xs text-gray-400">Solo file .pdf</p>

    <input
      ref="fileInput"
      type="file"
      accept="application/pdf"
      multiple
      class="hidden"
      @change="onFileSelect"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['files-added'])
const fileInput = ref(null)
const dragging = ref(false)

function openFileDialog() {
  fileInput.value?.click()
}

function onDrop(event) {
  dragging.value = false
  const dt = event.dataTransfer
  if (dt?.files?.length) {
    emit('files-added', dt.files)
  }
}

function onFileSelect(event) {
  if (event.target.files?.length) {
    emit('files-added', event.target.files)
    event.target.value = ''
  }
}
</script>
