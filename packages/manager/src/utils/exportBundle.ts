/**
 * Export packaging: turn the rendered article into a self-contained ZIP.
 *
 * The HTML and every local asset it references land in the same archive, and
 * the assets are renamed canonically (`image1.png`, `attachment1.pdf`, …) so the
 * package reads like a document rather than a mirror of `data/`. References in
 * the HTML are rewritten to those names, which keeps them working when the user
 * unzips the package anywhere.
 *
 * Only `/data/…` URLs are copied — external URLs (CDNs, image hosts) stay
 * absolute and keep loading from the network.
 */

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'])

export type ExportAsset = { url: string; name: string; bytes: Uint8Array }

export type ExportPackage = {
  zip: Blob
  html: string
  assets: ExportAsset[]
  /** URLs that were referenced but could not be read; left untouched in the HTML. */
  missing: string[]
}

function extensionOf(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const file = clean.slice(clean.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  if (dot <= 0 || dot === file.length - 1) return ''
  const ext = file.slice(dot + 1).toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext
}

/** All distinct `/data/…` URLs referenced by src/href/data-url, first-seen order. */
export function collectLocalRefs(html: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  // File cards keep their target in `data-url` (they are <span>s in the editor);
  // the export step turns them into <a href>, but handle both shapes.
  for (const m of html.matchAll(/\b(?:src|href|data-url)="([^"]+)"/g)) {
    const raw = m[1]
    if (!raw.startsWith('/data/')) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}

/** image1.png / attachment2.pdf — sequential per kind, extension preserved. */
function canonicalName(url: string, kindIndex: number): string {
  const ext = extensionOf(url)
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const base = (isImage ? 'image' : 'attachment') + kindIndex
  return ext ? `${base}.${ext}` : base
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace `src`/`href` occurrences of `url` with `name`. Matching is done on the
 * exact attribute value so a URL that happens to be a prefix of another cannot
 * be partially rewritten.
 */
function rewriteRef(html: string, url: string, name: string): string {
  const pattern = new RegExp(`(\\b(?:src|href|data-url)=")${escapeRegExp(url)}(")`, 'g')
  return html.replace(pattern, (_m, open: string, close: string) => open + name + close)
}

/** `/editor/article?id=<slug>` → `/<locale>/post/<slug>` (the site's canonical URL). */
export function rewriteInternalPostLinks(html: string, locale: string): string {
  return html.replace(
    /href="\/editor\/article\?id=([^"&]+)"/g,
    (_m, slug: string) => {
      let decoded = slug
      try { decoded = decodeURIComponent(slug) } catch { /* keep raw */ }
      return `href="/${locale || 'en'}/post/${encodeURIComponent(decoded)}"`
    },
  )
}

/**
 * Slides are rendered by Marp, which keeps image sources exactly as authored:
 * `asset://x` stays a dead `src`, and a bare `pic.png` stays relative to the
 * exported file (i.e. broken). Map both onto the `/data/…` space the reader can
 * fetch from, so the packaging step below can copy them.
 */
export function resolveSlideImageUrls(html: string, postId: string): string {
  const base = postId === '__about__' ? '/data/__about__' : `/data/posts/${postId}`
  return html.replace(/\bsrc="([^"]+)"/g, (whole: string, src: string) => {
    // asset:// is a scheme too — resolve it before the generic scheme guard.
    if (src.startsWith('asset://')) return `src="/data/assets/${src.slice(8)}"`
    if (/^[a-zA-Z][\w+.-]*:/.test(src) || src.startsWith('/') || src.startsWith('#')) return whole
    return `src="${base}/${src}"`
  })
}

export type BuildExportOptions = {
  /** Rendered body HTML (no document wrapper). */
  bodyHtml: string
  /** File name inside the archive, e.g. `my-post.html`. */
  htmlName: string
  /** Wraps the rewritten body into the standalone document. */
  wrap: (bodyHtml: string) => string
  /** Reads asset bytes; null means "could not read" (reference stays absolute). */
  readBytes: (url: string) => Promise<Uint8Array | null>
  locale?: string
}

/**
 * Build the ZIP: document + renamed assets. Assets that cannot be read are left
 * pointing at their original URL rather than silently producing a broken link.
 */
export async function buildExportPackage(options: BuildExportOptions): Promise<ExportPackage> {
  const { bodyHtml, htmlName, wrap, readBytes, locale = 'en' } = options

  let html = rewriteInternalPostLinks(bodyHtml, locale)
  const refs = collectLocalRefs(html)
  const assets: ExportAsset[] = []
  const missing: string[] = []
  let imageIndex = 0
  let fileIndex = 0

  for (const url of refs) {
    const ext = extensionOf(url)
    const isImage = IMAGE_EXTENSIONS.has(ext)
    const bytes = await readBytes(url)
    if (!bytes || bytes.length === 0) {
      // Keep the original reference rather than producing a broken link.
      missing.push(url)
      continue
    }
    // The per-kind counter keeps names unique: (index, extension) is never
    // reused because the index advances for every copied asset of that kind.
    const name = canonicalName(url, isImage ? ++imageIndex : ++fileIndex)
    assets.push({ url, name, bytes })
    html = rewriteRef(html, url, name)
  }

  const document = wrap(html)
  const encoder = new TextEncoder()
  const { buildZip } = await import('./zipStore')
  const zip = buildZip([
    { name: htmlName, data: encoder.encode(document) },
    ...assets.map((asset) => ({ name: asset.name, data: asset.bytes })),
  ])

  return { zip, html: document, assets, missing }
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Read the bytes behind a `/data/…` URL.
 *
 * In the browser (dev server, and the web build served by it) the URL is served
 * as a static file, so `fetch` works. In Electron with `file://` there is no
 * such origin, so fall back to the preload bridge that reads an absolute path.
 * Returns null when the file cannot be read — the caller keeps the original URL.
 */
export async function readAssetBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (response.ok) return new Uint8Array(await response.arrayBuffer())
  } catch {
    /* fall through to the Electron bridge */
  }

  const api = (globalThis as any).chronicleElectron
  if (api?.getRepoRoot && api?.readFileByPath) {
    try {
      const root = String((await api.getRepoRoot()) || '').replace(/[\\/]+$/, '')
      if (root) {
        const separator = root.includes('\\') ? '\\' : '/'
        const absolute = root + url.replace(/\//g, separator)
        const base64 = await api.readFileByPath(absolute)
        if (base64) return base64ToBytes(String(base64))
      }
    } catch {
      /* treat as unreadable */
    }
  }
  return null
}
