<!--
  Chronicle Manager — CodeMirror 6 Editor
  Replaces raw <textarea> with syntax-hled markdown editing.
-->
<template>
  <div ref="editorHost" class="cm-editor-host"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap, undo, redo, historyField, isolateHistory } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { HighlightStyle, syntaxHighlighting, LanguageDescription, StreamLanguage, LanguageSupport } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ── Task list (GFM) decoration plugin ────────────────────
// @lezer/markdown parses - [ ] / - [x] correctly as Task/TaskMarker,
// but @codemirror/lang-markdown's NodeProp mapping converts them to
// Link/LinkMark (styled as links).  This ViewPlugin overrides the
// styling so checkboxes look like checkboxes, not hyperlinks.
import { ViewPlugin, Decoration, type ViewUpdate, type DecorationSet } from '@codemirror/view'

const taskMarkerPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this._scan(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged)
      this.decorations = this._scan(update.view)
  }

  _scan(view: EditorView): DecorationSet {
    const marks: any[] = []
    const doc = view.state.doc
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i)
      const m = /^(\s*[-*+]\s+)\[([ xX])\](?=\s)/.exec(line.text)
      if (m) {
        const from = line.from + m[1].length
        const to = from + 3
        const checked = m[2].toLowerCase() === 'x'
        marks.push(Decoration.mark({
          class: 'cm-task-marker ' + (checked ? 'cm-task-checked' : 'cm-task-unchecked')
        }).range(from, to))
      }
    }
    return Decoration.set(marks)
  }
}, {
  decorations: v => v.decorations
})

// ── Code block language support ─────────────────────────────
// LanguageDescription objects for fenced code blocks in markdown.
// Each language is lazily loaded only when first used.
//
// Two sources:
//   • Official CM6 packages (@codemirror/lang-*) — first-class Lezer grammars
//   • Legacy modes (@codemirror/legacy-modes) — CM5 modes wrapped via StreamLanguage
//
// Cost: all loaded via dynamic import(), zero impact on editor bootstrap.
// Only the language used in the current post is ever fetched over the network.

/** Helper: dynamic import a legacy CM5 mode, wrap with StreamLanguage → LanguageSupport. */
function legacyLoader(modePath: string, exportName: string) {
  return () => import(modePath).then((m: Record<string, any>) => {
    const lang = StreamLanguage.define(m[exportName])
    return new LanguageSupport(lang)
  })
}

const codeLanguages = [
  // ── Tier 1: Official CM6 language packages ──────────
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'mjs', 'cjs'],
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    load() { return import('@codemirror/lang-javascript').then(m => m.javascript()) },
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'tsx', 'typescript'],
    extensions: ['ts', 'tsx'],
    load() { return import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })) },
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    extensions: ['css'],
    load() { return import('@codemirror/lang-css').then(m => m.css()) },
  }),
  LanguageDescription.of({
    name: 'SCSS',
    alias: ['scss'],
    extensions: ['scss'],
    load() { return import('@codemirror/lang-css').then(m => m.css()) },
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm', 'xml', 'svg'],
    extensions: ['html', 'htm'],
    load() { return import('@codemirror/lang-html').then(m => m.html()) },
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json'],
    extensions: ['json'],
    load() { return import('@codemirror/lang-json').then(m => m.json()) },
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python', 'python3'],
    extensions: ['py'],
    load() { return import('@codemirror/lang-python').then(m => m.python()) },
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql', 'mysql', 'postgresql', 'sqlite', 'psql'],
    extensions: ['sql'],
    load() { return import('@codemirror/lang-sql').then(m => m.sql()) },
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yaml', 'yml'],
    extensions: ['yaml', 'yml'],
    load() { return import('@codemirror/lang-yaml').then(m => m.yaml()) },
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rust', 'rs'],
    extensions: ['rs'],
    load() { return import('@codemirror/lang-rust').then(m => m.rust()) },
  }),
  LanguageDescription.of({
    name: 'Go',
    alias: ['go', 'golang'],
    extensions: ['go'],
    load() { return import('@codemirror/lang-go').then(m => m.go()) },
  }),
  LanguageDescription.of({
    name: 'Java',
    alias: ['java'],
    extensions: ['java'],
    load() { return import('@codemirror/lang-java').then(m => m.java()) },
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'c++', 'c', 'cc', 'h', 'hpp'],
    extensions: ['cpp', 'c', 'cc', 'h', 'hpp'],
    load() { return import('@codemirror/lang-cpp').then(m => m.cpp()) },
  }),
  LanguageDescription.of({
    name: 'PHP',
    alias: ['php'],
    extensions: ['php'],
    load() { return import('@codemirror/lang-php').then(m => m.php()) },
  }),
  LanguageDescription.of({
    name: 'XML',
    alias: ['xml', 'xsl', 'xsd', 'wsdl'],
    extensions: ['xml', 'xsl', 'xsd'],
    load() { return import('@codemirror/lang-xml').then(m => m.xml()) },
  }),

  // ── Tier 2: Legacy modes (CM5 → StreamLanguage) ─────
  // StreamLanguage.define() extends Language, not LanguageSupport.
  // LanguageDescription.load() expects LanguageSupport — legacyLoader() wraps with new LanguageSupport().
  LanguageDescription.of({
    name: 'Shell',
    alias: ['bash', 'sh', 'zsh', 'shell', 'fish'],
    extensions: ['sh', 'bash', 'zsh'],
    load: legacyLoader('@codemirror/legacy-modes/mode/shell', 'shell'),
  }),
  LanguageDescription.of({
    name: 'Diff',
    alias: ['diff', 'patch'],
    extensions: ['diff', 'patch'],
    load: legacyLoader('@codemirror/legacy-modes/mode/diff', 'diff'),
  }),
  LanguageDescription.of({
    name: 'Dockerfile',
    alias: ['dockerfile', 'docker'],
    extensions: ['dockerfile'],
    load: legacyLoader('@codemirror/legacy-modes/mode/dockerfile', 'dockerFile'),
  }),
  LanguageDescription.of({
    name: 'TOML',
    alias: ['toml'],
    extensions: ['toml'],
    load: legacyLoader('@codemirror/legacy-modes/mode/toml', 'toml'),
  }),
  LanguageDescription.of({
    name: 'Ruby',
    alias: ['ruby', 'rb'],
    extensions: ['rb'],
    load: legacyLoader('@codemirror/legacy-modes/mode/ruby', 'ruby'),
  }),
  LanguageDescription.of({
    name: 'Lua',
    alias: ['lua'],
    extensions: ['lua'],
    load: legacyLoader('@codemirror/legacy-modes/mode/lua', 'lua'),
  }),
  LanguageDescription.of({
    name: 'Nginx',
    alias: ['nginx', 'nginxconf'],
    extensions: ['conf'],
    load: legacyLoader('@codemirror/legacy-modes/mode/nginx', 'nginx'),
  }),
  LanguageDescription.of({
    name: 'INI',
    alias: ['ini', 'properties', 'cfg'],
    extensions: ['ini', 'properties', 'cfg'],
    load: legacyLoader('@codemirror/legacy-modes/mode/properties', 'properties'),
  }),
  LanguageDescription.of({
    name: 'PowerShell',
    alias: ['powershell', 'pwsh', 'ps1'],
    extensions: ['ps1'],
    load: legacyLoader('@codemirror/legacy-modes/mode/powershell', 'powerShell'),
  }),
  LanguageDescription.of({
    name: 'Makefile',
    alias: ['makefile', 'make', 'mk'],
    extensions: ['mk'],
    // No dedicated CM5 make mode — shell provides passable highlighting
    load: legacyLoader('@codemirror/legacy-modes/mode/shell', 'shell'),
  }),
]

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  fontClass?: string
}>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  fontClass: 'font-sans',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'cursorChange': [line: number, col: number]
  'changeRange': [range: { from: number; to: number }]
  'editorScroll': []
}>()

const editorHost = ref<HTMLDivElement | null>(null)
const canUndoRef = ref(false)
const canRedoRef = ref(false)
let editorView: EditorView | null = null
const editableCompartment = new Compartment()

// Track cursor position
let cursorTimer: ReturnType<typeof setTimeout> | null = null

function emitCursor(view: EditorView) {
  if (cursorTimer) clearTimeout(cursorTimer)
  cursorTimer = setTimeout(() => {
    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    emit('cursorChange', line.number, pos - line.from + 1)
  }, 50)
}

// ── Syntax Highlighting ─────────────────────────────────
// Class names mirror hljs conventions; colors come from CSS below.
//
// Two categories — physically separate, logically independent:
//   1. Markdown structure — always active, highlights prose syntax
//      (headings, emphasis, links, quotes, list markers, etc.)
//   2. Code tokens — only active inside fenced code blocks
//      (keywords, strings, types — delegated from markdown parser
//       to the per-language Lezer/StreamLanguage grammar)
//
// @lezer/highlight tags are context-aware: tags.keyword inside a
// markdown document only fires within fenced code regions, never
// on prose text.  So the two rule sets cannot conflict.
const hljsHighlight = HighlightStyle.define([

  // ═══════════════════════════════════════════════════════
  //  Category 1: Markdown structure → cm-md-*
  //  Editor-only.  Colored by CmEditor.vue <style>.
  //  No overlap with hljs-* code-token classes.
  // ═══════════════════════════════════════════════════════

  // Headings
  { tag: tags.heading1, class: 'cm-md-heading' },
  { tag: tags.heading2, class: 'cm-md-heading' },
  { tag: tags.heading3, class: 'cm-md-heading' },
  { tag: tags.heading4, class: 'cm-md-heading' },
  { tag: tags.heading5, class: 'cm-md-heading' },
  { tag: tags.heading6, class: 'cm-md-heading' },

  // Inline formatting
  { tag: tags.strong, class: 'cm-md-strong' },
  { tag: tags.emphasis, class: 'cm-md-emphasis' },
  { tag: tags.strikethrough, class: 'cm-md-strikethrough' },
  { tag: tags.monospace, class: 'cm-md-code' },

  // Links & URLs
  { tag: tags.link, class: 'cm-md-link' },
  { tag: tags.url, class: 'cm-md-link' },

  // Block-level
  { tag: tags.list, class: 'cm-md-list' },
  { tag: tags.quote, class: 'cm-md-quote' },

  // Structural punctuation (heading #, list -, blockquote >, etc.)
  { tag: tags.meta, class: 'cm-md-meta' },
  { tag: tags.contentSeparator, class: 'cm-md-hr' },

  // HTML comments in markdown
  { tag: tags.comment, class: 'cm-md-comment' },

  // ═══════════════════════════════════════════════════════
  //  Category 2: Code tokens → hljs-*
  //  Fenced blocks only.  Color source:
  //    chronicle-markdown.css — shared between SSG + editor
  //    .syntax-hl .hljs-*  ← published pages
  //    .cm-editor-host  .hljs-*  ← CMS editor
  //  Both contexts use the same --code-* CSS variables.
  // ═══════════════════════════════════════════════════════

  // Keywords (multiple tiers to cover language variations)
  { tag: tags.keyword, class: 'hljs-keyword' },
  { tag: tags.controlKeyword, class: 'hljs-keyword' },
  { tag: tags.definitionKeyword, class: 'hljs-keyword' },
  { tag: tags.operatorKeyword, class: 'hljs-keyword' },
  { tag: tags.moduleKeyword, class: 'hljs-keyword' },

  // Literals
  { tag: tags.string, class: 'hljs-string' },
  { tag: tags.special(tags.string), class: 'hljs-string' },
  { tag: tags.number, class: 'hljs-number' },
  { tag: tags.bool, class: 'hljs-literal' },
  { tag: tags.null, class: 'hljs-literal' },
  { tag: tags.literal, class: 'hljs-literal' },
  { tag: tags.character, class: 'hljs-char' },
  { tag: tags.escape, class: 'hljs-char escape_' },

  // Identifiers & types
  { tag: tags.variableName, class: 'hljs-variable' },
  { tag: tags.definition(tags.variableName), class: 'hljs-variable' },
  { tag: tags.typeName, class: 'hljs-type' },
  { tag: tags.namespace, class: 'hljs-type' },
  { tag: tags.className, class: 'hljs-title class_' },
  // Function calls: foo(), method(), obj.method()
  { tag: tags.function(tags.variableName), class: 'hljs-title function_' },
  { tag: tags.function(tags.propertyName), class: 'hljs-title function_' },

  // Function definitions: def foo, function foo, fn foo
  { tag: tags.definition(tags.function(tags.variableName)), class: 'hljs-title function_' },

  { tag: tags.labelName, class: 'hljs-symbol' },

  // Macros: macro_rules! foo, println! — function-like macros get function color
  { tag: tags.macroName, class: 'hljs-symbol' },
  { tag: tags.function(tags.macroName), class: 'hljs-title function_' },
  { tag: tags.modifier, class: 'hljs-modifier' },
  { tag: tags.self, class: 'hljs-built_in' },
  { tag: tags.annotation, class: 'hljs-meta' },

  // Object / struct / tag members
  { tag: tags.propertyName, class: 'hljs-property' },
  { tag: tags.attributeName, class: 'hljs-attr' },
  { tag: tags.attributeValue, class: 'hljs-string' },
  { tag: tags.tagName, class: 'hljs-tag' },

  // Operators & punctuation
  { tag: tags.operator, class: 'hljs-operator' },
  { tag: tags.punctuation, class: 'hljs-punctuation' },
  { tag: tags.bracket, class: 'hljs-punctuation' },
  { tag: tags.separator, class: 'hljs-punctuation' },

  // Regex & special
  { tag: tags.regexp, class: 'hljs-regexp' },
  { tag: tags.invalid, class: 'hljs-invalid' },

  // Comments inside code blocks
  { tag: tags.lineComment, class: 'hljs-comment' },
  { tag: tags.blockComment, class: 'hljs-comment' },
  { tag: tags.docComment, class: 'hljs-comment' },
  { tag: tags.docString, class: 'hljs-string' },

])

function createExtensions(): Extension[] {
  const exts: Extension[] = [
    markdown({ base: markdownLanguage, codeLanguages }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Suppress model-value emission during IME composition
        if (!update.view.composing) {
          const val = update.state.doc.toString()
          const len = update.startState.doc.length
          const newLen = update.state.doc.length
          let fromLine = Infinity, toLine = 0
          if (len > 0 && newLen > 0) {
            update.changes.iterChanges((fromA, _toA, _fromB, toB) => {
              const p0 = Math.min(Math.max(fromA, 0), len - 1)
              const l0 = update.startState.doc.lineAt(p0).number
              const p1 = Math.min(Math.max(toB - 1, 0), newLen - 1)
              const l1 = update.state.doc.lineAt(p1).number
              fromLine = Math.min(fromLine, l0)
              toLine = Math.max(toLine, l1)
            })
          }
          if (!isFinite(fromLine)) { fromLine = 1; toLine = update.state.doc.lines }
          emit('update:modelValue', val)
          emit('changeRange', { from: fromLine, to: toLine })
        }
      }
      if (update.selectionSet) {
        emitCursor(update.view)
      }
      // Update undo/redo state reactively
      const hv = update.view.state.field(historyField, false) as any
      const prevCanUndo = canUndoRef.value
      canUndoRef.value = (hv?.done?.length ?? 0) > 1
      canRedoRef.value = (hv?.undone?.length ?? 0) > 0
      if (canUndoRef.value !== prevCanUndo) {
      }
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    history(),
    EditorState.allowMultipleSelections.of(false),
    EditorView.lineWrapping,
    taskMarkerPlugin,
  ]

  if (props.placeholder) {
    exts.push(cmPlaceholder(props.placeholder))
  }

  exts.push(syntaxHighlighting(hljsHighlight))

  exts.push(editableCompartment.of(EditorView.editable.of(!props.disabled)))

  return exts
}

function createEditor() {
  if (!editorHost.value) return
  if (editorView) editorView.destroy()

  editorView = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: createExtensions(),
    }),
    parent: editorHost.value,
  })
}

onMounted(() => {
  nextTick(() => {
    createEditor()
    editorView?.scrollDOM.addEventListener('scroll', () => emit('editorScroll'), { passive: true })
  })
})

onUnmounted(() => {
  if (cursorTimer) clearTimeout(cursorTimer)
  editorView?.destroy()
  editorView = null
})

watch(() => props.modelValue, (val) => {
  if (editorView && !editorView.composing && val !== editorView.state.doc.toString()) {
    editorView.setState(EditorState.create({ doc: val, extensions: createExtensions() })); //
  }
})

watch(() => props.disabled, (val) => {
  if (editorView) {
    editorView.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!val)),
    })
  }
})

defineExpose({
  focus() { editorView?.focus() },
  getEditor() { return editorView },
  undo() { if (editorView) undo(editorView) },
  redo() { if (editorView) redo(editorView) },
  canUndo: canUndoRef,
  canRedo: canRedoRef,
  initContent(content: string) {
    if (!editorView) return
    editorView.setState(EditorState.create({ doc: content, extensions: createExtensions() }))
    const h0 = (editorView.state.field(historyField, false) as any)
    canUndoRef.value = (h0?.done?.length ?? 0) > 1
    canRedoRef.value = (h0?.undone?.length ?? 0) > 0
  },
  getCursorLine(): number {
    if (!editorView) return 1
    const pos = editorView.state.selection.main.head
    return editorView.state.doc.lineAt(pos).number
  },
  insertAtCursor(text: string, cursorOffset: number = text.length) {
    if (!editorView) return
    const { from, to } = editorView.state.selection.main
    editorView.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + Math.max(0, Math.min(cursorOffset, text.length)) },
    })
  },
  getSelection(): { from: number; to: number; text: string } | null {
    if (!editorView) return null
    const { from, to } = editorView.state.selection.main
    return { from, to, text: editorView.state.sliceDoc(from, to) }
  },
  getScrollDom(): HTMLElement | null {
    return editorView?.scrollDOM ?? null
  },
  addScrollListener(fn: EventListener) {
    editorView?.scrollDOM.addEventListener('scroll', fn)
  },
  removeScrollListener(fn: EventListener) {
    editorView?.scrollDOM.removeEventListener('scroll', fn)
  },
})
</script>

<style>
.cm-editor-host {
  height: 100%;
}

.cm-editor-host .cm-editor {
  background: var(--app-bg-pri);
  color: var(--app-text-pri);
  font-size: .9rem;
  height: 100%;
  font-family: var(--app-font-stack-mono);
}

.cm-editor-host .cm-editor .cm-scroller {
  font-family: inherit;
  line-height: 1.7;
}

.cm-editor-host .cm-editor .cm-content {
  padding: 1rem 1rem 55vh 1rem;
}

.cm-editor-host .cm-editor.cm-focused {
  outline: none;
}

/* ── Category 1: Markdown structure (cm-md-*) ──────────
   Editor-only.  These classes come from CmEditor.vue's
   HighlightStyle Category 1 — no equivalent in the published
   site's chronicle-markdown.css.

   Color inheritance:
     cm-md-heading / cm-md-link / cm-md-quote / cm-md-meta
       → explicit hex (editor dark/light theme)
     cm-md-hr / cm-md-comment
       → var(--code-comment)  ← shared variable
     cm-md-code
       → var(--code-text)     ← shared variable
     cm-md-strong / cm-md-emphasis / cm-md-strikethrough
       → font-* property only, inherits text color from .cm-editor
*/

/* ── Inline formatting ───────────────────────────── */
.cm-editor-host .cm-md-strong        { font-weight: bold; }
.cm-editor-host .cm-md-emphasis      { font-style: italic; }
.cm-editor-host .cm-md-strikethrough { text-decoration: line-through; opacity: 0.6; }

/* ── Dark theme (default) ────────────────────────── */
.cm-editor-host .cm-md-heading       { color: #c678dd; font-weight: bold; }
.cm-editor-host .cm-md-heading.cm-md-meta { color: #c678dd; }
.cm-editor-host .cm-md-link          { color: #61afef; text-decoration: underline; }
.cm-editor-host .cm-md-code          { color: var(--code-text); }
.cm-editor-host .cm-md-code.cm-md-meta { color: var(--code-text); }
.cm-editor-host .cm-md-list.cm-md-meta { color: #d19a66; }
.cm-editor-host .cm-md-quote         { color: #98c379; }
.cm-editor-host .cm-md-quote.cm-md-meta { color: #98c379; }
.cm-editor-host .cm-md-comment       { color: var(--code-comment); font-style: italic; }
.cm-editor-host .cm-md-hr            { color: var(--code-comment); }
.cm-editor-host .cm-md-strong.cm-md-meta { color: var(--app-text-pri); }
.cm-editor-host .cm-md-emphasis.cm-md-meta { color: var(--app-text-pri); }
.cm-editor-host .cm-md-strikethrough.cm-md-meta { color: var(--app-text-pri); }

/* ── Light theme ─────────────────────────────────── */
[data-backend-theme="light"] .cm-editor-host .cm-md-heading { color: #a626a4; font-weight: bold; }
[data-backend-theme="light"] .cm-editor-host .cm-md-heading.cm-md-meta { color: #a626a4; }
[data-backend-theme="light"] .cm-editor-host .cm-md-link    { color: #4078f2; text-decoration: underline; }
[data-backend-theme="light"] .cm-editor-host .cm-md-quote   { color: #50a14f; }
[data-backend-theme="light"] .cm-editor-host .cm-md-list.cm-md-meta   { color: #986801; }
[data-backend-theme="light"] .cm-editor-host .cm-md-quote.cm-md-meta  { color: #50a14f; }
[data-backend-theme="light"] .cm-editor-host .cm-md-comment { color: #a0a1a7; font-style: italic; }
[data-backend-theme="light"] .cm-editor-host .cm-md-hr      { color: #a0a1a7; }

/* ── Task list markers (GFM) ─────────────────────────
 * - [ ] unchecked  → dimmed square
 * - [x] checked    → accent checkmark
 * CmEditor applies `cm-task-marker` + `cm-task-checked`/`cm-task-unchecked`
 * via ViewPlugin (see taskMarkerPlugin above).
 */
.cm-editor-host .cm-task-marker.cm-task-unchecked {
  color: var(--featured);
  font-weight: bold;
}
.cm-editor-host .cm-task-marker.cm-task-checked {
  color: var(--accent);
  font-weight: bold;
}

/*
 * ── Category 2: Code tokens (hljs-*) ─────────────────────
 * Fenced-block-only.  Rules live in chronicle-markdown.css:
 *
 *   .syntax-hl .hljs-*  ← SSG output + CMS preview
 *   .cm-editor-host  .hljs-*  ← CMS editor (CodeMirror)
 *
 * Both contexts share the same --code-* CSS variables,
 * so hljs-keyword always = var(--code-keyword) everywhere.
 * Adding a new code token class?  Edit chronicle-markdown.css.
 */
/* Cursor & selection */
.cm-editor-host .cm-editor .cm-content  { caret-color: var(--app-text-pri); }
.cm-editor-host .cm-editor .cm-cursor   { border-left: 2px solid var(--app-text-pri); }
.cm-editor-host .cm-editor .cm-selectionBackground { background: var(--comp-bg-glass-active); }
.cm-editor-host .cm-editor .cm-activeLine          { background: var(--comp-bg-glass-hvr); }
.cm-editor-host .cm-editor .cm-matchingBracket     { background: var(--comp-bg-glass-active); outline: 1px solid #2ea35f; }

/* ── Search / Replace Panel ────────────────────── */

.cm-panels {
  position: absolute !important;
  top: 0;
  right: 0;
  z-index: 20;
  background: transparent !important;
  border: none !important;
}

.cm-panels-bottom {
  position: absolute;
  top: auto;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: none !important;
}

.cm-panel {
  background: var(--comp-bg-blur) !important;
  color: var(--comp-text-pri) !important;
  border: 1px solid var(--border-color) !important;
  padding: 8px 12px !important;
  margin: 16px !important;
  border-radius: 10px !important;
  box-shadow: var(--shadow-elev-2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-family: var(--app-font-stack) !important;
  font-size: 0.85rem !important;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 16px);
}

.cm-panel.cm-search [name=close]{
  font-size: 1.2rem !important;
  right: 8px !important;
}

.cm-panel .cm-textfield {
  background: var(--app-bg-pri) !important;
  color: var(--comp-text-pri) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  padding: 5px 10px !important;
  font-size: 0.85rem !important;
  font-family: var(--app-font-stack) !important;
  outline: none !important;
  transition: border-color 0.2s ease;
  min-width: 180px;
}
.cm-panel .cm-textfield:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.cm-panel .cm-btn {
  background-image: none !important;
  background: var(--comp-bg) !important;
  color: var(--comp-text-pri) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  font-size: 0.8rem !important;
  font-family: var(--app-font-stack) !important;
  padding: 4px 10px !important;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  white-space: nowrap;
  touch-action: manipulation;
  text-transform: capitalize;
}
.cm-panel .cm-btn:hover {
  background: var(--comp-bg-hvr) !important;
  border-color: var(--accent) !important;
}
.cm-panel .cm-btn:active {
  background: var(--comp-bg-active) !important;
}

.cm-panel label {
  font-family: var(--app-font-stack) !important;
  font-size: 0.8rem !important;
  color: var(--comp-text-sec) !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin-left: .5rem!important;
  cursor: pointer;
  user-select: none;
}
.cm-panel input[type="checkbox"] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
  margin: 0;
}

/* ── Search Match Highlighting ────────────────── */
.cm-searchMatch {
  background: color-mix(in srgb, var(--accent) 28%, transparent) !important;
  outline: 1px solid color-mix(in srgb, var(--accent) 48%, transparent) !important;
}
.cm-searchMatch.cm-searchMatch-selected {
  background: color-mix(in srgb, var(--accent) 50%, transparent) !important;
  outline: 2px solid var(--accent) !important;
}

</style>
