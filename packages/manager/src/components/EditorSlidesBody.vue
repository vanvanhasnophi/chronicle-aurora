<template>
  <div class="slides-body" ref="slidesBodyRef" @keydown="onKeydown">
    <!-- Left: Thumbnail strip -->
    <div class="thumbnail-strip" v-show="showThumbnails">
      <div class="thumbnail-strip-header">
        <span class="thumbnail-count">{{ slides.length }} {{ slides.length === 1 ? t('editor.slide') : t('editor.slides') }}</span>
        <button class="thumbnail-toggle" @click="showThumbnailsLocal = !showThumbnailsLocal" title="Toggle thumbnails">
          <span class="icon-svg" v-html="Icons.chevron"></span>
        </button>
      </div>
      <div class="thumbnail-list">
        <div v-for="(slide, i) in slides" :key="i" class="thumbnail-item" :class="{ active: i === currentSlide }"
          @click="goToSlide(i)">
          <span class="thumbnail-num">{{ i + 1 }}</span>
          <span class="thumbnail-label">{{ slideTitle(slide) }}</span>
          <span v-if="slide.hasNotes" class="thumbnail-notes-dot" title="Has speaker notes">💬</span>
        </div>
      </div>
    </div>

    <!-- Split area: editor + preview, sized against remaining space after thumbnails -->
    <div class="split-area" ref="splitAreaRef">
      <!-- Center: Code editor -->
      <div v-show="showEditor" class="pane editor-pane" :style="editorStyle">
        <CmEditor ref="editorRef" v-model="localContent" :disabled="props.disabled" :placeholder="placeholder"
          :fontClass="fontClass" @cursorChange="onCursorChange"
          @changeRange="(r: { from: number; to: number }) => slideState.onContentChange(r.from, r.to)" />
      </div>

      <!-- Draggable divider (split mode) -->
      <div v-if="showEditor && showPreview" class="pane-divider" @mousedown.prevent="onDividerDown">
        <span class="divider-line"></span>
      </div>

      <!-- Right: Slide preview -->
      <div v-show="showPreview" class="pane preview-pane" :class="previewMode" :style="previewStyle"
        ref="previewPaneRef" @wheel="onWheel">
        <div v-if="slides.length" class="marp-output" ref="marpOutRef" style="width:100%;height:100%;overflow:auto">
        </div>
        <template v-if="currentSlideData">
          <!-- Speaker notes -->
          <div v-if="currentSlideData.hasNotes" class="speaker-notes-panel" :class="{ expanded: notesExpanded }">
            <button class="notes-toggle" @click="notesExpanded = !notesExpanded">
              💬 Speaker Notes {{ notesExpanded ? '▾' : '▸' }}
            </button>
            <div v-show="notesExpanded" class="notes-content">{{ currentSlideData.notes }}</div>
          </div>
        </template>
        <div v-else class="empty-preview">
          <p>{{ t('editor.emptySlides') }}</p>
          <p>{{ t('editor.emptySlidesHint') }}</p>
        </div>

        <!-- Slide navigation controls -->
        <div v-if="slides.length > 0" class="slide-controls-bar">
          <button @click="goToSlide(0)" :disabled="currentSlide <= 0" title="First slide (Home)">
            <span class="icon-svg reverse" v-html="Icons.toBottom"></span>
          </button>
          <button @click="prevSlide" :disabled="currentSlide <= 0" title="Previous slide (← / PageUp)">
            <span class="icon-svg reverse" v-html="Icons.chevron"></span>
          </button>
          <span class="slide-position">{{ currentSlide + 1 }} / {{ slides.length }}</span>
          <button @click="nextSlide" :disabled="currentSlide >= slides.length - 1" title="Next slide (→ / PageDown)">
            <span class="icon-svg" v-html="Icons.chevron"></span>
          </button>
          <button @click="goToSlide(slides.length - 1)" :disabled="currentSlide >= slides.length - 1"
            title="Last slide (End)">
            <span class="icon-svg" v-html="Icons.toBottom"></span>
          </button>
        </div>
      </div>
    </div><!-- .split-area -->
  </div>

  <!-- Slide overview modal -->
  <SlideOverview v-if="showOverview" :slides="slides" :active-index="currentSlide" @close="showOverview = false"
    @select="goToSlide($event); showOverview = false" />

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorView } from '@codemirror/view'
import CmEditor from './CmEditor.vue'
import SlideOverview from './slides/SlideOverview.vue'
import { parseSlides } from '@chronicle/shared/src/utils'
import type { ParsedSlide } from '@chronicle/shared/src/utils'
import { renderPreview } from '../utils/markdownPreview'
import { Icons } from '../utils/icons'
import * as MarpCore from '@marp-team/marp-core'
import { chronicleLightTheme, chronicleDarkTheme } from '../composables/editor/slides/chronicleThemes'
import { resolveMarpCore } from '../composables/editor/slides/useMarpEngine'
import { initSlideStore, lastOpFlags, focusOrCreateDirective as _focusOrCreateDirective, insertNewSlide as _insertNewSlide } from '../composables/editor/slides/useSlideDirectives'
import { flashCMLines } from '../composables/editor/markdown/useEditorFlash'

// Marp engine with Chronicle themes (default accent)
// marp-core 是 CJS 包：Vite 预打包后 default 导出是 module.exports 对象而非类，
// 必须用 resolveMarpCore 剥壳，否则会抛 “Marp is not a constructor”。
const { t } = useI18n()
const Marp = resolveMarpCore(MarpCore)
const marp = new Marp({ html: true, markdown: { breaks: false } })
try { marp.themeSet.add(chronicleLightTheme('#2563eb')); marp.themeSet.add(chronicleDarkTheme('#58a6ff')) } catch { }


const props = withDefaults(defineProps<{
  modelValue: string
  fontClass?: string
  placeholder?: string
  layoutMode?: 'slideshow' | 'split' | 'edit'
  disabled?: boolean
}>(), {
  modelValue: '',
  fontClass: 'font-sans',
  placeholder: 'Write your slides...',
  layoutMode: 'split',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// ── Content ──────────────────────────────────────────
const localContent = ref(props.modelValue)
const slideState = initSlideStore(localContent)
const { currentSlide, hasSlideClass, toggleSlideClass, removeSlideClass, ensureSlideClass, hasPaginate, togglePaginate } = slideState

// Apply accent-color & tinted-bg from frontmatter before each Marp render
let lastAccent = '#2563eb', lastTintedBg = false
function applyAccentTheme(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  const fm = m ? m[1] : ''
  let raw = (fm.match(/accent-color:\s*"?([^"\n]+)"?/)?.[1] || fm.match(/^accent:\s*(\S+)/m)?.[1] || '').trim()
  if (!raw) raw = 'default'
  const tb = fm.match(/^tinted-bg:\s*(\S+)/m)?.[1] || ''
  const tintedBg = tb === 'true'
  if (raw === lastAccent && tintedBg === lastTintedBg) return
  lastAccent = raw; lastTintedBg = tintedBg
  const accent = raw === 'follow'
    ? getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#2563eb'
    : raw === 'default' ? '#2563eb'
    : (raw.startsWith('#') ? raw : `#${raw}`)
  try {
    marp.themeSet.add(chronicleLightTheme(accent, tintedBg))
    marp.themeSet.add(chronicleDarkTheme(accent, tintedBg))
  } catch { }
}

watch(() => props.modelValue, (val) => {
  if (val !== localContent.value) { localContent.value = val; slideState.fullRebuild() }
})

watch(localContent, (val) => {
  emit('update:modelValue', val)
})

// ── Refs & state ─────────────────────────────────────
const editorRef = slideState.editorRef    // 共享给 useSlideState 的 CodeMirror 引用
const splitAreaRef = ref<HTMLDivElement | null>(null)
const notesExpanded = ref(false)
const showThumbnailsLocal = ref(true)
const showOverview = ref(false)
const COLUMN_CLASSES = ['columns', 'columns-2', 'columns-3']
const columnsMenuItems = computed(() => {
  const cs = slideState.slideMetas.value[slideState.currentSlide.value]?.classes ?? []
  const activeCols = cs.filter(c => COLUMN_CLASSES.includes(c))
  const effective = activeCols.length === 1 ? activeCols[0] : activeCols.length > 1 ? 'columns' : ''
  const active = (cls: string) => effective === cls
  return [
    { label: t('editor.columns.none'), action: 'removeColumns', icon: Icons.prohibit, active: !effective },
    { label: t('editor.columns.two'), action: 'insertClassColumns2', icon: Icons.twoCol, active: active('columns-2') },
    { label: t('editor.columns.three'), action: 'insertClassColumns3', icon: Icons.threeCol, active: active('columns-3') },
    { label: t('editor.columns.custom'), action: 'insertClassColumns', icon: Icons.columns, active: active('columns') },
    { type: 'separator' as const },
    { label: t('editor.columns.addSplit'), action: 'addSplit', icon: Icons.dividerV },
  ]
})

const previewMode = ref<"single" | "all">("single")
const cursorLine = ref(1)
const autoFollow = ref(true)

// ── Parse slides: count outer <svg data-marpit-svg>, extract content section per slide ──
const parsed = computed(() => {
  if (!localContent.value.trim()) return { slides: [] as ParsedSlide[], css: '' }
  try {
    const { html, css } = marp.render(localContent.value)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const svgs = [...doc.querySelectorAll('[data-marpit-svg]')]
    const slides: ParsedSlide[] = svgs.map((svg, i) => {
      // Each SVG has multiple foreignObject/section layers; take the content one (has id attr on section)
      const contentSec = svg.querySelector('section[id]') || svg.querySelector('section')
      const notes = contentSec?.querySelector('.notes, aside.notes')?.textContent?.trim() || ''
      return {
        index: i,
        markdown: '',
        html: contentSec?.outerHTML || '',
        directives: {} as Record<string, string>,
        notes,
        hasNotes: !!notes,
      }
    })
    return { slides: slides.length ? slides : [{ index: 0, markdown: '', html: '', directives: {}, notes: '', hasNotes: false }], css }
  } catch {
    return { slides: [] as ParsedSlide[], css: '' }
  }
})

const previewPaneRef = ref<HTMLElement | null>(null)
const marpOutRef = ref<HTMLElement | null>(null)

// ── Split divider drag ───────────────────────────────
const SPLIT_KEY_SLIDES = 'chronicle_slides_split_ratio'
const splitRatio = ref(Number(localStorage.getItem(SPLIT_KEY_SLIDES)) || 0.5)
const editorStyle = computed(() =>
  props.layoutMode !== 'edit' && showPreview.value
    ? { width: `calc(${splitRatio.value * 100}% - 5px)`, flex: 'none' }
    : {}
)
const previewStyle = computed(() =>
  props.layoutMode !== 'edit' && showEditor.value
    ? { width: `calc(${(1 - splitRatio.value) * 100}% - 5px)`, flex: 'none' }
    : {}
)

function onDividerDown(e: MouseEvent) {
  const ws = splitAreaRef.value; if (!ws) return
  const startX = e.clientX
  const startRatio = splitRatio.value
  const totalWidth = ws.offsetWidth
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const r = Math.min(0.8, Math.max(0.2, startRatio + dx / totalWidth))
    splitRatio.value = r
  }
  const onUp = () => {
    localStorage.setItem(SPLIT_KEY_SLIDES, String(splitRatio.value))
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const slides = computed(() => parsed.value.slides)
const currentSlideData = computed(() => slides.value[currentSlide.value] ?? null)

// Inject Marp HTML + CSS, preserve current slide index across re-renders
async function renderMarpOutput(md: string) {
  if (!md.trim()) { currentSlide.value = 0; return }
  applyAccentTheme(md)
  const prev = currentSlide.value
  try {
    let { html, css } = marp.render(md)
    // Mermaid 后处理
    if (html.includes('language-mermaid') || html.includes('mermaid')) {
      try {
        const mm = await import('mermaid')
        const mermaid = (mm && (mm as any).default) || mm
        mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } })
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const codes = doc.querySelectorAll('pre code.language-mermaid, code[class*="mermaid"]')
        for (const code of codes) {
          const pre = code.closest('pre'); const text = code.textContent || ''
          if (!text.trim() || !pre) continue
          try {
            const id = 'mermaid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
            const r = await mermaid.render(id, text.trim())
            const svg = (r && (r.svg || r)) ? String(r.svg || r) : ''
            if (svg) { const w = doc.createElement('div'); w.className = 'mermaid-prerendered'; w.innerHTML = svg; pre.replaceWith(w) }
          } catch { }
        }
        html = doc.body.innerHTML
      } catch { }
    }
    const el = marpOutRef.value; if (!el) return
    el.innerHTML = html
    document.getElementById('marp-slides-css')?.remove()
    const style = document.createElement('style')
    style.id = 'marp-slides-css'; style.textContent = css
    previewPaneRef.value?.appendChild(style)
    const svgCount = el.querySelectorAll('[data-marpit-svg]').length
    currentSlide.value = Math.min(prev, Math.max(0, svgCount - 1))
    updateSlideVisibility(currentSlide.value)
  } catch { }
}

watch(localContent, (val) => {
  void nextTick(() => renderMarpOutput(val))
}, { immediate: true })

function updateSlideVisibility(idx: number) {
  const el = marpOutRef.value; if (!el) return
  if (previewMode.value === 'single') {
    el.querySelectorAll('[data-marpit-svg]').forEach((svg: any, i) => {
      svg.style.display = i === idx ? '' : 'none'
    })
  } else {
    // "all" mode: scroll the target slide into view
    const svgs = el.querySelectorAll('[data-marpit-svg]')
    if (svgs[idx]) {
      svgs[idx].scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }
}

watch(currentSlide, (idx) => updateSlideVisibility(idx))
watch(previewMode, (mode) => {
  const el = marpOutRef.value; if (!el) return
  if (mode === 'all') {
    el.querySelectorAll('[data-marpit-svg]').forEach((n: any) => { n.style.display = '' })
  } else {
    updateSlideVisibility(currentSlide.value)
  }
})
const config = computed(() => ({} as Record<string, any>))
const ratio = computed(() => '16:9')

// Delegates to slides/useSlideDirectives
/** 定位或创建自由属性。已有则聚焦闪烁，无则新建后聚焦闪烁。 */
function focusOrCreateDirective(idx: number, key: 'header' | 'footer' | 'bgColor', directive: string) {
  _focusOrCreateDirective(editorRef, localContent, idx, key, directive)
}

// ── Layout modes ─────────────────────────────────────
const showThumbnails = computed(() => showThumbnailsLocal.value && props.layoutMode !== 'edit')
const showEditor = computed(() => props.layoutMode === 'split' || props.layoutMode === 'edit')
const showPreview = computed(() => props.layoutMode !== 'edit')

// ── Slide title extraction ───────────────────────────
function slideTitle(slide: ParsedSlide): string {
  // Extract from HTML (section[id] content)
  const h = slide.html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (h) return h[1].replace(/<[^>]+>/g, '').slice(0, 40)
  const text = slide.html.replace(/<[^>]+>/g, '').trim()
  return text.slice(0, 40) || `Slide ${slide.index + 1}`
}

// ── Cursor→slide sync ────────────────────────────────
function onCursorChange(line: number) {
  cursorLine.value = line
  if (!autoFollow.value) return
  // Find which slide contains this line
  const contentBefore = localContent.value.split('\n').slice(0, line).join('\n')
  // Count --- separators to find slide index
  const lines = localContent.value.split('\n')
  let sepCount = 0
  let inFrontmatter = true
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) inFrontmatter = false
      continue
    }
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      sepCount++
    }
  }
  const slideIdx = Math.min(sepCount, Math.max(0, slides.value.length - 1))
  if (slideIdx !== currentSlide.value) {
    currentSlide.value = slideIdx
  }
}

// ── Navigation ───────────────────────────────────────
function goToSlide(idx: number) {
  if (idx < 0 || idx >= slides.value.length) return
  currentSlide.value = idx
  autoFollow.value = false
  jumpEditorToSlide(idx)
  // Re-enable cursor→slide sync after the programmatic jump settles
  void nextTick(() => { autoFollow.value = true })
  notesExpanded.value = false
}

function prevSlide() { if (currentSlide.value > 0) { currentSlide.value--; goToSlide(currentSlide.value) } }
function nextSlide() { if (currentSlide.value < slides.value.length - 1) { currentSlide.value++; goToSlide(currentSlide.value) } }

function onWheel(e: WheelEvent) {
  if (previewMode.value === 'single') {
    e.preventDefault()
    if (e.deltaY > 0) nextSlide()
    else if (e.deltaY < 0) prevSlide()
  }
}

function jumpEditorToSlide(idx: number) {
  if (!editorRef.value) return
  const lines = localContent.value.split('\n')
  // Slide 0 starts right after the frontmatter closing ---
  if (idx === 0) {
    let inFrontmatter = true
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim()
      if (inFrontmatter && l === '---' && i > 0) {
        inFrontmatter = false
        const cmView = (editorRef.value as any)?.getEditor?.()
        if (cmView) {
          const pos = cmView.state.doc.line(Math.min(i + 2, lines.length)).from
          cmView.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: 'start' }),
          })
        }
        return
      }
    }
    return
  }
  // Slide N (N>0) starts after separator #(N-1)
  let sepCount = 0
  let inFrontmatter = true
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) { inFrontmatter = false; continue }
      continue
    }
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      if (sepCount === idx - 1) {
        const cmView = (editorRef.value as any)?.getEditor?.()
        if (cmView) {
          const pos = cmView.state.doc.line(Math.min(i + 2, lines.length)).from
          cmView.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: 'start' }),
          })
        }
        return
      }
      sepCount++
    }
  }
}

// ── Keyboard ─────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement

  // Allow keyboard shortcuts in body area even when focus is on non-input elements
  const isInInput = target.closest('.cm-editor, input, textarea')
  const isInShell = target.closest('.blog-editor')

  // Overview has its own keyboard handling (Esc closes)
  if (showOverview.value) {
    if (!isInInput && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); showOverview.value = false }
    return
  }

  if (isInInput) return // let CodeMirror handle it
  if (!isInShell) return // only handle keys within the editor

  switch (e.key) {
    case 'ArrowLeft': case 'PageUp': e.preventDefault(); prevSlide(); break
    case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); nextSlide(); break
    case 'Home': e.preventDefault(); goToSlide(0); break
    case 'End': e.preventDefault(); goToSlide(slides.value.length - 1); break
    case 'o': case 'O': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); showOverview.value = true } break
    case 'f': case 'F': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFullscreen() } break
  }
}

function toggleFullscreen() {
  const el = document.querySelector('.preview-pane') as HTMLElement | null
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    el.requestFullscreen()
  }
}

// ── Expose ───────────────────────────────────────────
function insertAtCursor(text: string) {
  const editor = editorRef.value as any
  editor?.insertAtCursor?.(text)
}
function getSelection() { return (editorRef.value as any)?.getSelection?.() || '' }
function clearHistory() { (editorRef.value as any)?.clearHistory?.() }
function undo() { (editorRef.value as any)?.undo() }
function redo() { (editorRef.value as any)?.redo() }

// Pass through CmEditor's reactive undo/redo state
const canUndo = computed(() => !!(editorRef.value as any)?.canUndo)
const canRedo = computed(() => !!(editorRef.value as any)?.canRedo)

function handleToolAction(action: string) {
  // 先导航——确保操作时编辑器定位在当前 slide
  if (!['preview:single','preview:all','toggleOutline','addSplit'].includes(action)) {
    jumpEditorToSlide(currentSlide.value)
  }
  if (action === 'preview:single') previewMode.value = 'single'
  else if (action === 'preview:all') previewMode.value = 'all'
  else if (action === 'toggleOutline') showThumbnailsLocal.value = !showThumbnailsLocal.value
  else if (action === 'newSlide') insertNewSlide()
  else if (action === 'insertHeader') focusOrCreateDirective(currentSlide.value, 'header', '<!-- _header: "" -->')
  else if (action === 'insertFooter') focusOrCreateDirective(currentSlide.value, 'footer', '<!-- _footer: "" -->')
  else if (action === 'insertClassLead') toggleSlideClass(currentSlide.value, 'lead')
  else if (action === 'addSplit') { (editorRef.value as any)?.insertAtCursor?.('\n<!-- _split -->\n') }
  else if (action === 'removeColumns') COLUMN_CLASSES.forEach(c => removeSlideClass(currentSlide.value, c))
  else if (action === 'insertClassColumns') { COLUMN_CLASSES.forEach(c => { if (c !== 'columns') removeSlideClass(currentSlide.value, c) }); ensureSlideClass(currentSlide.value, 'columns') }
  else if (action === 'insertClassColumns2') { COLUMN_CLASSES.forEach(c => { if (c !== 'columns-2') removeSlideClass(currentSlide.value, c) }); ensureSlideClass(currentSlide.value, 'columns-2') }
  else if (action === 'insertClassColumns3') { COLUMN_CLASSES.forEach(c => { if (c !== 'columns-3') removeSlideClass(currentSlide.value, c) }); ensureSlideClass(currentSlide.value, 'columns-3') }
  else if (action === 'insertBgColor') focusOrCreateDirective(currentSlide.value, 'bgColor', '<!-- _backgroundColor:  -->')
  else if (action === 'insertPaginate') togglePaginate(currentSlide.value)
  // 闪烁高亮当前行（纯删除操作除外）
  const view = (editorRef.value as any)?.getEditor?.()
  if (view && !['preview:single','preview:all','toggleOutline'].includes(action) && !lastOpFlags.wasDelete) {
    let cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
    if (action === 'addSplit') cursorLine = Math.max(1, cursorLine - 1)
    requestAnimationFrame(() => flashCMLines(view, cursorLine))
  }
  lastOpFlags.wasDelete = false
}

// Delegates to slides/useSlideDirectives
function insertNewSlide() {
  _insertNewSlide(editorRef, localContent, currentSlide, goToSlide)
}
function getToolbarConfig() {
  return {
    tabs: [
      {
        id: 'start', label: 'Start', icon: Icons.edit,
        groups: [
          {
            tools: [
              { type: 'button', id: 'new-slide', label: 'New Page', icon: Icons.plus, action: 'newSlide' },
              { type: 'button', id: 'media', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'mode-slideshow', label: 'Slideshow', icon: Icons.slideshow, action: 'layout:slideshow' },
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
            ]
          },
          {
            tools: [
              { type: 'spacer' },
              { type: 'button', id: 'export', label: 'Export', icon: Icons.save, action: 'export' },
              { type: 'button', id: 'wordcount', label: '', icon: '', action: 'stats', isStats: true },
            ]
          },
        ]
      },
      {
        id: 'insert', label: 'Insert', icon: Icons.plus,
        groups: [
          {
            tools: [
              { type: 'button', id: 'new-slide', label: 'New Page', icon: Icons.plus, action: 'newSlide' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'media', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
              { type: 'button', id: 'link', label: 'Link', icon: Icons.link, action: 'openLinkModal' },
              { type: 'button', id: 'table', label: 'Table', icon: Icons.table, action: 'openTableModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'code', label: 'Code', icon: Icons.codeTag, action: 'insertCode' },
              { type: 'button', id: 'math', label: 'Formula', icon: Icons.formula, action: 'openMathModal' },
              { type: 'button', id: 'quote', label: 'Quote', icon: Icons.quote, action: 'insertQuote' },
              { type: 'button', id: 'todo', label: 'Todo', icon: Icons.todo, action: 'insertTodo' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'insertHeader', label: 'Header', icon: Icons.header, action: 'insertHeader' },
              { type: 'button', id: 'insertFooter', label: 'Footer', icon: Icons.footer, action: 'insertFooter' },
            ]
          },
        ]
      },
      {
        id: 'page', label: 'Page', icon: Icons.slideshow,
        groups: [
          {
            tools: [
              { type: 'button', id: 'insertClassLead', label: 'Lead', icon: Icons.singlePage, action: 'insertClassLead' },
              { type: 'button', id: 'columnsMenu', label: 'Columns', icon: Icons.columns, popover: () => ({ type: 'menu', items: columnsMenuItems.value }), popoverOnSelect: (a: string) => handleToolAction(a) },
              { type: 'button', id: 'insertBgColor', label: 'BG', icon: Icons.palette, action: 'insertBgColor' },
              { type: 'button', id: 'insertPaginate', label: 'Page No', icon: Icons.orderNum, action: 'insertPaginate' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'insertHeader', label: 'Header', icon: Icons.header, action: 'insertHeader' },
              { type: 'button', id: 'insertFooter', label: 'Footer', icon: Icons.footer, action: 'insertFooter' },
            ]
          },
        ]
      },
      {
        id: 'view', label: 'View', icon: Icons.eye,
        groups: [
          {
            tools: [
              { type: 'button', id: 'toggle-outline', label: 'Outline', icon: Icons.list, action: 'toggleOutline' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'mode-slideshow', label: 'Slideshow', icon: Icons.slideshow, action: 'layout:slideshow' },
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'preview-single', label: 'Single', icon: Icons.singlePage, action: 'preview:single' },
              { type: 'button', id: 'preview-all', label: 'All', icon: Icons.rows, action: 'preview:all' },
            ]
          }
        ]
      },
    ]
  }
}

defineExpose({
  editorRef, insertAtCursor, getSelection, undo, redo, clearHistory,
  canUndo, canRedo, getToolbarConfig, handleToolAction, previewMode, showThumbnailsLocal,
  hasSlideClass,
  /** 滚动编辑器到当前光标位置（工具栏插入后调用） */
  scrollToCursor() {
    const view = (editorRef.value as any)?.getEditor?.()
    if (view) {
      const pos = view.state.selection.main.head
      view.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      })
    }
  },
  /** 查询当前可见 slide 的 DOM section 是否包含指定 class（供 toolbar active state） */
  checkActiveSlideClass(cls: string) {
    const svgs = marpOutRef.value?.querySelectorAll?.('[data-marpit-svg]') ?? []
    for (const svg of svgs) {
      if ((svg as HTMLElement).style.display === 'none') continue // single mode: 只查可见 slide
      // all mode: 所有 slide 可见，按 currentSlide 索引匹配；single mode: 只有一个可见
      if (previewMode.value === 'all' && Array.from(svgs).indexOf(svg) !== currentSlide.value) continue
      const sec = svg.querySelector('section[id], section:not([data-marpit-pagination])')
      return sec?.classList?.contains(cls) ?? false
    }
    return false
  },
  initContent(content: string) {
    localContent.value = content
      ; (editorRef.value as any)?.initContent?.(content)
  },
})
</script>

<style>
/* flash highlight for directive focus — 瞬间亮，背景渐隐 */
.chr-flash-line {
  background: var(--accent)!important;
  border-radius: 4px;
}
.chr-flash-line.remove {
  background: transparent !important;
  transition: background 2s ease-out, color 2s ease-out, border-radius 2s ease-out;
}

.preview-pane.single [data-marpit-svg] {
  position: absolute;
  inset: 0;
  margin: auto;
  max-width: 100%;
  max-height: 100%
}

.preview-pane.full [data-marpit-svg] {
  display: block
}
</style>

<style scoped>
.preview-pane {
  position: relative
}

.slides-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

/* ── Thumbnail strip ──────────────────────────────── */
.thumbnail-strip {
  width: min(200px, 25vw);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  margin: 10px;
}

.thumbnail-strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: .75rem;
  color: var(--comp-text-sec);
}

.thumbnail-count {
  font-weight: 500;
  font-variation-settings: 'wght' 500;
}

.thumbnail-toggle {
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--comp-text-sec);
  padding: 2px;
  width: 22px;
  height: 22px;
  transition: background 0.2s, color 0.2s;
}

.thumbnail-toggle:hover {
  background: var(--hover);
  color: var(--comp-text-pri);
}

.thumbnail-toggle .icon-svg :deep(svg) {
  width: 18px;
  height: 18px;
  transform: rotate(90deg);
}

.thumbnail-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;

  background: var(--comp-bg-blur);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-elev-1);
}

.thumbnail-list::-webkit-scrollbar {
  width: 6px;
}

.thumbnail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: .75rem;
  color: var(--comp-text-sec);
  border: 1px solid transparent;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.thumbnail-item.active {
  background: var(--comp-bg-accent);
  border-color: var(--accent);
  color: var(--app-text-pri);
}

.thumbnail-item:hover:not(.active) {
  background: var(--comp-bg-accent-hvr);
}

.thumbnail-num {
  font-weight: 700;
  font-size: 11px;
  min-width: 18px;
  text-align: center;
  color: var(--comp-text-sec);
}

.thumbnail-item.active .thumbnail-num,.thumbnail-item.active .thumbnail-label {
  color: var(--comp-text-pri-hl);
}

.thumbnail-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-notes-dot {
  font-size: 9px;
  flex-shrink: 0;
}

/* ── Panes ─────────────────────────────────────────── */
.pane {
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  min-width: 0;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--app-bg-pri);
}

.empty-preview {
  text-align: center;
  color: var(--comp-text-sec);
  padding: 2rem;
  line-height: 1.8;
}

.empty-preview code {
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

/* ── Speaker notes ─────────────────────────────────── */
.speaker-notes-panel {
  width: 100%;
  max-width: 960px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
}

.notes-toggle {
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--comp-text-sec);
}

.notes-toggle:hover {
  background: var(--hover);
}

.notes-content {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--comp-text-sec);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
}

/* ── Controls bar ──────────────────────────────────── */
.slide-controls-bar {
  display: flex;
  position: absolute;
  align-items: center;
  justify-content: center;
  bottom: 24px;
  gap: 8px;
  padding: 4px 12px;
  background: var(--comp-bg-blur);
  backdrop-filter: blur(6px);
  border-radius: 99999px;
  box-shadow: var(--shadow-elev-2);
  font-size: .8rem;
  color: var(--comp-text-pri);
}

.slide-controls-bar button {
  border: none;
  padding: 6px 8px;
  border-radius: 8px;
  background: transparent;
  color: var(--comp-text-sec);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s, color 0.2s;
}

.slide-controls-bar button .icon-svg :deep(svg) {
  width: 18px;
  height: 18px;
}

.slide-controls-bar button .icon-svg.reverse :deep(svg) {
  transform: rotate(180deg);
}


.slide-controls-bar button:hover {
  background: var(--hover);
  color: var(--comp-text-pri);
  cursor: pointer;
  font-size: 12px;
}

.slide-controls-bar button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.slide-position {
  font-weight: 500;
  font-variation-settings: 'wght' 500;
  letter-spacing: .5px;
  min-width: 50px;
  text-align: center;
}

/* ── Split area ──────────────────────────────────── */
.split-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
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
</style>
