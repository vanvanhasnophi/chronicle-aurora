<template>
  <div class="editor-print-page">
    <div class="print-actions">
      <button class="print-action-btn" type="button" :disabled="!snapshot || !!loadError || !rendered" @click="triggerPrint">
        {{ t('editor.print') }}
      </button>
      <button class="print-action-btn secondary" type="button" @click="closePreview">
        {{ t('editor.cancel') }}
      </button>
    </div>

    <div class="print-surface" :class="fontClass">
      <div v-if="loadError" class="print-error">
        {{ loadError }}
      </div>

      <div v-else class="print-body">
        <header v-if="snapshot?.title" class="print-header">
          <h1 class="print-title">{{ snapshot.title }}</h1>
        </header>

        <!-- Pipeline B: matches template-astro published output exactly -->
        <MarkdownItPreview
          v-if="snapshot"
          :markdown="snapshot.content || ''"
          :open-details="true"
          class="print-content"
          @rendered="handleRendered"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
// Pipeline A disabled; using Pipeline B for print preview
// import MdParser from '../components/MdParser.vue'
import MarkdownItPreview from '../components/MarkdownItPreview.vue'

type PrintSnapshot = {
  title?: string
  content?: string
  font?: string
  assetMap?: Record<string, string>
  postStatus?: string
  postDate?: string
  postUpdated?: string
  tags?: string[]
  author?: string
  aiGenerated?: boolean
  locale?: string
  createdAt?: number
}

const route = useRoute()
const { t } = useI18n()
const snapshot = ref<PrintSnapshot | null>(null)
const loadError = ref('')
const rendered = ref(false)
const autoPrintHandled = ref(false)
let detailObserver: MutationObserver | null = null

const autoPrintEnabled = computed(() => String(route.query.autoPrint || '') === '1')

const storageKey = computed(() => {
  const token = String(route.query.token || '').trim()
  return token ? `chronicle_print_preview_${token}` : ''
})

const fontClass = computed(() => `font-${snapshot.value?.font || 'sans'}`)
function forceLightTheme() {
  try {
    document.body.setAttribute('data-theme', 'light')
    document.body.setAttribute('data-backend-theme', 'light')
    document.body.classList.add('backend')
  } catch (e) { }
}

/** Print preview always shows the content of every <details>, including a
 *  browser-initiated Ctrl+P that bypasses triggerPrint. */
function expandAllDetails() {
  document.querySelectorAll<HTMLDetailsElement>('.print-body details').forEach((d) => {
    d.open = true
  })
}

function loadSnapshot() {
  try {
    if (!storageKey.value) {
      loadError.value = t('editor.printMissingData')
      return
    }

    const raw = localStorage.getItem(storageKey.value)
    if (!raw) {
      loadError.value = t('editor.printMissingData')
      return
    }

    localStorage.removeItem(storageKey.value)
    snapshot.value = JSON.parse(raw)
    document.title = snapshot.value?.title || t('editor.print')
  } catch (e) {
    loadError.value = t('editor.printMissingData')
  }
}

async function triggerPrint() {
  if (loadError.value || !snapshot.value || !rendered.value) return

  try {
    await nextTick()
    try {
      if ('fonts' in document) {
        await (document as any).fonts.ready
      }
    } catch (e) { }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    expandAllDetails()
    window.print()
  } catch (e) {
  }
}

async function maybeAutoPrint() {
  if (!autoPrintEnabled.value || autoPrintHandled.value || loadError.value || !snapshot.value || !rendered.value) return
  autoPrintHandled.value = true
  await triggerPrint()
}

function handleRendered() {
  expandAllDetails()
  rendered.value = true
  void maybeAutoPrint()
}

function closePreview() {
  try {
    window.close()
  } catch (e) { }
}

onMounted(async () => {
  forceLightTheme()
  loadSnapshot()
  // Pipeline B renders synchronously; mark as rendered after DOM flush
  await nextTick()
  expandAllDetails()
  // ...but MarkdownItPreview rebuilds its blocks through a debounce, so the
  // <details> nodes can arrive after the first flush.  Watch for them.
  const printBody = document.querySelector('.print-body')
  if (printBody) {
    detailObserver = new MutationObserver(() => expandAllDetails())
    detailObserver.observe(printBody, { childList: true, subtree: true })
  }
  rendered.value = true
  window.addEventListener('beforeprint', expandAllDetails)
  if (autoPrintEnabled.value) {
    void maybeAutoPrint()
  }
})

onBeforeUnmount(() => {
  detailObserver?.disconnect()
  window.removeEventListener('beforeprint', expandAllDetails)
})
</script>

<style scoped>
.editor-print-page {
  position: relative;
  min-height: auto;
  background: #fff;
  color: #111;
  overflow: visible;
}

.print-actions {
  position: sticky;
  top: 16px;
  margin-left: auto;
  margin-right: 16px;
  z-index: 20;
  display: flex;
  gap: 10px;
  width: fit-content;
}

.print-action-btn {
  border: none;
  background: #111;
  color: #fff;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.print-action-btn.secondary {
  background: #fff;
  color: #111;
}

.print-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.print-surface {
  box-sizing: border-box;
  width: 100%;
  min-height: auto;
  padding: 48px;
}

.print-error {
  padding: 18px 20px;
  border-radius: 12px;
  background: #f7f7f8;
  color: #4b5563;
  border: 1px solid rgba(17, 17, 17, 0.08);
}

.print-body {
  color: #111;
  font-family: 'InterVariable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}

.print-header {
  margin: 0 0 24px;
  padding: 0 0 16px;
}

h1.print-title {
  margin: 0;
  font-size: 2.6rem;
  line-height: 1.25;
  font-weight: 700;
  color: #111;
}

.print-body {
  color: #111;
}

/* Pipeline B output uses .mdit-preview and native markdown-it HTML elements */
:deep(.print-body),
:deep(.print-body .mdit-preview) {
  color: #111;
}

@media print {
  .print-actions {
    display: none;
  }

  .editor-print-page {
    background: #fff;
    min-height: auto;
  }

  .print-surface {
    min-height: auto;
  }

  .print-surface {
    padding: 16px;
  }

  .print-header {
    margin-bottom: 18px;
    padding-bottom: 12px;
  }

  .print-title {
    font-size: 24px;
  }
}

.print-body :deep(.editor-footer){
  display: none 
}

.print-body :deep(.code-chunk-container .toolbar){
  display: none;
}

.print-body :deep(.code-chunk-container .editor-wrapper,.code-textarea,.syntax-hl){
  max-height: none !important;
}

.print-body :deep(.code-chunk-container){
  max-height: none !important;
}

.print-body :deep(.code-textarea){
  max-height: none !important;
  overflow: hidden !important;
}

.print-body :deep(.syntax-hl){
  max-height: none !important;
  overflow: hidden !important;
}

.print-body :deep(thead){
  background: #ccc;
}

.print-body :deep(.code-chunk-container.mermaid .editor-wrapper){
  display: none;
}

</style>
