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

/** Append the chevron to every <summary> that doesn't carry it yet. */
export function injectDetailsChevrons(html: string): string {
  if (!html || !html.toLowerCase().includes('<summary')) return html
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
