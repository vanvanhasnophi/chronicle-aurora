/**
 * useMarpEngine — Marp 幻灯片渲染引擎
 *
 * @marp-team/marp-core 实例管理 + Chronicle 主题注册 + Mermaid 后处理。
 * 从 useEditorFile 拆出，供 export / print 使用。
 */

import { chronicleLightTheme, chronicleDarkTheme } from './chronicleThemes'

/**
 * 解析 @marp-team/marp-core 的 Marp 构造函数。
 *
 * marp-core 只发布 CJS（main: lib/marp.js，导出 `{ Marp, default }`），
 * 但不同运行 / 打包环境在外面套的壳层数并不一致：
 *   - Node / Astro SSR：default import === module.exports，类在 `.default` 或 `.Marp`
 *   - Vite(rolldown) 预打包：产物结尾是 `export default require_marp()`，
 *     于是 `import Marp from ...` 拿到的是 module.exports 对象本身（不是构造函数），
 *     直接 `new Marp()` 会抛 “Marp is not a constructor”。
 * 所以这里逐层剥壳，直到取出可构造函数，兼容以上所有导出形状。
 */
export function resolveMarpCore(mod: any): any {
  let cur = mod
  for (let depth = 0; depth < 5 && cur && typeof cur !== 'function'; depth++) {
    const next = cur.Marp ?? cur.default
    if (!next || next === cur) break
    cur = next
  }
  if (typeof cur !== 'function') {
    const shape = mod && typeof mod === 'object' ? Object.keys(mod).join(', ') : String(mod)
    throw new TypeError(`[useMarpEngine] 无法解析 Marp 构造函数，模块导出形状: ${shape || '(empty)'}`)
  }
  return cur
}

let _marpCore: any = null
export async function getMarpCore() {
  if (_marpCore) return _marpCore
  const mod = await import('@marp-team/marp-core')
  _marpCore = resolveMarpCore(mod)
  return _marpCore
}

export async function renderSlidesToHTML(md: string): Promise<{ html: string; css: string }> {
  try {
    const Marp = await getMarpCore()
    const marp = new Marp({ html: true })
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
    let fmAccent = '', tintedBg = false
    if (fmMatch) {
      const am = fmMatch[1].match(/^accent-color:\s*(\S+)/m) || fmMatch[1].match(/^accent:\s*(\S+)/m)
      if (am) fmAccent = am[1].replace(/["']/g, '')
      const tb = fmMatch[1].match(/^tinted-bg:\s*(\S+)/m)
      if (tb) tintedBg = tb[1] === 'true'
    }
    const accent = (fmAccent === 'follow')
      ? (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb')
      : (fmAccent && fmAccent !== 'default' ? fmAccent : '#2563eb')
    try { marp.themeSet.add(chronicleLightTheme(accent, tintedBg)) } catch (e) { console.warn('[useMarpEngine] Failed to register Chronicle theme', e) }
    try { marp.themeSet.add(chronicleDarkTheme(accent, tintedBg)) } catch (e) { console.warn('[useMarpEngine] Failed to register Chronicle Dark theme', e) }
    let renderMd = md
    if (!/^theme:\s*\S/m.test(md)) {
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
      if (fmMatch) {
        renderMd = `---\n${fmMatch[1]}\ntheme: chronicle\n---${md.slice(fmMatch[0].length)}`
      } else {
        renderMd = `---\ntheme: chronicle\n---\n\n${md}`
      }
    }
    const r = marp.render(renderMd)
    // Mermaid 后处理
    let html = r.html
    if (html.includes('language-mermaid') || html.includes('mermaid')) {
      try {
        const mermaidMod = await import('mermaid')
        const mermaid = (mermaidMod && (mermaidMod as any).default) || mermaidMod
        try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const codes = doc.querySelectorAll('pre code.language-mermaid, code[class*="mermaid"]')
        for (const code of codes) {
          const pre = code.closest('pre')
          const text = code.textContent || ''
          if (!text.trim() || !pre) continue
          try {
            const id = 'mermaid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
            const res = await mermaid.render(id, text.trim())
            let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
            if (svg) {
              const wrapper = doc.createElement('div')
              wrapper.className = 'mermaid-prerendered'
              wrapper.innerHTML = svg
              pre.replaceWith(wrapper)
            }
          } catch { /* skip */ }
        }
        html = doc.body.innerHTML
      } catch { /* Mermaid not available */ }
    }
    return { html, css: r.css }
  } catch (e) {
    console.error('renderSlidesToHTML failed', e)
    return { html: `<section><pre>${md.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></section>`, css: '' }
  }
}
