<template>
  <div class="md-parser-rendered" @click="handleGlobalClick">
    <!-- Inline TOC removed; handled at page level (BlogPost.vue) -->
    <template v-for="(block, index) in localBlocks" :key="keyPrefix + index">
      <div v-if="block.type === 'table'" class="content-block" :data-block-index="index">
        <template v-if="!heavyLoaded">
          <div class="table-placeholder md-placeholder">表格内容正在加载…</div>
        </template>
        <template v-else>
          <component :is="MarkdownTableComp" :header="block.header || []" :body="block.body || []" :readOnly="readOnly" @change="(h: string[], b: string[][]) => updateTable(index, h, b)" />
        </template>
      </div>

      <div v-else-if="block.type === 'code'" class="content-block" :data-block-index="index">
        <template v-if="!heavyLoaded">
          <pre class="code-placeholder md-placeholder">{{ block.content.substring(0, 200) }}</pre>
        </template>
        <template v-else>
          <component v-if="CodeChunkComp" :is="CodeChunkComp" v-model="block.content" :language="block.language || 'plain'" :readonly="readOnly" :title="readOnly ? '' : ''" @change="(code: string, lang: string) => updateCode(index, code, lang)" />
        </template>
      </div>

      <div v-else-if="block.type === 'quote'" class="content-block text-block" :data-block-index="index" v-html="renderBlockHtml(block)"></div>
      <div v-else class="content-block text-block" :data-block-index="index">
        <div class="parsed-html-content" v-html="renderBlockHtml(block)"></div>
      </div>
    </template>
    

    <!-- Math Interaction Popup moved to standalone component (loaded after heavy components) -->
    <component v-if="heavyLoaded && MathTooltipComp" :is="MathTooltipComp" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { parseMarkdown, convertToHtml, blocksToMarkdown, type ContentBlock } from '../utils/markdownParser'
import { usePreview } from '../composables/usePreview'
import { useI18n } from 'vue-i18n'
const { t } = useI18n();
const props = withDefaults(defineProps<{
  modelValue?: string
  readOnly?: boolean
  assetMap?: Record<string, string>
  blocks?: ContentBlock[] | undefined
}>(), {
  modelValue: '',
  readOnly: false,
  assetMap: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'parsed-blocks', blocks: ContentBlock[]): void
  (e: 'rendered'): void
}>()

const localBlocks = ref<ContentBlock[]>([])
const keyPrefix = ref('block-')
const { openImagePreview, openPreview } = usePreview()

import useMathTooltip from '../composables/useMathTooltip'
import useToast from '../composables/useToast'

const mathTooltip = useMathTooltip()
const isMobile = ref(false)
const { show: showToast } = useToast()

// Heavy components will be dynamically imported to avoid blocking initial render.
const MarkdownTableComp = ref<any>(null)
const CodeChunkComp = ref<any>(null)
const AsyncHighlightComp = ref<any>(null)
const MathTooltipComp = ref<any>(null)
const heavyLoaded = ref(false)

async function loadHeavyComponents() {
  try {
    const isReadingMode = !!props.readOnly

    const loadParallel = async () => {
      // Always load table/code/highlight. Skip MathTooltip on mobile to save payload.
      const imports: Promise<any>[] = [
        import('./MarkdownTable.vue'),
        import('./CodeChunk.vue'),
        import('./AsyncHighlight.vue')
      ]
      if (!isMobile.value) imports.push(import('./MathTooltip.vue'))
      const results = await Promise.all(imports)
      const mt = results[0]
      const cc = results[1]
      const ah = results[2]
      const mtp = results[3]
      MarkdownTableComp.value = (mt && (mt as any).default) ? (mt as any).default : mt
      CodeChunkComp.value = (cc && (cc as any).default) ? (cc as any).default : cc
      AsyncHighlightComp.value = (ah && (ah as any).default) ? (ah as any).default : ah
      if (!isMobile.value && mtp) MathTooltipComp.value = (mtp && (mtp as any).default) ? (mtp as any).default : mtp
      heavyLoaded.value = true
      try { nextTick(() => { scheduleRenderMath(); emit('rendered') }) } catch(e) {}
    }

    const loadSerial = async () => {
      // Load in strict priority: MarkdownTable -> CodeChunk -> AsyncHighlight -> MathTooltip
      try {
        const mt = await import('./MarkdownTable.vue')
        MarkdownTableComp.value = (mt && (mt as any).default) ? (mt as any).default : mt
        // allow DOM to replace table placeholders immediately
        try { await nextTick(); } catch (e) {}

        const cc = await import('./CodeChunk.vue')
        CodeChunkComp.value = (cc && (cc as any).default) ? (cc as any).default : cc
        try { await nextTick(); } catch (e) {}

        const ah = await import('./AsyncHighlight.vue')
        AsyncHighlightComp.value = (ah && (ah as any).default) ? (ah as any).default : ah
        try { await nextTick(); } catch (e) {}

        if (!isMobile.value) {
          const mtp = await import('./MathTooltip.vue')
          MathTooltipComp.value = (mtp && (mtp as any).default) ? (mtp as any).default : mtp
        }
        // mark as fully loaded
        heavyLoaded.value = true
        try { nextTick(() => { scheduleRenderMath(); emit('rendered') }) } catch(e) {}
      } catch (e) {
        // ignore individual failures; components will remain as placeholders
      }
    }

    const runner = isReadingMode ? loadSerial : loadParallel
    if ((window as any).requestIdleCallback) (window as any).requestIdleCallback(() => { void runner() }, { timeout: 500 })
    else setTimeout(() => { void runner() }, 200)
  } catch (e) {
    // ignore
  }
}

// Lazy-load KaTeX on demand to avoid bundling it into the initial payload
let katex: any = null
let katexCssLoaded = false
async function ensureKatexLoaded() {
  if (!katex) {
    const mod = await import('katex')
    katex = (mod && (mod as any).default) || mod
  }
  if (!katexCssLoaded) {
    const cssUrl = (await import('katex/dist/katex.min.css?url')).default
    if (!document.getElementById('katex-css')) {
      const l = document.createElement('link')
      l.id = 'katex-css'
      l.rel = 'stylesheet'
      l.href = cssUrl
      document.head.appendChild(l)
    }
    katexCssLoaded = true
  }
}

// Cache rendered KaTeX HTML by unique-id so if placeholders are re-inserted
// (e.g. due to layout/resize or v-html rewrite) we can reuse rendered output
// and avoid calling katex.renderToString again.
const katexRenderCache = new Map<string, string>()

// Handler called by MathTooltip when user saves edits.
async function handleTooltipSave(newTex: string, uniqueId: string, blockIndex: number) {
  if (blockIndex === -1 || !localBlocks.value[blockIndex]) return
  try {
    await ensureKatexLoaded()
    if (newTex) katex.renderToString(newTex, { throwOnError: true, displayMode: true })
  } catch (e) {
    // validation should be handled in the tooltip component; block save if invalid
    return
  }

  const block = localBlocks.value[blockIndex]
  if (block.type === 'math') {
    block.content = newTex
    emit('update:modelValue', blocksToMarkdown(localBlocks.value))
    // Update cache for this unique id if provided
    if (uniqueId) {
      try {
        const html = katex.renderToString(newTex, { throwOnError: false, displayMode: true })
        katexRenderCache.set(uniqueId, html)
      } catch (e) {
        katexRenderCache.set(uniqueId, newTex)
      }
    }
    return
  }

  const text = block.content
  const matches: { start: number, end: number, content: string, full: string }[] = []
  let match: RegExpExecArray | null
  const regexBlock = /\\\[([\s\S]+?)\\\]/g
  while ((match = regexBlock.exec(text)) !== null) {
    matches.push({ start: match.index, end: regexBlock.lastIndex, content: match[1], full: match[0] })
  }
  const regexDisplay = /\$\$((?:[^\n]|\n)+?)\$\$/g
  while ((match = regexDisplay.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      matches.push({ start: match.index, end: regexDisplay.lastIndex, content: match[1], full: match[0] })
    }
  }
  const regexInlineParen = /\\\(([\s\S]+?)\\\)/g
  while ((match = regexInlineParen.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      matches.push({ start: match.index, end: regexInlineParen.lastIndex, content: match[1], full: match[0] })
    }
  }
  const regexInline = /\$((?:[^$\n]|)+?)\$/g
  while ((match = regexInline.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      if (match[1].trim()) {
        matches.push({ start: match.index, end: regexInline.lastIndex, content: match[1], full: match[0] })
      }
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const container = document.querySelector(`.content-block[data-block-index="${blockIndex}"]`)
  if (!container) return
  const placeholders = Array.from(container.querySelectorAll('.katex-interactive'))
  const targetIndex = placeholders.findIndex(el => el.getAttribute('data-unique-id') === uniqueId)

  if (targetIndex !== -1 && matches[targetIndex]) {
    const targetMatch = matches[targetIndex]
    const contentStartOffset = targetMatch.full.indexOf(targetMatch.content)
    if (contentStartOffset === -1) return
    const absStart = targetMatch.start + contentStartOffset
    const absEnd = absStart + targetMatch.content.length
    const newBlockContent = text.substring(0, absStart) + newTex + text.substring(absEnd)
    block.content = newBlockContent
    emit('update:modelValue', blocksToMarkdown(localBlocks.value))
    // Update cache for edited inline math
    if (uniqueId) {
      try {
        const html = katex.renderToString(newTex, { throwOnError: false, displayMode: false })
        katexRenderCache.set(uniqueId, html)
      } catch (e) {
        katexRenderCache.set(uniqueId, newTex)
      }
    }
  }
}


// Async math rendering state
let mathTimer: any = null
const MATH_BATCH = 12
function cancelRenderMath() {
  if (mathTimer) clearTimeout(mathTimer)
  mathTimer = null
}

async function processMathBatch() {
  const container = document.querySelector('.md-parser-rendered')
  if (!container) return
  const placeholders = Array.from(container.querySelectorAll('.katex-placeholder')) as HTMLElement[]
  // filter to those not yet marked rendered to avoid touching rendered DOM
  const pending = placeholders.filter(el => !el.classList.contains('katex-rendered')) as HTMLElement[]
  if (!pending.length) return
  const batch = pending.slice(0, MATH_BATCH)
  for (const el of batch) {
    const tex = el.getAttribute('data-tex') || ''
    const type = el.getAttribute('data-type') || 'inline'
    const uid = el.getAttribute('data-unique-id') || ''
    // If we have cached rendered HTML for this unique id, reuse it.
    if (uid && katexRenderCache.has(uid)) {
      const cached = katexRenderCache.get(uid) as string
      // If element already contains the same rendered HTML, avoid touching DOM to prevent reflow
      if (el.innerHTML && el.innerHTML.trim() === cached.trim()) {
        el.classList.add('katex-rendered')
        continue
      }
      el.innerHTML = cached
      el.classList.add('katex-rendered')
      continue
    }
    try {
      await ensureKatexLoaded()
      const html = katex.renderToString(tex, { displayMode: type === 'block', throwOnError: false })
      el.innerHTML = html
      el.classList.add('katex-rendered')
      console.log(`Rendered math: ${tex}`)
      if (uid) katexRenderCache.set(uid, html)
    } catch (e) {
      // fallback: show raw TeX
      el.textContent = tex
      el.classList.add('katex-rendered')
      if (uid) katexRenderCache.set(uid, tex)
    }
  }
  // schedule next batch if remaining
  const remaining = container.querySelectorAll('.katex-placeholder:not(.katex-rendered)').length
  if (remaining > 0) {
    mathTimer = setTimeout(() => { void processMathBatch() }, 40)
  } else {
    mathTimer = null
  }
}

function scheduleRenderMath() {
  cancelRenderMath()
  // let browser breathe a frame then start
  mathTimer = setTimeout(() => { void processMathBatch() }, 8)
}

// Inline TOC logic moved to page-level (BlogPost.vue)
// Image zoom/pan is handled by FilePreviewModal (usePreview composable)

function renderBlockHtml(block: ContentBlock): string {
  let html = convertToHtml(block)

  // Heading id injection is handled at page level (BlogPost.vue)
  
  // Replace images
  // Matches any src that is NOT http/https
  // We use a regex that captures the src content
  if (props.assetMap && Object.keys(props.assetMap).length > 0) {
      html = html.replace(/src=["']([^"']+)["']/g, (match, src) => {
          // If online url, skip
          if (/^https?:\/\//i.test(src)) {
              return match
          }
          // Resolve custom protocols
          if (src.startsWith('asset://')) {
              const resolved = `/data/assets/${src.slice(8)}`
              console.log('[renderBlockHtml] asset:// →', resolved)
              return `src="${resolved}"`
          }
          // If we have a local mapping (from upload), use it
          if (props.assetMap![src]) {
              return `src=\"${props.assetMap![src]}\"`
          }
          // Otherwise keep as is (might be absolute server path)
          return match
      })
  }
  // If we have cached KaTeX renderings for some unique ids, replace
  // the placeholder tags with the cached HTML so re-renders only affect
  // the specific formula that changed.
  html = html.replace(/<(span|div)\b([^>]*?)data-unique-id=["']([^"']+)["']([^>]*)>\s*<\/\1>/g, (match, tag, beforeAttrs, uid, afterAttrs) => {
    if (katexRenderCache.has(uid)) {
      return katexRenderCache.get(uid) as string
    }
    return match
  })
  return html
}


async function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  const mathWrapper = target.closest('.katex-interactive') as HTMLElement
  if (mathWrapper) {
    e.stopPropagation()
    const tex = mathWrapper.getAttribute('data-tex')
    const uniqueId = mathWrapper.getAttribute('data-unique-id') || ''
    const contentBlock = mathWrapper.closest('.content-block') as HTMLElement
    // blockIndex might be on the content-block or its parent depending on structure
    // We added :data-block-index="index" to .content-block
    const blockIndexStr = contentBlock?.getAttribute('data-block-index')
    const blockIndex = blockIndexStr ? parseInt(blockIndexStr, 10) : -1

    if (tex) {
        if (isMobile.value) {
        // On mobile just copy TeX source to clipboard instead of opening editor tooltip
        let copied = false
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(tex)
            copied = true
          } else {
            // fallback: create temporary textarea
            const t = document.createElement('textarea')
            t.value = tex
            document.body.appendChild(t)
            t.select()
            try { copied = document.execCommand('copy') } catch (e) { copied = false }
            t.remove()
          }
        } catch (e) {
          copied = false
        }
        if (copied) showToast(t('formula.copied'),{status: 'success', position: 'bottom-center', shape: 'capsule'} )
        return
      }
      mathTooltip.show({ x: e.clientX, y: e.clientY, tex, uniqueId, blockIndex, isEditing: !props.readOnly, onSave: handleTooltipSave })
      return
    }
  }

  // post:// cross-post link — open in new tab/window
  const postLink = target.closest('a[data-post-link]') as HTMLAnchorElement
  if (postLink) {
    e.preventDefault()
    e.stopPropagation()
    window.open(postLink.href, '_blank')
    return
  }

  // File Card Click
  const cardEl = target.closest('.file-card') as HTMLElement
  if (cardEl) {
      // If the card is an anchor (mailto/link), allow native navigation and do not open preview
      if (cardEl.tagName === 'A') {
        return
      }
      const cardType = cardEl.getAttribute('data-type') || ''
      // Link/Post type → navigate, not file preview
      if (cardType === 'Link' || cardType === 'Post') {
        e.preventDefault()
        e.stopPropagation()
        const url = cardEl.getAttribute('data-url') || ''
        if (url) window.open(url, '_blank')
        return
      }
      e.stopPropagation()
      const url = cardEl.getAttribute('data-url') || ''
      const name = cardEl.getAttribute('data-name') || 'File'
      const type = cardEl.getAttribute('data-type') || ''
      openPreview({
        name,
        path: url,
        type
      })
      return
  }

  // Image Click Handling
  if (target.tagName === 'IMG' && target.classList.contains('md-image')) {
    const wrapper = target.closest('.md-image-wrapper')
    if (!wrapper || !wrapper.classList.contains('loaded')) return
    e.stopPropagation()
    const src = (target as HTMLImageElement).src
    const hook = (window as any).__CHRONICLE_OPEN_IMAGE_VIEWER__
    if (typeof hook === 'function') {
      hook({ src, alt: (target as HTMLImageElement).alt || '', element: target })
    } else {
      openImagePreview(src)
    }
    return
  }

  // Click elsewhere closes tooltip
  mathTooltip.hide()
}


// Tooltip UI moved to MathTooltip component which handles its own outside-click listeners

const IMAGE_LOAD_TIMEOUT_MS = 20000

onMounted(() => {
  // prefer site-level class `is-mobile` set on <html>; fallback to UA/touch probe
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      isMobile.value = document.documentElement.classList.contains('is-mobile')
    }
  } catch (e) {}

  // If parent provided parsed blocks, use them instead of parsing modelValue
  if (props.blocks && Array.isArray(props.blocks) && props.blocks.length) {
    localBlocks.value = props.blocks as ContentBlock[]
    nextTick(() => {
      emit('rendered')
      scheduleRenderMath()
    })
  }
  // Start loading heavy components in background
  try { void loadHeavyComponents() } catch(e) {}
})
onUnmounted(() => {
  cancelRenderMath()
})

watch(() => props.modelValue, (newVal) => {
  // If parent provided blocks (even empty array), assume parent controls content
  if (props.blocks !== undefined) return

  if (newVal === blocksToMarkdown(toRaw(localBlocks.value))) {
    return
  }
  localBlocks.value = parseMarkdown(newVal || '')
  emit('parsed-blocks', toRaw(localBlocks.value))
  nextTick(() => {
    emit('rendered')
    scheduleRenderMath()
    // start loading heavy components after initial text render
    try { void loadHeavyComponents() } catch(e) {}
  })
}, { immediate: true })

// Watch for parent-updated blocks and adopt them
watch(() => props.blocks, (b) => {
  if (b && Array.isArray(b)) {
    localBlocks.value = b as ContentBlock[]
    nextTick(() => {
      emit('rendered')
      scheduleRenderMath()
    })
  }
})
// ... rest of script to follow

function updateTable(index: number, header: string[], body: string[][]) {
  if (props.readOnly) return
  const block = localBlocks.value[index]
  if (block && block.type === 'table') {
    block.header = header
    block.body = body
    sync()
  }
}

function updateCode(index: number, code: string, lang: string) {
  if (props.readOnly) return
  const block = localBlocks.value[index]
  if (block && block.type === 'code') {
    block.content = code
    block.language = lang
    sync()
  }
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const offset = 72
  const top = window.scrollY + rect.top - offset
  window.scrollTo({ top, behavior: 'smooth' })
}

function sync() {
  const md = blocksToMarkdown(toRaw(localBlocks.value))
  emit('update:modelValue', md)
}

defineExpose({
  getMarkdown: () => blocksToMarkdown(toRaw(localBlocks.value))
})
</script>

<style>
.katex-interactive, .katex-interactive-block {
  cursor: pointer;
  transition: background-color 0.2s;
  border-radius: 4px;
}


.math-tooltip {
  position: fixed;
  z-index: 9999;
  background-color: var(--app-bg-pri);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-elev-2);
  padding: 8px;
  min-width: 200px;
  max-width: 400px;
  color: var(--comp-text-pri);
  font-size: 14px;
  /* v-if handles visibility now, so we start visible */
  opacity: 1;
  transform: translateY(0);
  animation: tooltipFadeIn 0.16s ease;
}

@keyframes tooltipFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

.math-tooltip-tex {
  /* Deprecated, using editor structure instead */
  display: none;
}
/* Reused styles for content */
.math-tooltip-content { display: none; } 

.math-tooltip-actions .icon-btn {
  background: var(--hover);
  border: 1px solid var(--border-color);
  color: var(--comp-text-pri);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
}
.math-tooltip-actions .square-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px; /* Square with slight radius */
}
.math-tooltip-actions .save-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.validation-error {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--status-error);
    background: var(--status-error-bg);
    border: 1px solid var(--status-error);
    border-radius: 4px;
    padding: 6px 8px;
    margin-top: 4px;
}
.validation-error svg {
    flex-shrink: 0;
}

hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 16px 0;
}

.math-tooltip-actions .icon-btn:hover {
  background-color: var(--active);
  border-color: var(--accent);
  color: var(--app-text-pri);
}

/* Edit Mode Styles */
.math-tooltip.editing {
  min-width: 400px;
  width: 400px;
  max-width: 600px;
}
.math-tooltip-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 80vh;
}

.math-tooltip-editor .editor-wrapper {
  position: relative;
  min-height: 48px;
  max-height: 200px; /* Limit max height */
  background: var(--comp-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.math-tooltip-editor .editor-content {
  position: relative;
  width: 100%;
}

.math-tooltip-editor .syntax-hl {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 8px;
  padding-bottom: 24px;
  min-height: 48px; /* Should match wrapper min-height roughly */
  font-family: var(--app-font-stack-mono);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word; /* Ensure wrapping so it dictates height */
  box-sizing: border-box;
  color: var(--comp-text-pri);
  pointer-events: none;
}

.math-tooltip-editor .code-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 8px;
  padding-bottom: 20px;
  border: none;
  font-family: var(--app-font-stack-mono);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background: transparent;
  color: transparent;
  caret-color: var(--app-text-pri);
  resize: none;
  border: none;
  outline: none;
  z-index: 10;
  overflow: hidden; /* Hide scrollbar, use wrapper's */
  box-sizing: border-box;
}

/* Cleanup redundant styles */
.math-tooltip-editor .editor-wrapper {
   min-height: 42px;
}
.math-tooltip-editor .syntax-hl {
   padding-bottom: 20px;
   min-height: 42px;
}

.math-tooltip-editor .code-textarea {
  font-family: var(--app-font-stack-mono); /* Force monospace */
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word; /* Deprecated but useful fallback */
  overflow-wrap: break-word;
  background: transparent;
  color: transparent;
  caret-color: var(--app-text-pri);
  resize: none;
  border: none;
  outline: none;
  z-index: 10;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 8px;
  padding-bottom: 20px; /* Consistent padding */
  overflow: hidden; /* Prevent double scrollbars, rely on wrapper */
  pointer-events: auto; /* Allow input */
}

.math-tooltip-editor .syntax-hl {
  position: relative;
  margin: 0;
  padding: 8px;
  padding-bottom: 20px; /* Consistent padding */
  pointer-events: none;
  background: transparent;
  width: 100%;
  font-family: var(--app-font-stack-mono); /* Force monospace */
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word; /* Deprecated but useful fallback */
  overflow-wrap: break-word;
}

/* The wrapper now scrolls if content exceeds its max-height */
.math-tooltip-editor .editor-wrapper {
  overflow-y: auto; /* Allow scrolling on wrapper */
}

.math-tooltip-editor .syntax-hl {
  pointer-events: none;
  background: transparent;
  color: var(--comp-text-pri);
  z-index: 0;
  /* Override padding-bottom for the highlighter so it aligns with textarea but doesn't trap scroll */
  /* Actually they must match exactly for alignment */
}

.math-tooltip-editor .code-textarea {
  background: transparent;
  color: transparent;
  caret-color: var(--app-text-pri);
  resize: none;
  outline: none;
  z-index: 1;
}

/* Ensure read-only highlight has proper scrolling if content is long */
.syntax-hl-readonly {
  width: 100%;
  box-sizing: border-box;
}

.math-tooltip-editor .math-tooltip-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}

.math-tooltip-actions .text-btn {
  width: auto;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  background: var(--comp-bg-glass-hvr);
  color: var(--comp-text-pri);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.math-tooltip-actions .text-btn:hover {
  background-color: var(--comp-bg-glass-active);
  border-color: var(--accent);
  color: var(--app-text-pri);
}


</style>

<style>
.md-parser-rendered {
  width: 100%;
}
.content-block {
  margin: 1em 0;
}
.md-quote-block {
  background: var(--comp-bg-glass-hvr);
  border-left: 4px solid var(--accent);
  padding: 0.5em 1em;
  margin: 0.5em 0;
  border-radius: 4px;
  line-height: 1.6;
}
.md-quote-block br {
  line-height: 1.2;
  display: block;
  margin: 0.2em 0 0.2em 0;
}
.md-quote-block .quote-hard-break {
  display: block;
  height: 1.6em;
  content: '';
}
.md-quote-block .backslash {
  font-family: var(--app-font-stack-mono);
  color: var(--comp-text-sec);
  padding: 0 0.1em;
}

/* Inline code — keep in sync with chronicle-markdown.css (.chr-md code).
   No chip background: accent-tinted ink only.  --code-bg / --code-text
   remain reserved for editor syntax highlighting and danger tints. */
code {
  color: color-mix(in srgb, var(--accent) 20%, var(--app-text-pri));
  padding: 0.2em 0.3em;
  font-size: 0.9em;
  font-family: var(--app-font-stack-mono);
  font-weight: 500;
  vertical-align: baseline;
}

.text-block p {
  margin: 0.8em 0;
  line-height: 1.6;
}

/* 修复强调标签样式 */
i, em {
  font-style: italic;
}
strong, b {
  font-weight: bold;
  font-variation-settings: 'wght' 700;
}

/* Image Centering & Wrapper */
.md-image-container {
  display: block;
  margin: 1em auto;
  width: fit-content; /* Ensure caption stays with image width or minimal needed */
  text-align: center;
  max-width: 100%;
}

.md-image-wrapper {
  display: block;
  margin: 0 auto; /* Center inside container */
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  max-width: 100%;
  width: fit-content;
  min-width: 200px;
  min-height: 120px;
  padding: 0 16px;
  box-sizing: border-box;
  background-color: var(--comp-bg);
}

.md-image-wrapper::before {
  content: attr(data-placeholder-text);
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 0;
  font-family: var(--app-font-stack);
  font-size: 14px;
  color: var(--comp-text-pri);
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
}

.md-placeholder-text {
  display: none;
}

.md-image-wrapper .md-image {
  position: relative;
  z-index: 1;
}

.md-image-caption {
  display: block;
  margin-top: 8px;
  font-size: 0.9em;
  color: var(--comp-text-sec);
  text-align: center;
  font-family: var(--app-font-stack);
  width: 100%; /* Ensure it spans the container's width */
}

.md-image {
  max-width: 100%;
  max-height: 500px; /* Max height in document flow */
  height: auto;
  border-radius: 8px;
  display: block;
  cursor: zoom-in;
  object-fit: contain; /* Ensure it doesn't stretch */
}

.md-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: color 0.2s;
}

.md-link:hover {
  color: var(--accent-hvr);
}

/* Image Preview Modal */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: var(--app-height);
  background: var(--comp-bg-blur);
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  animation: fadeIn 0.2s ease;
}

.preview-close-btn {
  position: absolute;
  top: 30px;
  right: 30px;
  background: var(--comp-bg-glass);
  border: none;
  color: var(--app-text-pri);
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10001;
  transition: background 0.2s, transform 0.1s;
  padding: 0;
  box-shadow: var(--shadow-elev-1);
}
.preview-close-btn:hover {
  background: var(--comp-bg-blur);
  transform: scale(1.05);
}
.preview-close-btn svg {
  width: 24px;
  height: 24px;
}
.preview-close-btn:hover {
  background: var(--comp-bg-glass-hvr);
}

.image-preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-content {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
  box-shadow: var(--shadow-elev-3);
  cursor: grab;
  transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  will-change: transform;
}
.image-preview-content.is-dragging {
  transition: none !important;
}
.image-preview-content:active {
  cursor: grabbing;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* File Card Styles */
.file-card {
  display: inline-flex;
  align-items: center;
  background-color: var(--comp-bg-glass);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  max-width: 240px;
}

.file-card:hover {
  background-color: var(--comp-bg-glass-hl);
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: var(--shadow-elev-1);
}

.file-card-icon {
  width: 24px;
  height: 24px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--comp-text-pri);
}
.file-card:hover .file-card-icon {
    color: var(--accent);
}

.file-card-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}


.file-card-title {
  font-size: 14px;
  color: var(--comp-text-pri);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-card-subtitle {
  font-size: 11px;
  color: var(--comp-text-sec);
  margin-top: 2px;
  /* Truncate long subtitles with ellipsis */
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
