/**
 * Chronicle — Unified Markdown Renderer
 *
 * markdown-it is the single markdown parser for both template-astro (SSG)
 * and manager (CMS preview). Custom rendering for interactive components
 * (Katex, CodeChunk, file cards, image wrappers) is layered on top.
 *
 * Keep in sync with: packages/manager/src/utils/markdownPreview.ts
 */

import MarkdownIt from 'markdown-it';
import { withBase } from './basePath';
import markdownItFootnote from 'markdown-it-footnote';
import hljs from 'highlight.js';
import katex from 'katex';
import { Icons } from './icons';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { SANITIZE_CONFIG, isSafeIframeSrc, injectDetailsChevrons } from '@chronicle/shared/src/utils';
import { buildTocFromHtml, type TocItem } from './toc';
import { getLocalImageSize } from './imageSize';

// DOMPurify needs a DOM window at build time (SSG runs in Node.js).
const purifyWindow = new JSDOM('').window as unknown as Window & typeof globalThis;
const purify = DOMPurify(purifyWindow);

// iframe 视频嵌入（网易云/哔哩哔哩/YouTube）——非白名单 src 的 iframe 直接移除
// （iframe 可加载任意页面/脚本/钓鱼，放行必须锁死域名）
purify.addHook('afterSanitizeAttributes', (node: Element) => {
  if (node.tagName === 'IFRAME' && !isSafeIframeSrc(node.getAttribute('src') || '')) {
    node.remove();
  }
});

// ═══════════════════════════════════════════════════════════
//  Config — must match template-astro's localDataSource AND
//  manager's markdownPreview.ts
// ═══════════════════════════════════════════════════════════

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

// Explicit protocol whitelist (P3-6): the old trailing [a-zA-Z][a-zA-Z0-9+.-]*:
// branch accepted ANY protocol (e.g. javascript:). Now only known-safe ones pass.
//
// Relative destinations must pass too: markdown-it's link rule gives up entirely
// when validateLink rejects the href, which silently turned `[English](README.md)`
// into literal text whenever normalizeLink could not make it absolute (no post
// id yet → unsaved / new document).
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const SAFE_SCHEME = /^(?:https?:|file:|mailto:|tel:|sms:|asset:|post:)/i;
md.validateLink = (url: string) => {
  const u = String(url).trim();
  if (!HAS_SCHEME.test(u)) return true;   // relative path, /root, #anchor, ?query
  return SAFE_SCHEME.test(u);
};

// ── Custom protocol resolution ─────────────────────────
// Hook into normalizeLink — EVERY link/image URL passes through here.
//   asset://<file>  → /assets/<file>           public shared asset
//   post://<slug>   → /post/<slug>             cross-post link
//   <file>          → /post/<id>/<file>        private post asset (relative path)
// Non-ASCII filenames are encoded via encodeURI.
let _currentPostId = ''
export function setRenderPostId(id: string) { _currentPostId = id }

let _currentLocale = 'en'
export function setRenderLocale(locale: string) { _currentLocale = locale }

/** Resolve asset://<file> → /assets/<file> */
export function resolveAssetUrl(file: string): string {
  return withBase('/assets/' + encodeURI(file))
}

/** Resolve post://<slug> → /{lang}/post/<slug> */
export function resolvePostUrl(slug: string): string {
  return withBase('/' + _currentLocale + '/post/' + encodeURI(slug))
}

function encodeFilename(url: string): string {
  // Split path into segments, encode each segment individually
  return url.split('/').map(seg => {
    try { decodeURI(seg); return seg } catch { return encodeURI(seg) }
  }).join('/')
}

const _normalizeLink = md.normalizeLink.bind(md);
md.normalizeLink = (url: string) => {
  if (url.startsWith('asset://')) return resolveAssetUrl(url.slice(8));
  if (url.startsWith('post://')) return resolvePostUrl(url.slice(7));
  // Relative path → resolve to post attachment directory
  if (_currentPostId && !url.startsWith('/') && !url.startsWith('#') && !/^[a-zA-Z][\w+.-]*:/.test(url)) {
    const base = withBase(_currentPostId === '__about__' ? '/about' : `/post_attachment/${_currentPostId}`);
    return `${base}/${encodeFilename(url)}`;
  }
  // Site-root links written in Markdown follow the deploy base path too.
  if (url.startsWith('/') && !url.startsWith('//')) return _normalizeLink(withBase(url));
  return _normalizeLink(url);
};

md.use(markdownItFootnote);

/**
 * GitHub-style alerts: `> [!NOTE]` / TIP / IMPORTANT / WARNING / CAUTION as the
 * first line of a blockquote. The marker becomes a title paragraph inside the
 * quote (text after the marker wins over the default label) and the quote is
 * tagged with `data-alert`, which the stylesheet colours per type.
 *
 * Mirrored in packages/manager/src/utils/markdownPreview.ts — change both.
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

// ── post:// links: open in new tab ──────────────────────
// post://<slug> normalizes to /post/<slug> (cross-post detail page).
// Distinguish from post attachments (/post_attachment/…) and assets.
const _astroLinkOpen = md.renderer.rules.link_open || function(tokens: any, idx: number, options: any, _env: any, self: any) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function(tokens: any, idx: number, options: any, env: any, self: any) {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1];
    // /{lang}/post/<slug> = cross-post link, NOT /post_attachment/…
    if (/^\/[a-z]{2}\/post\/[^/]+$/.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
      token.attrSet('data-post-link', '');
    }
  }
  return _astroLinkOpen(tokens, idx, options, env, self);
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

function parseImageSize(src: string, pos: number, max: number): { ok: boolean; pos: number; width: string; height: string } {
  if (pos >= max || src.charCodeAt(pos) !== 0x3D) return { ok: false, pos, width: '', height: '' };
  pos++;
  if (pos >= max) return { ok: false, pos, width: '', height: '' };
  const code = src.charCodeAt(pos);
  if (code !== 0x78 && (code < 0x30 || code > 0x39)) return { ok: false, pos, width: '', height: '' };

  const result: any = { ok: true, pos, width: '', height: '' };
  while (pos < max) { const c = src.charCodeAt(pos); if ((c >= 0x30 && c <= 0x39) || c === 0x25) { result.width += src[pos++]; } else break; }
  if (src.charCodeAt(pos) !== 0x78) return { ok: false, pos, width: '', height: '' };
  pos++;
  while (pos < max) { const c = src.charCodeAt(pos); if ((c >= 0x30 && c <= 0x39) || c === 0x25) { result.height += src[pos++]; } else break; }
  result.pos = pos;
  return result;
}

function isSpace(code: number): boolean { return code === 0x20 || code === 0x0A || code === 0x09; }

md.inline.ruler.before('image', 'chronicle_image_size', (state: any, silent: boolean) => {
  if (state.src.charCodeAt(state.pos) !== 0x21) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 0x5B) return false;

  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) return false;

  let pos = labelEnd + 1;
  if (pos >= state.posMax || state.src.charCodeAt(pos) !== 0x28) return false;

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

  let width = '', height = '';
  const sizeRes = parseImageSize(state.src, pos, state.posMax);
  if (sizeRes.ok) { width = sizeRes.width; height = sizeRes.height; pos = sizeRes.pos; }

  while (pos < state.posMax && isSpace(state.src.charCodeAt(pos))) pos++;

  if (pos >= state.posMax || state.src.charCodeAt(pos) !== 0x29) return false;
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
const TYPE_PREFIXES: [string, string, string][] = [
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
  // markdown-it and became dead `file:…` hrefs.
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

const FORCE_LINK_PREFIX = 'open:';

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
 *   - the host is never read:             https://example.md/ is a site, not a file
 *   - 2–6 alphanumerics, segment non-empty (no `.hidden`, no `.PDFx`)
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
      p = slash >= 0 ? p.slice(slash) : '';   // no path → no file
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
  // `file:///…` is the URL scheme (Electron local paths), not the CMS type tag.
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
//   [text](audio:…)      → file card, type forced by the prefix
//   [text](report.pdf)   → file card, type from the extension
//   [text](README.md)    → plain link (markdown docs are navigation targets)
//   [text](open:any.url) → plain link, forced (escapes the extension check)
//   [![badge](img)](url) → plain link around an image — never a card
md.inline.ruler.before('link', 'chronicle_file_card', (state: any, silent: boolean) => {
  const pos = state.pos;
  const src = state.src;

  if (src.charCodeAt(pos) !== 0x5B) return false;

  // ── Label: [ … ] ──
  // markdown-it's own helper, so nested constructs are skipped correctly —
  // the naive scan stopped at the first `]` and mangled `[![badge](img)](url)`.
  const labelStart = pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, pos, false);
  if (labelEnd < 0) return false;
  const labelSrc = src.slice(labelStart, labelEnd);

  // ── Destination: ( url "title" ) ──
  let i = labelEnd + 1;
  if (i >= state.posMax || src.charCodeAt(i) !== 0x28) return false;
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
  if (i >= state.posMax || src.charCodeAt(i) !== 0x29) return false;
  const end = i + 1;   // past ')'

  // ── Forced plain link: open:<url> ──
  // Emit the same token shape markdown-it's `link` rule would (see link.mjs):
  // link_open → inline label → link_close. That keeps normalizeLink (asset://,
  // post://, relative, base path), link validation, `linkLevel` nesting guard
  // and nested inline markup identical to a normal link.
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

  // ── Card: type-prefix OR card extension ──
  const prefixMatch = parseTypePrefix(href);
  if (!prefixMatch && !isCardLink(href)) return false;

  if (!silent) {
    // mailto: keeps the full href as data-url; link:/mailto: show stripped URL as subtitle
    const isMailto = prefixMatch?.type === 'Email';
    const isLink   = prefixMatch?.type === 'Link';
    const rawUrl   = isMailto ? href : (prefixMatch ? prefixMatch.actualUrl : href);
    // Resolve asset:// and post:// in the URL after type-prefix stripping
    const cardUrl  = rawUrl.startsWith('asset://') ? resolveAssetUrl(rawUrl.slice(8))
                   : rawUrl.startsWith('post://') ? resolvePostUrl(rawUrl.slice(7))
                   : (_currentPostId && !rawUrl.startsWith('/') && !/^[a-zA-Z][\w+.-]*:/.test(rawUrl)
                       ? `${_currentPostId === '__about__' ? '/about' : `/post_attachment/${_currentPostId}`}/${encodeFilename(rawUrl)}`
                       : rawUrl);
    const subtitle = (isMailto || isLink) ? (prefixMatch?.actualUrl || href) : undefined;

    // A card sharing its line with prose renders compact ("mini"); a card that
    // is alone on its line keeps the full block treatment.
    const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  const hasTextBefore = /\S/.test(src.slice(lineStart, pos));
    const endsLine = /^[ \t]*(\r?\n|$)/.test(src.slice(end, state.posMax));
    const mini = hasTextBefore || !endsLine;

    const token = state.push('html_inline', '', 0);
    token.content = renderFileCard(cardUrl, labelSrc.trim(), prefixMatch?.type, subtitle, mini);
  }
  state.pos = end;
  return true;
});

// ── GFM Task list checkbox (inline rule) ───────────────
// Intercepts [ ] / [x] at the start of inline content.
// Registered after chronicle_file_card, before 'link'.
md.inline.ruler.before('link', 'task_list_checkbox', (state: any, silent: boolean) => {
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

md.renderer.rules.checkbox_input = (tokens: any, idx: number) => {
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
//
//  Supported delimiters:
//    $...$        inline math
//    $$...$$      block math
//    \(...\)      inline math (LaTeX)
//    \[...\]      block math (LaTeX)
// ═══════════════════════════════════════════════════════════

// Math placeholders use HTML comments so markdown-it passes them through untouched.
// Format: <!--cm B0--> (block math, index 0) or <!--cm I3--> (inline math, index 3)
function mathPh(type: 'I' | 'B', idx: number): string { return `<!--cm ${type}${idx}-->`; }

function protectMath(content: string): { text: string; mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }> } {
  const mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }> = [];
  let idx = 0;
  let result = content;

  // Block first so inline patterns don't match inside block delimiters.
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_m: string, tex: string) => {
    const clean = tex.trim();
    if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'block' });
    return mathPh('B', idx++);
  });
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_m: string, tex: string) => {
    const clean = tex.trim();
    if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'block' });
    return mathPh('B', idx++);
  });
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_m: string, tex: string) => {
    const clean = tex.trim();
    if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'inline' });
    return mathPh('I', idx++);
  });
  result = result.replace(/\$([^$\n]+?)\$/g, (_m: string, tex: string) => {
    const clean = tex.trim();
    if (!clean) return _m;
    mathBlocks.push({ tex: clean, type: 'inline' });
    return mathPh('I', idx++);
  });

  return { text: result, mathBlocks };
}

function restoreMath(html: string, mathBlocks: Array<{ tex: string; type: 'inline' | 'block' }>): string {
  return html.replace(/<!--cm ([IB])(\d+)-->/g, (_m, type, num) => {
    const i = Number(num);
    if (i >= 0 && i < mathBlocks.length) {
      return renderKatexPlaceholder(mathBlocks[i].tex, mathBlocks[i].type);
    }
    return _m;
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderKatexPlaceholder(tex: string, type: 'inline' | 'block'): string {
  const tag = type === 'block' ? 'div' : 'span';
  try {
    const html = katex.renderToString(tex, { displayMode: type === 'block', throwOnError: false });
    return `<${tag} class="katex-rendered katex-interactive" data-tex="${escapeAttr(tex)}" data-type="${type}">${html}</${tag}>`;
  } catch (_) {
    return `<${tag} class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="${type}">${escapeAttr(tex)}</${tag}>`;
  }
}

// ═══════════════════════════════════════════════════════════
//  Step 2: Post-process markdown-it HTML → component HTML
// ═══════════════════════════════════════════════════════════

// Register mermaid grammar for hljs (not built-in)
hljs.registerLanguage('mermaid', function(_hljs: any) {
  return {
    name: 'Mermaid',
    keywords: {
      keyword: 'graph flowchart sequenceDiagram classDiagram stateDiagram erDiagram gantt pie journey gitGraph mindmap timeline quadrantChart sankey-beta xyChart blockBeta c4Context zenuml requirementDiagram architectureBeta classDef style linkStyle click call default end subgraph direction TB TD BT RL LR top bottom left right',
      literal: 'true false null'
    },
    contains: [
      _hljs.COMMENT('%%', '$'),
      _hljs.QUOTE_STRING_MODE,
      { className: 'string', begin: /\[/, end: /\]/ },
      { className: 'string', begin: /\(/, end: /\)/ },
      { className: 'string', begin: /\{/, end: /\}/ },
      { className: 'operator', begin: /--?>?|==>?|<-?->?|\.{2,}/ },
      { className: 'number', begin: /\b\d+\.?\d*\b/ },
      { className: 'params', begin: /\|/, end: /\|/ },
    ]
  };
});

/**
 * Render code blocks as CodeChunk-compatible HTML.
 * Both template-astro and manager use this exact structure.
 */
function renderCodeChunkHtml(code: string, lang: string): string {
  const safeLang = escapeAttr(lang || 'plain');
  const lines = code.split('\n').length || 1;
  const lineHeight = 20;
  const height = Math.max(80, Math.min(360, lines * lineHeight + 24));
  const isMermaid = safeLang === 'mermaid';

  // hljs pre-rendered highlighting
  let highlighted = escapeAttr(code);
  try {
    const hlLang = isMermaid ? 'mermaid' : lang;
    if (hlLang && hlLang !== 'plain' && hljs.getLanguage(hlLang)) {
      const result = hljs.highlight(code, { language: hlLang, ignoreIllegals: true });
      highlighted = result.value;
    }
  } catch (_) {}

  // ── Mermaid toolbar (matches CodeChunk.vue) ──
  let mermaidToolbar = '';
  let mermaidPreview = '';
  if (isMermaid) {
    mermaidToolbar = `
        <div class="toolbar-divider"></div>
        <button class="icon-btn mermaid-download-btn" title="Download SVG">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 21H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="toolbar-divider"></div>
        <div class="mermaid-group">
          <button class="icon-btn mermaid-split-btn active" title="Split">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="18" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
          </button>
          <button class="icon-btn mermaid-code-btn" title="Code">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 7 2 12 7 17"/><line x1="14" y1="5" x2="10" y2="19"/><polyline points="17 7 22 12 17 17"/></svg>
          </button>
          <button class="icon-btn mermaid-preview-btn" title="Preview">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="toolbar-divider"></div>`;
    mermaidPreview = `
    <div class="mermaid-preview" style="padding:0.5rem 1rem;">
      <div class="mermaid-container" style="align-items:center;justify-content:center;display:flex"><!-- prerendered at build time --></div>
    </div>`;
  }

  // No <textarea> in the markup at all: regular blocks don't need it (copy uses
  // data-code), and mermaid reads its raw source from the copy button's data-code
  // too (article.ts initMermaidCodeBlocks) — the Code view is the highlighted
  // <pre>, which is already the display layer.

  return `
<div class="code-chunk-container${isMermaid ? ' mermaid' : ''}">
  <div class="editor-header">
    <div class="header-left">
      <span class="language-label" title="${safeLang}">${safeLang}</span>
    </div>
    <div class="toolbar">
      ${mermaidToolbar}
      <button class="icon-btn copy-btn" title="Copy" data-code="${escapeAttr(code)}">
        <svg class="copy-icon" width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"></rect><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect></svg>
        <svg class="success-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>
  </div>
  <div class="editor-wrapper" style="height: ${height}px;">
    <div class="editor-content">
      <pre class="syntax-hl" style="padding: 0.7rem 1.5rem 1.2rem 1.5rem; font-size: 13.5px; line-height: 1.3em; font-family: inherit; box-sizing: border-box;"><code>${highlighted}</code></pre>
    </div>
  </div>
  ${mermaidPreview}
  <div class="editor-footer" data-chars="${code.length}" data-lines="${lines}"><span><span>${code.length} chars &nbsp;|&nbsp; ${lines} lines</span></span></div>
</div>`;
}

/**
 * Render images with wrapper + placeholder behavior.
 *
 * `autoRatio` + `ratio` = dimensions were auto-detected from the local file at
 * build time (not `=WxH` hints). The wrapper then reserves the image's *real*
 * aspect ratio (responsive) instead of the 2:1 placeholder — so the
 * placeholder → natural-size jump disappears and in-viewport images can't
 * cause CLS. `width` may still carry an explicit `=70%`-style hint.
 */
function renderImageWrapper(src: string, alt?: string, title?: string, width?: string, height?: string, autoRatio?: boolean, ratio?: string): string {
  if (!src) {
    return `<div class="md-image-container">
      <div class="md-image-wrapper placeholder" data-placeholder-text="No image">
        <span class="md-placeholder-text" aria-hidden="true">No image</span>
      </div>
    </div>`;
  }
  const captionHtml = (title && title.trim()) ? `<div class="md-image-caption">${escapeAttr(title.trim())}</div>` : '';
  const cssDim = (v: string) => v ? v.includes('%') ? v : v + 'px' : '';

  // Auto-detected ratio → inline aspect-ratio beats the 2:1 placeholder rule in
  // chronicle-markdown.css; the wrapper scales responsively with the real ratio.
  // Explicit relative hints (e.g. `=70%`, `=x50%`) are inlined alongside it.
  //
  // A height-only hint (`=x300`) must NOT be turned into width:100%: an explicit
  // width together with an explicit height overrides aspect-ratio and stretches
  // the image. resolveImageDims derives a px width from the real ratio instead;
  // only when there is no usable width hint at all does the figure fill the column.
  const fillColumn = !width && (!height || height.includes('%'));
  const wrapperStyle = (autoRatio && ratio)
    ? ` style="aspect-ratio:${ratio};${width ? 'width:' + cssDim(width) + ';' : ''}${fillColumn ? 'width:100%;' : ''}${height ? 'height:' + cssDim(height) + ';' : ''}max-width:100%"`
    : (width || height)
      ? ` style="${width ? 'width:' + cssDim(width) + ';' : ''}${height ? 'height:' + cssDim(height) + ';' : ''}max-width:100%"`
      : '';
  // Intrinsic width/height attributes on the <img> itself — belt-and-suspenders on
  // top of the wrapper's inline aspect-ratio (both are set at render time from the
  // real file dimensions; the CSS width/height:100% still controls rendering).
  const dimAttrs = (autoRatio && ratio)
    ? (() => { const m = ratio.split('/'); return m.length === 2 ? ` width="${m[0]}" height="${m[1]}"` : ''; })()
    : '';

  // Generate <picture> with WebP/AVIF sources for images with known extensions (not SVG or external)
  const hasExt = /\.(jpg|jpeg|png|gif)(\?|$)/i.test(src);
  // Fixed height without a width basis → letterbox instead of stretching.
  const imgClass = (height && !width) ? 'md-image md-image-contain' : 'md-image';
  const imgTag = hasExt
    ? `<picture>
      <source srcset="${escapeAttr(src.replace(/\.(jpg|jpeg|png|gif)$/i, '.avif'))}" type="image/avif">
      <source srcset="${escapeAttr(src.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp'))}" type="image/webp">
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="${imgClass}"${dimAttrs} loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />
    </picture>`
    : `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="${imgClass}"${dimAttrs} loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />`;

  return `<div class="md-image-container">
    <div class="md-image-wrapper" data-placeholder-text="Loading..."${wrapperStyle}>
      ${imgTag}
      <span class="md-placeholder-text" aria-hidden="true">Loading...</span>
    </div>
    ${captionHtml}
  </div>`;
}

/**
 * Check if a URL looks like a file link that should render as a file card.
 * Kept as a thin alias of {@link isCardLink} for callers outside this module.
 */
function isFileCardUrl(url: string): boolean {
  return isCardLink(url);
}

function getFileCardType(url: string): { type: string; icon: string } {
  const ext = getLinkExtension(url);

  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext))
    return { type: 'Audio', icon: Icons.audio };
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext))
    return { type: 'Video', icon: Icons.video };
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext))
    return { type: 'Document', icon: Icons.document };
  if (['txt', 'md', 'markdown', 'mdx', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml'].includes(ext))
    return { type: 'Code/Text', icon: Icons.codeText };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { type: 'Archive', icon: Icons.archive };

  return { type: 'File', icon: Icons.link };
}

/**
 * Render a file card.
 *
 * `mini` = the card shares its line with prose. It then becomes a single-line
 * pill (icon + name, no subtitle) built from <span>s, so it can live inside a
 * <p> without the block-card markup breaking the paragraph. Both variants stay
 * `<span>`-based: a <div> inside <p> is invalid HTML and browsers reparent it,
 * which used to split the surrounding paragraph.
 */
function renderFileCard(url: string, displayName?: string, forcedType?: string, customSubtitle?: string, mini = false): string {
  const detected = getFileCardType(url);
  // forcedType from prefix (audio:/video:/document: etc.) wins over extension detection
  const type = forcedType || detected.type;
  const icon = forcedType
    ? getPrefixIcon(TYPE_PREFIXES.find(p => p[1] === forcedType)?.[2] || 'link')
    : detected.icon;
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

// ═══════════════════════════════════════════════════════════
//  Post-processing pipeline
// ═══════════════════════════════════════════════════════════

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
  // (a) Blocks WITH a language tag (```rust, ```c++, ```invalid-lang).
  //     [^"]* captures full language names including special chars (+, #, -).
  // (b) Blocks WITHOUT a language tag (bare ```) — fall back to "plain".

  // (a) language-tagged blocks
  result = result.replace(
    /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang, rawCode) => {
      const code = unescapeHtml(rawCode);
      return renderCodeChunkHtml(code, lang || 'plain');
    }
  );

  // (b) bare blocks (no class). Applied after (a) so tagged blocks are consumed.
  result = result.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_m, rawCode) => {
      const code = unescapeHtml(rawCode);
      return renderCodeChunkHtml(code, 'plain');
    }
  );

  // Shared by the two image passes below: title attr → caption, width/height
  // from imsize hints, plus auto-detected real ratio for local files.
  const resolveImageDims = (src: string, hintW: string, hintH: string) => {
    // Both hints present → legacy fixed-dim behavior (e.g. `=500x300`, `=70%x50%`).
    if (hintW && hintH) return { width: hintW, height: hintH, autoRatio: false, ratio: undefined };
    const dims = getLocalImageSize(src);
    if (dims) {
      // Height-only hint (`=x300`): derive the width from the real aspect ratio
      // instead of emitting width:100%. With an explicit width *and* height the
      // wrapper would override aspect-ratio and stretch the image.
      const pxHeight = /^[0-9.]+$/.test(hintH) ? Number(hintH) : null;
      const derivedW = (!hintW && pxHeight && dims.height)
        ? String(Math.round(pxHeight * (dims.width / dims.height)))
        : '';
      // A relative height (`=x50%`) has no px basis to derive from — the wrapper
      // keeps filling the column, and renderImageWrapper emits width:100% for it.
      return {
        width: hintW || derivedW,
        height: hintH || '',
        autoRatio: true,
        ratio: `${dims.width}/${dims.height}`,
      };
    }
    return { width: hintW, height: hintH, autoRatio: false, ratio: undefined };
  };
  // 2. Linked images (`[![badge](img)](url)`) and images that share a line with
  //    prose stay inline: the block wrapper below would turn them into a
  //    full-width 2:1 placeholder box and split the surrounding paragraph.
  result = markInlineImages(result);

  // 3. Images → image wrapper (title attr → caption, width/height hints, plus
  //    auto-detected real ratio for local files so the space is reserved).
  result = result.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m, src) => {
      if (IMG_ALREADY_RENDERED.test(_m)) return _m;
      const d = resolveImageDims(src, extractAttr(_m, 'width'), extractAttr(_m, 'height'));
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), d.width, d.height, d.autoRatio, d.ratio);
    }
  );
  // Also handle inline images (not wrapped in <p>), skip those inside <picture>
  result = result.replace(
    /(?:<picture>[\s\S]*?<\/picture>)|(<img\s[^>]*src="([^"]+)"[^>]*>)/g,
    (_m, imgTag, src) => {
      if (!imgTag) return _m; // <picture> block — leave as-is
      if (IMG_ALREADY_RENDERED.test(imgTag)) return imgTag;
      const d = resolveImageDims(src, extractAttr(_m, 'width'), extractAttr(_m, 'height'));
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), d.width, d.height, d.autoRatio, d.ratio);
    }
  );

  return result;
}

// ═══════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════

/**
 * Render Chronicle-flavored markdown to HTML.
 *
 * Pipeline:
 *   1. Protect math delimiters → placeholders
 *   2. markdown-it → standard HTML
 *   3. Restore math placeholders → katex-placeholder HTML
 *   4. Post-process → CodeChunk, file cards, image wrappers
 */
export function renderChronicleMarkdown(content: string, locale?: string): string {
  if (!content) return '';

  // Set locale synchronously before rendering — avoids SSG parallel-build race
  if (locale) _currentLocale = locale;

  // Step 1: Protect math
  const { text, mathBlocks } = protectMath(content);

  // Step 2: markdown-it rendering
  let html = md.render(text);

  // Step 3: Restore math placeholders
  html = restoreMath(html, mathBlocks);

  // Step 4: Sanitize user HTML — strip scripts, event handlers, etc.
  // Runs BEFORE post-processing so that Chronicle's own safe image-wrapper
  // handlers (onload/onerror for loading states) survive.
  html = purify.sanitize(html, SANITIZE_CONFIG);

  // Step 5: Post-process to component HTML (CodeChunk, image wrapper, file cards).
  // Happens AFTER sanitize so the wrapper attributes added here are trusted.
  html = postProcessHtml(html);

  // <details> without <summary> gets a localized real summary — otherwise the
  // browser's anonymous "Details" widget bypasses Chronicle's header styles.
  const detailsLabel = /^zh/i.test(String(locale || _currentLocale)) ? '详情' : 'Details';
  return injectDetailsChevrons(html, detailsLabel);
}

/**
 * Single-pipeline TOC extraction (P2-3): renders markdown with the SAME md
 * instance used for post bodies, then extracts headings from the resulting
 * HTML. Verified identical to the old regex-over-rendered-HTML path on the
 * full data/posts corpus (scripts/toc-compare.ts, 2026-08) — the regex
 * markdownParser TOC path in toc.ts was retired.
 */
export function extractHeadings(content: string): TocItem[] {
  if (!content) return [];
  return buildTocFromHtml(md.render(content));
}

/**
 * Strip markdown to plain text (for word count, summaries, etc.)
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
