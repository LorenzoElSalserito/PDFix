<template>
  <div class="space-y-2" data-testid="signature-placer">
    <p
      v-if="!imagePath"
      data-testid="signature-needs-image"
      class="text-sm text-gray-500 dark:text-slate-400"
    >
      {{ t('placer.chooseImage') }}
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <button
            type="button"
            data-testid="signature-page-previous"
            class="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
          >
            ‹
          </button>
          <span data-testid="signature-page-label" class="text-xs text-gray-600 dark:text-slate-300 tabular-nums">
            {{ t('placer.page') }} {{ page }} {{ t('placer.of') }} {{ pageCount }}
          </span>
          <button
            type="button"
            data-testid="signature-page-next"
            class="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800"
            :disabled="page >= pageCount"
            @click="goToPage(page + 1)"
          >
            ›
          </button>
        </div>
        <span data-testid="signature-size" class="text-xs text-gray-400 dark:text-slate-500 tabular-nums">
          {{ Math.round(modelValue.width * 100) }}%
        </span>
      </div>

      <!-- Il foglio. L'immagine della pagina, quando c'è, e sopra la firma. -->
      <div
        ref="stage"
        data-testid="signature-stage"
        class="relative mx-auto select-none overflow-hidden rounded-lg border border-gray-300 dark:border-slate-600 bg-white"
        :style="{ aspectRatio: `${pageAspect}`, height: '46vh', width: 'auto', maxWidth: '100%' }"
      >
        <img
          v-if="pageImage"
          data-testid="signature-page-image"
          :src="pageImage"
          alt=""
          class="absolute inset-0 h-full w-full object-contain"
          draggable="false"
        />
        <p
          v-else
          data-testid="signature-page-fallback"
          class="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-gray-400 dark:text-slate-500"
        >
          {{ loading ? t('placer.loading') : previewError }}
        </p>

        <div
          data-testid="signature-overlay"
          tabindex="0"
          role="application"
          :aria-label="t('placer.hint')"
          class="absolute cursor-move rounded border border-blue-500/70 bg-blue-500/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          :style="overlayStyle"
          @pointerdown="startDrag"
          @keydown="nudge"
        >
          <img :src="signatureUrl" alt="" class="pointer-events-none h-full w-full object-fill" draggable="false" />
          <span
            data-testid="signature-resize"
            class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border border-white bg-blue-600"
            @pointerdown.stop="startResize"
          ></span>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBridge } from '../composables/useBridge.js'
import { useI18n } from '../composables/useI18n.js'
import { imageRatio, openDocument } from '../lib/preview.js'

const props = defineProps({
  // { page, x, y, width }: frazioni della pagina, origine in alto a sinistra.
  modelValue: { type: Object, required: true },
  documentPath: { type: String, default: '' },
  imagePath: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const bridge = useBridge()

/** Larghezza minima della firma: sotto, il riquadro non si prende più. */
const MIN_WIDTH = 0.03

const stage = ref(null)
const pageImage = ref('')
const pageAspect = ref(210 / 297)
const pageCount = ref(1)
const loading = ref(false)
const previewError = ref('')
const signatureUrl = ref('')
const signatureRatio = ref(0.4)

let document = null
let objectUrl = null

const page = computed(() => props.modelValue?.page ?? 1)

/**
 * Altezza della firma in frazione dell'altezza della pagina.
 *
 * La larghezza è una frazione della larghezza del foglio; l'altezza in punti
 * discende dal rapporto dell'immagine, e per tornare a essere una frazione va
 * divisa per l'altezza del foglio — cioè moltiplicata per il suo rapporto.
 * Senza questo passaggio la firma comparirebbe stirata in verticale.
 */
const heightFraction = computed(() => heightOf(props.modelValue))

const overlayStyle = computed(() => ({
  left: `${props.modelValue.x * 100}%`,
  top: `${props.modelValue.y * 100}%`,
  width: `${props.modelValue.width * 100}%`,
  height: `${heightFraction.value * 100}%`,
}))

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/** Altezza in frazione di pagina di un piazzamento qualsiasi. */
const heightOf = (placement) => placement.width * signatureRatio.value * pageAspect.value

/**
 * Applica una modifica al piazzamento, in una sola emissione.
 *
 * Le proprietà arrivano dal padre e si aggiornano al ciclo successivo: due
 * emissioni nello stesso gesto — prima la larghezza, poi la posizione — si
 * calcolerebbero entrambe sul valore vecchio, e la seconda cancellerebbe la
 * prima. Qui si compone il valore completo e lo si riporta dentro il foglio.
 */
function update(patch) {
  const next = { ...props.modelValue, ...patch }
  next.width = clamp(next.width, MIN_WIDTH, 1)
  next.x = clamp(next.x, 0, 1 - next.width)
  next.y = clamp(next.y, 0, Math.max(0, 1 - heightOf(next)))
  emit('update:modelValue', next)
}

/** Sposta la firma restando dentro il foglio. */
function moveTo(x, y) {
  update({ x, y })
}

function goToPage(number) {
  const target = clamp(number, 1, pageCount.value)
  update({ page: target })
  renderPage(target)
}

// --------------------------------------------------------- trascinamento ----

function stageRect() {
  return stage.value?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 }
}

function startDrag(event) {
  const rect = stageRect()
  const origin = { x: props.modelValue.x, y: props.modelValue.y, pointerX: event.clientX, pointerY: event.clientY }
  event.currentTarget.focus?.()

  const onMove = (move) => {
    moveTo(
      origin.x + (move.clientX - origin.pointerX) / rect.width,
      origin.y + (move.clientY - origin.pointerY) / rect.height,
    )
  }
  listenWhileDragging(onMove)
}

function startResize(event) {
  const rect = stageRect()
  const left = rect.left + props.modelValue.x * rect.width

  // Ingrandendo, il riquadro può sbordare: `update` lo riporta dentro insieme
  // alla nuova larghezza, in un colpo solo.
  const onMove = (move) => update({ width: (move.clientX - left) / rect.width })
  listenWhileDragging(onMove)
}

/** Ascolta il puntatore fino al rilascio, ovunque finisca. */
function listenWhileDragging(onMove) {
  const stop = () => {
    globalThis.removeEventListener('pointermove', onMove)
    globalThis.removeEventListener('pointerup', stop)
    globalThis.removeEventListener('pointercancel', stop)
  }
  globalThis.addEventListener('pointermove', onMove)
  globalThis.addEventListener('pointerup', stop)
  globalThis.addEventListener('pointercancel', stop)
}

/** Le frecce spostano di poco, con Maiusc di parecchio. */
function nudge(event) {
  const step = event.shiftKey ? 0.05 : 0.005
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  moveTo(props.modelValue.x + move[0], props.modelValue.y + move[1])
}

// ------------------------------------------------------------- anteprima ----

async function renderPage(number) {
  if (!document) return
  try {
    const rendered = await document.renderPage(number, 900)
    pageAspect.value = rendered.width / rendered.height
    pageImage.value = rendered.url
  } catch {
    pageImage.value = ''
    previewError.value = t('placer.failed')
  }
}

async function loadDocument() {
  pageImage.value = ''
  previewError.value = ''
  if (!props.documentPath) return

  loading.value = true
  try {
    const bytes = await bridge.readFileBytes(props.documentPath)
    document = await openDocument(bytes)
    pageCount.value = document.pageCount
    if (props.modelValue.page > pageCount.value) update({ page: pageCount.value })
    await renderPage(Math.min(props.modelValue.page, pageCount.value))
  } catch (cause) {
    // L'anteprima è un aiuto, non una condizione: senza, il foglio resta un
    // rettangolo in scala e la firma si colloca comunque.
    previewError.value = cause?.message || t('placer.failed')
  } finally {
    loading.value = false
  }
}

async function loadSignature() {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
  signatureUrl.value = ''
  if (!props.imagePath) return

  try {
    const bytes = await bridge.readFileBytes(props.imagePath)
    objectUrl = URL.createObjectURL(new Blob([bytes]))
    signatureUrl.value = objectUrl
    signatureRatio.value = await imageRatio(objectUrl)
  } catch {
    signatureUrl.value = ''
  }
}

watch(() => props.documentPath, loadDocument, { immediate: true })
watch(() => props.imagePath, loadSignature, { immediate: true })

// Il riquadro predefinito è pensato per una firma larga e bassa: appena si
// conoscono le proporzioni vere dell'immagine e del foglio, la posizione viene
// riportata dentro la pagina, altrimenti una firma quadrata partirebbe con
// mezzo tratto fuori dal bordo.
watch([signatureRatio, pageAspect], () => update({}))

onBeforeUnmount(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  document?.destroy?.()
})
</script>
