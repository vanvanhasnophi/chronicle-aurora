// Chronicle Marp theme CSS generators (light + dark)
// Default: hardcoded blue. `accent: "follow"` → uses var(--accent).
// `accent: "#e74c3c"` → custom hex.
// `tinted-bg: true` → background = color-mix(accent, default-bg)

function light(accent = '#2563eb', tintedBg = false): string {
  const bg = tintedBg ? `color-mix(in srgb,${accent} 8%,#fff)` : '#fff'
  const cardBg = tintedBg ? accent : '#eee'
  const cardFg = tintedBg ? '#fff' : '#111'
  const cardBorder = tintedBg ? accent : '#1119'
  return `/* @theme chronicle */
section{font-family:"InterVariable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:28px;line-height:1.6;color:#111;background:${bg};padding:60px 80px;width:1280px;height:720px}
section h1{color:${accent};margin-bottom:.2em}
section h2{font-size:1.4em;margin:.3em 0}
section h3{font-size:1.3em;margin:.2em 0}
section h4{font-size:1.2em;margin:.15em 0}
section h5{font-size:1.1em;margin:.1em 0}
section p{margin:0 0 .5em 0}
section a{color:${accent}}
section code{font-family:"JetBrains Mono","Fira Code",monospace;background:#f0f0f0;padding:2px 6px;border-radius:4px}
section pre{background:#f5f5f5;border:1px solid #eee;padding:16px;border-radius:6px;overflow:hidden}
section pre code{background:none;padding:0;font-size:0.9em;line-height:1}
section ul,section ol{padding-left:2em;margin:8px 0 14px}
section li{margin:4px 0}
section li::marker{color:#111a}
section table{border-collapse:collapse;margin:8px 0}
section table th,section table td{padding:.5em .75em; font-size:.9em; text-align:left}
section table th{background:${cardBg};color:${cardFg};border:1px solid ${cardBorder};font-weight:bold;font-variation-settings:'wght' 600}
section table td{border:1px solid #1119}
section blockquote{border-left:4px solid ${accent};color:#444;padding:0 0 0 24px;margin:8px 0}
section blockquote p{margin:10px 0}
.hljs{background:transparent}
.hljs-keyword{color:#00f}.hljs-string{color:#a31515}.hljs-comment{color:green}
.hljs-number{color:#098658}.hljs-title{color:#795e26}.hljs-type{color:#267f99}
.hljs-built_in{color:#00f}.hljs-literal{color:#00f}.hljs-meta{color:#a31515}
.hljs-attr{color:#795e26}.hljs-params{color:#001080}.hljs-variable{color:#0b5394}.hljs-subst{color:#0b5394}
section.lead{text-align:center;padding-top:16%}
section.lead h1{font-size:3em}
section.columns{display:grid;grid-template-columns:1fr 1fr;gap:2rem}
section.columns :is(h1,h2,h3,h4,h5,h6,header,footer){grid-column:1/-1}
section.columns-2{column-count:2;column-gap:2rem}
section.columns-3{column-count:3;column-gap:1.5rem}
section.columns-2>*,section.columns-3>*{break-inside:avoid}
section.columns-2 :is(h1,h2,h3,h4,h5,h6,header,footer){column-span:all}
section.columns-3 :is(h1,h2,h3,h4,h5,h6,header,footer){column-span:all}
section.invert{color:#eee;background:#080808}
section.invert h1{color:${accent}}section.invert a{color:${accent}}
section.invert code{background:#161616}section.invert pre{background:#080808;border-color:#1a1a1a}
section.invert blockquote{color:#bbb}section.invert li::marker{color:#eeea}
header{position:absolute;top:30px;color:#6b7280;font-size:.9rem}
footer{position:absolute;bottom:20px;color:#6b7280;font-size:.9rem}
section::after{color:#6b7280}
.mermaid-prerendered{display:flex;justify-content:center;padding:10px 0; background: transparent; color: #111}
.mermaid-prerendered svg{max-width:100%;height:auto}
.mermaid-prerendered .label, .mermaid-prerendered .nodeLabel, .mermaid-prerendered .messageText, .mermaid-prerendered .legend, .mermaid-prerenderex .edgeLabel, .mermaid-prerendered span, .mermaid-prerendered text, .mermaid-prerendered p{ background: ${bg}!important; color: #111!important}
.mermaid-prerendered svg,.mermaid-prerendered svg *{font-family:inherit!important}
.mermaid-prerendered svg .nodeLabel,.mermaid-prerendered svg .label,.mermaid-prerendered svg .messageText,.mermaid-prerendered svg .legend text{fill:#111!important}
.mermaid-prerendered svg tspan{fill:#111!important}
.mermaid-prerendered svg .node rect,.mermaid-prerendered svg .node circle,.mermaid-prerendered svg .node ellipse,.mermaid-prerendered svg .node polygon,.mermaid-prerendered svg .cluster rect,.mermaid-prerendered svg .node path{fill:transparent!important;stroke:#111!important}
.mermaid-prerendered svg .edgePath .path,.mermaid-prerendered svg .flowchart-link{stroke:#111!important}
.mermaid-prerendered svg .edgeLabel rect,.mermaid-prerendered svg .edgeLabel span{fill:transparent!important}
.mermaid-prerendered svg line,.mermaid-prerendered svg rect,.mermaid-prerendered svg polygon,.mermaid-prerendered svg circle, .mermaid-prerendered triangle,.mermaid-prerendered svg path:not([class]){fill: ${bg}!important;stroke:#111!important}
.mermaid-prerendered svg marker path{fill:#111!important;stroke:#111!important;stroke-width:1.5!important}
@media print{.no-print{display:none!important}}`
}

function dark(accent = '#58a6ff', tintedBg = false): string {
  const bg = tintedBg ? `color-mix(in srgb,${accent} 3%,#080808)` : '#080808'
  const cardBg = tintedBg ? accent : '#161616'
  const cardFg = tintedBg ? '#fff' : '#eee'
  const cardBorder = tintedBg ? accent : '#eee9'
  return `/* @theme chronicle-dark */
section{font-family:"InterVariable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:28px;line-height:1.6;color:#eee;background:${bg};padding:60px 80px;width:1280px;height:720px}
section h1{color:${accent};margin-bottom:.2em}
section h2{font-size:1.4em;margin:.3em 0}
section h3{font-size:1.3em;margin:.2em 0}
section h4{font-size:1.2em;margin:.15em 0}
section h5{font-size:1.1em;margin:.1em 0}
section p{margin:0 0 .5em 0}
section a{color:${accent}}
section code{font-family:"JetBrains Mono","Fira Code",monospace;background:#161616;padding:2px 6px;border-radius:4px}
section pre{background:#080808;border:1px solid #1a1a1a;padding:16px;border-radius:6px;overflow:hidden}
section pre code{background:none;padding:0;font-size:0.9em;line-height:1}
section ul,section ol{padding-left:2em;margin:8px 0 14px}
section li{margin:4px 0}
section li::marker{color:#eeea}
section table{border-collapse:collapse;margin:8px 0}
section table th,section table td{padding:.5em .75em; font-size:.9em; text-align:left}
section table th{background:${cardBg};color:${cardFg};border:1px solid ${cardBorder};font-weight:bold;font-variation-settings:'wght' 600}
section table td{border:1px solid #eee9}
section blockquote{border-left:4px solid ${accent};color:#bbb;padding:0 0 0 24px;margin:8px 0}
section blockquote p{margin:10px 0}
.hljs{background:transparent}
.hljs-keyword{color:#569cd6}.hljs-string{color:#ce9178}.hljs-comment{color:#6a9955}
.hljs-number{color:#b5cea8}.hljs-title{color:#569cd6}.hljs-type{color:#4ec9b0}
.hljs-built_in{color:#569cd6}.hljs-literal{color:#569cd6}.hljs-meta{color:#ce9178}
.hljs-attr{color:#9cdcfe}.hljs-params{color:#9cdcfe}
section.lead{text-align:center;padding-top:16%}
section.lead h1{font-size:3em}
section.columns{display:grid;grid-template-columns:1fr 1fr;gap:2rem}
section.columns :is(h1,h2,h3,h4,h5,h6,header,footer){grid-column:1/-1}
section.columns-2{column-count:2;column-gap:2rem}
section.columns-3{column-count:3;column-gap:1.5rem}
section.columns-2>*,section.columns-3>*{break-inside:avoid}
section.columns-2 :is(h1,h2,h3,h4,h5,h6,header,footer){column-span:all}
section.columns-3 :is(h1,h2,h3,h4,h5,h6,header,footer){column-span:all}
section.invert{color:#111;background:#fff}
section.invert h1{color:${accent}}section.invert a{color:${accent}}
section.invert code{background:#f0f0f0}section.invert pre{background:#f5f5f5;border-color:#eee}
section.invert blockquote{color:#444}section.invert li::marker{color:#111a}
header{position:absolute;top:30px;color:#8b949e;font-size:.9rem}
footer{position:absolute;bottom:20px;color:#8b949e;font-size:.9rem}
section::after{color:#8b949e}
.mermaid-prerendered{display:flex;justify-content:center;padding:10px 0;background: transparent; color: #eee!important}
.mermaid-prerendered svg{max-width:100%;height:auto}
.mermaid-prerendered .label, .mermaid-prerendered .nodeLabel, .mermaid-prerendered .messageText, .mermaid-prerendered .legend, .mermaid-prerenderex .edgeLabel, .mermaid-prerendered span, .mermaid-prerendered text, .mermaid-prerendered p{ background: ${bg}!important; color: #eee!important}
.mermaid-prerendered svg,.mermaid-prerendered svg *{font-family:inherit!important}
.mermaid-prerendered svg .nodeLabel,.mermaid-prerendered svg .label,.mermaid-prerendered svg .messageText,.mermaid-prerendered svg .legend text{fill:#eee!important}
.mermaid-prerendered svg .node rect,.mermaid-prerendered svg .node circle,.mermaid-prerendered svg .node ellipse,.mermaid-prerendered svg .node polygon,.mermaid-prerendered svg .cluster rect,.mermaid-prerendered svg .node path{fill:transparent!important;stroke:#eee!important}
.mermaid-prerendered svg .edgePath .path,.mermaid-prerendered svg .flowchart-link{stroke:#eee!important}
.mermaid-prerendered svg .edgeLabel rect,.mermaid-prerendered svg .edgeLabel span{fill:transparent!important}
.mermaid-prerendered svg tspan{fill:#eee!important}
.mermaid-prerendered svg line,.mermaid-prerendered svg rect,.mermaid-prerendered svg polygon,.mermaid-prerendered svg circle, .mermaid-prerendered triangle,.mermaid-prerendered svg path:not([class]){fill: ${bg}!important;stroke:#eee!important}
.mermaid-prerendered svg marker path{fill:#eee!important;stroke:#eee!important;stroke-width:1.5!important}
@media print{.no-print{display:none!important}}`
}

export const chronicleCSS = light()
export const chronicleDarkCSS = dark()
export function chronicleLightTheme(accent: string, tintedBg = false) { return light(accent, tintedBg) }
export function chronicleDarkTheme(accent: string, tintedBg = false) { return dark(accent, tintedBg) }

