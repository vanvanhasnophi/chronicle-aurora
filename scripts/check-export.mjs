#!/usr/bin/env node
/**
 * Chronicle Aurora — export / print behaviour gate
 *
 * Guards the parts of the CMS that don't go through the Markdown renderers:
 *   1. export packaging: which files get copied, how they are renamed, whether
 *      the HTML references the new names, and that the archive is a real ZIP
 *      (central directory + CRC32 verified here, no external unzip needed)
 *   2. export fallback: no local assets ⇒ a single HTML is the deliverable
 *   3. slide packaging: Marp's authored `asset://` / relative image sources are
 *      resolved into the data space before packaging
 *   4. print sanitisation: file cards and internal links lose their target,
 *      external links and mailto: keep working
 *
 * The modules are bundled with esbuild (the CMS is a Vite app, so `?inline`
 * imports are aliased to an empty stylesheet).
 *
 * Usage: node scripts/check-export.mjs [--verbose]
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.chronicle', 'export-check')
const verbose = process.argv.includes('--verbose')

fs.mkdirSync(OUT, { recursive: true })

const inlineCssPlugin = {
  name: 'inline-css',
  setup(b) {
    b.onResolve({ filter: /\?inline$/ }, () => ({ path: 'css-stub', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default ""', loader: 'js' }))
  },
}

async function bundle(entry, name) {
  const file = path.join(OUT, `${name}.mjs`)
  await build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: file,
    logLevel: 'error',
    plugins: [inlineCssPlugin],
  })
  return import(pathToFileURL(file).href + `?t=${Date.now()}`)
}

// ── minimal ZIP reader: central directory + CRC32 verification ─────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function readZip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record')
  const count = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  const entries = []
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory signature')
    const crc = view.getUint32(p + 16, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = buffer.slice(p + 46, p + 46 + nameLen).toString('utf8')
    // local header: 30 bytes + name + extra, then the stored bytes
    const lNameLen = view.getUint16(localOffset + 26, true)
    const lExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const data = buffer.slice(dataStart, dataStart + size)
    entries.push({ name, size, crc, ok: crc32(data) === crc, data })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ── assertions ────────────────────────────────────────────────────────────
let failures = 0
const pass = (label, ok, detail = '') => {
  if (ok) {
    if (verbose) console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`)
  }
}

const exportBundle = await bundle('packages/manager/src/utils/exportBundle.ts', 'exportBundle')
const printSanitize = await bundle('packages/manager/src/utils/printSanitize.ts', 'printSanitize')
const templates = await bundle('packages/manager/src/composables/editor/markdown/useHTMLTemplates.ts', 'useHTMLTemplates')

// 1. article packaging: rename, dedupe, rewrite, archive layout
const articleBody = [
  '<p><img src="/data/posts/demo/one.png" alt="1" class="md-image"></p>',
  '<p><img src="/data/assets/two.jpg" alt="2" class="md-image-inline"></p>',
  '<p><img src="/data/posts/demo/one.png" alt="dup" class="md-image"></p>',
  '<a href="/data/posts/demo/report.pdf" class="file-card">report.pdf</a>',
  '<p><img src="/data/posts/demo/three.jpeg" alt="3" class="md-image"></p>',
  '<p><a href="/editor/article?id=other-post">other</a> <a href="https://example.com/x">ext</a></p>',
].join('\n')

const article = await exportBundle.buildExportPackage({
  bodyHtml: articleBody,
  htmlName: 'index.html',
  wrap: (body) => templates.buildArticleStandaloneHtml('Gate', body, 'en', 'sans'),
  readBytes: async (url) => new TextEncoder().encode(`BYTES:${url}`),
  locale: 'en',
})

const mapping = Object.fromEntries(article.assets.map((a) => [a.url, a.name]))
pass('assets renamed canonically',
  mapping['/data/posts/demo/one.png'] === 'image1.png'
  && mapping['/data/assets/two.jpg'] === 'image2.jpg'
  && mapping['/data/posts/demo/three.jpeg'] === 'image3.jpg'
  && mapping['/data/posts/demo/report.pdf'] === 'attachment1.pdf',
  JSON.stringify(mapping))
pass('duplicate reference copied once', article.assets.filter((a) => a.url.endsWith('one.png')).length === 1)
pass('jpeg normalised to jpg', article.assets.some((a) => a.name === 'image3.jpg'))
pass('html references renamed assets', ['image1.png', 'image2.jpg', 'image3.jpg', 'attachment1.pdf'].every((n) => article.html.includes(`"${n}"`)))
pass('no /data references left', !article.html.includes('/data/'))
pass('internal post link rewritten', article.html.includes('href="/en/post/other-post"'))
pass('external link untouched', article.html.includes('href="https://example.com/x"'))

const entries = readZip(Buffer.from(await article.zip.arrayBuffer()))
pass('archive layout is flat', JSON.stringify(entries.map((e) => e.name).sort()) ===
  JSON.stringify(['attachment1.pdf', 'image1.png', 'image2.jpg', 'image3.jpg', 'index.html']),
  JSON.stringify(entries.map((e) => e.name)))
pass('archive crc32 valid', entries.every((e) => e.ok))
const archivedHtml = entries.find((e) => e.name === 'index.html')
pass('document inside archive is self-contained', archivedHtml && archivedHtml.data.toString('utf8').includes('"image1.png"'))
pass('asset bytes survive packaging', entries.find((e) => e.name === 'image1.png').data.toString('utf8') === 'BYTES:/data/posts/demo/one.png')

// 2. no local assets ⇒ single html deliverable, nothing to copy
const bare = await exportBundle.buildExportPackage({
  bodyHtml: '<p>plain <a href="https://example.com">x</a></p>',
  htmlName: 'index.html',
  wrap: (body) => `<!DOCTYPE html><html><body>${body}</body></html>`,
  readBytes: async () => null,
  locale: 'en',
})
pass('no assets ⇒ nothing to package', bare.assets.length === 0)
pass('no assets ⇒ html is the deliverable', bare.html.includes('plain'))

// 3. unreadable asset keeps its URL and is reported
const partial = await exportBundle.buildExportPackage({
  bodyHtml: '<p><img src="/data/posts/demo/gone.png" alt="g"></p>',
  htmlName: 'index.html',
  wrap: (b) => b,
  readBytes: async () => null,
  locale: 'en',
})
pass('missing asset reported', partial.missing.length === 1 && partial.missing[0].endsWith('gone.png'))
pass('missing asset keeps original url', partial.html.includes('/data/posts/demo/gone.png'))

// 4. slides: authored sources resolved into the data space, then packaged
const slideHtml = [
  '<img src="asset://logo.png" alt="l">',
  '<img src="pic.png" alt="p">',
  '<img src="https://cdn.example.com/x.png" alt="e">',
].join('\n')
const resolved = exportBundle.resolveSlideImageUrls(slideHtml, 'deck')
pass('asset:// resolved for slides', resolved.includes('src="/data/assets/logo.png"'))
pass('relative resolved for slides', resolved.includes('src="/data/posts/deck/pic.png"'))
pass('external untouched for slides', resolved.includes('src="https://cdn.example.com/x.png"'))

const slides = await exportBundle.buildExportPackage({
  bodyHtml: resolved,
  htmlName: 'index.html',
  wrap: (body) => templates.buildSlidesStandaloneHtml('Deck', body, ':root{}', 'en'),
  readBytes: async (url) => new TextEncoder().encode(`IMG:${url}`),
  locale: 'en',
})
const slideEntries = readZip(Buffer.from(await slides.zip.arrayBuffer()))
pass('slides archive = index.html + renamed images', JSON.stringify(slideEntries.map((e) => e.name).sort()) ===
  JSON.stringify(['image1.png', 'image2.png', 'index.html']), JSON.stringify(slideEntries.map((e) => e.name)))
pass('slides archive crc32 valid', slideEntries.every((e) => e.ok))

// 5. print: cards + internal links lose their target, external links survive
const printed = printSanitize.neutralizeForPrint([
  '<a href="https://example.com" target="_blank" rel="noopener">ext</a>',
  '<a href="mailto:a@b.c">mail</a>',
  '<a href="/editor/article?id=x">post</a>',
  '<a href="/data/posts/demo/report.pdf" class="file-card">report.pdf</a>',
  '<a href="#anchor">anchor</a>',
].join('\n'))
pass('print keeps external link', printed.includes('href="https://example.com"'))
pass('print keeps mailto', printed.includes('href="mailto:a@b.c"'))
pass('print drops internal post link', !printed.includes('/editor/article?id=x'))
pass('print drops file card target', !printed.includes('href="/data/posts/demo/report.pdf"'))
pass('print keeps card label', printed.includes('report.pdf'))
pass('print drops anchor target', !printed.includes('href="#anchor"'))
pass('print marks neutralised links', (printed.match(/data-print-static/g) || []).length === 3,
  String((printed.match(/data-print-static/g) || []).length))

const printDoc = templates.buildStandalonePrintHtml('Gate', printSanitize.neutralizeForPrint('<a href="/x">in</a>'), 'en', 'sans')
pass('print document is forced light', /<html[^>]*data-theme="light"/.test(printDoc) && printDoc.includes(':root{color-scheme:light}'))
pass('print document ships the static cursor rule', printDoc.includes('[data-print-static]'))

// 6. Electron fallback: no HTTP origin to fetch from, so the preload bridge
//    reads an absolute path and returns base64.
const bridgeCalls = []
globalThis.chronicleElectron = {
  getRepoRoot: async () => 'C:\\repo',
  readFileByPath: async (absolute) => {
    bridgeCalls.push(absolute)
    return Buffer.from('PDFBYTES').toString('base64')
  },
}
const bridged = await exportBundle.readAssetBytes('/data/posts/demo/report.pdf')
pass('electron fallback decodes base64 bytes', bridged && Buffer.from(bridged).toString('utf8') === 'PDFBYTES',
  bridged ? String(bridged.length) : 'null')
pass('electron fallback builds an absolute path',
  bridgeCalls[0] === 'C:\\repo\\data\\posts\\demo\\report.pdf', bridgeCalls[0])
delete globalThis.chronicleElectron

fs.rmSync(OUT, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\nexport: FAIL (${failures} check${failures === 1 ? '' : 's'})`)
  process.exit(1)
}
console.log('export: PASS (packaging, archive integrity, slides, print)')
