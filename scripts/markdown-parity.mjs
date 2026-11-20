#!/usr/bin/env node
/**
 * Chronicle Aurora — Markdown renderer parity check
 *
 * The SSG renderer (template-astro/src/utils/chronicleMarkdown.ts) and the CMS
 * renderer (manager/src/utils/markdownPreview.ts) are two hand-synced copies of
 * the same pipeline. This script bundles both, feeds them one corpus, and diffs
 * the output after normalising the differences that are *by design*
 * (link bases, KaTeX rendering vs placeholder, <picture> sources, ...).
 *
 * Anything left over is real drift — the kind that turned `[English](README.md)`
 * into literal text in the CMS while the site rendered a link.
 *
 * Usage:
 *   node scripts/markdown-parity.mjs           # summary table
 *   node scripts/markdown-parity.mjs --verbose # dump both outputs per case
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'node:url'

const verbose = process.argv.includes('--verbose')

// ── Corpus: one line per feature ─────────────────────────────
const CASES = [
  ['headings', '## h2\n\n### h3 with `code`'],
  ['emphasis', '**bold** *italic* ~~del~~ `code`'],
  ['link external', '[site](https://example.com/a?b=1#c)'],
  ['link relative (md)', '[English](README.md)'],
  ['link relative (asset)', '[image](pic.png)'],
  ['link open:', '[manual](open:manual.pdf#page=3)'],
  ['link post:', '[other](post://hello-world)'],
  ['link asset:', '[shared](asset://logo.svg)'],
  ['link mailto', '[mail](mailto:a@b.c)'],
  ['link anchor', '[top](#top)'],
  ['card alone', '[report](report.pdf)'],
  ['card prefix audio', '[listen](audio:ep.mp3)'],
  ['card prefix code', '[readme](code:README.md)'],
  ['card prefix file', '[blob](file:whatever)'],
  ['card mini', 'Download the [report](report.pdf) now.'],
  ['card in list', '- item [report](report.pdf)\n- other'],
  ['image alone', '![figure](/a.png)'],
  ['image with size', '![figure](/a.png =300x200)'],
  ['image with title', '![figure](/a.png "caption text")'],
  ['image inline', 'Text ![icon](/a.png) more text.'],
  ['image linked', '[![badge](https://img.shields.io/badge/v-1)](CHANGELOG.md)'],
  ['image two per line', '![a](/a.png) ![b](/b.png)'],
  ['code fence', '```js\nconst a = 1\n```'],
  ['code fence bare', '```\nplain\n```'],
  ['code fence mermaid', '```mermaid\ngraph TD;A-->B\n```'],
  ['inline code', 'call `fn()` here'],
  ['list tight', '- one\n- two'],
  ['list loose', '- one\n\n- two'],
  ['list task', '- [x] done\n- [ ] todo'],
  ['table', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
  ['blockquote', '> quoted ![icon](/a.png) text'],
  ['blockquote image', '> ![solo](/a.png)'],
  ['alert note', '> [!NOTE]\n> body text'],
  ['alert custom title', '> [!WARNING] Careful\n> body text'],
  ['alert in list', '- item\n\n  > [!TIP]\n  > tip body'],
  ['nested blockquote', '> a\n>\n> > b'],
  ['hr', 'a\n\n---\n\nb'],
  ['details', '<details>\n<summary>T</summary>\n\nbody\n\n</details>'],
  ['footnote', 'text[^1]\n\n[^1]: note'],
  ['math inline', 'value $x^2$ end'],
  ['math block', '$$\nx^2\n$$'],
  ['html inline', 'a <kbd>Ctrl</kbd> b'],
  ['strikethrough in table', '| ~~x~~ |\n| --- |\n| y |'],
]

// ── Normalisation: things that are ALLOWED to differ ────────────────────
const normalise = (html) =>
  html
    // link bases: CMS uses filesystem paths, SSG uses public routes
    .replace(/\/data\/posts\/demo\//g, '/POST/')
    .replace(/\/data\/__about__\//g, '/ABOUT/')
    .replace(/\/post_attachment\/demo\//g, '/POST/')
    .replace(/\/about\//g, '/ABOUT/')
    .replace(/\/data\/assets\//g, '/ASSET/')
    .replace(/\/assets\//g, '/ASSET/')
    // cross-post link target
    .replace(/\/editor\/article\?id=/g, '/POSTLINK/')
    .replace(/\/en\/post\//g, '/POSTLINK/')
    // KaTeX: SSG prerenders, CMS emits an interactive placeholder
    .replace(/<span class="katex-rendered[\s\S]*?<\/span>/g, '<KATEX/>')
    .replace(/<div class="katex-rendered[\s\S]*?<\/div>/g, '<KATEX/>')
    .replace(/<span class="katex-placeholder[\s\S]*?<\/span>/g, '<KATEX/>')
    .replace(/<div class="katex-placeholder[\s\S]*?<\/div>/g, '<KATEX/>')
    // <picture> AVIF/WebP sources are an SSG-only optimisation
    .replace(/<source[^>]*>/g, '')
    .replace(/<\/?picture>/g, '')
    // mermaid toolbar exists only in the SSG CodeChunk
    .replace(/<div class="toolbar-divider"><\/div>/g, '')
    .replace(/<button[^>]*class="[^"]*mermaid-[^"]*"[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<div class="mermaid-group">[\s\S]*?<\/div>/g, '')
    // details label is localised by the caller
    .replace(/<span class="details-chevron[^"]*"/g, '<span')
    // whitespace / attribute order noise
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()

// ── Build both renderers to temp ESM ────────────────────────────────────
async function bundle(entry, outfile, extra = {}) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'warning',
    alias: { '@chronicle/shared': './packages/shared' },
    // jsdom does dynamic require() internally — keep it external.
    external: ['jsdom'],
    ...extra,
  })
  // Astro injects import.meta.env at build time; the bundle has no such thing.
  const code = fs.readFileSync(outfile, 'utf8').replace(/import\.meta\.env/g, "({ BASE_URL: '/' })")
  fs.writeFileSync(outfile, code, 'utf8')
}

// Bundles must live inside the repo so bare imports (jsdom) resolve.
const tmp = path.resolve('.chronicle', 'parity')
fs.mkdirSync(tmp, { recursive: true })
const astroBundle = path.join(tmp, 'astro.mjs')
const cmsBundle = path.join(tmp, 'cms.mjs')

await bundle('packages/template-astro/src/utils/chronicleMarkdown.ts', astroBundle)
await bundle('packages/manager/src/utils/markdownPreview.ts', cmsBundle)

// DOM for DOMPurify (both renderers sanitize)
const dom = new JSDOM('')
globalThis.window = dom.window
globalThis.document = dom.window.document
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }) } catch {}

const astro = await import(pathToFileURL(astroBundle).href)
const cms = await import(pathToFileURL(cmsBundle).href)

const renderAstro = (md) => {
  astro.setRenderPostId('demo')
  astro.setRenderLocale('en')
  return astro.renderChronicleMarkdown(md, 'en')
}
const renderCms = (md) => {
  cms.setPreviewPostId('demo')
  return cms.renderPreview(md)
}

// ── Diff ────────────────────────────────────────────────────────────────
// ── Diff ───────────────────────────────────────────────────
// Differences that are by design until the renderers are unified:
//   code fence*  — the site inlines highlight.js output, the CMS leaves the code
//                  plain because <CodeChunk.vue> highlights it in the browser.
//   math *       — the site prerenders KaTeX, the CMS emits an interactive
//                  placeholder (<MathTooltip>) instead.
const EXPECTED = new Set(['code fence', 'code fence mermaid', 'math inline', 'math block'])

let same = 0
const drift = []
const expected = []
for (const [name, md] of CASES) {
  const a = normalise(renderAstro(md))
  const c = normalise(renderCms(md))
  if (a === c) { same++; continue }
  if (EXPECTED.has(name)) { expected.push(name); continue }
  drift.push({ name, a, c })
}

console.log(`\nparity: ${same}/${CASES.length} identical · ${expected.length} expected · ${drift.length} unexpected\n`)
if (expected.length) console.log(`expected (by design): ${expected.join(', ')}`)
for (const d of drift) {
  console.log(`--- DRIFT: ${d.name}`)
  if (verbose) {
    console.log(`  site: ${d.a}`)
    console.log(`  cms : ${d.c}`)
    continue
  }
  // show the first differing character window
  let i = 0
  while (i < d.a.length && i < d.c.length && d.a[i] === d.c[i]) i++
  const from = Math.max(0, i - 60)
  console.log(`  site: ...${d.a.slice(from, i + 100)}`)
  console.log(`  cms : ...${d.c.slice(from, i + 100)}`)
}
if (drift.length) {
  console.log(`\n${drift.length} real difference(s). Run with --verbose for full output.`)
  process.exitCode = 1
}
