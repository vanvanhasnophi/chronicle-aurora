<!--
  Chronicle Manager — Markdown-it Preview Panel (Pipeline B)

  ContentBlock-based: each markdown block (paragraph, heading, code, list…)
  becomes a ContentBlock with its own rendered HTML + stable memo.
  Active-block CSS class is applied OUTSIDE v-memo so cursor movement
  never triggers content re-render.
-->
<template>
  <div class="chr-md mdit-preview" :class="$attrs.class" @click="handleClick" ref="containerRef">
    <template v-for="(blk, i) in blocks" :key="`b-${i}`">
      <!-- active class on wrapper — cheap CSS toggle, no re-render -->
      <div :class="{ 'active-block': i === activeBlockIndex }">
        <!-- content with v-memo — only re-renders when memo changes -->
        <CodeChunk
          v-if="blk.type === 'code'"
          v-memo="[blk._memo]"
          :modelValue="blk.content"
          :language="blk.language || 'plain'"
          :readonly="true"
        />
        <div v-else v-memo="[blk._memo]" v-html="blk.content" />
      </div>
    </template>
    <!-- Footnotes rendered separately — not part of cursor→block mapping -->
    <div v-if="footnoteHtml" class="chronicle-footnotes" v-html="footnoteHtml" />
  </div>
  <component v-if="mathTooltipLoaded && MathTooltipComp" :is="MathTooltipComp" />
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { renderBlockHtml, renderFootnoteHtml, getBlockRanges, getChangedSegIndices, getSegIndexAtLine } from '../utils/markdownPreview'
import type { ContentBlock } from '../utils/markdownPreview'
import { debounce } from '../utils/debounce'
import { usePreview } from '../composables/usePreview'
import useMathTooltip from '../composables/useMathTooltip'
import CodeChunk from './CodeChunk.vue'
import '@chronicle/shared/src/styles/chronicle-markdown.css'

const props = defineProps<{
  markdown: string
  cursorLine?: number
  changeRange?: { from: number; to: number } | null
  /** Print preview: render every <details> already open (no post-mount toggle). */
  openDetails?: boolean
}>()

const { openImagePreview, openPreview } = usePreview()
const mathTooltip = useMathTooltip()

const containerRef = ref<HTMLDivElement | null>(null)
const MathTooltipComp = ref<any>(null)
const mathTooltipLoaded = ref(false)

// ── ContentBlock data ────────────────────────────────────

interface KeyedBlock extends ContentBlock {
  _memo: string
}

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i) | 0 }
  return (h >>> 0).toString(36)
}

function blockMemo(b: ContentBlock): string {
  return `${b.type}-${b.language || ''}-${b.content.length}-${hashStr(b.content.substring(0, 120))}`
}

const blocks = ref<KeyedBlock[]>([])
const activeBlockIndex = ref(-1)
const footnoteHtml = ref('')

const emit = defineEmits<{ (e: 'rendered'): void }>()

function notifyRendered() {
  void nextTick(() => emit('rendered'))
}

// ── Incremental update ───────────────────────────────────

const updateBlocks = debounce(() => {
  if (!props.markdown || !props.markdown.trim()) {
    blocks.value = []
    footnoteHtml.value = ''
    notifyRendered()
    return
  }
  try {
    // Build ContentBlocks from markdown tokens + render each block to HTML
    const raw = renderBlockHtml(props.markdown, { openDetails: props.openDetails })
    footnoteHtml.value = renderFootnoteHtml(props.markdown)
    const prev = blocks.value
    const ranges = getBlockRanges(props.markdown)
    const range = props.changeRange

    // Determine which indices changed
    let dirtyIndices: Set<number> | null = null
    if (range && prev.length === raw.length && prev.length > 0) {
      const span = range.to - range.from
      if (span < 30) {
        dirtyIndices = getChangedSegIndices(ranges, Math.max(1, range.from - 1), range.to + 1)
      }
    }

    // Build output, keeping stable references for unchanged blocks
    const next: KeyedBlock[] = []
    for (let i = 0; i < raw.length; i++) {
      const memo = blockMemo(raw[i])
      const dirty = dirtyIndices ? dirtyIndices.has(i) : true
      if (!dirty && i < prev.length && prev[i]?._memo === memo) {
        next.push(prev[i]!) // unchanged → same object reference
      } else {
        next.push({ ...raw[i], _memo: memo })
      }
    }
    blocks.value = next
    notifyRendered()
  } catch {
    blocks.value = [{ type: 'html', content: `<pre>${escapeHtml(props.markdown || '')}</pre>`, _memo: 'err' }]
    notifyRendered()
  }
}, 100)

// Markdown or changeRange → rebuild blocks (debounced)
watch(() => props.markdown, () => updateBlocks(), { immediate: true })

// Cursor-only movement → update active index immediately (no re-render)
watch(() => props.cursorLine, (line) => {
  if (!line) { activeBlockIndex.value = -1; return }
  const ranges = getBlockRanges(props.markdown)
  activeBlockIndex.value = getSegIndexAtLine(ranges, line)
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Lazy dependencies ─────────────────────────────────────

let katex: any = null
let katexCssLoaded = false

async function ensureKatexLoaded() {
  if (!katex) {
    const mod = await import('katex')
    katex = (mod && (mod as any).default) || mod
  }
  if (!katexCssLoaded) {
    try {
      const cssUrl = (await import('katex/dist/katex.min.css?url')).default
      if (!document.getElementById('katex-css')) {
        const l = document.createElement('link')
        l.id = 'katex-css'; l.rel = 'stylesheet'; l.href = cssUrl
        document.head.appendChild(l)
      }
    } catch (_) {}
    katexCssLoaded = true
  }
}

async function loadMathTooltip() {
  if (MathTooltipComp.value) return
  try {
    const mod = await import('./MathTooltip.vue')
    MathTooltipComp.value = (mod && (mod as any).default) || mod
    mathTooltipLoaded.value = true
  } catch (_) {}
}

// ── KaTeX hydration ───────────────────────────────────────

let hydrateTimer: ReturnType<typeof setTimeout> | null = null
const katexCache = new Map<string, string>()

async function hydrateKatex(container: HTMLElement) {
  const placeholders = Array.from(
    container.querySelectorAll('.katex-placeholder:not(.katex-rendered)')
  ) as HTMLElement[]
  if (!placeholders.length) return
  await ensureKatexLoaded()
  for (const el of placeholders) {
    const tex = el.getAttribute('data-tex') || ''
    const type = el.getAttribute('data-type') || 'inline'
    const uid = el.getAttribute('data-unique-id') || ''
    if (uid && katexCache.has(uid)) { el.innerHTML = katexCache.get(uid)!; el.classList.add('katex-rendered'); continue }
    try {
      el.innerHTML = katex.renderToString(tex, { displayMode: type === 'block', throwOnError: false })
      el.classList.add('katex-rendered')
      if (uid) katexCache.set(uid, el.innerHTML)
    } catch (_) { el.textContent = tex; el.classList.add('katex-rendered') }
  }
}

async function doHydrate() {
  const container = containerRef.value
  if (!container) return
  await hydrateKatex(container)
  if (!mathTooltipLoaded.value) void loadMathTooltip()
}

function scheduleHydrate() {
  if (hydrateTimer) clearTimeout(hydrateTimer)
  hydrateTimer = setTimeout(() => { void doHydrate() }, 80)
}

watch(blocks, () => scheduleHydrate())
onMounted(() => scheduleHydrate())
onUnmounted(() => { if (hydrateTimer) clearTimeout(hydrateTimer) })

// ── Click delegation ──────────────────────────────────────

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const mathEl = target.closest('.katex-interactive') as HTMLElement | null
  if (mathEl) {
    e.stopPropagation()
    const tex = mathEl.getAttribute('data-tex')
    if (tex) mathTooltip.show({ x: e.clientX, y: e.clientY, tex, originalTex: tex, uniqueId: mathEl.getAttribute('data-unique-id') || '', blockIndex: -1, isEditing: false })
    return
  }
  if (mathTooltip.state.visible) mathTooltip.hide()

  const cardEl = target.closest('.file-card') as HTMLElement | null
  if (cardEl) {
    // <a> cards (link + mailto) — let browser handle navigation
    if (cardEl.tagName === 'A') return
    const cardUrl = cardEl.getAttribute('data-url') || ''
    const cardType = (cardEl.getAttribute('data-type') || '').toLowerCase()
    // Only explicit Link / Email types redirect; everything else previews
    if (cardType === 'link') { window.open(cardUrl, '_blank', 'noopener'); return }
    if (cardType === 'email') { window.location.href = cardUrl; return }
    e.stopPropagation()
    openPreview({ name: cardEl.getAttribute('data-name') || 'File', path: cardUrl, type: cardEl.getAttribute('data-type') || '' })
    return
  }

  if (target.tagName === 'IMG') {
    e.stopPropagation()
    const src = (target as HTMLImageElement).src
    const hook = (window as any).__CHRONICLE_OPEN_IMAGE_VIEWER__
    if (typeof hook === 'function') hook({ src, alt: (target as HTMLImageElement).alt || '', element: target })
    else openImagePreview(src)
  }
}
</script>
