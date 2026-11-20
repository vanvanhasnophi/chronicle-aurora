/**
 * Chronicle Manager — Markdown Preview Renderer
 *
 * Uses the same markdown-it configuration and post-processing pipeline
 * as template-astro's chronicleMarkdown.ts to guarantee CMS preview output
 * matches the published page exactly.
 *
 * Keep in sync with: packages/template-astro/src/utils/chronicleMarkdown.ts
 */

import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import { Icons } from './icons';
import DOMPurify from 'dompurify';
import { SANITIZE_CONFIG, isSafeIframeSrc, injectDetailsChevrons, openAllDetails } from '@chronicle/shared/src/utils';

// iframe 视频嵌入（网易云/哔哩哔哩/YouTube）——非白名单 src 的 iframe 直接移除
// （与 template-astro 的 chronicleMarkdown.ts 同逻辑，CMS 预览与 SSG 输出一致）
DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
  if (node.tagName === 'IFRAME' && !isSafeIframeSrc(node.getAttribute('src') || '')) {
    node.remove();
  }
});

// ═══════════════════════════════════════════════════════════
//  Config — must match chronicleMarkdown.ts in template-astro
// ═══════════════════════════════════════════════════════════

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

// Allow file:/// URLs and custom protocols: asset://, post://
//
// Relative destinations must pass too: markdown-it's link rule gives up entirely
// when validateLink rejects the href, which silently turned `[English](README.md)`
// into literal text whenever normalizeLink could not make it absolute — exactly
// what happens for an unsaved document or a locally opened file (_postId is
// empty, so the relative href stays relative). The old catch-all
// `[a-zA-Z][a-zA-Z0-9+.-]*:` accepted ANY scheme (javascript:, code:, ...); only
// the known ones below are allowed now.
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const SAFE_SCHEME = /^(?:https?:|file:|mailto:|tel:|sms:|asset:|post:)/i
md.validateLink = (url: string) => {
  const u = String(url).trim()
  if (!HAS_SCHEME.test(u)) return true   // relative path, /root, #anchor, ?query
  return SAFE_SCHEME.test(u)
}

// Current post context — set by BlogEditor when post changes
let _postId = ''
export function setPreviewPostId(id: string) { _postId = id }

// Resolve custom protocols
function resolveAssetUrl(file: string): string { return '/data/assets/' + file }
function resolvePostUrl(slug: string): string  { return '/editor/article?id=' + slug }

// Resolve URLs:
//   asset://file  → /data/assets/file       (public)
//   post://slug   → /editor/article?id=slug  (cross-post)
//   file.png      → /data/posts/<slug>/file  (private, relative path)
const _mdNormalizeLink = md.normalizeLink.bind(md);
md.normalizeLink = (url: string) => {
  if (url.startsWith('asset://')) return resolveAssetUrl(url.slice(8));
  if (url.startsWith('post://')) return resolvePostUrl(url.slice(7));
  // Relative path — resolve to post directory, encode non-ASCII filenames
  if (_postId && !url.startsWith('/') && !url.startsWith('#') && !/^[a-zA-Z][\w+.-]*:/.test(url)) {
    const base = _postId === '__about__' ? '/data/__about__' : `/data/posts/${_postId}`; // manager uses filesystem path
    const encoded = url.split('/').map(seg => { try { decodeURI(seg); return seg } catch { return encodeURI(seg) } }).join('/');
    const resolved = `${base}/${encoded}`;
    console.log('[markdownPreview] relative →', resolved);
    return resolved;
  }
  return _mdNormalizeLink(url);
};

md.use(markdownItFootnote);

/**
 * GitHub-style alerts: `> [!NOTE]` / TIP / IMPORTANT / WARNING / CAUTION as the
 * first line of a blockquote. The marker becomes a title paragraph inside the
 * quote (text after the marker wins over the default label) and the quote is
 * tagged with `data-alert`, which the stylesheet colours per type.
 *
 * Mirrored in packages/template-astro/src/utils/chronicleMarkdown.ts — change both.
 */
const ALERT_LABELS: Record<string, string> = {
  note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
};

function chronicleAlerts(state: any) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'blockquote_open') continue;
    const paraOpen = tokens[i + 1];
    const inline = tokens[i + 2];
    const paraClose = tokens[i + 3];
    if (paraOpen?.type !== 'paragraph_open' || inline?.type !== 'inline' || paraClose?.type !== 'paragraph_close') continue;
    const lineEnd = inline.content.indexOf('\n');
    const firstLine = (lineEnd === -1 ? inline.content : inline.content.slice(0, lineEnd)).trim();
    const match = /^\[!(note|tip|important|warning|caution)\](?:[ \t]+(.*))?$/i.exec(firstLine);
    if (!match) continue;

    const type = match[1].toLowerCase();
    const title = (match[2] || '').trim() || ALERT_LABELS[type];
    const rest = lineEnd === -1 ? '' : inline.content.slice(lineEnd + 1);

    open.attrSet('class', `md-alert md-alert--${type}`);
    open.attrSet('data-alert', type);

    const titleOpen = new state.Token('paragraph_open', 'p', 1);
    titleOpen.attrSet('class', 'md-alert-title');
    titleOpen.block = true;
    const titleInline = new state.Token('inline', '', 0);
    titleInline.content = title;
    const titleText = new state.Token('text', '', 0);
    titleText.content = title;
    titleInline.children = [titleText];
    const titleClose = new state.Token('paragraph_close', 'p', -1);

    if (!rest.trim()) {
      // The marker line was the whole paragraph → replace it with the title.
      tokens.splice(i + 1, 3, titleOpen, titleInline, titleClose);
    } else {
      inline.content = rest.trim();
      inline.children = [];
      state.md.inline.parse(inline.content, state.md, state.env, inline.children);
      tokens.splice(i + 1, 0, titleOpen, titleInline, titleClose);
    }
  }
}

md.core.ruler.push('chronicle_alerts', chronicleAlerts);

// ── post:// links: open in new tab/window ───────────────
// post://<slug> normalizes to /editor/article?id=<slug> (cross-post editor link).
const _previewLinkOpen = md.renderer.rules.link_open || function(tokens: any, idx: number, options: any, _env: any, self: any) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function(tokens: any, idx: number, options: any, env: any, self: any) {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1];
    if (href.startsWith('/editor/article?id=')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
      token.attrSet('data-post-link', '');
    }
  }
  return _previewLinkOpen(tokens, idx, options, env, self);
};

// Strip brackets from footnote refs: [1] → 1
md.renderer.rules.footnote_caption = (tokens: any, idx: number) => {
  let n = (Number(tokens[idx].meta.id) + 1).toString()
  if (tokens[idx].meta.subId > 0) n += ':' + tokens[idx].meta.subId
  return n
}

// Use <a> directly — capsule styling is on the link itself
md.renderer.rules.footnote_ref = (tokens: any, idx: number, options: any, env: any, slf: any) => {
  const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf)
  const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf)
  let refid = id
  if (tokens[idx].meta.subId > 0) refid += ':' + tokens[idx].meta.subId
  return `<a class="footnote-ref" id="fnref${refid}" href="#fn${id}">${caption}</a>`
}

// ── Tiny =WxH image-size plugin ──────────────────────────
// Based on markdown-it-imsize but without Node.js autofill deps.

function parseImageSize(src: string, pos: number, max: number): { ok: boolean; pos: number; width: string; height: string } {
  if (pos >= max || src.charCodeAt(pos) !== 0x3D /* = */) return { ok: false, pos, width: '', height: '' };
  pos++;
  if (pos >= max) return { ok: false, pos, width: '', height: '' };
  // next char must be digit or 'x'
  const code = src.charCodeAt(pos);
  if (code !== 0x78 /* x */ && (code < 0x30 || code > 0x39)) return { ok: false, pos, width: '', height: '' };

  const result: any = { ok: true, pos, width: '', height: '' };
  // parse width
  while (pos < max) { const c = src.charCodeAt(pos); if ((c >= 0x30 && c <= 0x39) || c === 0x25) { result.width += src[pos++]; } else break; }
  if (src.charCodeAt(pos) !== 0x78 /* x */) return { ok: false, pos, width: '', height: '' };
  pos++; // skip x
  // parse height
  while (pos < max) { const c = src.charCodeAt(pos); if ((c >= 0x30 && c <= 0x39) || c === 0x25) { result.height += src[pos++]; } else break; }
  result.pos = pos;
  return result;
}

function isSpace(code: number): boolean { return code === 0x20 || code === 0x0A || code === 0x09; }

md.inline.ruler.before('image', 'chronicle_image_size', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x21 /* ! */) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 0x5B /* [ */) return false;

  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) return false;

  let pos = labelEnd + 1;
  if (pos >= state.posMax || state.src.charCodeAt(pos) !== 0x28 /* ( */) return false;

  // parse ( href "title" =WxH )
  pos++;
  while (pos < state.posMax && isSpace(state.src.charCodeAt(pos))) pos++;

  const hrefRes = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
  if (!hrefRes.ok) return false;
  let href = state.md.normalizeLink(hrefRes.str);
  if (!state.md.validateLink(href)) href = '';
  pos = hrefRes.pos;

  while (pos < state.posMax && isSpace(state.src.charCodeAt(pos))) pos++;

  let title = '';
  const titleRes = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
  if (titleRes.ok) { title = titleRes.str; pos = titleRes.pos; }

  while (pos < state.posMax && isSpace(state.src.charCodeAt(pos))) pos++;

  // parse =WxH
  let width = '', height = '';
  const sizeRes = parseImageSize(state.src, pos, state.posMax);
  if (sizeRes.ok) { width = sizeRes.width; height = sizeRes.height; pos = sizeRes.pos; }

  while (pos < state.posMax && isSpace(state.src.charCodeAt(pos))) pos++;

  if (pos >= state.posMax || state.src.charCodeAt(pos) !== 0x29 /* ) */) return false;
  pos++;

  // Does this image share its line with other content? (`Text ![x](a.png) more`)
  // The image then belongs to the text flow and must not become a block figure
  // with a 2:1 placeholder — see markInlineImages() in the post-process pass.
  // `state.pos` is still the `!` here (only the local `pos` moved past `)`).
  const lineStart = state.src.lastIndexOf('\n', state.pos - 1) + 1;
  const hasTextBefore = /\S/.test(state.src.slice(lineStart, state.pos));
  const endsLine = /^[ \t]*(\r?\n|$)/.test(state.src.slice(pos, state.posMax));
  const isInlineImage = hasTextBefore || !endsLine;

  if (!silent) {
    const content = state.src.slice(labelStart, labelEnd);
    state.pos = labelStart;
    state.posMax = labelEnd;
    const tokens: any[] = [];
    state.md.inline.parse(content, state.md, state.env, tokens);

    const token = state.push('image', 'img', 0);
    token.attrs = [['src', href], ['alt', '']];
    token.children = tokens;
    token.content = content;
    if (title) token.attrs.push(['title', title]);
    if (width) token.attrs.push(['width', width]);
    if (height) token.attrs.push(['height', height]);
    if (isInlineImage) token.attrs.push(['data-inline', '1']);
  }

  state.pos = pos;
  state.posMax = state.src.length;
  return true;
});

// ── File-card type prefixes ──────────────────────────────
// A leading `type:` forces the card type regardless of the extension.
// (`open:` is not here — it forces a plain link, see FORCE_LINK_PREFIX.)
// Supports both head-tags (audio:, video:, ...) and tail extensions (.mp3, .pdf).
const TYPE_PREFIXES: [string, string, string][] = [
  // [prefix, type-label, icon-key]
  ['audio:',    'Audio',     'audio'],
  ['video:',    'Video',     'video'],
  ['document:', 'Document',  'document'],
  ['doc:',      'Document',  'document'],
  ['text:',     'Code/Text', 'codeText'],
  ['code:',     'Code/Text', 'codeText'],
  ['archive:',  'Archive',   'archive'],
  ['link:',     'Link',      'link'],
  ['mailto:',   'Email',     'person'],
  ['attach:',   'File',      'link'],
  // The CMS inserts `file:` for extension-less / unknown types (getTypePrefix
  // in useFileTypes.ts) — without this entry those links fell through to
  // markdown-it and became dead `file:...` hrefs.
  ['file:',     'File',      'link'],
];

function getPrefixIcon(key: string): string {
  const map: Record<string, string> = {
    audio: Icons.audio, video: Icons.video, document: Icons.document,
    codeText: Icons.codeText, archive: Icons.archive, link: Icons.link,
    person: Icons.person,
  };
  return map[key] || Icons.link;
}

// ── Link classification ──────────────────────────────────
// `open:` forces a plain inline <a> (navigate) even when the URL looks like a
// file — the counterpart of `file:` / `audio:` / `video:`, which force a
// preview card. Example: [manual](open:manual.pdf#page=3).
const FORCE_LINK_PREFIX = 'open:'

// Extensions that default to a file CARD (preview affordance).
// Markdown documents are deliberately absent: a .md file is a navigation
// target, not a preview target, so `[English](README.md)` stays a link.
// Force a card for one with `text:` / `attach:`.
const CARD_EXTENSIONS = [
  'mp3','wav','ogg','m4a','flac','aac',
  'mp4','webm','mkv','mov','avi',
  'pdf','doc','docx','ppt','pptx','xls','xlsx',
  'txt','js','ts','json','c','cpp','py','java','html','css','vue','log','xml','yaml',
  'zip','rar','7z','tar','gz',
];

/**
 * Extension of a link's last *path* segment — stricter than a bare `\.ext`:
 *   - query and fragment are ignored:      a.pdf?dl=1, a.pdf#page=2
 *   - the host is never read:              https://example.md/ is a site, not a file
 *   - 2-6 alphanumerics, segment non-empty
 * `asset://` and `post://` carry a bare path, so all of it is the path.
 */
function getLinkExtension(url: string): string {
  let p = String(url).split('#')[0].split('?')[0];
  if (/^asset:\/\//i.test(p)) p = p.slice(8);
  else if (/^post:\/\//i.test(p)) p = p.slice(7);
  else {
    const scheme = p.indexOf('://');
    if (scheme >= 0) {
      const slash = p.indexOf('/', scheme + 3);
      p = slash >= 0 ? p.slice(slash) : '';   // no path -> no file
    }
  }
  const seg = p.slice(p.lastIndexOf('/') + 1);
  const m = seg.match(/^[^.\/]+\.([0-9a-z]{2,6})$/i);
  return m ? m[1].toLowerCase() : '';
}

/** Does `[text](url)` render as a file card (preview) rather than a link? */
function isCardLink(url: string): boolean {
  const ext = getLinkExtension(url);
  return !!ext && CARD_EXTENSIONS.includes(ext);
}

function parseTypePrefix(href: string): { type: string; icon: string; actualUrl: string } | null {
  // `file:///...` is the URL scheme (Electron local paths), not the CMS type tag.
  if (/^file:\/\//i.test(href)) return null;
  const lower = href.toLowerCase();
  for (const [prefix, type, iconKey] of TYPE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { type, icon: getPrefixIcon(iconKey), actualUrl: href.slice(prefix.length) };
    }
  }
  return null;
}

// ── File-card interception (inline rule) ─────────────────
// Runs BEFORE markdown-it's built-in "link" rule.
//   [text](audio:...)      -> file card, type forced by the prefix
//   [text](report.pdf)     -> file card, type from the extension
//   [text](README.md)      -> plain link (markdown docs are navigation targets)
//   [text](open:any.url)   -> plain link, forced (escapes the extension check)
//   [![badge](img)](url)   -> plain link around an image, never a card
md.inline.ruler.before('link', 'chronicle_file_card', (state, silent) => {
  const pos = state.pos;
  const src = state.src;

  // Must start with '['
  if (src.charCodeAt(pos) !== 0x5B) return false;

  // ── Label: [ ... ] ──
  // markdown-it's own helper, so nested constructs are skipped correctly — the
  // naive scan stopped at the first `]` and mangled `[![badge](img)](url)`.
  const labelStart = pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, pos, false);
  if (labelEnd < 0) return false;
  const labelSrc = src.slice(labelStart, labelEnd);

  // ── Destination: ( url "title" ) ──
  let i = labelEnd + 1;
  if (i >= state.posMax || src.charCodeAt(i) !== 0x28 /* ( */) return false;
  i++;

  const destRes = state.md.helpers.parseLinkDestination(src, i, state.posMax);
  if (!destRes.ok) return false;
  const href = destRes.str;
  i = destRes.pos;

  while (i < state.posMax && isSpace(src.charCodeAt(i))) i++;
  const titleGap = i;
  const titleRes = state.md.helpers.parseLinkTitle(src, i, state.posMax);
  const title = (titleRes.ok && i > titleGap) ? titleRes.str : '';
  if (title) i = titleRes.pos;
  while (i < state.posMax && isSpace(src.charCodeAt(i))) i++;
  if (i >= state.posMax || src.charCodeAt(i) !== 0x29 /* ) */) return false;
  const end = i + 1;   // past ')'

  // ── Forced plain link: open:<url> ──
  // Emit the same token shape markdown-it's `link` rule would (see link.mjs):
  // link_open -> inline label -> link_close. Keeps normalizeLink, link
  // validation, the `linkLevel` nesting guard and nested inline markup intact.
  //
  // NB: rewriting state.src/posMax in place is NOT an option — tokenize()
  // captures `end = state.posMax` once, so a shorter source makes the loop run
  // off the end and emit literal "undefined" text.
  if (href.toLowerCase().startsWith(FORCE_LINK_PREFIX)) {
    if (!silent) {
      const max = state.posMax;
      let dest = state.md.normalizeLink(href.slice(FORCE_LINK_PREFIX.length));
      if (!state.md.validateLink(dest)) dest = '';

      state.pos = labelStart;
      state.posMax = labelEnd;
      const tokenO = state.push('link_open', 'a', 1);
      const attrs: [string, string][] = [['href', dest]];
      if (title) attrs.push(['title', title]);
      tokenO.attrs = attrs;

      state.linkLevel++;
      state.md.inline.tokenize(state);
      state.linkLevel--;

      state.push('link_close', 'a', -1);
      state.posMax = max;
    }
    state.pos = end;
    return true;
  }

  // A link wrapping an image is a badge / linked image, not a file card.
  if (labelSrc.includes('![')) return false;

  // ── Intercept: type-prefix OR card extension ──
  const prefixMatch = parseTypePrefix(href);

  // Blob/file URLs lack extensions — fall back to the link text's extension.
  const textExt = (href.startsWith('blob:') || href.startsWith('file://'))
    ? getLinkExtension(labelSrc.replace(/\s+$/, ''))
    : '';
  const effectiveExt = textExt && CARD_EXTENSIONS.includes(textExt) ? textExt : undefined;

  if (!prefixMatch && !isCardLink(href) && !effectiveExt) return false;

  // If we matched via text extension, build a virtual prefix for rendering
  const effectivePrefix = !prefixMatch && effectiveExt
    ? (() => {
        const ct = getFileCardType(effectiveExt);
        const iconKey = ct.type === 'Code/Text' ? 'codetext' : ct.type.toLowerCase();
        return { type: ct.type, icon: getPrefixIcon(iconKey), actualUrl: href };
      })()
    : null;

  if (!silent) {
    const activePrefix = effectivePrefix || prefixMatch;
    const isMailto = activePrefix?.type === 'Email';
    const isLink   = activePrefix?.type === 'Link';
    const rawUrl   = isMailto ? href : (activePrefix ? activePrefix.actualUrl : href);
    // Resolve asset:// and post:// in the URL after type-prefix stripping
    const cardUrl  = rawUrl.startsWith('asset://') ? resolveAssetUrl(rawUrl.slice(8))
                   : rawUrl.startsWith('post://') ? resolvePostUrl(rawUrl.slice(7))
                   : (_postId && !rawUrl.startsWith('/') && !/^[a-zA-Z][\w+.-]*:/.test(rawUrl)
                       ? `${_postId === '__about__' ? '/data/__about__' : `/data/posts/${_postId}`}/${rawUrl.split('/').map((seg: string) => { try { decodeURI(seg); return seg } catch { return encodeURI(seg) } }).join('/')}`
                       : rawUrl);
    const subtitle = (isMailto || isLink) ? (activePrefix?.actualUrl || href) : undefined;

    // A card sharing its line with prose renders compact ("mini"); a card that
    // is alone on its line keeps the full block treatment.
    const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  const hasTextBefore = /\S/.test(src.slice(lineStart, pos));
    const endsLine = /^[ \t]*(\r?\n|$)/.test(src.slice(end, state.posMax));
    const mini = hasTextBefore || !endsLine;

    const token = state.push('html_inline', '', 0);
    token.content = renderFileCard(cardUrl, labelSrc.trim(), activePrefix?.type, subtitle, mini);
  }
  state.pos = end;
  return true;
});

// ── GFM Task list checkbox (inline rule) ───────────────
// Intercepts [ ] / [x] at the start of inline content.
// Registered after chronicle_file_card, before 'link'.
// [ ] → unchecked, [x]/[X] → checked.
md.inline.ruler.before('link', 'task_list_checkbox', (state, silent) => {
  const start = state.pos
  if (state.pending.trim().length > 0) return false

  const src = state.src
  if (src.charCodeAt(start) !== 0x5B /* [ */) return false
  if (start + 2 >= state.posMax) return false

  const ch = src.charCodeAt(start + 1)
  if (ch !== 0x20 && ch !== 0x78 && ch !== 0x58) return false
  if (src.charCodeAt(start + 2) !== 0x5D /* ] */) return false

  if (!silent) {
    const checked = ch !== 0x20
    const token = state.push('checkbox_input', '', 0)
    token.attrSet('checked', checked ? 'true' : 'false')
  }

  state.pos = start + 3
  return true
})

md.renderer.rules.checkbox_input = (tokens, idx) => {
  const checked = tokens[idx].attrGet('checked') === 'true'
  return `<input type="checkbox" class="md-task-checkbox" disabled${checked ? ' checked' : ''}>`
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractAttr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function uniqueId(): string {
  return `chr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════
//  Step 1: Pre-process math delimiters → katex placeholders
// ═══════════════════════════════════════════════════════════

function mathPh(type: 'I' | 'B', idx: number): string { return `<!--cm ${type}${idx}-->`; }

function protectMath(content: string): { text: string; mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }> } {
  const mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }> = [];
  let idx = 0;
  let result = content;

  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_m: string, tex: string) => {
    const clean = tex.trim(); if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'block' }); return mathPh('B', idx++);
  });
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_m: string, tex: string) => {
    const clean = tex.trim(); if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'block' }); return mathPh('B', idx++);
  });
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_m: string, tex: string) => {
    const clean = tex.trim(); if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'inline' }); return mathPh('I', idx++);
  });
  result = result.replace(/\$([^$\n]+?)\$/g, (_m: string, tex: string) => {
    const clean = tex.trim(); if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'inline' }); return mathPh('I', idx++);
  });

  return { text: result, mathBlocks };
}

function restoreMath(html: string, mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }>): string {
  return html.replace(/<!--cm ([IB])(\d+)-->/g, (_m: string, type: string, num: string) => {
    const i = Number(num);
    if (i >= 0 && i < mathBlocks.length) return renderKatexPlaceholder(mathBlocks[i].tex, mathBlocks[i].type);
    return _m;
  });
}

function renderKatexPlaceholder(tex: string, type: 'inline' | 'block'): string {
  const uid = uniqueId();
  const tag = type === 'block' ? 'div' : 'span';
  return `<${tag} class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="${type}" data-unique-id="${uid}">${escapeAttr(tex)}</${tag}>`;
}

// ═══════════════════════════════════════════════════════════
//  Step 2: Post-process → component HTML
// ═══════════════════════════════════════════════════════════

function renderCodeChunkHtml(code: string, lang: string): string {
  const safeCode = escapeAttr(code);
  const safeLang = escapeAttr(lang || 'plain');
  const lines = code.split('\n').length || 1;
  const lineHeight = 20;
  const height = Math.max(80, Math.min(360, lines * lineHeight + 24));

  return `
<div class="code-chunk-container">
  <div class="editor-header">
    <div class="header-left">
      <span class="language-label" title="${safeLang}">${safeLang}</span>
    </div>
    <div class="toolbar">
      <button class="icon-btn copy-btn" title="Copy" data-code="${safeCode}">
        <svg class="copy-icon" width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"></rect><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect></svg>
        <svg class="success-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>
  </div>
  <div class="editor-wrapper" style="height: ${height}px;">
    <div class="editor-content">
      <pre class="syntax-hl" style="padding: 0.7rem 1.5rem 1.2rem 1.5rem; font-size: 13.5px; line-height: 1.3em; font-family: inherit; box-sizing: border-box;"><code>${safeCode}</code></pre>
    </div>
  </div>
  <div class="editor-footer" data-chars="${code.length}" data-lines="${lines}"><span><span>${code.length} chars &nbsp;|&nbsp; ${lines} lines</span></span></div>
</div>`;
}

function renderImageWrapper(src: string, alt?: string, title?: string, width?: string, height?: string): string {
  if (!src) {
    return `<div class="md-image-container">
      <div class="md-image-wrapper placeholder" data-placeholder-text="No image">
        <span class="md-placeholder-text" aria-hidden="true">No image</span>
      </div>
    </div>`;
  }
  // title attribute → caption (markdown: "title text" in quotes after URL)
  const captionHtml = (title && title.trim()) ? `<div class="md-image-caption">${escapeAttr(title.trim())}</div>` : '';
  // Apply size to wrapper, not <img> — wrapper is the "viewport", img fills it.
  // Supports absolute (400, 300px) and relative (70%, 50%) units.
  const cssDim = (v: string) => v ? v.includes('%') ? v : v + 'px' : '';
  const wrapperStyle = (width || height)
    ? ` style="${width ? 'width:' + cssDim(width) + ';' : ''}${height ? 'height:' + cssDim(height) + ';' : ''}max-width:100%"`
    : '';
  // The editor preview has no file dimensions, so a height-only hint (`=x300`)
  // leaves the wrapper column-wide: letterbox instead of stretching the image.
  const imgClass = (!width && height && !height.includes('%')) ? 'md-image md-image-contain' : 'md-image';
  return `<div class="md-image-container">
    <div class="md-image-wrapper" data-placeholder-text="Loading..."${wrapperStyle}>
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="${imgClass}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />
      <span class="md-placeholder-text" aria-hidden="true">Loading...</span>
    </div>
    ${captionHtml}
  </div>`;
}

/** Kept as a thin alias of {@link isCardLink} for callers outside this module. */
function isFileCardUrl(url: string): boolean {
  return isCardLink(url);
}

function getFileCardType(urlOrExt: string): { type: string; icon: string } {
  // Callers pass either a URL or a bare extension (`mp3`).
  const raw = String(urlOrExt || '');
  const ext = /^[0-9a-z]{2,6}$/i.test(raw) ? raw.toLowerCase() : getLinkExtension(raw);
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return { type: 'Audio', icon: Icons.audio };
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) return { type: 'Video', icon: Icons.video };
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return { type: 'Document', icon: Icons.document };
  if (['txt', 'md', 'markdown', 'mdx', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml'].includes(ext)) return { type: 'Code/Text', icon: Icons.codeText };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { type: 'Archive', icon: Icons.archive };
  return { type: 'File', icon: Icons.link };
}

/**
 * Render a file card.
 *
 * `mini` = the card shares its line with prose. It then becomes a single-line
 * pill (icon + name, no subtitle) built from spans, so it can live inside a
 * <p> without the block-card markup breaking the paragraph. Both variants stay
 * span-based: a <div> inside <p> is invalid HTML and browsers reparent it,
 * which used to split the surrounding paragraph.
 */
function renderFileCard(url: string, displayName?: string, forcedType?: string, customSubtitle?: string, mini = false): string {
  const detected = getFileCardType(url);
  // forcedType from prefix (audio:/video:/document: etc.) wins over extension detection
  const type = forcedType || detected.type;
  const icon = forcedType ? getPrefixIcon(
    TYPE_PREFIXES.find(p => p[1] === forcedType)?.[2] || 'link'
  ) : detected.icon;
  // Prefer the link text (markdown [text](url)) over the raw filename
  const name = (displayName && displayName.trim()) ? displayName.trim() : (url.split('/').pop() || url);
  const safeUrl = escapeAttr(url);
  const safeName = escapeAttr(name);
  // Subtitle: custom (link:/mailto: stripped URL) > detected type label
  const safeSubtitle = escapeAttr(customSubtitle || type);
  const cls = mini ? 'file-card file-card-mini' : 'file-card';
  // The mini card drops the subtitle; keep the type as a tooltip instead.
  const subtitleHtml = mini ? '' : `<span class="file-card-subtitle">${safeSubtitle}</span>`;
  const titleAttr = mini ? ` title="${safeSubtitle}"` : '';

  return `<span class="${cls}" data-url="${safeUrl}" data-name="${safeName}" data-type="${escapeAttr(type)}"${titleAttr}>` +
    `<span class="file-card-icon">${icon}</span>` +
    `<span class="file-card-info"><span class="file-card-title">${safeName}</span>${subtitleHtml}</span>` +
    `</span>`;
}

/** An <img> that already went through one of the passes below. */
const IMG_ALREADY_RENDERED = /\bmd-image(-inline)?\b/;

/**
 * Mark images that are wrapped in a link (`[![alt](img)](url)`) as inline.
 *
 * Badges and other clickable images must not become block image containers:
 * the wrapper carries a 2:1 placeholder, a caption and `opacity:0` until
 * `onload` fires — inside an <a> that is pure breakage, and the image is a
 * glyph on the text baseline, not a figure.
 */
function inlineLinkedImages(html: string): string {
  return html.replace(
    /(<a\b[^>]*>)(\s*)(<img\b[^>]*>)(\s*<\/a>)/g,
    (m, open: string, before: string, img: string, after: string) => {
      if (IMG_ALREADY_RENDERED.test(img)) return m;
      return `${open}${before}${img.replace(/^<img\b/, '<img class="md-image-inline"')}${after}`;
    }
  );
}

/**
 * Turn every "this image belongs to a text line" case into an inline image.
 *
 * Two sources set the inline flag:
 *   1. linked images — `[![alt](img)](url)`, handled by inlineLinkedImages()
 *   2. an image sharing its line with prose (`Text ![x](a.png) more`), flagged
 *      with `data-inline="1"` by the image-size inline rule at parse time
 *
 * Both skip the block image wrapper below, so the paragraph around them is not
 * split by a <div> and no 2:1 placeholder/caption is injected.
 */
function markInlineImages(html: string): string {
  const out = inlineLinkedImages(html);
  return out.replace(/<img\b[^>]*\sdata-inline="1"[^>]*>/g, (tag) => {
    if (IMG_ALREADY_RENDERED.test(tag)) return tag;
    return tag.replace(/^<img\b/, '<img class="md-image-inline" loading="lazy" decoding="async"');
  });
}

function postProcessHtml(html: string): string {
  let result = html;

  // 1. Code blocks → CodeChunk HTML
  // (a) Language-tagged blocks — [^"]* captures special chars (+, #, -).
  result = result.replace(
    /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang, rawCode) => {
      const code = unescapeHtml(rawCode);
      return renderCodeChunkHtml(code, lang || 'plain');
    }
  );

  // (b) Bare blocks (no language class) → fall back to "plain".
  result = result.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_m, rawCode) => {
      const code = unescapeHtml(rawCode);
      return renderCodeChunkHtml(code, 'plain');
    }
  );

  // 2. Linked images and images sharing a line with prose stay inline (the
  //    block wrapper would turn a badge / inline glyph into a full-width box).
  result = markInlineImages(result);

  // 3. Images → image wrapper (title attr → caption, width/height from =WxH syntax)
  result = result.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m, src) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m;
      const alt = extractAttr(_m, 'alt');
      const title = extractAttr(_m, 'title');
      const width = extractAttr(_m, 'width');
      const height = extractAttr(_m, 'height');
      return renderImageWrapper(src, alt, title, width, height);
    }
  );
  result = result.replace(
    /<img\s[^>]*src="([^"]+)"[^>]*>/g,
    (_m, src) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m;
      const alt = extractAttr(_m, 'alt');
      const title = extractAttr(_m, 'title');
      const width = extractAttr(_m, 'width');
      const height = extractAttr(_m, 'height');
      return renderImageWrapper(src, alt, title, width, height);
    }
  );

  return result;
}

// ═══════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════

/**
 * Render Chronicle-flavored markdown to HTML.
 * Pipeline: protect math → markdown-it → restore math → post-process
 */
export function renderPreview(markdown: string): string {
  if (!markdown) return '';

  const { text, mathBlocks } = protectMath(markdown);
  let html = md.render(text);
  html = restoreMath(html, mathBlocks);

  // Sanitize user HTML BEFORE post-processing, so Chronicle's own safe
  // image-wrapper handlers (onload/onerror) aren't stripped.
  html = DOMPurify.sanitize(html, SANITIZE_CONFIG);

  html = postProcessHtml(html);

  return injectDetailsChevrons(html);
}

// ── Segmented render (for editor preview) ──────────────────
// Splits rendered HTML at code-block boundaries so the Vue
// layer can mount <CodeChunk> components instead of static HTML.

export interface MarkdownSegment {
  type: 'html' | 'code';
  content: string;
  language?: string;
}

/** Render markdown for editor preview: code blocks stay as <pre><code>
 *  so they can be extracted and replaced with CodeChunk.vue components. */
function renderForSegments(markdown: string): string {
  if (!markdown) return '';
  const { text, mathBlocks } = protectMath(markdown);
  let html = md.render(text);
  html = restoreMath(html, mathBlocks);
  // Apply image post-processing only (code blocks left as <pre><code>).
  // Linked / in-line images stay inline here too — same rule as the full pipeline.
  html = markInlineImages(html);
  html = html.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m: string, src: string) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m;
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), extractAttr(_m, 'width'), extractAttr(_m, 'height'));
    }
  );
  html = html.replace(
    /<img\s[^>]*src="([^"]+)"[^>]*>/g,
    (_m: string, src: string) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m;
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), extractAttr(_m, 'width'), extractAttr(_m, 'height'));
    }
  );
  return injectDetailsChevrons(html);
}

export function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
  const html = renderForSegments(markdown);
  if (!html) return [];

  const segments: MarkdownSegment[] = [];
  // Match both tagged (<pre><code class="language-X">) and bare (<pre><code>) blocks.
  const regex = /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'code',
      language: match[1] || 'plain',
      content: unescapeHtml(match[2]),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < html.length) {
    segments.push({ type: 'html', content: html.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'html', content: html }];
}

/**
 * Strip markdown to plain text.
 */
export function stripMarkdownToText(markdown: string): string {
  if (!markdown) return '';
  const { text } = protectMath(markdown);
  const html = md.render(text);
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

// ── ContentBlock builder ────────────────────────────────────
// Builds ContentBlock array from markdown tokens (not HTML splitting).

export interface ContentBlock {
  type: 'html' | 'code'
  content: string
  language?: string
}

/** Net <details> nesting delta in a raw HTML block. */
function detailsDelta(html: string): number {
  const opens = (html.match(/<details\b/gi) || []).length
  const closes = (html.match(/<\/details\s*>/gi) || []).length
  return opens - closes
}

/** Parse markdown → ContentBlock[] with each block's HTML pre-rendered. */
export function renderBlockHtml(
  markdown: string,
  options: { openDetails?: boolean } = {},
): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const { text, mathBlocks } = protectMath(markdown)
  const tokens = md.parse(text, {})
  // Linked images (`[![badge](img)](url)`) and images sharing a line with text
  // must stay inline in EVERY block type, not just paragraphs — otherwise the
  // same markdown renders differently in a list / quote / table.
  const finalize = (raw: string) => wrapStandaloneImages(restoreMathBlock(raw, mathBlocks))

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]

    // ── Fence / code ──
    if (t.type === 'fence') {
      blocks.push({ type: 'code', content: t.content, language: t.info.trim() || 'plain' })
      i++; continue
    }

    // ── HR ──
    if (t.type === 'hr') {
      blocks.push({ type: 'html', content: '<hr>' })
      i++; continue
    }

    // ── Paragraph ──
    if (t.type === 'paragraph_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'paragraph_open') depth++
        else if (tokens[j].type === 'paragraph_close') depth--
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      // Inline post-processing: images only (file cards handled by inline rule)
      const html = postProcessInlineBlocks(restoreMathBlock(raw, mathBlocks))
      blocks.push({ type: 'html', content: html })
      i = j; continue
    }

    // ── Heading ──
    if (t.type === 'heading_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'heading_open') depth++
        else if (tokens[j].type === 'heading_close') depth--
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      blocks.push({ type: 'html', content: finalize(raw) })
      i = j; continue
    }

    // ── Bullet / ordered list ──
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const closeType = t.type.replace('_open', '_close')
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === t.type) depth++
        else if (tokens[j].type === closeType) depth--
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      blocks.push({ type: 'html', content: finalize(raw) })
      i = j; continue
    }

    // ── Blockquote ──
    if (t.type === 'blockquote_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'blockquote_open') depth++
        else if (tokens[j].type === 'blockquote_close') depth--
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      blocks.push({ type: 'html', content: finalize(raw) })
      i = j; continue
    }

    // ── Table ──
    if (t.type === 'table_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'table_open') depth++
        else if (tokens[j].type === 'table_close') depth--
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      blocks.push({ type: 'html', content: finalize(raw) })
      i = j; continue
    }

    // ── Footnote block (markdown-it-footnote) ──
    // Skip in main content — rendered separately via renderFootnoteHtml
    if (t.type === 'footnote_block_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'footnote_block_open') depth++
        else if (tokens[j].type === 'footnote_block_close') depth--
        j++
      }
      i = j; continue
    }

    // ── <details> container ──
    // markdown-it emits the opening tag, the inner paragraph/list, and the
    // closing tag as separate tokens.  Rendering them as separate preview
    // blocks orphans the content outside the <details> box, so render the
    // whole token span as one block.
    if (t.type === 'html_block' && detailsDelta(t.content) > 0) {
      let depth = detailsDelta(t.content)
      let j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'html_block') depth += detailsDelta(tokens[j].content)
        j++
      }
      const raw = md.renderer.render(tokens.slice(i, j), md.options, {})
      blocks.push({ type: 'html', content: postProcessInlineBlocks(restoreMathBlock(raw, mathBlocks)) })
      i = j
      continue
    }

    // ── Standalone HTML / math placeholder ──
    if (t.type === 'html_block' || t.type === 'inline') {
      const raw = t.type === 'inline' ? md.renderer.render([t], md.options, {}) : t.content
      blocks.push({ type: 'html', content: finalize(raw) })
      i++; continue
    }

    i++
  }

  for (const b of blocks) {
    if (b.type !== 'html') continue
    b.content = injectDetailsChevrons(options.openDetails ? openAllDetails(b.content) : b.content)
  }

  return blocks
}

/** Render only the footnote section HTML, or empty string if none. */
export function renderFootnoteHtml(markdown: string): string {
  const { text, mathBlocks } = protectMath(markdown)
  const tokens = md.parse(text, {})
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'footnote_block_open') {
      let depth = 1, j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'footnote_block_open') depth++
        else if (tokens[j].type === 'footnote_block_close') depth--
        j++
      }
      return restoreMathBlock(md.renderer.render(tokens.slice(i, j), md.options, {}), mathBlocks)
    }
  }
  return ''
}

/** Restore math placeholders in a block's rendered HTML. */
function restoreMathBlock(html: string, mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }>): string {
  return html.replace(/<!--cm ([IB])(\d+)-->/g, (_m: string, type: string, num: string) => {
    const i = Number(num)
    if (i >= 0 && i < mathBlocks.length) return renderKatexPlaceholder(mathBlocks[i].tex, mathBlocks[i].type)
    return _m
  })
}

/** Apply image wrapper post-processing to inline blocks (paragraphs only). */
function postProcessInlineBlocks(html: string): string {
  return wrapStandaloneImages(html)
}

/**
 * Wrap standalone images in the block-image markup.
 *
 * The site's renderer does this in one pass over the whole document, so images
 * inside quotes, list items and tables get the same wrapper/placeholder. Here
 * blocks are rendered individually, so every branch has to run this. Inline
 * images (`md-image-inline`) and already-wrapped ones are skipped.
 */
function wrapStandaloneImages(html: string): string {
  return markInlineImages(html).replace(
    /<img\s[^>]*src="([^"]+)"[^>]*>/g,
    (_m, src) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), extractAttr(_m, 'width'), extractAttr(_m, 'height'))
    }
  )
}

// ── Block-level line mapping ─────────────────────────────────
// Uses markdown-it token .map to map a cursor line to a segment index.

export interface BlockRange {
  /** index into segments[] */
  segIndex: number
  /** 1-based start line */
  startLine: number
  /** 1-based end line (inclusive) */
  endLine: number
}

/** Parse markdown and return line range for each segment. */
export function getBlockRanges(markdown: string): BlockRange[] {
  const ranges: BlockRange[] = []
  const tokens = md.parse(markdown, {})
  let segIndex = 0

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    // Only process opening block tokens (they carry .map)
    if (t.type === 'paragraph_open') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'paragraph_open') depth++
        else if (tokens[i].type === 'paragraph_close') depth--
        i++
      }
      i--
    } else if (t.type === 'heading_open') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'heading_open') depth++
        else if (tokens[i].type === 'heading_close') depth--
        i++
      }
      i--
    } else if (t.type === 'fence' || t.type === 'code_block') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === t.type) depth++
        else if (tokens[i].type === t.type.replace('_open', '_close')) depth--
        i++
      }
      i-- // compensate for outer loop i++
    } else if (t.type === 'blockquote_open') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'blockquote_open') depth++
        else if (tokens[i].type === 'blockquote_close') depth--
        i++
      }
      i--
    } else if (t.type === 'table_open') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'table_open') depth++
        else if (tokens[i].type === 'table_close') depth--
        i++
      }
      i--
    } else if (t.type === 'hr') {
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[0] + 1 })
    } else if (t.type === 'footnote_block_open') {
      // Skip footnote block — rendered separately, not part of main content
      let depth = 1; i++
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'footnote_block_open') depth++
        else if (tokens[i].type === 'footnote_block_close') depth--
        i++
      }
      i--
    } else if (t.type === 'html_block' && detailsDelta(t.content) > 0) {
      // Keep in sync with renderBlockHtml: the whole <details> span is one block.
      const startLine = t.map ? t.map[0] + 1 : 0
      let endLine = t.map ? t.map[1] : startLine
      let depth = detailsDelta(t.content)
      let j = i + 1
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'html_block') {
          depth += detailsDelta(tokens[j].content)
          if (tokens[j].map) endLine = tokens[j].map[1]
        }
        j++
      }
      ranges.push({ segIndex: segIndex++, startLine, endLine })
      i = j - 1
    } else if (t.type === 'html_block') {
      // 与 renderBlockHtml 对齐：html_block（裸 HTML/iframe）会生成块——
      // 必须分配 segIndex，否则后续块索引错位（active-block 加错/不加）
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      else segIndex++
    } else if (t.type === 'inline') {
      // 游离 inline（renderBlockHtml 也生成块）——推进索引保持对齐；
      // 有 map 给行范围，无 map（罕见）仅计数
      if (t.map) ranges.push({ segIndex: segIndex++, startLine: t.map[0] + 1, endLine: t.map[1] })
      else segIndex++
    }
  }
  return ranges
}

/** Find the segment index containing the given 1-based line number. */
export function getSegIndexAtLine(ranges: BlockRange[], line: number): number {
  for (const r of ranges) {
    if (line >= r.startLine && line <= r.endLine) return r.segIndex
  }
  return -1
}

/** Get segment indices that overlap with a line range [fromLine, toLine] (inclusive). */
export function getChangedSegIndices(ranges: BlockRange[], fromLine: number, toLine: number): Set<number> {
  const set = new Set<number>()
  for (const r of ranges) {
    if (r.endLine >= fromLine && r.startLine <= toLine) set.add(r.segIndex)
  }
  return set
}
