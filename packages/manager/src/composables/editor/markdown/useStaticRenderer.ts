/**
 * useStaticRenderer — 静态 HTML 渲染管线
 *
 * 将 markdown-it 的交互式 preview HTML 转为导出/打印专用的纯静态 HTML：
 *   1. KaTeX 占位符 → 预渲染为静态 HTML
 *   2. 代码块 → 去交互化（无 copy 按钮、无 textarea）
 *   3. Mermaid 代码块 → 预渲染为 SVG
 *   4. 图片 → 移除 onload/onerror/Loading 占位
 *   5. file-card → div 转 a 标签
 *
 * 依赖：renderPreview（markdown-it 预览引擎）、escapeHtml
 */

import { renderPreview } from '../../../utils/markdownPreview'
import { escapeHtml } from './useHTMLTemplates'

// ══════════════════════════════════════════════════════
// KaTeX 单例引擎
// ══════════════════════════════════════════════════════

let _katex: any = null
async function getKatex() {
  if (_katex) return _katex
  const mod = await import('katex')
  _katex = (mod as any).default || mod
  return _katex
}

/** 将 KaTeX 占位符预渲染为静态 HTML */
export async function prerenderKatexInHTML(html: string): Promise<string> {
  if (!html.includes('katex-interactive')) return html
  try {
    const katex = await getKatex()
    const re = /<(span|div)\s[^>]*class="[^"]*\bkatex-placeholder\b[^"]*\bkatex-interactive\b[^"]*"[^>]*data-tex="([^"]*)"[^>]*data-type="(inline|block)"[^>]*>[\s\S]*?<\/\1>/g
    return html.replace(re, (_m: string, _tag: string, tex: string, type: string) => {
      try {
        const rendered = katex.renderToString(tex, {
          throwOnError: false,
          displayMode: type === 'block',
        })
        return type === 'block'
          ? `<div class="katex-block">${rendered}</div>`
          : `<span class="katex-inline">${rendered}</span>`
      } catch {
        return `<code>${escapeHtml(tex)}</code>`
      }
    })
  } catch {
    return html
  }
}

// ══════════════════════════════════════════════════════
// Mermaid 单例引擎
// ══════════════════════════════════════════════════════

let _mermaid: any = null
async function getMermaid() {
  if (_mermaid) return _mermaid
  const mod = await import('mermaid')
  _mermaid = (mod && (mod as any).default) || mod
  try { _mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
  return _mermaid
}

/**
 * 将 renderPreview 产出的交互式 HTML 转为导出专用的纯静态 HTML
 */
export async function renderStaticHTML(md: string): Promise<string> {
  // 1. 先 KaTeX 预渲染（在 HTML 字符串上，避免 DOM 序列化破坏占位符格式）
  let html = renderPreview(md)
  if (!html) return ''

  html = await prerenderKatexInHTML(html)

  // 2. 用 DOM 处理代码块和图片（结构变换）
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstChild as HTMLElement
  if (!root) return html

  // 代码块去交互化，Mermaid 特殊处理：预渲染为 SVG
  for (const chunk of Array.from(root.querySelectorAll('.code-chunk-container'))) {
    // renderPreview() emits a static CodeChunk (span.language-label + pre code),
    // not the interactive CodeChunk (select + textarea).  Support both so the
    // language label is right and Mermaid actually reaches the SVG branch.
    const langEl =
      chunk.querySelector('.language-selector option[selected]') ||
      chunk.querySelector('.language-label')
    const lang = (langEl?.getAttribute('value') || langEl?.textContent || 'plain').trim().toLowerCase() || 'plain'
    const textarea = chunk.querySelector('textarea')
    const codeEl = chunk.querySelector('pre code')
    const rawCode = textarea
      ? (textarea.value || textarea.textContent || '')
      : (codeEl?.textContent || '')

    // Mermaid：预渲染为静态 SVG
    if (lang === 'mermaid' && rawCode.trim()) {
      try {
        const mermaidMod = await import('mermaid')
        const mermaid = (mermaidMod && (mermaidMod as any).default) || mermaidMod
        try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
        const id = 'mermaid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
        const res = await mermaid.render(id, rawCode)
        let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
        // 箭头 marker → 敞口 V 形（去闭合边，只保留两条斜线）
        svg = svg.replace(
          /(<marker[^>]*id="[^"]*arrowhead[^"]*"[^>]*>)([\s\S]*?)<\/marker>/g,
          (_m: string, open: string, body: string) => {
            body = body.replace(/fill="context-stroke"/g, 'fill="none" stroke="context-stroke" stroke-linejoin="round"')
            body = body.replace(/\s*z\s*("|\/)/g, '$1') // 去掉 closePath
            return open + body + '</marker>'
          },
        )
        const wrapper = doc.createElement('div')
        wrapper.className = 'mermaid-prerendered'
        wrapper.innerHTML = `<div class="mermaid-svg">${svg}</div>`
        chunk.replaceWith(wrapper)
        continue
      } catch (e) { console.warn('Mermaid render failed for export', e) }
    }

    // 普通代码块
    const pre = chunk.querySelector('pre')
    const code = pre?.querySelector('code')
    chunk.innerHTML = ''
    const header = doc.createElement('div')
    header.className = 'code-chunk-header'
    const langSpan = doc.createElement('span')
    langSpan.className = 'code-chunk-lang'
    langSpan.textContent = lang
    header.appendChild(langSpan)
    chunk.appendChild(header)
    const body = doc.createElement('div')
    body.className = 'code-chunk-body'
    if (pre && code) {
      pre.className = ''
      code.className = ''
      body.appendChild(pre)
    } else {
      const fallback = doc.createElement('pre')
      const fc = doc.createElement('code')
      fc.textContent = rawCode
      fallback.appendChild(fc)
      body.appendChild(fallback)
    }
    chunk.appendChild(body)
  }

  // 图片：移除 wrapper，样式直写到 img，去掉 onload/onerror/占位
  for (const container of Array.from(root.querySelectorAll('.md-image-container'))) {
    const wrapper = container.querySelector('.md-image-wrapper')
    const img = wrapper?.querySelector('img')
    const caption = container.querySelector('.md-image-caption')
    if (!img) { container.remove(); continue }
    img.removeAttribute('onload')
    img.removeAttribute('onerror')
    img.removeAttribute('loading')
    img.setAttribute('loading', 'eager')
    const wrapperStyle = wrapper?.getAttribute('style') || ''
    if (wrapperStyle) img.setAttribute('style', wrapperStyle)
    // 替换：container → img + caption
    const frag = doc.createDocumentFragment()
    frag.appendChild(img)
    if (caption) frag.appendChild(caption)
    container.replaceWith(frag)
  }

  // file-card：div → a 标签，恢复链接跳转
  for (const card of Array.from(root.querySelectorAll('.file-card'))) {
    const url = card.getAttribute('data-url') || card.getAttribute('href')
    if (!url) continue
    const anchor = doc.createElement('a')
    anchor.className = 'file-card'
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    anchor.innerHTML = card.innerHTML
    card.replaceWith(anchor)
  }

  html = root.innerHTML
  return html
}


// Mermaid 渲染
// ══════════════════════════════════════════════════════

/**
 * 将 markdown 中的 ```mermaid 代码块渲染为内联 SVG。
 * 在保存前调用，确保 Astro 端直接使用预渲染的 SVG。
 */
export async function renderMermaidBlocksInMarkdown(md: string) {
  if (!md || !/```\s*mermaid\b/.test(md)) return md
  let mod: any
  try { mod = await import('mermaid') } catch (e) { console.warn('Failed to load mermaid', e); return md }
  const mermaid = (mod && mod.default) || mod
  try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
  /** 统一 SVG marker 引用到 chronicle-mermaid-arrow */
  function sanitizeSvg(svg: string) {
    if (!svg) return svg
    svg = svg.replace(/marker-(?:end|start)=("|')?url\([^#)]*#([^\)"']+)\)("|')?/g, 'marker-$1')
    svg = svg.replace(/marker-(end|start)=("|')?url\(\#([^\)"']+)\)("|')?/g, (_, pos: string) => `marker-${pos}="url(#chronicle-mermaid-arrow)"`)
    svg = svg.replace(/url\((?:"|')?\#([^\)"']+)(?:"|')?\)/g, 'url(#chronicle-mermaid-arrow)')
    return svg
  }
  const regex = /```\s*mermaid\s*\n([\s\S]*?)\n```/g
  let lastIndex = 0; let out = ''; let match: RegExpExecArray | null; let idx = 0
  while ((match = regex.exec(md)) !== null) {
    out += md.slice(lastIndex, match.index)
    try {
      const id = 'mermaid_' + Date.now() + '_' + (idx++)
      const res = await mermaid.render(id, match[1])
      let svg = String((res && (res.svg || res)) || '')
      svg = sanitizeSvg(svg)
      out += `<div class="mermaid-svg">${svg}</div>`
    } catch (e) { console.warn('mermaid render failed on save', e); out += match[0] }
    lastIndex = regex.lastIndex
  }
  out += md.slice(lastIndex)
  return out
}

