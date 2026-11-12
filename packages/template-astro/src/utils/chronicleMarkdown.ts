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
md.validateLink = (url: string) => /^(https?:|file:|mailto:|tel:|sms:|\/|#|asset:|post:)/i.test(String(url));

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
  return '/assets/' + encodeURI(file)
}

/** Resolve post://<slug> → /{lang}/post/<slug> */
export function resolvePostUrl(slug: string): string {
  return '/' + _currentLocale + '/post/' + encodeURI(slug)
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
  if (_currentPostId && !url.startsWith('/') && !/^[a-zA-Z][\w+.-]*:/.test(url)) {
    const base = _currentPostId === '__about__' ? '/about' : `/post_attachment/${_currentPostId}`;
    return `${base}/${encodeFilename(url)}`;
  }
  return _normalizeLink(url);
};

md.use(markdownItFootnote);

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
// When [text](audio:...) or [text](file.ext) is detected,
// produces html_inline directly so the default link rule never sees it.

const TYPE_PREFIXES: [string, string, string][] = [
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

md.inline.ruler.before('link', 'chronicle_file_card', (state: any, silent: boolean) => {
  const pos = state.pos;
  const src = state.src;

  if (src.charCodeAt(pos) !== 0x5B) return false;

  // ── Parse link text: [ ... ] ──
  let i = pos + 1;
  let linkText = '';
  while (i < state.posMax) {
    const ch = src.charCodeAt(i);
    if (ch === 0x5C) { linkText += src[i + 1] || ''; i += 2; continue; }
    if (ch === 0x5D) { i++; break; }
    linkText += src[i]; i++;
  }
  if (i >= state.posMax) return false;

  // ── Parse URL: ( ... ) ──
  if (src.charCodeAt(i) !== 0x28) return false;
  i++;
  let href = '';
  let depth = 1;
  while (i < state.posMax && depth > 0) {
    const ch = src.charCodeAt(i);
    if (ch === 0x5C) { href += src[i + 1] || ''; i += 2; continue; }
    if (ch === 0x28) depth++;
    if (ch === 0x29) { depth--; if (depth === 0) { i++; break; } }
    href += src[i]; i++;
  }
  if (depth > 0) return false;

  // ── Intercept: type-prefix OR file-extension ──
  const prefixMatch = parseTypePrefix(href);
  if (!prefixMatch && !hasFileExtension(href)) return false;

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

    const token = state.push('html_inline', '', 0);
    token.content = renderFileCard(cardUrl, linkText.trim(), prefixMatch?.type, subtitle);
  }
  state.pos = i;
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
  const wrapperStyle = (autoRatio && ratio)
    ? ` style="aspect-ratio:${ratio};${width ? 'width:' + cssDim(width) + ';' : 'width:100%;'}${height ? 'height:' + cssDim(height) + ';' : ''}max-width:100%"`
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
  const imgTag = hasExt
    ? `<picture>
      <source srcset="${escapeAttr(src.replace(/\.(jpg|jpeg|png|gif)$/i, '.avif'))}" type="image/avif">
      <source srcset="${escapeAttr(src.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp'))}" type="image/webp">
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="md-image"${dimAttrs} loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />
    </picture>`
    : `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || '')}" class="md-image"${dimAttrs} loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.closest('.md-image-wrapper').dataset.error='1'" />`;

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
 */
function isFileCardUrl(url: string): boolean {
  const extMatch = url.match(/\.([0-9a-z]+)($|\?)/i);
  if (!extMatch) return false;
  const ext = extMatch[1].toLowerCase();
  const fileExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',       // audio
    'mp4', 'webm', 'mkv', 'mov', 'avi',                               // video
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',              // documents
    'txt', 'md', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml', // code
    'zip', 'rar', '7z', 'tar', 'gz',                                   // archives
  ];
  return fileExts.includes(ext);
}

function getFileCardType(url: string): { type: string; icon: string } {
  const ext = (url.match(/\.([0-9a-z]+)($|\?)/i) || [])[1]?.toLowerCase() || '';

  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext))
    return { type: 'Audio', icon: Icons.audio };
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext))
    return { type: 'Video', icon: Icons.video };
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext))
    return { type: 'Document', icon: Icons.document };
  if (['txt', 'md', 'js', 'ts', 'json', 'c', 'cpp', 'py', 'java', 'html', 'css', 'vue', 'log', 'xml', 'yaml'].includes(ext))
    return { type: 'Code/Text', icon: Icons.codeText };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { type: 'Archive', icon: Icons.archive };

  return { type: 'File', icon: Icons.link };
}

function renderFileCard(url: string, displayName?: string, forcedType?: string, customSubtitle?: string): string {
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

  return `<div class="file-card" data-url="${safeUrl}" data-name="${safeName}" data-type="${escapeAttr(type)}">
    <div class="file-card-icon">${icon}</div>
    <div class="file-card-info">
      <div class="file-card-title">${safeName}</div>
      <div class="file-card-subtitle">${safeSubtitle}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  Post-processing pipeline
// ═══════════════════════════════════════════════════════════

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

  // 2. Images → image wrapper (title attr → caption, width/height from imsize
  //    hints, plus auto-detected real ratio for local files to reserve space)
  const resolveImageDims = (src: string, hintW: string, hintH: string) => {
    // Both hints present → legacy fixed-dim behavior (e.g. `=500x300`, `=70%x50%`).
    if (hintW && hintH) return { width: hintW, height: hintH, autoRatio: false, ratio: undefined };
    const dims = getLocalImageSize(src);
    if (dims) {
      // Auto ratio + explicit RELATIVE hints are both inlined (e.g. `=70%` keeps
      // its width; `=x50%` keeps its height) — only the missing dimension is
      // filled by the real aspect ratio.
      return {
        width: hintW || '100%',
        height: hintH || '',
        autoRatio: true,
        ratio: `${dims.width}/${dims.height}`,
      };
    }
    return { width: hintW, height: hintH, autoRatio: false, ratio: undefined };
  };
  result = result.replace(
    /<p><img\s[^>]*src="([^"]+)"[^>]*>\s*(<span[^>]*>[^<]*<\/span>\s*)?(<\/p>)?/g,
    (_m, src) => {
      if (_m.includes('class="md-image"')) return _m;
      const d = resolveImageDims(src, extractAttr(_m, 'width'), extractAttr(_m, 'height'));
      return renderImageWrapper(src, extractAttr(_m, 'alt'), extractAttr(_m, 'title'), d.width, d.height, d.autoRatio, d.ratio);
    }
  );
  // Also handle inline images (not wrapped in <p>), skip those inside <picture>
  result = result.replace(
    /(?:<picture>[\s\S]*?<\/picture>)|(<img\s[^>]*src="([^"]+)"[^>]*>)/g,
    (_m, imgTag, src) => {
      if (!imgTag) return _m; // <picture> block — leave as-is
      if (_m.includes('class="md-image"')) return imgTag;
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

  return injectDetailsChevrons(html);
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
