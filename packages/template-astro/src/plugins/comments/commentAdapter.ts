/**
 * CommentAdapter — unified client-side hydration for CommentSection.
 *
 * Implements true client:visible via IntersectionObserver.
 * Dispatches to backend-specific logic based on `data-comment-backend`:
 *   - "" (empty)   → static SSR content only (relative dates updated, no interaction)
 *   - "waline"     → Waline headless REST API, rendered with Chronicle's own UI
 *
 * Waline is consumed "headless": we do NOT load the @waline/client SDK or its UI.
 * Instead we call the Waline server REST API directly and render the list + form
 * with Chronicle markup/CSS so the design stays consistent with the rest of the site.
 *
 * Waline data model (server renders markdown → HTML, sanitizes via DOMPurify):
 *   objectId→id, nick→author, mail→email, link→website, comment→content (HTML),
 *   insertedAt→date, pid→parent, rid→rootId, avatar→avatarUrl
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { formatRelativeTime } from '@chronicle/shared/src/utils';

// ── i18n helpers ───────────────────────────────────────────

/** Resolve locale string from container or document */
function resolveLang(container?: HTMLElement): string {
  if (container) {
    const dataLang = container.dataset.locale || container.closest('[data-page-locale]')?.getAttribute('data-page-locale');
    if (dataLang) return dataLang === 'zh-CN' || dataLang === 'zh' ? 'zh' : 'en';
  }
  return (document.documentElement.lang || 'en').startsWith('zh') ? 'zh' : 'en';
}

/** Read the i18n blob injected by CommentSection (single source of truth = locale files). */
function readI18n(container: HTMLElement): Record<string, string> {
  const el = container.querySelector<HTMLElement>('[data-role="comment-i18n"]');
  if (!el) return {};
  try {
    return JSON.parse(el.textContent || '{}');
  } catch {
    return {};
  }
}

// ── Relative date formatting ───────────────────────────────

function formatRelativeDate(dateStr: string, lang: string): string {
  return formatRelativeTime(dateStr, lang === 'zh' ? 'zh' : 'en');
}

// ── Types ──────────────────────────────────────────────────

export interface CommentData {
  id: string;
  author: string;
  email?: string;
  website?: string;
  content: string;        // sanitized HTML (Waline server renders markdown + DOMPurify)
  date: string;
  parent?: string | null;
  rootId?: string;
  avatarUrl?: string;
  /** Pinned (置顶) comment — Waline `sticky` flag. */
  pinned?: boolean;
  /** 3.1.x — commenter geo address (country/province), never the raw IP. */
  location?: string;
}

interface WalineComment {
  objectId: string | number;
  nick?: string;
  mail?: string;
  link?: string;
  avatar?: string;
  comment?: string;
  insertedAt?: string;
  /** v3 API: epoch-ms timestamp. `insertedAt` is deleted by the server when `!deprecated`. */
  time?: number;
  pid?: string | number | null;
  rid?: string | number | null;
  /** Waline pinned flag — boolean after `formatCmt`, but tolerate raw string/number storage. */
  sticky?: boolean | number | string;
  /** IP geo-location string (e.g. "中国 江苏省 南京市") — Waline's `addr` field. */
  addr?: string;
  children?: WalineComment[];
}

// ── DOM rendering ──────────────────────────────────────────

function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/** Render lightweight markdown → sanitized HTML for the client-side preview.
 *  Mirrors Waline's model: the preview uses a light renderer; the server does
 *  the full markdown-it + sanitize pass on submit and returns the final HTML. */
function renderMarkdownPreview(md: string): string {
  try {
    const html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string;
    return DOMPurify.sanitize(html, { ADD_DATA_URI_TAGS: ['img'] });
  } catch {
    return escapeHtml(md);
  }
}

function renderEmptyState(icon: boolean, message: string): string {
  const iconSVG = icon
    ? `<svg class="cs-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
    : '';
  return `<div class="cs-empty">${iconSVG}<p class="cs-empty-text">${escapeHtml(message)}</p></div>`;
}

function renderAvatar(comment: CommentData, isReply: boolean): string {
  const sm = isReply ? '--sm' : '';
  const size = isReply ? 32 : 40;
  if (comment.avatarUrl) {
    return `<img class="cs-avatar-img${sm}" src="${escapeHtml(comment.avatarUrl)}" alt="" loading="lazy" width="${size}" height="${size}" referrerpolicy="no-referrer" />`;
  }
  const initial = (comment.author.charAt(0) || '?').toUpperCase();
  return `<span class="cs-avatar-initial${sm}">${escapeHtml(initial)}</span>`;
}

function renderCommentHTML(comment: CommentNode, lang: string, isReply: boolean, replyLabel: string, replyToLabel: string, pinnedLabel: string): string {
  const author = comment.website
    ? `<a href="${escapeHtml(comment.website)}" rel="nofollow noopener" target="_blank">${escapeHtml(comment.author)}</a>`
    : escapeHtml(comment.author);

  // For a reply that targets another reply (not the root), show "回复 @xxx".
  const replyTo = comment.replyToAuthor
    ? `<span class="cs-reply-to">${escapeHtml(replyToLabel)} @${escapeHtml(comment.replyToAuthor)}</span>`
    : '';

  // Pinned (置顶) badge — only roots are pinned by Waline, but render defensively.
  const pinnedBadge = comment.pinned
    ? `<span class="cs-pinned-badge" aria-label="${escapeHtml(pinnedLabel)}">${escapeHtml(pinnedLabel)}</span>`
    : '';

  // 3.1.x — geo badge: show the geo address (never the raw IP) when present and enabled.
  const showGeo = (document.querySelector('.comment-section') as HTMLElement | null)?.dataset.showGeo !== 'false';
  const geoBadge = comment.location && showGeo
    ? `<span class="cs-location">${escapeHtml(comment.location)}</span>`
    : '';

  return `
    <div class="cs-comment${isReply ? ' cs-comment--reply' : ''}" id="comment-${escapeHtml(comment.id)}">
      <div class="cs-avatar">${renderAvatar(comment, isReply)}</div>
      <div class="cs-body">
        <div class="cs-meta">
          <span class="cs-author">${author}</span>
          ${pinnedBadge}
          ${replyTo}
          <span class="cs-date" data-date="${escapeHtml(comment.date)}">${escapeHtml(formatRelativeDate(comment.date, lang))}</span>
          ${geoBadge}
        </div>
        <div class="cs-content">${comment.content}</div>
        <button type="button" class="cs-reply-btn" data-reply-to="${escapeHtml(comment.id)}" data-reply-root="${escapeHtml(comment.rootId || comment.id)}">${escapeHtml(replyLabel)}</button>
      </div>
    </div>`;
}

interface CommentNode extends CommentData {
  replies: CommentNode[];
  /** Author being replied to, when this reply targets another reply (not the root). */
  replyToAuthor?: string;
}

/**
 * Build a flat two-level thread: roots + their replies. All descendants are grouped
 * under their root (via rid) and rendered at the same second level — a reply that
 * targets another reply keeps `replyToAuthor` for an inline "回复 @xxx" attribution,
 * mirroring Waline's own flattening rather than infinite nesting.
 */
function buildThreads(flat: CommentData[]): CommentNode[] {
  const byId = new Map<string, CommentData>();
  flat.forEach((c) => byId.set(c.id, c));

  const roots: CommentNode[] = [];
  flat.forEach((c) => {
    if (!c.parent) roots.push({ ...c, replies: [] });
  });

  flat.forEach((c) => {
    if (!c.parent) return;
    const rootId = c.rootId || c.parent;
    const root = roots.find((r) => r.id === rootId);
    if (!root) return;
    const replyToAuthor = c.parent !== rootId ? byId.get(c.parent)?.author : undefined;
    root.replies.push({ ...c, replies: [], replyToAuthor });
  });

  return roots;
}

function renderThread(node: CommentNode, lang: string, replyLabel: string, replyToLabel: string, pinnedLabel: string): string {
  const html = renderCommentHTML(node, lang, false, replyLabel, replyToLabel, pinnedLabel);
  const replies = node.replies.map((r) => renderCommentHTML(r, lang, true, replyLabel, replyToLabel, pinnedLabel)).join('');
  return `<div class="cs-thread">${html}${replies ? `<div class="cs-replies">${replies}</div>` : ''}</div>`;
}

function renderCommentList(flat: CommentData[], lang: string, replyLabel: string, replyToLabel: string, pinnedLabel: string, emptyMessage: string): string {
  const threads = buildThreads(flat);
  if (threads.length === 0) return renderEmptyState(true, emptyMessage);
  return threads.map((n) => renderThread(n, lang, replyLabel, replyToLabel, pinnedLabel)).join('');
}

/** Native lazy-loading for media injected into comment content (images, iframes). */
function applyLazyMedia(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>('.cs-content img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
  });
  root.querySelectorAll<HTMLIFrameElement>('.cs-content iframe').forEach((iframe) => {
    if (!iframe.hasAttribute('loading')) iframe.loading = 'lazy';
  });
}

// ── Waline REST API ────────────────────────────────────────

function normalizeBaseUrl(raw: string): string {
  if (!raw) return '';
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

function mapWalineComment(c: WalineComment): CommentData {
  // v3 deletes `insertedAt` and returns `time` (epoch ms); v1 returns `insertedAt` (ISO).
  const date = typeof c.time === 'number' ? new Date(c.time).toISOString() : c.insertedAt || '';
  // Waline's `formatCmt` coerces `sticky` to boolean; tolerate raw string/number storage too.
  const pinned = c.sticky == null ? false : Boolean(Number(c.sticky));
  return {
    id: String(c.objectId),
    author: (c.nick || '').trim() || 'Anonymous',
    email: c.mail || undefined,
    website: c.link || undefined,
    content: c.comment || '',
    date,
    parent: c.pid != null ? String(c.pid) : null,
    rootId: c.rid != null ? String(c.rid) : String(c.objectId),
    avatarUrl: c.avatar || undefined,
    pinned,
    location: c.addr || undefined,
  };
}

async function fetchWalineComments(
  serverUrl: string,
  path: string,
  page = 1,
  pageSize = 20,
): Promise<{ count: number; comments: CommentData[]; page: number; totalPages: number; hasMore: boolean }> {
  const base = normalizeBaseUrl(serverUrl);
  // 分页拉取：有图（含 base64 内嵌）的评论 HTML 大，一次拉 100 条很重 → 每页 20 + 加载更多
  const url = `${base}/api/comment?path=${encodeURIComponent(path)}&pageSize=${pageSize}&page=${page}&sortBy=insertedAt_desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // v3 envelope: { errno, errmsg, data: { page, totalPages, pageSize, count, data: [...] } }
  const list: WalineComment[] = Array.isArray(json?.data?.data) ? json.data.data : [];
  // Waline returns a nested tree (roots with `children`). Flatten into a
  // parent-referenced list so buildTree() can re-nest by pid/rid.
  const flat = list.flatMap((root) => [root, ...(root.children || [])]);
  const comments = flat.map(mapWalineComment);
  const count = typeof json?.data?.count === 'number' ? json.data.count : comments.length;
  const totalPages = typeof json?.data?.totalPages === 'number' ? json.data.totalPages : 1;
  return { count, comments, page, totalPages, hasMore: page < totalPages };
}

/** Extract a human-readable message from a Waline error envelope.
 *  errmsg may be a string, or (for validation errors) an object mapping
 *  field → reason, e.g. { url: "...", comment: "..." }. */
function extractWalineError(json: any): string {
  const msg = json?.errmsg ?? json?.msg ?? json?.message;
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object') {
    return Object.entries(msg as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
  }
  return String(msg);
}

async function submitWalineComment(
  serverUrl: string,
  path: string,
  data: { author: string; email?: string; website?: string; content: string; parent?: string; rootId?: string },
): Promise<void> {
  const base = normalizeBaseUrl(serverUrl);
  const url = `${base}/api/comment`;

  const body: Record<string, unknown> = {
    nick: data.author,
    comment: data.content,      // raw markdown; Waline server renders + sanitizes it
    url: path,
    ua: navigator.userAgent,
  };
  if (data.email) body.mail = data.email;
  if (data.website) body.link = data.website;
  if (data.parent) body.pid = data.parent;
  if (data.rootId) body.rid = data.rootId;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Waline always answers with a JSON envelope { errno, errmsg, data }.
  // Business rejections (validation, duplicate, rate-limit, spam) return
  // HTTP 200 with errno != 0 — so errno must be inspected, not just res.ok.
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }

  const errno = typeof json?.errno === 'number' ? json.errno : 0;
  if (!res.ok || errno !== 0) {
    const detail =
      extractWalineError(json) || (res.ok ? `Waline errno ${errno}` : `HTTP ${res.status}`);
    throw new Error(detail);
  }
}

// ── Form handling ──────────────────────────────────────────

function setupWalineForm(
  container: HTMLElement,
  serverUrl: string,
  path: string,
  i18n: Record<string, string>,
  onOptimistic: (draft: {
    author: string;
    email?: string;
    website?: string;
    content: string;
    parent?: string | null;
    rootId?: string | null;
  }) => void,
): void {
  const form = container.querySelector<HTMLFormElement>('[data-role="comment-form"]');
  if (!form) return;

  const authorInput = form.querySelector<HTMLInputElement>('[data-role="author"]');
  const emailInput = form.querySelector<HTMLInputElement>('[data-role="email"]');
  const websiteInput = form.querySelector<HTMLInputElement>('[data-role="website"]');
  const contentInput = form.querySelector<HTMLTextAreaElement>('[data-role="content"]');
  const parentInput = form.querySelector<HTMLInputElement>('[data-role="parent"]');
  const rootInput = form.querySelector<HTMLInputElement>('[data-role="root"]');
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-role="submit"]');
  const note = form.querySelector<HTMLElement>('[data-role="form-note"]');
  const replyIndicator = form.querySelector<HTMLElement>('[data-role="reply-indicator"]');
  const replyTarget = form.querySelector<HTMLElement>('[data-role="reply-target"]');
  const replyCancel = form.querySelector<HTMLButtonElement>('[data-role="reply-cancel"]');
  const previewToggle = form.querySelector<HTMLButtonElement>('[data-role="preview-toggle"]');
  const preview = form.querySelector<HTMLElement>('[data-role="preview"]');

  const setReplyTo = (id: string | null, rootId: string | null, name: string) => {
    if (parentInput) parentInput.value = id || '';
    if (rootInput) rootInput.value = rootId || '';
    if (id && replyIndicator && replyTarget) {
      replyTarget.textContent = `@${name}`;
      replyIndicator.hidden = false;
    } else if (replyIndicator) {
      replyIndicator.hidden = true;
    }
    contentInput?.focus();
  };

  // Reply buttons — delegated, since the list is re-rendered on refresh
  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-reply-to]');
    if (!btn) return;
    const id = btn.dataset.replyTo || '';
    const root = btn.dataset.replyRoot || '';
    const author = btn.closest<HTMLElement>('.cs-comment')?.querySelector<HTMLElement>('.cs-author')?.textContent?.trim() || '';
    setReplyTo(id, root, author);
  });

  replyCancel?.addEventListener('click', () => setReplyTo(null, null, ''));

  // Preview toggle — lightweight markdown preview (mirrors Waline's limited preview)
  let previewing = false;
  const renderPreview = () => {
    if (!preview) return;
    const md = contentInput?.value || '';
    preview.innerHTML = md ? renderMarkdownPreview(md) : '';
    preview.hidden = !previewing;
  };
  previewToggle?.addEventListener('click', () => {
    previewing = !previewing;
    renderPreview();
  });
  contentInput?.addEventListener('input', () => {
    if (previewing) renderPreview();
  });

  // Image attachment — images are kept as separate attachments (chips), NOT injected
  // into the textarea. On submit they're appended after the text body as markdown image
  // syntax, so Waline renders them as images below the comment text.
  const imageBtn = form.querySelector<HTMLButtonElement>('[data-role="image-btn"]');
  const imageInput = form.querySelector<HTMLInputElement>('[data-role="image-input"]');
  const attachContainer = form.querySelector<HTMLElement>('[data-role="attachments"]');
  // 图片上传配置：开关 + 图床（endpoint/token）。未启用或无图床时整个上传链路不激活（按钮 SSR 已隐藏）。
  const imageUpload = container.dataset.imageUpload === 'true';
  const imageEndpoint = String(container.dataset.imageEndpoint || '').trim();
  const imageToken = String(container.dataset.imageToken || '').trim();
  const attachments: { name: string; dataUrl: string }[] = [];

  /** 上传一张图片到图床（multipart file），返回 URL。lsky-pro 风格响应：{ data: { links: { url } } }。 */
  async function uploadImage(dataUrl: string): Promise<string> {
    if (!imageEndpoint) throw new Error('image host not configured');
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append('file', blob, 'image.png');
    const res = await fetch(imageEndpoint, {
      method: 'POST',
      headers: imageToken ? { Authorization: 'Bearer ' + imageToken } : {},
      body: fd,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json().catch(() => ({}));
    const url = json?.data?.links?.url || json?.data?.url || json?.url;
    if (!url) throw new Error('no url in response');
    return String(url);
  }

  const renderAttachments = () => {
    if (!attachContainer) return;
    attachContainer.innerHTML = attachments
      .map(
        (a, i) =>
          `<span class="cs-attachment">` +
          `<img class="cs-attachment-thumb" src="${escapeHtml(a.dataUrl)}" alt="" />` +
          `<span class="cs-attachment-name">${escapeHtml(a.name)}</span>` +
          `<button type="button" class="cs-attachment-remove" data-attachment-index="${i}" aria-label="Remove">&times;</button>` +
          `</span>`,
      )
      .join('');
    attachContainer.hidden = attachments.length === 0;
  };

  imageBtn?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        attachments.push({ name: file.name, dataUrl: reader.result });
        renderAttachments();
      }
    };
    reader.readAsDataURL(file);
    imageInput.value = ''; // reset so the same file can be re-selected
  });

  attachContainer?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-attachment-index]');
    if (!btn) return;
    attachments.splice(Number(btn.getAttribute('data-attachment-index')), 1);
    renderAttachments();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!contentInput || !authorInput || !submitBtn) return;

    const author = authorInput.value.trim();
    const content = contentInput.value.trim();
    const email = emailInput?.value.trim() || '';
    const website = websiteInput?.value.trim() || '';
    const parent = parentInput?.value || '';
    const rootId = rootInput?.value || '';
    // Email is required: a null `mail` breaks Waline's avatar renderer (Nunjucks trim(null)).
    if (!author || !content || !email) return;

    // Attachments are uploaded to the image host (URL), then appended after the
    // text body as markdown image syntax. (Waline has no separate attachment
    // field; the server renders them as images. Never inline base64.)
    let finalContent = content;
    if (attachments.length > 0 && !imageUpload) {
      if (note) { note.textContent = i18n.imageDisabled || 'Images are disabled.'; note.hidden = false; }
      return;
    }
    try {
      const urls = await Promise.all(attachments.map((a) => uploadImage(a.dataUrl)));
      const attachmentMarkdown = urls
        .map((u, i) => `![${attachments[i].name.replace(/[\[\]]/g, '')}](${u})`)
        .join('\n');
      finalContent = [content, attachmentMarkdown].filter(Boolean).join('\n\n');
    } catch (err) {
      if (note) { note.textContent = i18n.imageUploadError || 'Image upload failed.'; note.hidden = false; }
      submitBtn.disabled = false;
      return;
    }

    submitBtn.disabled = true;
    if (note) note.hidden = true;

    // Optimistic UI: show the comment immediately, regardless of the request.
    onOptimistic({
      author,
      email: email || undefined,
      website: website || undefined,
      content: finalContent,
      parent: parent || null,
      rootId: rootId || null,
    });

    // Treat the comment as sent: clear the form and confirm immediately. The
    // network request is fire-and-forget — the optimistic entry stays even if
    // it fails, and the list is never re-fetched until a hard refresh.
    form.reset();
    attachments.length = 0;
    renderAttachments();
    setReplyTo(null, null, '');
    if (note) {
      note.textContent = i18n.submitted || 'Comment submitted.';
      note.classList.remove('cs-form-note--error');
      note.hidden = false;
    }

    try {
      await submitWalineComment(serverUrl, path, {
        author,
        email: email || undefined,
        website: website || undefined,
        content: finalContent,
        parent: parent || undefined,
        rootId: rootId || undefined,
      });
    } catch (err) {
      // Keep the optimistic state; log for debugging only.
      console.warn('[comments] submit failed:', err);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ── Hydration ──────────────────────────────────────────────

function updateRelativeDates(container: HTMLElement, lang: string): void {
  const dateEls = container.querySelectorAll<HTMLElement>('.cs-date[data-date]');
  dateEls.forEach((el) => {
    const ds = el.dataset.date;
    if (ds) el.textContent = formatRelativeDate(ds, lang);
  });
}

interface CachedComments {
  comments: CommentData[];
  count: number;
  hasMore: boolean;
  page: number;
}

/**
 * Session cache: each post's comments are fetched once and kept in memory for
 * the rest of the visit. Soft navigation re-hydrates the section from this
 * cache (no request); a hard refresh clears the module and fetches again.
 */
const commentsCache = new Map<string, CachedComments>();

async function hydrateWaline(
  container: HTMLElement,
  serverUrl: string,
  path: string,
  lang: string,
  i18n: Record<string, string>,
): Promise<void> {
  const listEl = container.querySelector<HTMLElement>('.cs-list');
  const countEl = container.querySelector<HTMLElement>('.cs-count');

  const PAGE_SIZE = 20;
  let allComments: CommentData[] = [];
  let total = 0;
  let page = 1;
  let hasMore = true;
  let loading = false;

  const paint = () => {
    if (!listEl) return;
    let html = renderCommentList(
      allComments,
      lang,
      i18n.reply || 'Reply',
      i18n.replyTo || 'Reply to',
      i18n.pinned || 'Pinned',
      i18n.noComments || 'No comments yet.',
    );
    if (hasMore) {
      html += `<button type="button" class="cs-load-more" data-role="load-more">${escapeHtml(i18n.loadMore || 'Load more')}</button>`;
    }
    listEl.innerHTML = html;
    applyLazyMedia(listEl);
    if (countEl) {
      countEl.textContent = String(total);
      countEl.style.display = total > 0 ? '' : 'none';
    }
  };

  const remember = () => {
    commentsCache.set(path, { comments: allComments.slice(), count: total, hasMore, page });
  };

  const render = async (append = false) => {
    if (!listEl || loading) return;
    loading = true;
    if (!append) {
      listEl.innerHTML = `<div class="cs-loading">${escapeHtml(i18n.loading || 'Loading comments...')}</div>`;
    }
    try {
      const { count, comments, hasMore: hm } = await fetchWalineComments(serverUrl, path, page, PAGE_SIZE);
      allComments = append ? allComments.concat(comments) : comments;
      total = count;
      hasMore = hm;
      remember();
      paint();
    } catch {
      if (!append) listEl.innerHTML = renderEmptyState(false, i18n.loadError || 'Could not load comments.');
    } finally {
      loading = false;
    }
  };

  /**
   * Optimistic submit: the comment is rendered immediately and is never rolled
   * back, even when the request fails. The list is not re-fetched afterwards —
   * the local cache is the source of truth until the next hard refresh.
   */
  const addOptimistic = (draft: {
    author: string;
    email?: string;
    website?: string;
    content: string;
    parent?: string | null;
    rootId?: string | null;
  }) => {
    const optimistic: CommentData = {
      id: 'local-' + Date.now(),
      author: draft.author,
      email: draft.email,
      website: draft.website,
      content: renderMarkdownPreview(draft.content),
      date: new Date().toISOString(),
      parent: draft.parent || null,
      rootId: draft.rootId || null,
    };
    allComments = [optimistic, ...allComments];
    total += 1;
    remember();
    paint();
  };

  // Load more: append the next page to the end of the list.
  listEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-role="load-more"]');
    if (!btn) return;
    page += 1;
    void render(true);
  });

  setupWalineForm(container, serverUrl, path, i18n, addOptimistic);

  const cached = commentsCache.get(path);
  if (cached) {
    allComments = cached.comments.slice();
    total = cached.count;
    hasMore = cached.hasMore;
    page = cached.page;
    paint();
  } else {
    await render(false);
  }
}

function hydrateContainer(container: HTMLElement): void {
  const backend = container.dataset.commentBackend || '';
  const walineServerUrl = container.dataset.walineServerUrl || '';
  const postId = container.dataset.postId || '';
  const lang = resolveLang(container);
  const i18n = readI18n(container);

  // Always update relative dates on SSR content.
  updateRelativeDates(container, lang);

  switch (backend) {
    case 'waline': {
      if (walineServerUrl && postId) {
        // Locale-independent canonical path — one comment thread per post.
        const path = `/post/${postId}`;
        void hydrateWaline(container, walineServerUrl, path, lang, i18n);
      }
      break;
    }
    // default (""): static only — dates already updated
  }
}

/**
 * Initialize comment section hydration with IntersectionObserver
 * (true client:visible — only hydrates when the section scrolls into view).
 *
 * Returns a cleanup function that disconnects observers and resets state.
 * Call on `astro:before-swap` to prevent leaks across SPA navigations.
 */
export function hydrateCommentSection(): () => void {
  if (typeof window === 'undefined') return () => {};

  const containers = document.querySelectorAll<HTMLElement>('.comment-section');
  if (containers.length === 0) return () => {};

  if (!('IntersectionObserver' in window)) {
    containers.forEach((c) => {
      if (c.dataset.hydrated !== '1') {
        c.dataset.hydrated = '1';
        hydrateContainer(c);
      }
    });
    return () => {
      containers.forEach((c) => { delete c.dataset.hydrated; });
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          const container = entry.target as HTMLElement;
          if (container.dataset.hydrated !== '1') {
            // Never hydrate (and thus never fire the Waline fetch) until the
            // page has fully loaded. On wide viewports the section can be
            // within rootMargin before `load` — fetching + rendering comments
            // mid-load reflows the huge article container (CLS ~0.7 on
            // desktop). After load the fetch can't race first paint.
            const start = () => {
              if (container.dataset.hydrated !== '1') {
                container.dataset.hydrated = '1';
                hydrateContainer(container);
              }
            };
            if (document.readyState === 'complete') start();
            else window.addEventListener('load', start, { once: true });
          }
        }
      }
    },
    { rootMargin: '200px' },
  );

  containers.forEach((c) => {
    if (c.dataset.hydrated !== '1') observer.observe(c);
  });

  return () => {
    observer.disconnect();
    containers.forEach((c) => { delete c.dataset.hydrated; });
  };
}
