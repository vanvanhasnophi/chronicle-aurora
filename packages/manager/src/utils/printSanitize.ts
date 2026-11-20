/**
 * Print sanitisation.
 *
 * The print/preview output is meant to be *read* (or saved as PDF), not used:
 * file cards and internal links have no meaning outside the CMS, while external
 * links stay useful in a PDF. So we strip the target from cards and internal
 * links (keeping their children and styling) and leave external ones intact.
 *
 * Anchor tags are matched on their attribute string — the renderer always emits
 * double-quoted attributes with escaped values, so no attribute can smuggle a
 * quote into the tag.
 */

const EXTERNAL_HREF = /^(?:https?:|mailto:|tel:)/i
const FILE_CARD_CLASS = /(?:^|\s)file-card(?:-mini)?(?:\s|$)/

/** True for links that should remain clickable in print. */
export function isExternalHref(href: string): boolean {
  return EXTERNAL_HREF.test(href.trim())
}

/** Is this anchor a file card (`<a class="file-card">` / `file-card-mini`)? */
export function isFileCardAnchor(attributes: string): boolean {
  const match = /\bclass="([^"]*)"/.exec(attributes)
  return match ? FILE_CARD_CLASS.test(match[1]) : false
}

function stripAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(`\\s*\\b${name}(?:="[^"]*")?`, 'gi'), '')
}

/**
 * Remove hrefs from file cards and internal links; keep external links.
 * Elements that lost their target get `data-print-static` so CSS can drop the
 * pointer cursor (and any future styling can hook onto it).
 */
export function neutralizeForPrint(html: string): string {
  return html.replace(/<a\b([^>]*)>/g, (whole: string, attributes: string) => {
    const hrefMatch = /\bhref="([^"]*)"/.exec(attributes)
    if (!hrefMatch) return whole
    const href = hrefMatch[1]
    if (!isFileCardAnchor(attributes) && isExternalHref(href)) return whole

    let next = attributes
    for (const name of ['href', 'target', 'rel', 'download', 'ping', 'referrerpolicy']) {
      next = stripAttribute(next, name)
    }
    if (!/\bdata-print-static=/.test(next)) next += ' data-print-static="1"'
    return `<a${next}>`
  })
}
