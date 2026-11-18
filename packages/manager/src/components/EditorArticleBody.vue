<template>
  <div class="editor-workspace" ref="workspaceRef">
    <!-- Editor Pane -->
    <div v-show="showEditor" class="pane editor-pane" :style="editorStyle">
      <CmEditor
        ref="editorRef"
        v-model="localContent"
        :disabled="props.disabled"
        :placeholder="placeholder"
        :fontClass="fontClass"
        @mouseover="activeScroll = 'editor'"
        @cursorChange="onCursorChange"
        @changeRange="onChangeRange"
        @editorScroll="onEditorScroll"
      />
    </div>

    <!-- Draggable divider (split mode only) -->
    <div
      v-if="showEditor && showPreview"
      class="pane-divider"
      @mousedown.prevent="onDividerDown"
    >
      <span class="divider-line"></span>
    </div>

    <!-- Preview Pane -->
    <div
      v-show="showPreview"
      class="pane preview-pane"
      :class="fontClass"
      :style="previewStyle"
      ref="previewRef"
      tabindex="0"
      @scroll="syncScroll('preview')"
      @mouseover="activeScroll = 'preview'"
      @focus="activeScroll = 'preview'"
    >
      <div v-if="!hasContent" class="preview-empty-state">
        <p>{{ $t('editor.emptyArticle') }}</p>
        <p class="preview-empty-hint">{{ $t('editor.emptyArticleHint') }}</p>
      </div>
      <div v-else class="preview-fade-in" :class="{ 'fade-ready': previewReady }">
        <MarkdownItPreview
          :markdown="localContent"
          :cursorLine="cursorLine"
          :changeRange="changeRange"
          class="preview-content"
        />
      </div>
    </div>
  </div>

  <!-- Preview Search Overlay -->
  <div
    v-if="previewSearchOpen"
    class="search-float search-float--preview"
    @keydown.esc.prevent="closePreviewSearch()"
  >
    <div class="search-float-header">
      <span class="search-float-title">Preview Search</span>
      <button class="search-close-btn" @click="closePreviewSearch()">
        <span class="icon-svg" v-html="Icons.close"></span>
      </button>
    </div>
    <div class="search-float-body">
      <input
        ref="previewSearchInputRef"
        v-model="previewSearchQuery"
        class="search-input"
        :placeholder="$t('editor.findInPreview')"
        @keydown.enter.prevent="jumpToSearchMatch('preview', $event.shiftKey ? -1 : 1)"
        @keydown.esc.prevent="closePreviewSearch()"
      />
      <div class="search-float-actions">
        <span class="search-counter">{{ previewSearchMatchLabel }}</span>
        <div class="search-nav-btns">
          <button class="search-nav-btn" :disabled="!previewSearchMatchCount" @click="jumpToSearchMatch('preview', -1)">↑</button>
          <button class="search-nav-btn" :disabled="!previewSearchMatchCount" @click="jumpToSearchMatch('preview', 1)">↓</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import MarkdownItPreview from './MarkdownItPreview.vue'
import CmEditor from './CmEditor.vue'
import { Icons } from '../utils/icons.ts'

const props = withDefaults(defineProps<{
  modelValue: string
  fontClass?: string
  placeholder?: string
  layoutMode?: 'split' | 'edit' | 'preview'
  disabled?: boolean
}>(), {
  modelValue: '',
  fontClass: 'font-sans',
  placeholder: '',
  layoutMode: 'split',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// ── Internal content mirror ──────────────────────────
const localContent = ref(props.modelValue)
watch(() => props.modelValue, (val) => {
  if (val !== localContent.value) localContent.value = val
})

watch(localContent, (val) => {
  emit('update:modelValue', val)
  void nextTick(() => {
    refreshPreviewSearchSource()
    applyPreviewSearchHighlights()
  })
})

// ── Layout modes ─────────────────────────────────────
export type DocumentLayoutMode = 'split' | 'edit' | 'preview'

const showEditor = computed(() => props.layoutMode === 'split' || props.layoutMode === 'edit')
const showPreview = computed(() => props.layoutMode === 'split' || props.layoutMode === 'preview')

// ── Content detection ─────────────────────────────────
const hasContent = computed(() => {
  const body = localContent.value.replace(/^---\n[\s\S]*?\n---\n\n?/, '').trim()
  return body.length > 0
})
const previewReady = ref(hasContent.value)
watch(hasContent, (val) => { if (val) previewReady.value = true })

// ── Refs ─────────────────────────────────────────────
const editorRef = ref<any>(null)
const previewRef = ref<HTMLDivElement | null>(null)
const workspaceRef = ref<HTMLDivElement | null>(null)
const activeScroll = ref<'editor' | 'preview' | null>(null)

// ── Split divider drag ───────────────────────────────
const SPLIT_KEY = 'chronicle_editor_split_ratio'
const splitRatio = ref(Number(localStorage.getItem(SPLIT_KEY)) || 0.5)
const editorStyle = computed(() =>
  props.layoutMode === 'split' && showPreview.value
    ? { width: `calc(${splitRatio.value * 100}% - 5px)`, flex: 'none' }
    : {}
)
const previewStyle = computed(() =>
  props.layoutMode === 'split' && showEditor.value
    ? { width: `calc(${(1 - splitRatio.value) * 100}% - 5px)`, flex: 'none' }
    : {}
)

function onDividerDown(e: MouseEvent) {
  const ws = workspaceRef.value; if (!ws) return
  const startX = e.clientX
  const startRatio = splitRatio.value
  const totalWidth = ws.offsetWidth
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const r = Math.min(0.8, Math.max(0.2, startRatio + dx / totalWidth))
    splitRatio.value = r
  }
  const onUp = () => {
    localStorage.setItem(SPLIT_KEY, String(splitRatio.value))
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── Cursor tracking ──────────────────────────────────
const cursorLine = ref(1)
const changeRange = ref<{ from: number; to: number } | null>(null)

function onCursorChange(line: number, _col: number) {
  cursorLine.value = line
  setTimeout(() => scrollActiveBlockIntoView(), 80)
}

function onChangeRange(range: { from: number; to: number }) {
  changeRange.value = range
}

function onEditorScroll() {
  syncScroll('editor')
}

// ── Scroll sync ──────────────────────────────────────
function syncScroll(source: 'editor' | 'preview') {
  if (props.layoutMode !== 'split') return
  if (activeScroll.value && activeScroll.value !== source) return

  const scrollDom = (editorRef.value as any)?.getScrollDom?.() as HTMLElement | null
  const preview = previewRef.value
  if (!scrollDom || !preview) return

  const edH = scrollDom.scrollHeight - scrollDom.clientHeight
  const pvH = preview.scrollHeight - preview.clientHeight
  if (edH <= 0 || pvH <= 0) return

  if (source === 'editor') {
    preview.scrollTop = (scrollDom.scrollTop / edH) * pvH
  } else {
    scrollDom.scrollTop = (preview.scrollTop / pvH) * edH
  }
}

function scrollActiveBlockIntoView() {
  if (!previewRef.value) return
  const el = previewRef.value.querySelector('.active-block') as HTMLElement | null
  if (!el) return
  const container = previewRef.value
  const elTop = el.offsetTop - container.offsetTop
  const elBot = elTop + el.offsetHeight
  const margin = 60
  if (elTop < container.scrollTop + margin) {
    container.scrollTop = Math.max(0, elTop - margin)
  } else if (elBot > container.scrollTop + container.clientHeight - margin) {
    container.scrollTop = elBot - container.clientHeight + margin
  }
}

// ── Preview Search ───────────────────────────────────
// Editor search is handled natively by CodeMirror's @codemirror/search (Ctrl+F)
const previewSearchOpen = ref(false)
const previewSearchQuery = ref('')
const previewSearchInputRef = ref<HTMLInputElement | null>(null)
const previewSearchMatchIndex = ref(0)
const previewSearchSource = ref('')

function refreshPreviewSearchSource() {
  previewSearchSource.value = previewRef.value?.textContent || ''
}

function buildSearchMatches(query: string, content: string) {
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedContent = content.toLowerCase()
  if (!normalizedQuery) return [] as Array<{ start: number; end: number }>

  const matches: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (cursor <= normalizedContent.length) {
    const index = normalizedContent.indexOf(normalizedQuery, cursor)
    if (index === -1) break
    matches.push({ start: index, end: index + normalizedQuery.length })
    cursor = index + Math.max(normalizedQuery.length, 1)
  }
  return matches
}

const previewSearchMatches = computed(() => buildSearchMatches(previewSearchQuery.value, previewSearchSource.value))
const previewSearchMatchCount = computed(() => previewSearchMatches.value.length)
const previewSearchMatchLabel = computed(() => {
  if (!previewSearchMatchCount.value) return '0/0'
  return `${Math.min(previewSearchMatchIndex.value + 1, previewSearchMatchCount.value)}/${previewSearchMatchCount.value}`
})

function findTextNodeAtOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  let total = 0
  while (current) {
    const text = current.textContent || ''
    const nextTotal = total + text.length
    if (offset <= nextTotal) return { node: current, offset: offset - total }
    total = nextTotal
    current = walker.nextNode()
  }
  return null
}

function clearPreviewSearchHighlights() {
  const root = previewRef.value
  if (!root) return
  root.querySelectorAll('mark.search-hit, mark.search-hit-active').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
    parent.normalize()
  })
}

function applyPreviewSearchHighlights() {
  const root = previewRef.value
  if (!root) return
  clearPreviewSearchHighlights()
  const query = previewSearchQuery.value.trim()
  if (!query) return

  const matches = buildSearchMatches(query, previewSearchSource.value)
  if (!matches.length) return

  let accumulated = 0
  for (let i = 0; i < matches.length; i++) {
    const result = findTextNodeAtOffset(root, matches[i].start - accumulated)
    if (!result) continue
    const { node, offset } = result
    const parent = node.parentNode
    if (!parent) continue

    const mark = document.createElement('mark')
    mark.className = 'search-hit'
    mark.textContent = node.textContent?.slice(offset, offset + query.length) || ''
    const after = document.createTextNode(node.textContent?.slice(offset + query.length) || '')
    node.textContent = node.textContent?.slice(0, offset) || ''
    parent.insertBefore(mark, node.nextSibling)
    parent.insertBefore(after, mark.nextSibling)
    accumulated += result.offset + query.length
  }
}

function closePreviewSearch() {
  previewSearchOpen.value = false
  previewSearchQuery.value = ''
  previewSearchMatchIndex.value = 0
  clearPreviewSearchHighlights()
}

function jumpToSearchMatch(_pane: 'preview', delta: number) {
  const matches = previewSearchMatches.value
  if (!matches.length) return
  let idx = previewSearchMatchIndex.value + delta
  if (idx < 0) idx = matches.length - 1
  if (idx >= matches.length) idx = 0
  previewSearchMatchIndex.value = idx
  const root = previewRef.value
  if (!root) return
  root.querySelectorAll('mark.search-hit-active').forEach(m => m.classList.remove('search-hit-active'))
  const hits = root.querySelectorAll('mark.search-hit')
  if (hits[idx]) hits[idx].classList.add('search-hit-active')
  hits[idx]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

// ── Expose imperative API ────────────────────────────
function insertAtCursor(text: string, cursorOffset?: number) {
  const editor = editorRef.value as any
  editor?.insertAtCursor?.(text, cursorOffset)
}

function getSelection() {
  const editor = editorRef.value as any
  return editor?.getSelection?.() || ''
}

function clearHistory() { (editorRef.value as any)?.clearHistory?.() }

function undo() { (editorRef.value as any)?.undo() }
function redo() { (editorRef.value as any)?.redo() }


// Pass through CmEditor's reactive undo/redo state
const canUndo = computed(() => !!(editorRef.value as any)?.canUndo)
const canRedo = computed(() => !!(editorRef.value as any)?.canRedo)

function openPreviewSearch(initialQuery?: string) {
  previewSearchOpen.value = true
  if (initialQuery) previewSearchQuery.value = initialQuery
  void nextTick(() => previewSearchInputRef.value?.focus())
}

function getToolbarConfig() {
  return {
    tabs: [
      {
        id: 'start', label: 'Start', icon: Icons.edit,
        groups: [
          {
            tools: [
              { type: 'button', id: 'media', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
              { type: 'button', id: 'link', label: 'Link', icon: Icons.link, action: 'openLinkModal' },
              { type: 'button', id: 'table', label: 'Table', icon: Icons.table, action: 'openTableModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'font-sans', label: 'Sans', icon: Icons.fontSans, action: 'font:sans' },
              { type: 'button', id: 'font-serif', label: 'Serif', icon: Icons.fontSerif, action: 'font:serif' },
              { type: 'button', id: 'font-mono', label: 'Mono', icon: Icons.fontMono, action: 'font:mono' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
              { type: 'button', id: 'mode-preview', label: 'Preview', icon: Icons.eye, action: 'layout:preview' },
            ]
          },
          {
            tools: [
              { type: 'spacer' },
              { type: 'button', id: 'wordcount', label: '', icon: '', isStats: true },
            ]
          },
        ]
      },
      {
        id: 'insert', label: 'Insert', icon: Icons.plus,
        groups: [
          {
            tools: [
              { type: 'button', id: 'media-lg', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
              { type: 'button', id: 'link-lg', label: 'Link', icon: Icons.link, action: 'openLinkModal' },
              { type: 'button', id: 'table-lg', label: 'Table', icon: Icons.table, action: 'openTableModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'code', label: 'Code', icon: Icons.codeTag, action: 'insertCode' },
              { type: 'button', id: 'math', label: 'Formula', icon: Icons.formula, action: 'openMathModal' },
              { type: 'button', id: 'todo', label: 'Todo', icon: Icons.todo, action: 'insertTodo' },
              { type: 'button', id: 'footnote', label: 'Footnote', icon: Icons.hash, action: 'insertFootnote' },
              { type: 'button', id: 'quote', label: 'Quote', icon: Icons.quote, action: 'insertQuote' },
              { type: 'button', id: 'details', label: 'Collapsible', icon: Icons.chevron, action: 'insertDetails' },
            ]
          }
        ]
      },
      {
        id: 'view', label: 'View', icon: Icons.eye,
        groups: [
          {
            tools: [
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
              { type: 'button', id: 'mode-preview', label: 'Preview', icon: Icons.eye, action: 'layout:preview' },
            ]
          }
        ]
      },
    ]
  }
}

defineExpose({
  editorRef,
  insertAtCursor,
  getSelection,
  undo,
  redo,
  clearHistory,
  canUndo,
  canRedo,
  openPreviewSearch,
  closePreviewSearch,
  getToolbarConfig,
  initContent(content: string) {
    localContent.value = content
    ;(editorRef.value as any)?.initContent?.(content)
    previewReady.value = true
  },
})
</script>

<style scoped>
.editor-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  position: relative;
}

.pane {
  flex: 1;
  overflow: auto;
  height: 100%;
}

.editor-pane {
  overflow: hidden;
}

.preview-pane {
  background: var(--app-bg-pri);
  padding: 16px 16px 50vh 16px;
  box-sizing: border-box;
}

.preview-pane :deep(mark.search-hit) {
  background: rgba(255, 220, 90, 0.45);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

.preview-pane :deep(mark.search-hit-active) {
  background: rgba(255, 140, 0, 0.55);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}


/* ── Split divider ────────────────────────────────── */
.pane-divider {
  width: 9px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  user-select: none;
}
.pane-divider:hover .divider-line {
  width: 2px;
  background: color-mix(in srgb, var(--comp-text-pri-hl) 85%, transparent);
  box-shadow: 0 0 4px 0 var(--comp-text-pri-hl);
}
.pane-divider .divider-line {
  display: block;
  width: 1px;
  height: 100%;
  margin: 0 4px;
  background: var(--border-color);
  transition: width 0.15s, background 0.15s, box-shadow 0.15s;
}

/* Layout modifiers — classes are on parent .blog-editor, use :deep to reach */

:deep(.layout-edit .preview-pane) {
  display: none;
}

:deep(.layout-preview .editor-pane) {
  display: none;
}

:deep(.layout-preview .pane) {
  width: 100%;
}

.search-float {
  position: fixed;
  bottom: 18px;
  z-index: 1200;
  width: 320px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--comp-bg-sec);
  box-shadow: var(--shadow-elev-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-float--editor {
  left: 50%;
  transform: translateX(-50%);
}

.search-float--preview {
  right: 32px;
}

.search-float-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-float-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--comp-text-sec);
}

.search-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: var(--comp-text-sec);
}

.search-float-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--app-bg-pri);
  color: var(--app-text-pri);
  font-size: 13px;
  box-sizing: border-box;
}

.search-float-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-counter {
  font-size: 11px;
  color: var(--comp-text-sec);
}

.search-nav-btns {
  display: flex;
  gap: 4px;
}

.search-nav-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--app-bg-sec);
  color: var(--app-text-pri);
  cursor: pointer;
  font-size: 11px;
}
.search-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-svg {
  display: inline-flex;
  align-items: center;
  width: 14px;
  height: 14px;
}

/* ── Preview empty state ────────────────────────────── */
.preview-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--comp-text-sec);
  text-align: center;
  padding: 2rem;
  line-height: 1.8;
  font-family: var(--app-font-stack);
}

.preview-empty-hint {
  font-size: 0.85rem;
  opacity: 0.65;
  margin-top: 4px;
  font-family: var(--app-font-stack);
}

/* ── Preview fade-in ────────────────────────────────── */
.preview-fade-in {
  opacity: 0;
  transition: opacity 200ms ease-in;
}

.preview-fade-in.fade-ready {
  opacity: 1;
}
</style>
