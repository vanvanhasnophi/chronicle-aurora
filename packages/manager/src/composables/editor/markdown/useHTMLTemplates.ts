/**
 * useHTMLTemplates — 导出 / 打印 HTML 模板构建器
 *
 * 纯函数层。构建自包含的独立 HTML 文件（内联 CSS，无外部依赖）。
 * 用于 article/slides 导出和打印预览。
 *
 * 依赖：chronicle-markdown.css（Vite ?inline 导入）
 */

import _chronicleCSS from '@chronicle/shared/src/styles/chronicle-markdown.css?inline'

// ══════════════════════════════════════════════════════
// CSS 常量
// ══════════════════════════════════════════════════════

/** 与预览渲染引擎完全一致的 chronicle-markdown.css，Vite ?inline 构建时为字符串 */
export const CHRONICLE_CSS: string = (_chronicleCSS as any).default || String(_chronicleCSS)
/**
 * 导出专用覆盖样式（叠加在 chronicle-markdown.css 之上）：
 *   - body 居中 + 限宽
 *   - light/dark toggle 按钮
 *   - 图片始终居中
 *   - dark mode 变量覆盖 + prefers-color-scheme 回退
 *   - 打印隐藏交互元素
 */
export const EXPORT_OVERRIDE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap');
:root{
--app-font-stack:-apple-system,BlinkMacSystemFont,'InterVariable','Inter','Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;
--app-font-stack-serif:ui-serif,'Noto Serif SC',serif;
--app-font-stack-mono:'Consolas','SF Mono','Menlo','Monaco','Courier New',monospace;
--app-text-pri:#111;--app-text-sec:#4b5563;
--border-color:#e5e7eb;--accent:#2563eb;--accent-dark:#1d4ed8;--accent-contrast:#fff;
--code-bg:#f5f5f5c0;--code-inline:#f3f4f6;
--code-keyword:#7c3aed;--code-string:#059669;--code-comment:#6b7280;--code-number:#d97706;
--code-type:#2563eb;--code-tag:#2563eb;--code-attribute:#7c3aed;--code-property:#059669;
--code-selector:#d97706;--code-operator:#4b5563;--code-variable:#111;--code-text:#111;
--code-quote:#059669;--code-link:#2563eb;--code-boolean:#d97706;--code-preprocessor:#dc2626;
--code-section:#2563eb;--code-directive:#7c3aed;--code-parameter:#4b5563;--code-cmdlet:#7c3aed;
--code-katexcommand:#2563eb;
--comp-bg:#fafafa;--comp-bg-blur:rgba(250,250,250,.8);--comp-bg-glass:rgba(245,245,245,.7);
--comp-bg-hvr:#f3f4f690;--comp-bg-hl:#e5e7eb90;--comp-bg-active:#d1d5db90;
--comp-text-pri:#111;--comp-text-sec:#6b7280;
--status-error:#dc2626;--status-warning:#f59e0b;--featured:#f59e0b;
--status-error-bg:rgba(220,38,38,.12);
--active:rgba(17,17,17,.06);--hover:rgba(17,17,17,.04);
--border-color-blur:rgba(17,17,17,.12);
--comp-bg-inset:#f3f4f6;--comp-inset-shadow:inset 0 1px 2px rgba(0,0,0,.06);
--comp-bg-glass-hl:rgba(245,245,245,.85);
--glass-shadow-elev-1:0 2px 8px rgba(0,0,0,.08);
--shadow-elev-1:0 4px 12px rgba(0,0,0,.1);
--app-font-stack-inter:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;
--toc-scroll-offset:100px;
}
body{max-width:800px;margin:0 auto;padding:40px 48px;font-family:var(--app-font-stack);background:var(--comp-bg);color:var(--app-text-pri)}
body[data-font="serif"]{font-family:var(--app-font-stack-serif)}
.article-title{font-size:2.5rem;line-height:1.25;margin-bottom:2.5rem;font-weight:600;font-variation-settings:'wght' 600;border-bottom:1px solid var(--border-color);padding-bottom:1.5rem;color:var(--app-text-pri)}
.code-chunk-header{padding:0 1rem}
.code-chunk-lang{font-size:0.85rem;font-family:var(--app-font-stack);color:var(--comp-text-sec)}
pre{margin-block:0}
.chr-md .md-image {width:auto;height:auto;}
img,.md-image{display:block;max-width:100%;margin-left:auto;margin-right:auto;cursor:default!important;opacity:1!important;filter:none!important;transition:none!important}
[data-theme="dark"]{--app-text-pri:#e5e7eb;--app-text-sec:#9ca3af;--app-text-pri:#e5e7eb;--border-color:#333;--accent:#3b82f6;--accent-dark:#60a5fa;--accent-contrast:#111;--code-bg:#1a1a1ac0;--code-inline:#1f1f1f;--code-keyword:#a78bfa;--code-string:#34d399;--code-comment:#6b7280;--code-number:#fbbf24;--code-type:#60a5fa;--code-tag:#60a5fa;--code-attribute:#a78bfa;--code-property:#34d399;--code-selector:#fbbf24;--code-operator:#9ca3af;--code-variable:#e5e7eb;--code-text:#e5e7eb;--code-quote:#34d399;--code-link:#60a5fa;--code-boolean:#fbbf24;--code-preprocessor:#f87171;--code-section:#60a5fa;--code-directive:#a78bfa;--code-parameter:#9ca3af;--code-cmdlet:#a78bfa;--code-katexcommand:#60a5fa;--comp-bg:#1a1a1a;--comp-bg-blur:rgba(40,40,40,.9);--comp-bg-glass:rgba(60,60,60,.7);--comp-bg-hvr:#fff2;
--comp-bg-hl:#fff2;--comp-bg-active:#fff3;
--comp-text-pri:#e5e7eb;--comp-text-sec:#9ca3af;--status-error-bg:rgba(248,113,113,.16);--active:rgba(255,255,255,.08);--hover:rgba(255,255,255,.06);--border-color-blur:rgba(255,255,255,.14);--comp-bg-inset:#141414;--comp-inset-shadow:inset 0 1px 2px rgba(0,0,0,.45);--comp-bg-glass-hl:rgba(60,60,60,.8);--glass-shadow-elev-1:0 2px 8px rgba(0,0,0,.35);--shadow-elev-1:0 4px 12px rgba(0,0,0,.4)}
.theme-toggle{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;border:1px solid var(--border-color);background:var(--comp-bg);color:var(--app-text-pri);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100;transition:background .2s}
.theme-toggle svg{width:16px;height:16px;display:block}
.theme-toggle:hover{background:var(--hover)}
@page{margin:16mm 14mm}
@media print{
  body{padding:0;max-width:760px;margin:0 auto;background:#fff}
  .no-print{display:none!important}
  img,.md-image{opacity:1!important;filter:none!important;display:block!important;max-width:100%!important}
  .chr-md pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
  .chr-md .code-chunk-container{overflow:visible;break-inside:avoid}
  .chr-md .code-chunk-container .syntax-hl{overflow:visible}
  .chr-md tr{break-inside:avoid}
  .chr-md thead{display:table-header-group}
  .chr-md details,.chr-md .mermaid-prerendered,.chr-md img,.chr-md .md-image-container{break-inside:avoid}
  .chr-md h1,.chr-md h2,.chr-md h3,.chr-md h4{break-after:avoid}
  .chr-md p{orphans:3;widows:3}
  .chr-md .md-details-chevron{display:none}
  .chr-md details{box-shadow:none}
  .chr-md .code-chunk-container,.chr-md th,.chr-md details{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media (prefers-color-scheme:dark){:root:not([data-theme]){--app-text-pri:#e5e7eb;--app-text-sec:#9ca3af;--app-text-pri:#e5e7eb;--border-color:#333;--accent:#3b82f6;--accent-dark:#60a5fa;--code-bg:#1a1a1a;--code-inline:#1f1f1f;--code-keyword:#a78bfa;--code-string:#34d399;--code-comment:#6b7280;--code-number:#fbbf24;--code-type:#60a5fa;--code-tag:#60a5fa;--code-attribute:#a78bfa;--code-property:#34d399;--code-selector:#fbbf24;--code-operator:#9ca3af;--code-variable:#e5e7eb;--code-text:#e5e7eb;--code-quote:#34d399;--code-link:#60a5fa;--code-boolean:#fbbf24;--code-preprocessor:#f87171;--code-section:#60a5fa;--code-directive:#a78bfa;--code-parameter:#9ca3af;--code-cmdlet:#a78bfa;--code-katexcommand:#60a5fa;--comp-bg:#1a1a1a;--comp-bg-blur:rgba(26,26,26,.9);--comp-bg-glass:rgba(30,30,30,.7);--comp-bg-hvr:#222;--comp-bg-hl:#2a2a2a;--comp-bg-active:#333;--comp-text-pri:#e5e7eb;--comp-text-sec:#9ca3af;--status-error-bg:rgba(248,113,113,.16);--active:rgba(255,255,255,.08);--hover:rgba(255,255,255,.06);--border-color-blur:rgba(255,255,255,.14);--comp-bg-inset:#141414;--comp-inset-shadow:inset 0 1px 2px rgba(0,0,0,.45);--comp-bg-glass-hl:rgba(60,60,60,.8);--glass-shadow-elev-1:0 2px 8px rgba(0,0,0,.35);--shadow-elev-1:0 4px 12px rgba(0,0,0,.4)}}
/* KaTeX 离线字体兜底——各系统自带数学字体 */
.katex,.katex .mord,.katex .mbin,.katex .mrel,.katex .mopen,.katex .mclose,.katex .mpunct,.katex .minner,.katex .mathit,.katex .mathbf,.katex .mainit{font-family:KaTeX_Main,Cambria Math,STIX Two Math,Latin Modern Math,serif}
.katex .amsrm,.katex .mathbb{font-family:KaTeX_AMS,Cambria Math,STIX Two Math,serif}
.katex .mathcal{font-family:KaTeX_Caligraphic,Cambria Math,STIX Two Math,serif}
.katex .mathfrak{font-family:KaTeX_Fraktur,serif}
.katex .mathtt{font-family:KaTeX_Typewriter,Menlo,Courier New,monospace}
.katex .mathscr{font-family:KaTeX_Script,serif}
.katex .mathsf{font-family:KaTeX_SansSerif,sans-serif}
.katex-html{cursor:default}
.katex:hover,.katex-html:hover,.katex-mathml:hover{background:transparent!important}
.mermaid-prerendered{display:flex;justify-content:center;padding:10px 0}
.mermaid-prerendered svg{max-width:100%;height:auto}
.mermaid-prerendered svg,.mermaid-prerendered svg *{font-family:inherit!important}
.mermaid-prerendered svg .nodeLabel,.mermaid-prerendered svg .label,.mermaid-prerendered svg .messageText,.mermaid-prerendered svg .legend text{fill:var(--comp-text-pri)!important;color:var(--comp-text-pri)!important}
.mermaid-prerendered svg .node rect,.mermaid-prerendered svg .node circle,.mermaid-prerendered svg .node ellipse,.mermaid-prerendered svg .node polygon,.mermaid-prerendered svg .cluster rect,.mermaid-prerendered svg .node path{fill:none!important;stroke:var(--comp-text-sec)!important}
.mermaid-prerendered svg .edgePath .path,.mermaid-prerendered svg .flowchart-link{stroke:var(--comp-text-sec)!important}
.mermaid-prerendered svg .edgeLabel text,.mermaid-prerendered svg .edgeLabel rect,.mermaid-prerendered svg .edgeLabel span{fill:var(--comp-bg)!important}
.mermaid-prerendered svg marker path{stroke:var(--comp-text-sec)!important;stroke-width:1.5!important}
.mermaid-prerendered svg .actor,.mermaid-prerendered svg .labelBox{fill:none!important;stroke:var(--comp-text-sec)!important}`

/** KaTeX CSS — CDN 加载，所有主流 CMS 标准做法。字体由 CDN 自动处理。 */
export const KATEX_TAG = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">'

// ══════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ══════════════════════════════════════════════════════
// 打印快照类型
// ══════════════════════════════════════════════════════

export interface PrintSnapshot {
  title: string
  content: string
  font: string
  assetMap: Record<string, string>
  postId: string | null
  postStatus: string
  postDate: string
  postUpdated: string
  tags: string[]
  author: string
  aiGenerated: boolean
  locale: string
  createdAt: number
  editorType: 'article' | 'slides'
}
export function buildArticleStandaloneHtml(title: string, bodyHtml: string, lang: string, font?: string): string {
  const katexTag = KATEX_TAG
  return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${CHRONICLE_CSS}</style>
<style>${EXPORT_OVERRIDE}</style>
${katexTag}
</head>
<body${font ? ` data-font="${font}"` : ''}>
<button class="theme-toggle no-print" id="theme-toggle" title="Toggle light/dark" aria-label="Toggle theme"><svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
${title ? `<h1 class="article-title">${escapeHtml(title)}</h1>` : ''}
<div class="chr-md">${bodyHtml}</div>
<script>
(function(){var h=document.documentElement;var b=document.getElementById('theme-toggle');var sun='<svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';var moon='<svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';var s=localStorage.getItem('chronicle-export-theme');if(s==='dark'){h.dataset.theme='dark';b.innerHTML=moon}else if(s==='light'){h.dataset.theme='light';b.innerHTML=sun}b.addEventListener('click',function(){var c=h.dataset.theme==='dark'?'light':'dark';h.dataset.theme=c;b.innerHTML=c==='dark'?moon:sun;localStorage.setItem('chronicle-export-theme',c)})})()
<\/script>
</body>
</html>`
}


export function buildSlidesStandaloneHtml(title: string, bodyHtml: string, css: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap);</style>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;background:#000;color:#fff}
.slides-wrapper{max-width:1280px;margin:0 auto;padding:40px 0}
@media print{body{background:#fff}}
${css}
</style>
</head>
<body>
<div class="slides-wrapper">${bodyHtml}</div>
</body>
</html>`
}


export function buildSlidesPrintHtml(title: string, bodyHtml: string, css: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Print</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap);</style>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif}
@media print{
  @page{margin:0;size:1280px 720px}
  body{margin:0}
  section{page-break-after:always}
}
${css}
</style>
</head>
<body>${bodyHtml}</body>
</html>`
}


export function buildStandalonePrintHtml(title: string, renderedHtml: string, lang: string, font?: string): string {
  const katexTag = KATEX_TAG
  return `<!DOCTYPE html>
<html lang="${lang || 'en'}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light}</style>
<style>${CHRONICLE_CSS}</style>
<style>${EXPORT_OVERRIDE}</style>
${katexTag}
</head>
<body${font ? ` data-font="${font}"` : ''}>
${title ? `<h1 class="article-title">${escapeHtml(title)}</h1>` : ''}
<div class="chr-md">${renderedHtml}</div>
</body>
</html>`
}

/**
 * 打印预览 — 在当前页创建隐藏 iframe，注入静态 HTML 后直接调用 print()。
 * 不跨窗口，样式在同一 origin 下完整渲染。
 */
