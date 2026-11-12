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
md.validateLink = (url: string) => /^(https?:|file:|mailto:|\/|#|asset:|post:|[a-zA-Z][a-zA-Z0-9+.-]*:)/i.test(String(url));

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
  if (_postId && !url.startsWith('/') && !/^[a-zA-Z][\w+.-]*:/.test(url)) {
    const base = _postId === '__about__' ? '/data/__about__' : `/data/posts/${_postId}`; // manager uses filesystem path
    const encoded = url.split('/').map(seg => { try { decodeURI(seg); return seg } catch { return encodeURI(seg) } }).join('/');
    const resolved = `${base}/${encoded}`;
    console.log('[markdownPreview] relative →', resolved);
    return resolved;
  }
  return _mdNormalizeLink(url);
};

md.use(markdownItFootnote);

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
  }

  state.pos = pos;
  state.posMax = state.src.length;
  return true;
});

// ── File-card interception (inline rule) ─────────────────
// Runs BEFORE markdown-it's built-in "link" rule.
// When [text](file.ext) is detected, produces html_inline directly
// so the default link rule never sees the syntax.

// ── File-card type-prefix detection ──────────────────────
// Supports both head-tags (audio:, video:, etc.) and tail-extensions (.mp3, .pdf, etc.)

const TYPE_PREFIXES: [string, string, string][] = [
  // [prefix, type-label, icon-key]
  ['audio:',    'Audio',     'audio'],
  ['video:',    'Video',     'video'],
  ['document:', 'Document',  'document'],
  ['doc:',      'Document',  'document'],
  ['text:',     'Code/Text', 'codeText'],
  ['archive:',  'Archive',   'archive'],
  ['link:',     'Link',      'link'],
  ['mailto:',   'Email',     'person'],
  ['attach:',   'File',      'link'],
];

function getPrefixIcon(key: string): string {
  const map: Record<string, string> = {
    audio: Icons.audio, video: Icons.video, document: Icons.document,
    codeText: Icons.codeText, archive: Icons.archive, link: Icons.link,
    person: Icons.person,
  };
  return map[key] || Icons.link;
}

const FILE_EXTENSIONS = [
  'mp3','wav','ogg','m4a','flac','aac',
  'mp4','webm','mkv','mov','avi',
  'pdf','doc','docx','ppt','pptx','xls','xlsx',
  'txt','md','js','ts','json','c','cpp','py','java','html','css','vue','log','xml','yaml',
  'zip','rar','7z','tar','gz',
];

function hasFileExtension(href: string): boolean {
  const m = href.match(/\.([0-9a-z]+)($|\?)/i);
  return m ? FILE_EXTENSIONS.includes(m[1].toLowerCase()) : false;
}

function parseTypePrefix(href: string): { type: string; icon: string; actualUrl: string } | null {
  const lower = href.toLowerCase();
  for (const [prefix, type, iconKey] of TYPE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { type, icon: getPrefixIcon(iconKey), actualUrl: href.slice(prefix.length) };
    }
  }
  return null;
}

md.inline.ruler.before('link', 'chronicle_file_card', (state, silent) => {
  const pos = state.pos;
  const src = state.src;

  // Must start with '['
  if (src.charCodeAt(pos) !== 0x5B) return false;

  // ── Parse link text: [ ... ] ──
  let i = pos + 1;
  let linkText = '';
  while (i < state.posMax) {
    const ch = src.charCodeAt(i);
    if (ch === 0x5C /* backslash */) { linkText += src[i + 1] || ''; i += 2; continue; }
    if (ch === 0x5D /* ] */) { i++; break; }
    linkText += src[i]; i++;
  }
  if (i >= state.posMax) return false;

  // ── Parse URL: ( ... ) ──
  if (src.charCodeAt(i) !== 0x28 /* ( */) return false;
  i++;
  let href = '';
  let depth = 1;
  while (i < state.posMax && depth > 0) {
    const ch = src.charCodeAt(i);
    if (ch === 0x5C /* backslash */) { href += src[i + 1] || ''; i += 2; continue; }
    if (ch === 0x28 /* ( */) depth++;
    if (ch === 0x29 /* ) */) { depth--; if (depth === 0) { i++; break; } }
    href += src[i]; i++;
  }
  if (depth > 0) return false;

  // ── Intercept: type-prefix OR file-extension ──
  const prefixMatch = parseTypePrefix(href);

  // Blob/file URLs lack extensions — fall back to link text extension
  const textExt = (href.startsWith('blob:') || href.startsWith('file://'))
    ? (linkText.match(/\.([0-9a-z]+)$/i) || [])[1]?.toLowerCase()
    : undefined;
  const effectiveExt = textExt && FILE_EXTENSIONS.includes(textExt) ? textExt : undefined;

  if (!prefixMatch && !hasFileExtension(href) && !effectiveExt) return false;

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

    const token = state.push('html_inline', '', 0);
    token.content = renderFileCard(cardUrl, linkText.trim(), activePrefix?.type, subtitle);
  }
  state.pos = i;
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
  return `<div class="md-image-container">
    <div class="md-image-wrapper" data-placeholder-text="Loading..."${wrapperStyle}>
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="md-image" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />
      <span class="md-placeholder-text" aria-hidden="true">Loading...</span>
    </div>
    ${captionHtml}
  </div>`;
}

function isFileCardUrl(url: string): boolean {
  const extMatch = url.match(/\.([0-9a-z]+)($|\?)/i);
  if (!extMatch) return false;
  const ext = extMatch[1].toLowerCase();
  const fileExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
    'mp4', 'webm', 'mkv', 'mov', 'avi',
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'txt', 'md', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml',
    'zip', 'rar', '7z', 'tar', 'gz',
  ];
  return fileExts.includes(ext);
}

function getFileCardType(url: string): { type: string; icon: string } {
  const ext = (url.match(/\.([0-9a-z]+)($|\?)/i) || [])[1]?.toLowerCase() || '';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return { type: 'Audio', icon: Icons.audio };
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) return { type: 'Video', icon: Icons.video };
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return { type: 'Document', icon: Icons.document };
  if (['txt', 'md', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml'].includes(ext)) return { type: 'Code/Text', icon: Icons.codeText };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { type: 'Archive', icon: Icons.archive };
  return { type: 'File', icon: Icons.link };
}

function renderFileCard(url: string, displayName?: string, forcedType?: string, customSubtitle?: string): string {
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
  return `<div class="file-card" data-url="${safeUrl}" data-name="${safeName}" data-type="${escapeAttr(type)}">
    <div class="file-card-icon">${icon}</div>
    <div class="file-card-info">
      <div class="file-card-title">${safeName}</div>
      <div class="file-card-subtitle">${safeSubtitle}</div>
    </div>
  </div>`;
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

  // 2. Images → image wrapper (title attr → caption, width/height from =WxH syntax)
  result = result.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m, src) => {
      if (_m.includes('class="md-image"')) return _m;
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
      if (_m.includes('class="md-image"')) return _m;
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
  // Apply image post-processing only (code blocks left as <pre><code>)
  html = html.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m: string, src: string) => {
      if (_m.includes('class="md-image"')) return _m;
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), extractAttr(_m, 'width'), extractAttr(_m, 'height'));
    }
  );
  html = html.replace(
    /<img\s[^>]*src="([^"]+)"[^>]*>/g,
    (_m: string, src: string) => {
      if (_m.includes('class="md-image"')) return _m;
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
      blocks.push({ type: 'html', content: restoreMathBlock(raw, mathBlocks) })
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
      blocks.push({ type: 'html', content: restoreMathBlock(raw, mathBlocks) })
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
      blocks.push({ type: 'html', content: restoreMathBlock(raw, mathBlocks) })
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
      blocks.push({ type: 'html', content: restoreMathBlock(raw, mathBlocks) })
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
      blocks.push({ type: 'html', content: restoreMathBlock(raw, mathBlocks) })
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
  return html
    .replace(
      /<img\s[^>]*src="([^"]+)"[^>]*>/g,
      (_m, src) => {
        if (_m.includes('class="md-image"')) return _m
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
