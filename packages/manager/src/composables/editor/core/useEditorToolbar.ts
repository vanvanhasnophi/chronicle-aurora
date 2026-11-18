/**
 * useEditorToolbar — Ribbon 工具栏、快捷键、插入操作
 *
 * 职责：
 *   1. Ribbon 标签页配置（从 body 组件获取 toolbar config）
 *   2. 工具栏动作分发（handleToolAction）—— 布局/字体/媒体/链接/表格/公式/脚注/代码/TODO/引用
 *   3. 撤销/重做（委托给 CodeMirror）
 *   4. KaTeX 公式实时预览 + 插入（inline/block）
 *   5. 链接/表格插入弹窗的状态管理
 *   6. 字数统计
 *
 * 依赖：editorBodyRef（光标操作）、useEditorView.LayoutMode
 */
import { ref, computed, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import { getStats } from '../../../utils/markdownParser'
import { Icons } from '../../../utils/icons'
import type { LayoutMode } from './useEditorLayout'
import type { DropdownPreset } from './useToolDropdown'
import { getSlideStore } from '../slides/useSlideDirectives'

export interface EditorToolbarOptions {
  editorBodyRef: Ref<any>
  editorType: Ref<'article' | 'slides'>
  postFont: Ref<string>
  localValue: Ref<string>
  isCloudEditing: ComputedRef<boolean>
  layout: Ref<LayoutMode>
  activeModal: Ref<string>
  /** 打开媒体弹窗（来自 useEditorMedia） */
  openMediaModal: () => void
  /** 打开文件菜单的导出标签页（来自 useFileMenu） */
  openExportModal: () => void
  t: (key: string, options?: Record<string, any>) => string
}

export interface RibbonTool { type: 'button' | 'spacer'; id?: string; label?: string; icon?: string; action?: string; isStats?: boolean; onClick?: (e: MouseEvent) => void; popover?: DropdownPreset | (() => DropdownPreset); popoverOnSelect?: (action: string) => void }
export interface RibbonTabDef { id: string; label: string; icon: string; groups: Array<{ tools: RibbonTool[] }> }

export function useEditorToolbar(options: EditorToolbarOptions) {
  const {
    editorBodyRef, editorType, postFont, localValue, isCloudEditing,
    layout, activeModal, openMediaModal, openExportModal, t,
  } = options

  // ══════════════════════════════════════════════════════
  // Ribbon 标签页
  // ══════════════════════════════════════════════════════

  const ribbonTabs = ref<RibbonTabDef[]>([])
  const activeTab = ref('')
  const activeTabDef = computed(() => ribbonTabs.value.find(t => t.id === activeTab.value))

  /**
   * 从 body 组件加载工具栏配置。
   * 在 mounted 和 editorType 切换时调用。
   */
  function loadToolbarConfig() {
    void nextTick(() => {
      const config = editorBodyRef.value?.getToolbarConfig?.()
      if (config?.tabs) {
        ribbonTabs.value = (config.tabs as RibbonTabDef[]).map(tab => ({
          ...tab,
          label: `editor.tab.${tab.id}` || tab.label,
        }))
        if (!ribbonTabs.value.find(t => t.id === activeTab.value)) {
          activeTab.value = ribbonTabs.value[0]?.id || ''
        }
      }
    })
  }
  watch(editorType, loadToolbarConfig)

  /**
   * 判断工具栏按钮是否处于激活状态。
   * 支持 layout: / font: / preview: / toggleOutline 前缀。
   */
  function isToolActive(action: string): boolean {
    if (action.startsWith('layout:')) return layout.value === action.slice(7)
    if (action.startsWith('font:')) return postFont.value === action.slice(5)
    if (action === 'preview:single') return (editorBodyRef.value as any)?.previewMode === 'single'
    if (action === 'preview:all') return (editorBodyRef.value as any)?.previewMode === 'all'
    if (action === 'toggleOutline') return !!(editorBodyRef.value as any)?.showThumbnailsLocal
    // slides class toggle active states — 通过模块级 store 读 slide 状态机
    const checkSlideClass = (cls: string) => {
      const s = getSlideStore()
      if (!s) return false
      return s.hasSlideClass(s.currentSlide.value, cls)
    }
    if (action === 'insertClassLead') return checkSlideClass('lead')
    if (action === 'insertClassColumns') return checkSlideClass('columns')
    if (action === 'insertClassColumns2') return checkSlideClass('columns-2')
    if (action === 'insertClassColumns3') return checkSlideClass('columns-3')
    if (action === 'insertPaginate') { const s = getSlideStore(); return s?.hasPaginate(s.currentSlide.value) ?? false }
    return false
  }

  /**
   * Ribbon 工具栏动作分发器。
   * 支持的动作前缀：
   *   layout:xxx  — 切换布局
   *   font:xxx    — 切换字体
   *   普通 action  — openMediaModal / openLinkModal / openTableModal /
   *                 openMathModal / insertFootnote / insertCode /
   *                 insertTodo / insertQuote / stats / export /
   *                 幻灯片专属动作（委托给 body.handleToolAction）
   */
  function handleToolAction(action: string) {
    if (action.startsWith('layout:')) {
      layout.value = action.slice(7) as LayoutMode
    } else if (action.startsWith('font:')) {
      postFont.value = action.slice(5)
    } else if (action === 'openMediaModal') {
      openMediaModal()
    } else if (action === 'openLinkModal') {
      openLinkModalInner()
    } else if (action === 'openTableModal') {
      openTableModalInner()
    } else if (action === 'openMathModal') {
      mathInput.value = (editorBodyRef.value?.getSelection() as any)?.text || ''
      mathMode.value = 'inline'
      activeModal.value = 'math'
    } else if (action === 'insertFootnote') {
      insertFootnote()
    } else if (action === 'insertCode') {
      const sel = (editorBodyRef.value?.getSelection() as any)?.text || ''
      if (sel) {
        const isSingle = !sel.includes('\n')
        const md = isSingle ? '`' + sel + '`' : '\n```\n' + sel + '\n```\n'
        editorBodyRef.value?.insertAtCursor(md)
      } else {
        editorBodyRef.value?.insertAtCursor('\n```\n\n```\n')
      }
    } else if (action === 'insertTodo') {
      const sel = (editorBodyRef.value?.getSelection() as any)?.text?.trim() || ''
      if (sel) {
        const isSingle = !sel.includes('\n')
        const after = isSingle ? '\n\n' : '\n'
        const lines = '\n' + sel.split('\n').filter((l: string) => l.trim()).map((l: string) => `- [ ] ${l}`).join('\n') + after
        editorBodyRef.value?.insertAtCursor(lines)
      } else {
        editorBodyRef.value?.insertAtCursor('\n- [ ] \n')
      }
    } else if (action === 'insertQuote') {
      const sel = (editorBodyRef.value?.getSelection() as any)?.text || ''
      const text = sel.trim()
      if (text) {
        const isSingle = !text.includes('\n')
        const after = isSingle ? '\n\n' : '\n'
        const lines = '\n' + text.split('\n').map((l: string) => l.trim() ? `> ${l}` : '>').join('\n') + after
        editorBodyRef.value?.insertAtCursor(lines)
      } else {
        editorBodyRef.value?.insertAtCursor('\n> \n')
      }
    } else if (action === 'insertDetails') {
      insertDetails()
    } else if (action === 'stats') {
      activeModal.value = 'stats'
    } else if (action === 'export') {
      openExportModal()
    } else {
      // 幻灯片专属动作（如 insert-slide 等）
      ;(editorBodyRef.value as any)?.handleToolAction?.(action)
    }
    // 插入/修改操作后导航到光标
    const navActions = ['insertCode', 'insertTodo', 'insertQuote', 'insertDetails', 'openMathModal', 'insertFootnote', 'openLinkModal', 'openTableModal']
    if (navActions.includes(action)) {
      (editorBodyRef.value as any)?.scrollToCursor?.()
    }
  }

  /**
   * 插入折叠块：完整的 <details> + <summary> 结构，光标停在内层内容区。
   * 有选区时把选区包进折叠内容，否则插入空块。
   */
  function insertDetails() {
    const label = t('editor.detailsSummary') || 'Details'
    const selected = ((editorBodyRef.value?.getSelection() as any)?.text || '').trim()
    const open = `\n<details>\n<summary>${label}</summary>\n\n`
    const close = selected ? `\n</details>\n` : `</details>\n`
    const text = open + selected + close
    // 光标落在 summary 与结束标签之间：空块时停在那条空行上。
    const cursorOffset = open.length + selected.length - (selected ? 0 : 1)
    editorBodyRef.value?.insertAtCursor?.(text, cursorOffset)
  }

  // ══════════════════════════════════════════════════════
  // KaTeX 公式
  // ══════════════════════════════════════════════════════

  const mathInput = ref('')
  const mathMode = ref<'inline' | 'block'>('inline')
  const mathPreviewRef = ref<HTMLElement | null>(null)

  let _katex: any = null
  /** 懒加载 KaTeX（动态 import，首屏不阻塞） */
  function loadKatex() {
    if (_katex) return Promise.resolve(_katex)
    return import('katex').then(m => { _katex = m.default || m; return _katex })
  }

  /** 公式输入实时预览（debounce via nextTick） */
  watch(mathInput, (val) => {
    void nextTick(async () => {
      const el = mathPreviewRef.value
      if (!el || !val.trim()) { if (el) el.innerHTML = ''; return }
      try {
        const katex = await loadKatex()
        katex.render(val, el, { throwOnError: false, displayMode: false })
      } catch { el.textContent = val }
    })
  })

  /**
   * 插入 KaTeX 公式。
   * 幻灯片用 $/$ 分隔符（Marp 兼容），文章用 \(/\[ 分隔符（标准 LaTeX）。
   */
  function insertMath() {
    if (!mathInput.value.trim()) return
    const formula = mathInput.value.trim()
    const isSlides = editorType.value === 'slides'
    const md = mathMode.value === 'inline'
      ? (isSlides ? `$${formula}$` : `\\(${formula}\\)`)
      : (isSlides ? `\n$$\n${formula}\n$$\n` : `\n\\[\n${formula}\n\\]\n`)
    editorBodyRef.value?.insertAtCursor(md)
    mathInput.value = ''
    activeModal.value = 'none'
  }

  // ══════════════════════════════════════════════════════
  // 脚注
  // ══════════════════════════════════════════════════════

  /**
   * 插入脚注引用 + 在段落后追加定义。
   * 使用 CodeMirror 原生 API 精确控制插入位置。
   */
  function insertFootnote() {
    const ref = `[^${Date.now().toString(36)}]`
    const body = editorBodyRef.value as any
    const view = body?.editorRef?.getEditor?.()
    if (!view) return
    const sel = view.state.selection.main
    const selText = sel.from !== sel.to ? view.state.sliceDoc(sel.from, sel.to) : ''
    // 在光标/选区后插入引用
    view.dispatch({ changes: { from: sel.to, insert: ref } })
    // 找到段尾插入定义
    const doc = view.state.doc.toString()
    const pos = sel.to + ref.length
    const after = doc.slice(pos)
    const m = after.match(/\n\s*\n|$/)
    const insertAt = m?.index != null ? pos + m.index : doc.length
    view.dispatch({ changes: { from: insertAt, insert: `\n\n${ref}: ${selText}` } })
  }

  // ══════════════════════════════════════════════════════
  // 链接弹窗
  // ══════════════════════════════════════════════════════

  const linkText = ref('')
  const linkUrl = ref('')

  /** 打开链接弹窗——如果有选区则预填链接文本 */
  function openLinkModalInner() {
    const sel = (editorBodyRef.value?.editorRef as any)?.getSelection?.()
    if (sel && sel.from !== sel.to) linkText.value = sel.text
    linkUrl.value = ''
    activeModal.value = 'link'
  }

  function insertLink() {
    const text = linkText.value || 'Link'
    const url = linkUrl.value || '#'
    insertAtCursor(`[${text}](${url})`)
    activeModal.value = 'none'
  }

  // ══════════════════════════════════════════════════════
  // 表格弹窗
  // ══════════════════════════════════════════════════════

  const tblRows = ref(2)
  const tblCols = ref(2)
  /** 8×8 网格 hover 高亮的行列数 */
  const tblHoverR = ref(2)
  const tblHoverC = ref(2)

  watch([tblRows, tblCols], ([r, c]) => { tblHoverR.value = r; tblHoverC.value = c })

  function openTableModalInner() {
    tblRows.value = 2; tblCols.value = 2; tblHoverR.value = 2; tblHoverC.value = 2
    activeModal.value = 'table'
  }

  function tableGridHover(r: number, c: number) { tblHoverR.value = r; tblHoverC.value = c }
  function tableGridClick(r: number, c: number) { tblRows.value = r; tblCols.value = c }

  /** 生成 Markdown 表格并插入 */
  function insertTable() {
    const r = Math.max(1, parseInt(tblRows.value as any) || 1)
    const c = Math.max(1, parseInt(tblCols.value as any) || 1)
    let md = '\n'
    md += '| ' + Array(c).fill('Header').join(' | ') + ' |\n'
    md += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
    for (let i = 0; i < r; i++) {
      md += '| ' + Array(c).fill('Cell ' + (i + 1)).join(' | ') + ' |\n'
    }
    md += '\n'
    insertAtCursor(md)
    activeModal.value = 'none'
  }

  // ══════════════════════════════════════════════════════
  // 通用光标操作
  // ══════════════════════════════════════════════════════

  function insertAtCursor(insertText: string) {
    const editor = editorBodyRef.value?.editorRef as any
    if (!editor?.insertAtCursor) return
    editor.insertAtCursor(insertText)
  }

  // ══════════════════════════════════════════════════════
  // 撤销/重做（委托给 body 组件 → CodeMirror）
  // ══════════════════════════════════════════════════════

  function undo() { editorBodyRef.value?.undo() }
  function redo() { editorBodyRef.value?.redo() }

  // ══════════════════════════════════════════════════════
  // 字数统计
  // ══════════════════════════════════════════════════════

  const editorStats = computed(() => getStats(localValue.value))
  const wordCountLabel = computed(() => {
    const n = editorStats.value.wordCount || 0
    if (n === 1) return t('editor.countWords', { count: n })
    return t('editor.countWordsPlural', { count: n })
  })

  // ══════════════════════════════════════════════════════
  // 目录生成（当前未在 UI 中使用，保留供后续功能）
  // ══════════════════════════════════════════════════════

  function escapeTocText(text: string) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function buildTocFromMarkdown(markdown: string) {
    const items: Array<{ id: string; text: string; level: number }> = []
    const used = new Set<string>()
    const headingRegex = /^\s*(#{1,6})\s+(.*)$/gm
    let match: RegExpExecArray | null
    while ((match = headingRegex.exec(markdown || '')) !== null) {
      const level = match[1].length
      const text = String(match[2] || '').replace(/<[^>]+>/g, '').trim()
      if (!text) continue
      const base = escapeTocText(text)
        .replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, '-')
        .replace(/[^\w\-一-鿿]/g, '').replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      let id = base || 'heading'
      let suffix = 1
      while (used.has(id)) { id = `${base || 'heading'}-${suffix++}` }
      used.add(id)
      items.push({ id, text, level })
    }
    if (!items.length) return []
    const minLevel = Math.min(...items.map((item) => item.level))
    return items.map((item) => ({ id: item.id, text: item.text, level: item.level - minLevel + 1 }))
  }

  // ══════════════════════════════════════════════════════
  // 对外 API
  // ══════════════════════════════════════════════════════

  return {
    // Ribbon 配置
    ribbonTabs, activeTab, activeTabDef,
    loadToolbarConfig, isToolActive, handleToolAction,
    // 编辑操作
    undo, redo, insertAtCursor,
    // 插入
    insertLink, insertTable, insertMath, insertFootnote,
    // 公式
    mathInput, mathMode, mathPreviewRef, loadKatex,
    // 链接弹窗
    linkText, linkUrl, openLinkModalInner,
    // 表格弹窗
    openTableModalInner, tblRows, tblCols, tblHoverR, tblHoverC,
    tableGridHover, tableGridClick,
    // 统计
    editorStats, wordCountLabel,
    // ToC
    buildTocFromMarkdown,
  }
}
