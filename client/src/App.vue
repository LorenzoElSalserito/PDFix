<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-950">
    <header class="bg-white dark:bg-slate-900 shadow-sm border-b border-gray-200 dark:border-slate-700">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img
            :src="appIcon"
            alt="PDFix"
            data-testid="app-icon"
            class="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg"
          />
          <div class="min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100 tracking-tight leading-tight">
              PDFix
            </h1>
            <p class="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">
              {{ t('app.subtitle') }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <select
            data-testid="language-select"
            class="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 focus:ring-blue-500 focus:border-blue-500"
            :title="t('header.language')"
            :value="language"
            @change="changeLanguage($event.target.value)"
          >
            <option v-for="option in LANGUAGES" :key="option.value" :value="option.value">
              {{ option.short }}
            </option>
          </select>
          <button
            data-testid="about-open"
            class="p-2 text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            :title="t('header.info')"
            @click="openInfo"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
          </button>
          <button
            data-testid="settings-open"
            class="p-2 text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            :title="t('header.settings')"
            @click="openSettings"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.559-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
              />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Uploader :disabled="busy" @choose="chooseFiles" @dropped="addDroppedFiles" />

      <FileList
        v-if="documents.length > 0"
        :documents="documents"
        @update:documents="replace"
        @remove="remove"
        @clear="clear"
      />

      <ActionBar
        v-if="documents.length > 0"
        :operations="operations"
        :documents="documents"
        :pdfa="pdfa"
        :busy="busy"
        :running-operation="runningOperation"
        @update:pdfa="pdfa = $event"
        @run="run"
      />

      <StatusBanner :error="error" :success="success" :progress="progress" />

      <footer class="mt-10 pt-6 border-t border-gray-200 dark:border-slate-700 text-center text-xs text-gray-400 dark:text-slate-500">
        {{ t('app.footer') }}
      </footer>
    </main>

    <InfoDialog
      :open="infoOpen"
      :info="appInfo"
      @close="infoOpen = false"
      @report="reportBug"
      @donate="donate"
    />

    <OperationDialog
      :operation="pendingOperation"
      :files="paths"
      @close="pendingOperation = null"
      @confirm="confirmOperation"
    />

    <SettingsDialog
      :open="settingsOpen"
      :values="settingsValues"
      :fields="settingsFields"
      :sections="settingsSections"
      :features="settingsFeatures"
      :effective-memory-limit-mb="effectiveMemoryLimitMb"
      :diagnostics="diagnostics"
      @close="settingsOpen = false"
      @save="saveSettings"
      @reset="resetSettings"
      @diagnose="runDiagnostics"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import Uploader from './components/Uploader.vue'
import FileList from './components/FileList.vue'
import ActionBar from './components/ActionBar.vue'
import StatusBanner from './components/StatusBanner.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import OperationDialog from './components/OperationDialog.vue'
import InfoDialog from './components/InfoDialog.vue'
import appIcon from './assets/app-icon.png'
import { useBridge } from './composables/useBridge.js'
import { useDocuments } from './composables/useDocuments.js'
import { needsParams, useOperations } from './composables/useOperations.js'
import { useSettings } from './composables/useSettings.js'
import { useTheme } from './composables/useTheme.js'
import { useI18n } from './composables/useI18n.js'
import { LANGUAGES } from './i18n/index.js'

const bridge = useBridge()
const { documents, add, remove, clear, replace, paths } = useDocuments()
const { operations, refresh: refreshOperations } = useOperations()
const {
  values: settingsValues,
  fields: settingsFields,
  sections: settingsSections,
  features: settingsFeatures,
  effectiveMemoryLimitMb,
  load: loadSettings,
  save: storeSettings,
  reset: restoreDefaultSettings,
} = useSettings()
const theme = useTheme()
const { language, t, setLanguage } = useI18n()

const pdfa = ref(false)
const busy = ref(false)
const runningOperation = ref('')
const error = ref('')
const success = ref(null)
const progress = ref(null)
const settingsOpen = ref(false)
const diagnostics = ref(null)
const pendingOperation = ref(null)
const infoOpen = ref(false)
const appInfo = ref(null)

const unsubscribe = []

function resetStatus() {
  error.value = ''
  success.value = null
  progress.value = null
}

/** Riflette nell'interfaccia le preferenze appena lette o salvate. */
function applyPreferences() {
  theme.apply(settingsValues.value?.theme)
  setLanguage(settingsValues.value?.language)
  pdfa.value = Boolean(settingsValues.value?.defaultPdfA)
}

/**
 * Il selettore in intestazione scrive nelle preferenze: la lingua è una
 * impostazione a tutti gli effetti, e vale anche per i dialog di sistema.
 */
async function changeLanguage(value) {
  setLanguage(value)
  // Si invia solo la modifica, non l'intero stato: oltre il confine IPC può
  // viaggiare un oggetto semplice, non il proxy reattivo di Vue.
  await storeSettings({ language: value })
  applyPreferences()
  await refreshOperations()
}

async function openInfo() {
  appInfo.value = await bridge.info()
  infoOpen.value = true
}

function reportBug() {
  return bridge.reportBug()
}

function donate() {
  return bridge.donate()
}

async function chooseFiles() {
  resetStatus()
  try {
    add(await bridge.chooseFiles())
  } catch (cause) {
    error.value = cause.message
  }
}

async function addDroppedFiles(fileList) {
  resetStatus()
  try {
    add(await bridge.describeDroppedFiles(fileList))
  } catch {
    error.value = t('errors.dropped')
  }
}

/**
 * Un'operazione con parametri passa prima dalla sua finestra di configurazione;
 * le altre partono subito.
 */
function run(operation) {
  resetStatus()
  if (needsParams(operation)) {
    pendingOperation.value = operation
    return Promise.resolve()
  }
  return execute(operation, {})
}

function confirmOperation(params) {
  const operation = pendingOperation.value
  pendingOperation.value = null
  return execute(operation, params)
}

async function execute(operation, params) {
  resetStatus()
  busy.value = true
  runningOperation.value = operation.name
  try {
    const result = await bridge.run({
      operation: operation.name,
      files: paths.value,
      pdfa: pdfa.value,
      params,
    })
    if (result?.canceled) return
    if (result?.ok) success.value = result
    else error.value = result?.error || t('errors.generic')
  } catch (cause) {
    error.value = cause.message || t('errors.generic')
  } finally {
    busy.value = false
    runningOperation.value = ''
    progress.value = null
  }
}

async function openSettings() {
  await loadSettings()
  applyPreferences()
  diagnostics.value = null
  settingsOpen.value = true
}

async function saveSettings(values) {
  await storeSettings(values)
  applyPreferences()
  await refreshOperations()
  settingsOpen.value = false
}

async function resetSettings() {
  await restoreDefaultSettings()
  applyPreferences()
  await refreshOperations()
}

async function runDiagnostics() {
  const result = await bridge.diagnostics()
  diagnostics.value = result?.ok ? result : null
  if (!result?.ok) error.value = result?.error || t('errors.diagnostics')
}

function handleMenuAction(action) {
  if (action === 'open-files') chooseFiles()
  else if (action === 'clear-files') clear()
  else if (action === 'settings') openSettings()
  else if (action === 'about') openInfo()
}

/**
 * Scorciatoie da tastiera.
 *
 * Su Windows e Linux la barra dei menu non c'è: senza queste, "apri" e
 * "impostazioni" sarebbero raggiungibili solo col mouse.
 */
function handleKeydown(event) {
  const modifier = event.ctrlKey || event.metaKey
  if (modifier && event.key === 'o') {
    event.preventDefault()
    chooseFiles()
  } else if (modifier && event.key === ',') {
    event.preventDefault()
    openSettings()
  } else if (event.key === 'Escape') {
    if (pendingOperation.value) pendingOperation.value = null
    else if (infoOpen.value) infoOpen.value = false
    else if (settingsOpen.value) settingsOpen.value = false
  }
}

onMounted(async () => {
  await refreshOperations()
  await loadSettings()
  applyPreferences()
  unsubscribe.push(bridge.onProgress((value) => { progress.value = value }))
  unsubscribe.push(bridge.onMenuAction(handleMenuAction))
  unsubscribe.push(
    bridge.settings.onChange(async (values) => {
      if (values?.theme) theme.apply(values.theme)
      if (values?.language) setLanguage(values.language)
      await refreshOperations()
    }),
  )
  globalThis.addEventListener?.('keydown', handleKeydown)
})

onUnmounted(() => {
  for (const dispose of unsubscribe) dispose?.()
  globalThis.removeEventListener?.('keydown', handleKeydown)
})
</script>
