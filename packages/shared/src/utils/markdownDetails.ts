/**
 * Shared <details>/<summary> render helpers.
 *
 * The chevron is a real inline SVG (same path/size as the inline TOC icon:
 * 16px, 24 viewBox, 1.8 stroke), injected at render time so the SSG page and
 * the CMS preview use the exact same markup and size.
 */

export const DETAILS_CHEVRON_SVG =
  '<svg class="md-details-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"></polyline></svg>'

const SUMMARY_RE = /<summary\b([^>]*)>([\s\S]*?)<\/summary>/gi
const DETAILS_OPEN_RE = /<details\b([^>]*)>/gi
const DATA_SUMMARY_RE = /(?:^|\s)data-summary="([^"]*)"/i
const TITLE_ATTR_RE = /(?:^|\s)title="([^"]*)"/i

/** Escape text injected as a summary label. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Default label for a <details> authored without <summary>. */
function defaultSummaryLabel(): string {
  if (typeof navigator !== 'undefined' && /^zh/i.test(String(navigator.language || ''))) return '详情'
  return 'Details'
}

/**
 * A <details> without <summary> falls back to the browser's anonymous
 * "Details" widget — it can't be styled by .chr-md and loses Chronicle's
 * glass header / chevron. Inject a real <summary> so the custom styles apply.
 * Authors can label it with data-summary="..." or title="...".
 */
export function injectDetailsSummaries(html: string, defaultSummary?: string): string {
  if (!html || !html.toLowerCase().includes('<details')) return html
  const fallback = defaultSummary || defaultSummaryLabel()
  return html.replace(DETAILS_OPEN_RE, (match, attrs: string, offset: number, whole: string) => {
    const rest = whole.slice(offset + match.length)
    // Already starts with a <summary> (allow whitespace / comments).
    if (/^(?:\s|<!--[\s\S]*?-->)*<summary\b/i.test(rest)) return match
    const labelMatch = DATA_SUMMARY_RE.exec(attrs) || TITLE_ATTR_RE.exec(attrs)
    const label = labelMatch ? labelMatch[1] : fallback
    return `${match}<summary>${escapeHtml(label)}</summary>`
  })
}

/** Append the chevron to every <summary> that doesn't carry it yet. */
export function injectDetailsChevrons(html: string, defaultSummary?: string): string {
  if (!html) return html
  html = injectDetailsSummaries(html, defaultSummary)
  if (!html.toLowerCase().includes('<summary')) return html
  return html.replace(SUMMARY_RE, (match, attrs: string, inner: string) => {
    if (inner.includes('md-details-chevron')) return match
    return `<summary${attrs}>${inner}${DETAILS_CHEVRON_SVG}</summary>`
  })
}

/** Force every <details> open (used by the print preview). */
export function openAllDetails(html: string): string {
  if (!html || !html.toLowerCase().includes('<details')) return html
  return html.replace(/<details\b(?![^>]*\bopen\b)/gi, '<details open')
}
