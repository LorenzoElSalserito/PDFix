<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-800 tracking-tight">
          PDFix
        </h1>
        <span class="text-sm text-gray-500">PDF Merge &amp; PDF/A Converter</span>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 py-8">
      <Uploader @files-added="onFilesAdded" :disabled="processing" />

      <FileList
        v-if="files.length > 0"
        v-model:files="files"
        @remove="removeFile"
      />

      <div v-if="files.length > 0" class="mt-6 space-y-4">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="convertToPdfA"
              class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Converti in PDF/A (conservazione a lungo termine)
          </label>
        </div>

        <div class="flex gap-3">
          <button
            @click="merge"
            :disabled="files.length < 2 || processing"
            class="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="processing" class="flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Elaborazione...
            </span>
            <span v-else>Unisci PDF</span>
          </button>

          <button
            v-if="files.length === 1"
            @click="convertSingle"
            :disabled="!convertToPdfA || processing"
            class="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Converti in PDF/A
          </button>
        </div>
      </div>

      <div
        v-if="error"
        class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
      >
        {{ error }}
      </div>

      <div
        v-if="successMessage"
        class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"
      >
        {{ successMessage }}
      </div>

      <footer class="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
        PDFix &mdash; © Lorenzo DM 2026 &mdash; Licenza AGPLv3 &mdash;
        <a href="https://github.com/LorenzoElSalserito/PDFix" class="underline hover:text-gray-600">Codice Sorgente</a>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'
import Uploader from './components/Uploader.vue'
import FileList from './components/FileList.vue'

const files = ref([])
const convertToPdfA = ref(false)
const processing = ref(false)
const error = ref('')
const successMessage = ref('')

function onFilesAdded(newFiles) {
  const pdfFiles = Array.from(newFiles).filter(
    (f) => f.type === 'application/pdf'
  )
  if (pdfFiles.length === 0) {
    error.value = 'Seleziona solo file PDF.'
    return
  }
  error.value = ''
  successMessage.value = ''
  for (const f of pdfFiles) {
    files.value.push({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      preview: null,
    })
  }
  loadPreviews()
}

function removeFile(id) {
  files.value = files.value.filter((f) => f.id !== id)
}

async function loadPreviews() {
  const { PDFDocument } = await import('pdf-lib')
  for (const entry of files.value) {
    if (entry.preview) continue
    try {
      const buffer = await entry.file.arrayBuffer()
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const page = pdf.getPages()[0]
      if (page) {
        const { width, height } = page.getSize()
        entry.preview = { pages: pdf.getPageCount(), width, height }
      }
    } catch {
      entry.preview = { pages: '?', width: 0, height: 0 }
    }
  }
}

async function merge() {
  if (files.value.length < 2) return
  await sendToBackend('/api/merge')
}

async function convertSingle() {
  if (files.value.length !== 1 || !convertToPdfA.value) return
  await sendToBackend('/api/convert')
}

async function sendToBackend(endpoint) {
  processing.value = true
  error.value = ''
  successMessage.value = ''

  const formData = new FormData()
  files.value.forEach((entry, i) => {
    formData.append(`files[${i}]`, entry.file, entry.name)
  })
  formData.append('pdfa', convertToPdfA.value ? '1' : '0')

  try {
    const response = await axios.post(endpoint, formData, {
      responseType: 'blob',
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    const url = window.URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = convertToPdfA.value ? 'merged_pdfa.pdf' : 'merged.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)

    successMessage.value = 'File generato e scaricato con successo!'
  } catch (err) {
    if (err.response && err.response.data) {
      try {
        const text = await err.response.data.text()
        const json = JSON.parse(text)
        error.value = json.error || 'Errore durante l\'elaborazione.'
      } catch {
        error.value = 'Errore durante l\'elaborazione del file.'
      }
    } else {
      error.value = 'Impossibile contattare il server.'
    }
  } finally {
    processing.value = false
  }
}
</script>
