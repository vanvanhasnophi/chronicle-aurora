/**
 * Chronicle Template — Local Fs Adapter
 *
 * DataSource 的默认实现：构建期直接读 data/ 文件系统（YAML/JSON/Markdown）。
 * 无 API 后端——data/ 是唯一数据源（本地优先，见 CLAUDE.md）。
 * 注册点：src/data/index.ts（渲染层只 import 那里）。
 */

// Emit data-source info at build time (dev only)
if (import.meta.env.DEV) {
  console.info('[Chronicle] 📦 数据源: 本地文件系统 (localFs adapter)');
}

/**
 * Usage:
 *   DATA_SOURCE=local npm run build
 *
 * The Chronicle data directory is resolved as:
 *   1. CHRONICLE_DATA_DIR env var (absolute path)
 *   2. ../data relative to template-astro/ (monorepo layout)
 *   3. ./data relative to CWD (standalone lite checkout)
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import crypto from 'node:crypto';
import { renderChronicleMarkdown, setRenderPostId } from '../../utils/chronicleMarkdown';
import { normalizeAuthors } from '@chronicle/shared/src/utils';
import type { DataSource, PostMeta, LocalPost, LocalSettings, ChronicleComment, CommentTreeNode, PostPageConfig } from '../types';

/** Resolve asset:// protocol to /assets/ (public URL) */
function resolveAssetUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('asset://')) return '/assets/' + url.slice(8)
  return url
}

/** Read a YAML or JSON file, returning the parsed object */
function readDataFile(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) return YAML.parse(raw) ?? null
    return JSON.parse(raw)
  } catch { return null }
}

// Content-hash cache keyed by (path, size, mtime): a background video is large,
// and getPublicSettings() runs once per rendered page, so we must not re-read +
// re-hash the whole file 38× per build. Size+mtime is a safe "did it change"
// proxy — dev edits bump mtime and recompute the hash.
const _fileHashCache = new Map<string, string>();
function fileHash(src: string): string {
  const stat = fs.statSync(src);
  const key = `${src}:${stat.size}:${stat.mtimeMs}`;
  let hash = _fileHashCache.get(key);
  if (!hash) {
    hash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 8);
    _fileHashCache.set(key, hash);
  }
  return hash;
}

const BG_IMAGE_RE = /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i;
const BG_VIDEO_RE = /\.(mp4|webm|ogg|mov)$/i;
// A fallback first-frame poster (background_alt.<ext>) is NOT a background image —
// it is the <video> poster. Skip it in image discovery so it never "covers" the video.
const BG_POSTER_RE = /_alt\.(jpg|jpeg|png|gif|webp|avif|svg)$/i;

/** Raster source types the asset pipeline compresses to .webp/.avif siblings. */
const BG_RASTER_RE = /\.(jpg|jpeg|png|gif)$/i;

/**
 * Build the compressed-variant candidates for a background file, best first:
 * [avif, webp, original]. The asset pipeline (astro.config.mjs) emits
 * `<base>.webp` / `<base>.avif` next to jpg/jpeg/png/gif sources — but ONLY if
 * the variants actually exist on disk at build time, so a variant that wasn't
 * generated (e.g. source already webp/avif, or pipeline skipped) is omitted.
 * JS probes these in order and uses the first that decodes → smallest bytes.
 */
function backgroundCandidates(file: string, dir: string): string[] {
  const base = file.replace(/\.[^.]+$/, '');
  const cands: string[] = [];
  if (BG_RASTER_RE.test(file)) {
    for (const ext of ['avif', 'webp']) {
      const variant = `${base}.${ext}`;
      try {
        if (fs.existsSync(path.join(dir, variant))) {
          cands.push(`/data/background/${variant}?v=${fileHash(path.join(dir, variant))}`);
        }
      } catch { /* ignore */ }
    }
  }
  try {
    cands.push(`/data/background/${file}?v=${fileHash(path.join(dir, file))}`);
  } catch { /* ignore */ }
  return cands;
}

/** Auto-discover background image from data/background/ (poster files are skipped) */
function readBackgroundUrl(): string {
  try {
    const bgDir = path.join(DATA_DIR, 'background')
    if (!fs.existsSync(bgDir)) return ''
    const imgs = fs.readdirSync(bgDir).filter(f => BG_IMAGE_RE.test(f) && !f.startsWith('.') && !BG_POSTER_RE.test(f))
    if (imgs.length === 0) return ''
    const file = imgs[0]
    return `/data/background/${file}?v=${fileHash(path.join(bgDir, file))}`
  } catch { return '' }
}

/** Candidate list for the bg image (avif > webp > original), empty when no bg. */
function readBackgroundUrlCandidates(): string[] {
  try {
    const bgDir = path.join(DATA_DIR, 'background')
    if (!fs.existsSync(bgDir)) return []
    const imgs = fs.readdirSync(bgDir).filter(f => BG_IMAGE_RE.test(f) && !f.startsWith('.') && !BG_POSTER_RE.test(f))
    if (imgs.length === 0) return []
    return backgroundCandidates(imgs[0], bgDir)
  } catch { return [] }
}

/** Auto-discover the fallback first-frame poster (background_alt.<ext>) for the video. */
function readBackgroundPoster(): string {
  try {
    const bgDir = path.join(DATA_DIR, 'background')
    if (!fs.existsSync(bgDir)) return ''
    const posters = fs.readdirSync(bgDir).filter(f => BG_POSTER_RE.test(f) && !f.startsWith('.'))
    if (posters.length === 0) return ''
    const file = posters[0]
    return `/data/background/${file}?v=${fileHash(path.join(bgDir, file))}`
  } catch { return '' }
}

/** Candidate list for the poster (avif > webp > original), empty when none. */
function readBackgroundPosterCandidates(): string[] {
  try {
    const bgDir = path.join(DATA_DIR, 'background')
    if (!fs.existsSync(bgDir)) return []
    const posters = fs.readdirSync(bgDir).filter(f => BG_POSTER_RE.test(f) && !f.startsWith('.'))
    if (posters.length === 0) return []
    return backgroundCandidates(posters[0], bgDir)
  } catch { return [] }
}

/** Auto-discover background video from data/background/ (image/poster = above) */
function readBackgroundVideo(): string {
  try {
    const bgDir = path.join(DATA_DIR, 'background')
    if (!fs.existsSync(bgDir)) return ''
    const vids = fs.readdirSync(bgDir).filter(f => BG_VIDEO_RE.test(f) && !f.startsWith('.'))
    if (vids.length === 0) return ''
    const file = vids[0]
    return `/data/background/${file}?v=${fileHash(path.join(bgDir, file))}`
  } catch { return '' }
}

/** Read background metadata from data/background/background.yml */
function readBackgroundMeta(): string {
  const bgMeta = readDataFile(path.join(DATA_DIR, 'background', 'background.yml'))
  return bgMeta ? JSON.stringify(bgMeta) : ''
}

/** Read a single key from data/background/background.yml (e.g. backgroundColorLight). */
function parseBackgroundColor(key: string): string {
  try {
    const meta = readDataFile(path.join(DATA_DIR, 'background', 'background.yml'))
    if (meta && typeof meta === 'object') return String((meta as Record<string, any>)[key] || '')
  } catch { /* ignore */ }
  return ''
}

/** Strip YAML frontmatter, returning the body */
function stripFrontmatter(content: string): string {
    if (!content) return '';
    if (content.startsWith('---')) {
        const end = content.indexOf('---', 3);
        if (end !== -1) return content.slice(end + 3).trim();
    }
    return content;
}

/** Parse YAML frontmatter attributes from markdown content */
function parseFrontmatterYaml(content: string): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};
    if (!content || !content.startsWith('---')) return attrs;
    const end = content.indexOf('---', 3);
    if (end === -1) return attrs;
    const fm = content.slice(3, end);

    // Simple line-by-line YAML parser for frontmatter subset
    const lines = fm.split('\n');
    const stack: { key: string; indent: number }[] = [];
    let currentIndent = 0;

    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = line.search(/\S/);
        const trimmed = line.trim();

        // Key: value or Key:
        const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
        if (kvMatch) {
            const key = kvMatch[1];
            let value = kvMatch[2].trim();

            // Pop stack for dedent
            while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            if (value === '') {
                // Key with no value — might start a list on next lines
                // For now, initialize as empty array (will be populated by list items)
                attrs[key] = [];
                stack.push({ key, indent });
            } else {
                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                const converted = value === 'null' ? null : value === 'true' ? true : value === 'false' ? false : value;
                if (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                    attrs[key] = converted;
                } else {
                    attrs[key] = converted;
                }
            }
            continue;
        }

        // List item: - value
        const listMatch = trimmed.match(/^-\s+(.*)$/);
        if (listMatch) {
            let itemValue = listMatch[1].trim();
            // Remove quotes
            if ((itemValue.startsWith('"') && itemValue.endsWith('"')) ||
                (itemValue.startsWith("'") && itemValue.endsWith("'"))) {
                itemValue = itemValue.slice(1, -1);
            }
            // Find the active list key (last in stack or direct attr)
            const activeKey = stack.length > 0 ? stack[stack.length - 1].key : null;
            if (activeKey && Array.isArray(attrs[activeKey])) {
                (attrs[activeKey] as unknown[]).push(itemValue);
            }
        }
    }

    return attrs;
}

// ── Path Resolution ─────────────────────────────────────

function resolveDataDir(): string {
    if (process.env.CHRONICLE_DATA_DIR) {
        return path.resolve(process.env.CHRONICLE_DATA_DIR);
    }
    // Monorepo: CWD is packages/template-astro/ during build
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const monorepoData = path.join(repoRoot, 'data');
    if (fs.existsSync(monorepoData)) return monorepoData;
    // Standalone lite checkout: CWD/data/
    const cwd = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(cwd)) return cwd;
    // Direct env or fallback
    return path.resolve(process.cwd(), '..', '..', 'data');
}

const DATA_DIR = resolveDataDir();
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');
const COLLECTION_FILE = path.join(DATA_DIR, 'collections.yml');

/**
 * 合集归属实时查询（collections.yml 反查，与 CollectionNav 的 matched 同源）。
 * post.collection/collectionPath 不再依赖 frontmatter 或 index.json 快照字段——
 * collections.yml 改动（如文章移出合集）即时生效，避免陈旧快照导致"无合集文章
 * 仍挂合集导航/正文让位"。每篇文章映射到第一个包含它的合集（多合集按
 * collections.yml 顺序取第一个，合集内上下篇也以该合集为准）。
 */
let _colAssignmentCache: Map<string, { collection: string; collectionPath: string }> | null = null;
let _colAssignmentMtime = 0;
function resolveCollectionAssignments(): Map<string, { collection: string; collectionPath: string }> {
  try {
    const mtime = fs.statSync(COLLECTION_FILE).mtimeMs;
    if (_colAssignmentCache && _colAssignmentMtime === mtime) return _colAssignmentCache;
  } catch { return _colAssignmentCache ?? new Map(); }
  const map = new Map<string, { collection: string; collectionPath: string }>();
  try {
    const data = readDataFile(COLLECTION_FILE);
    const cols = Array.isArray(data) ? data : ((data as any)?.collections || []);
    const walk = (nodes: any[] | undefined, colName: string, parents: string[]) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (node?.type === 'post' && node.id) {
          const collectionPath = parents.length > 0
            ? `${colName} / ${parents.join(' / ')}`
            : colName;
          const id = String(node.id);
          if (!map.has(id)) {
            map.set(id, { collection: colName, collectionPath });
          }
        }
        if (node?.type === 'group' && Array.isArray(node.children)) {
          walk(node.children, colName, [...parents, node.title || 'Untitled']);
        }
      }
    };
    for (const col of cols) {
      if (col?.name && Array.isArray(col.nodes)) walk(col.nodes, String(col.name), []);
    }
  } catch { /* collections.yml 缺失/损坏 → 空映射 */ }
  _colAssignmentCache = map;
  try { _colAssignmentMtime = fs.statSync(COLLECTION_FILE).mtimeMs; } catch {}
  return map;
}
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.yml');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.yml');
const COMMENTS_DIR = path.join(DATA_DIR, 'comments');

// Markdown rendering centralized in src/utils/chronicleMarkdown.ts
// Uses markdown-it with custom rules for katex, code chunks, file cards, images.

// ── Post page config (3.1.x) — flat top-level groups from site.yml ──
// （类型定义见 src/data/types.ts；此处仅保留合并逻辑）

const POST_PAGE_DEFAULTS: Required<PostPageConfig> = {
  postMeta: { metaUpdated: true, metaStats: true, metaAiBadge: true, showTags: true },
  postTocEnabled: true,
  postToc: { inlineToc: true, tocFloat: true, tocFloatAlwaysExpanded: false, mobileTocControl: true },
  postCollectionNavEnabled: true,
  postCollectionNav: { alwaysCollapsed: false },
  postEndOfArticle: { relatedPosts: true, prevNext: true, prevNextMode: 'both', prevNextScope: 'global', prevNextOrder: 'desc', authorCard: true, share: true, shareChannels: ['twitter', 'weibo', 'linkedin'] },
  postComments: { backend: '', walineServerUrl: '', attitude: true, showGeoAddress: true, imageUploadEnabled: false, imageUploadEndpoint: '', imageUploadToken: '' },
}

/**
 * Merge raw site.yml values over defaults. Accepts both the flat 3.1.x keys
 * (postMeta / postToc / …) and the legacy nested `post:` block (pre-review).
 */
function normalizePostConfig(raw: unknown): PostPageConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const legacy = src.post && typeof src.post === 'object' ? (src.post as Record<string, any>) : {};
  // site.yml 按插件分组：readingExperience 组提供 toc/endOfArticle、comments 组提供评论配置
  const re = src['reading-experience'] && typeof src['reading-experience'] === 'object' ? (src['reading-experience'] as Record<string, any>) : {};
  const cm = src.comments && typeof src.comments === 'object' ? (src.comments as Record<string, any>) : {};
  // postCollectionNav 内置在 collections.yml（post.collectionNav——单 schema 同文件，
  // manager 保存时一并写入）；site.yml 旧值回退
  try {
    const collData = readDataFile(COLLECTION_FILE) || {};
    if (collData.post?.collectionNav && typeof collData.post.collectionNav === 'object') {
      const merged = { ...legacy.collectionNav, ...collData.post.collectionNav };
      legacy.collectionNav = merged;
    }
  } catch { /* 读取失败则回退 site.yml */ }
  const out: Record<string, any> = {};
  for (const key of Object.keys(POST_PAGE_DEFAULTS)) {
    const def = (POST_PAGE_DEFAULTS as Record<string, any>)[key];
    // Legacy/tree key mapping: post.meta → postMeta, post.toc → postToc,
    // post.toc.enabled → postTocEnabled, …（树结构与旧扁平 site.yml 双兼容）
    const legacyKey = { postMeta: 'meta', postToc: 'toc', postCollectionNav: 'collectionNav', postEndOfArticle: 'endOfArticle', postComments: 'comments', postTocEnabled: 'toc.enabled', postCollectionNavEnabled: 'collectionNav.enabled' }[key];
    let legacyVal: unknown
    if (legacyKey) {
      // 支持点路径（toc.enabled）
      legacyVal = legacy
      for (const p of String(legacyKey).split('.')) {
        if (legacyVal == null || typeof legacyVal !== 'object') { legacyVal = undefined; break }
        legacyVal = (legacyVal as Record<string, any>)[p]
      }
    }
    // 组优先（插件分组）：toc/endOfArticle ← readingExperience、comments ← comments 组
    const groupVal = key === 'postToc' ? re.toc
      : key === 'postEndOfArticle' ? re.endOfArticle
      : key === 'postComments' ? cm
      : undefined;
    const val = groupVal ?? src[key] ?? legacyVal;
    if (val && typeof val === 'object' && !Array.isArray(val) && def && typeof def === 'object') {
      out[key] = { ...def, ...val };
    } else {
      out[key] = val !== undefined ? val : def;
    }
  }
  return out as PostPageConfig;
}

// ── Post Access ──────────────────────────────────────────

// Cache: avoid re-scanning the filesystem on every call during build.
// In dev mode (astro dev) the cache is bypassed so edits reflect immediately.
let _postCache: PostMeta[] | null = null;
let _postCacheMtime = 0;
// Cache: avoid re-rendering markdown→HTML for the same post across multiple pages
const _htmlCache = new Map<string, string>();

function isCacheStale(): boolean {
  if (!_postCache) return true;
  try {
    const stat = fs.statSync(INDEX_FILE);
    return stat.mtimeMs > _postCacheMtime;
  } catch { return true; }
}

/** Parse a YAML date string into an ISO string (handles both ISO and YAML date formats) */
function normalizeDate(raw: unknown): string {
    if (raw instanceof Date) return raw.toISOString();
    const str = String(raw || '').trim();
    if (!str) return new Date().toISOString();
    // Try parsing — YAML dates like "2024-01-01" parse cleanly
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Scan posts/ directory and build PostMeta array from index.md files (fallback when index.json is missing) */
function scanPostsFromDisk(): PostMeta[] {
    const posts: PostMeta[] = [];

    if (!fs.existsSync(POSTS_DIR)) return posts;

    const entries = fs.readdirSync(POSTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = entry.name;
        const dirPath = path.join(POSTS_DIR, dir);

        // Read the post body (data/posts/<id>/index.md)
        const contentFile = 'index.md';
        const id = dir;
        const mdPath = path.join(dirPath, contentFile);
        if (!fs.existsSync(mdPath)) continue;

        let raw: string;
        try {
            raw = fs.readFileSync(mdPath, 'utf-8');
        } catch {
            continue;
        }

        // Parse frontmatter
        const attrs = parseFrontmatterYaml(raw);
        // 多作者：author 支持 YAML 列表或逗号分隔；author 保留首个、authors 存完整列表
        // 归一化：$site$ → 网站作者名，撞车去重（如 [$site$, Eightyfor] + name=Eightyfor → [Eightyfor]）
        const rawAuthors = Array.isArray(attrs.author)
            ? attrs.author.map((a: any) => String(a)).filter(Boolean)
            : (typeof attrs.author === 'string' && attrs.author.trim())
                ? attrs.author.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];
        const profileName = (getProfile() as Record<string, any>)?.name as string | undefined;
        const authorList = normalizeAuthors(rawAuthors, profileName);

        posts.push({
            id,
            title: String(attrs.title || dir),
            date: normalizeDate(attrs.date),
            updatedAt: attrs.updatedAt ? normalizeDate(attrs.updatedAt) : undefined,
            filename: contentFile,
            summary: String(attrs.summary || ''),
            tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
            status: String(attrs.status || 'published'),
            font: attrs.font ? String(attrs.font) : undefined,
            collection: attrs.collection ? String(attrs.collection) : undefined,
            collectionPath: attrs.collectionPath ? String(attrs.collectionPath) : undefined,
            author: authorList[0] || undefined,
            authors: authorList.length ? authorList : undefined,
            aiGenerated: !!attrs.aiGenerated,
            type: (attrs.type === 'slides' || !!attrs.marp) ? 'slides' : (String(attrs.type || '') || undefined),
            slideshow: attrs.slideshow || undefined,
            dir,
            toc: [],
        });
    }

    // 合集归属实时查询覆盖（frontmatter 的 collection 字段不再作为来源——
    // 统一查询 collections.yml，与 getAllPosts/index.json 路径一致）
    const colAssignments = resolveCollectionAssignments();
    for (const p of posts) {
      const ca = colAssignments.get(String(p.id));
      p.collection = ca?.collection;
      p.collectionPath = ca?.collectionPath;
    }
    return posts;
}

/** Load all post metadata — index.json first, fall back to scanning directories */
function getAllPosts(): PostMeta[] {
    // In dev mode, check if cache is stale (index.json was rewritten)
    if (_postCache && !isCacheStale()) return _postCache;

    // Try index.json first (fast path)
    if (fs.existsSync(INDEX_FILE)) {
        try {
            const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
            const parsed = JSON.parse(raw || '{}');
            // index.json is object-format keyed by id (P2-4 — array shape retired with convert.mjs).
            let posts: any[] = [];
            if (typeof parsed === "object" && Object.keys(parsed).length > 0) {
              const profileName = (getProfile() as Record<string, any>)?.name as string | undefined;
              // 作者归一化：$site$ → 网站作者名，撞车去重（如 [$site$, Eightyfor] + name=Eightyfor → [Eightyfor]）
              posts = Object.entries(parsed).map(([slug, entry]: [string, any]) => {
                const e = { id: slug, ...entry };
                const rawAuthors = Array.isArray(e.authors) ? e.authors : (e.author ? [e.author] : []);
                const authors = normalizeAuthors(rawAuthors, profileName);
                return { ...e, author: authors[0] || undefined, authors: authors.length ? authors : undefined };
              });
            }
            if (posts.length > 0) {
                // 合集归属实时查询覆盖（index.json 的 collection 是生成快照——
                // collections.yml 改动后未重跑 indexer 会陈旧：无合集文章残留旧合集）
                const colAssignments = resolveCollectionAssignments();
                for (const p of posts) {
                  const ca = colAssignments.get(String(p.id));
                  p.collection = ca?.collection;
                  p.collectionPath = ca?.collectionPath;
                }
                _postCache = posts;
                _postCacheMtime = fs.statSync(INDEX_FILE).mtimeMs;
                return _postCache;
            }
        } catch { /* fall through to scan */ }
    }

    // Fallback: scan posts/ directory
    _postCache = scanPostsFromDisk();
    _postCacheMtime = Date.now();
    if (_postCache.length > 0) {
        if (import.meta.env.DEV) console.log(`[localDataSource] Scanned ${_postCache.length} posts from ${POSTS_DIR}`);
    } else {
        console.warn('[localDataSource] No posts found in', POSTS_DIR);
    }
    return _postCache;
}

/** Get published posts only */
export function getPublishedPosts(): PostMeta[] {
    return getAllPosts().filter(p => p.status === 'published');
}

/** Get a single post with content */
export function getPostById(id: string, locale?: string): LocalPost | null {
    const posts = getAllPosts();
    const meta = posts.find(p => p.id === id);
    if (!meta) return null;
    const mdPath = path.join(POSTS_DIR, id, "index.md");
    if (!fs.existsSync(mdPath)) return null;
    const raw = fs.readFileSync(mdPath, "utf-8");
    const content = meta?.type === "slides" ? raw : stripFrontmatter(raw);

    // Render markdown to HTML (cached per locale — SSG builds en/zh in parallel)
    const loc = locale || 'en';
    const cacheKey = id + ':' + loc;
    let compiledHtml = _htmlCache.get(cacheKey) || '';
    if (!compiledHtml && content) {
        try {
            setRenderPostId(id);
            compiledHtml = renderChronicleMarkdown(content, loc);
            _htmlCache.set(cacheKey, compiledHtml);
        } catch (e) {
            console.warn('[localDataSource] Failed to render markdown for', id, e);
        }
    }

    // 合集归属实时查询（覆盖 index.json 快照——collections.yml 改动即时生效，
    // 无合集文章不再残留旧合集；与 CollectionNav 的 matched 同源，侧栏/正文让位一致）
    const ca = resolveCollectionAssignments().get(id);
    return { ...meta, collection: ca?.collection, collectionPath: ca?.collectionPath, content, compiledHtml };
}

// ── Settings ─────────────────────────────────────────────

/** Read friends data from friends.yml */
function readFriendsFromFile(): { cards: unknown[]; globalStyle: string | null } {
    const data = readDataFile(FRIENDS_FILE)
    if (!data) return { cards: [], globalStyle: null }
    const result = { cards: data.cards || [], globalStyle: data.globalStyle || null }
    // Resolve asset:// URLs in card data
    result.cards = (result.cards || []).map((c: any) => ({
      ...c,
      avatar: resolveAssetUrl(c.avatar || ''),
      cover: resolveAssetUrl(c.cover || ''),
    }))
    return result
}

function readFriendsCards(): unknown[] {
    return readFriendsFromFile().cards;
}

function readFriendsGlobalStyle(): string | null {
    // 方案 A：设置回 site.yml（顶层 friendsGlobalStyle 键）；旧 friends.yml globalStyle 回退
    try {
        const siteYml = path.join(DATA_DIR, 'site.yml');
        const site = readDataFile(siteYml) || {};
        if (typeof site.friendsGlobalStyle === 'string' && site.friendsGlobalStyle) return site.friendsGlobalStyle;
    } catch { /* ignore */ }
    return readFriendsFromFile().globalStyle ?? null;
}

/** Get public-safe settings */
export function getPublicSettings(): LocalSettings {
    // Aurora: read from data/site.yml (single source of truth)
    const siteYml = path.join(DATA_DIR, 'site.yml');
    let raw = readDataFile(siteYml) || {}
    // 树结构兼容：homepage/appearance/search 顶层块（对应 template-settings 的 x-tab 分块）
    // 摊平到顶层，顶层显式键优先；features 相关（comments/pages/rss/analytics）本就留顶层
    const BLOCKS = ['homepage', 'appearance', 'search']
    const flat: Record<string, any> = {}
    for (const b of BLOCKS) {
      const block = raw[b]
      if (block && typeof block === 'object') Object.assign(flat, block)
    }
    if (Object.keys(flat).length > 0) raw = { ...flat, ...raw }
    return {
        siteName: raw.siteName || raw.sitename || raw.site_name,
        siteDescription: raw.siteDescription || '',
        // 3.1.x 去 frontend 前缀（site 设置无 backend 对应物）；兼容旧键 frontendTheme 等
        theme: raw.theme ?? raw.frontendTheme,
        accent: raw.accent ?? raw.frontendAccent,
        background: readBackgroundUrl(),
        backgroundVideo: readBackgroundVideo(),
        backgroundPoster: readBackgroundPoster(),
        backgroundCandidates: readBackgroundUrlCandidates(),
        backgroundPosterCandidates: readBackgroundPosterCandidates(),
        backgroundMeta: readBackgroundMeta(),
        // 背景色持久化在 background.yml（3.1.x）；兼容旧键（baseColor* / backgroundColor* / frontend*）
        baseColorLight: raw.baseColorLight ?? raw.backgroundColorLight ?? raw.frontendBackgroundColorLight
          ?? parseBackgroundColor('baseColorLight') ?? parseBackgroundColor('backgroundColorLight') ?? '',
        baseColorDark: raw.baseColorDark ?? raw.backgroundColorDark ?? raw.frontendBackgroundColorDark
          ?? parseBackgroundColor('baseColorDark') ?? parseBackgroundColor('backgroundColorDark') ?? '',
        font: raw.font ?? raw.frontendFont,
        locale: raw.locale ?? raw.frontendLocale,
        // ── 开关按插件分组读取（site.yml 每插件一段，组内开关键 = featureFlag 名）──
        // 单功能插件（friends/collections/slides）site.yml 只存 enabled——页面开关 = 总开关，
        // 顶层镜像键（collectionPage/friendsPage/slides）作为派生值回退到组内 enabled（兼容旧消费方）
        collectionPage: raw.collections?.collectionPage ?? raw.collections?.enabled ?? raw.collectionPage ?? true,
        aboutPage: raw.aboutPage ?? true,
        friendsPage: raw.friends?.friendsPage ?? raw.friends?.enabled ?? raw.friendsPage ?? true,
        rss: raw.rss ?? true,
        searchSuggestions: raw.search?.searchSuggestions ?? true,
        globalSearch: raw.search?.globalSearch ?? raw.globalSearch ?? true,
        fullTextSearch: raw.search?.fullTextSearch ?? true,
        traffic: raw.traffic ?? raw.analytics?.enabled ?? false,
        // comments：enabled 总开关优先折叠；comments 子开关（评论区显隐）在其上叠加
        comments: raw.comments?.enabled === false ? false : (raw.comments?.comments ?? raw.comments ?? true),
        // 单功能插件（reading-experience）：组内只存 enabled——readingExperience 派生键回退到 enabled
        readingExperience: raw['reading-experience']?.enabled ?? true,
        slides: raw.slides?.slides ?? raw.slides?.enabled ?? true,
        // featureFlags 镜像（when.featureFlag 评估读这里）：组内开关键 + featureFlags 段 +
        // 顶层布尔键（兼容）；键名由插件声明（TEMPLATE_MANIFEST.plugins.featureFlag）
        featureFlags: {
            ...(raw.featureFlags || {}),
            searchSuggestions: raw.search?.searchSuggestions ?? raw.featureFlags?.searchSuggestions ?? true,
            globalSearch: raw.search?.globalSearch ?? raw.featureFlags?.globalSearch ?? true,
            fullTextSearch: raw.search?.fullTextSearch ?? raw.featureFlags?.fullTextSearch ?? true,
            comments: raw.comments?.enabled === false ? false : (raw.comments?.comments ?? raw.comments?.enabled ?? raw.featureFlags?.comments ?? true),
            readingExperience: raw['reading-experience']?.enabled ?? raw.featureFlags?.readingExperience ?? true,
            friendsPage: raw.friends?.friendsPage ?? raw.friends?.enabled ?? raw.featureFlags?.friendsPage ?? true,
            collectionPage: raw.collections?.collectionPage ?? raw.collections?.enabled ?? raw.featureFlags?.collectionPage ?? true,
            slides: raw.slides?.slides ?? raw.slides?.enabled ?? raw.featureFlags?.slides ?? true,
            aboutPage: raw.aboutPage ?? raw.featureFlags?.aboutPage ?? true,
            rss: raw.rss ?? raw.featureFlags?.rss ?? true,
            traffic: raw.traffic ?? raw.featureFlags?.traffic ?? raw.analytics?.enabled ?? false,
            ...Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'boolean')),
        },
        friendsCards: readFriendsCards(),
        friendsGlobalStyle: readFriendsGlobalStyle(),
        homepageMode: raw.homepageMode,
        singleColumnHomepage: raw.singleColumnHomepage,
        cardVisibility: raw.cardVisibility || {},
        recentUpdates: raw.recentUpdates || {},
        gaMeasurementId: raw.analytics?.gaMeasurementId ?? raw.gaMeasurementId,
        analytics: raw.analytics || {},
        icpNumber: raw.icpNumber || '',
        defaultPerformanceMode: raw.defaultPerformanceMode || 'auto',
        comment: raw.comment || {},
        post: normalizePostConfig(raw),
    };
}

/** Get author profile — avatar auto-discovered from data/avatar/ */
export function getProfile(): Record<string, unknown> {
    const data = readDataFile(PROFILE_FILE) || { name: '', bio: '', location: '', links: [] }
    // Auto-discover avatar from directory (like background)
    const avatarDir = path.join(DATA_DIR, 'avatar')
    try {
      if (fs.existsSync(avatarDir)) {
        const imgs = fs.readdirSync(avatarDir).filter(f => /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(f) && !f.startsWith('.'))
        if (imgs.length > 0) data.avatar = `/data/avatar/${imgs[0]}`
      }
    } catch {}
    // Resolve any asset:// URLs
    if (data.avatar) data.avatar = resolveAssetUrl(data.avatar as string)
    return data
}

/** Get collections data (single-file YAML) */
export function getCollections(): Record<string, unknown> {
    const data = readDataFile(COLLECTION_FILE)
    if (data) {
      const arr = Array.isArray(data) ? data : (data.collections || data.items || [])
      // Resolve asset:// URLs in collection covers
      const resolved = arr.map((c: any) => ({ ...c, cover: resolveAssetUrl(c.cover || '') }))
      return { collections: resolved }
    }
    return { collections: [] }
}

/**
 * Collection 内导航顺序：按 collections.yml nodes 树深度优先展平某 collection 的帖子 id
 * （保留人工定义的阅读顺序——collection 自带顺序，不按日期、不受 prevNextOrder 影响）。
 */
export function getCollectionPostIds(collectionName: string): string[] {
    const data = getCollections();
    const cols = Array.isArray(data?.collections) ? (data.collections as Record<string, any>[]) : [];
    const col = cols.find((c: any) => String(c.name || c.slug || '') === collectionName)
    if (!col) return []
    const ids: string[] = []
    const walk = (nodes: unknown[]) => {
      for (const node of nodes || []) {
        if (!node || typeof node !== 'object') continue
        const n = node as Record<string, any>
        if (n.type === 'post' && n.id) ids.push(String(n.id))
        if (n.type === 'group' && Array.isArray(n.children)) walk(n.children)
      }
    }
    walk(Array.isArray(col.nodes) ? col.nodes : [])
    return ids
}

// ── Comments ──────────────────────────────────────────────

/** Read comments for a post from data/comments/{postId}.json */
export function getComments(postId: string): ChronicleComment[] {
  const file = path.join(COMMENTS_DIR, `${postId}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build a nested tree from a flat parent-reference comment list (Staticman format).
 * Top-level comments have parent === null or undefined.
 * Each returned comment has its children in a `replies` array.
 */
export function buildCommentTree(flat: ChronicleComment[]): CommentTreeNode[] {
  const byParent = new Map<string, CommentTreeNode[]>();

  for (const c of flat) {
    const parentKey = c.parent || '__root__';
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey)!.push({ ...c, replies: [] });
  }

  function attachChildren(parent: CommentTreeNode): CommentTreeNode {
    const children = byParent.get(parent.id) || [];
    parent.replies = children.map(attachChildren);
    // Sort children by date ascending (oldest reply first)
    parent.replies.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return parent;
  }

  const roots = (byParent.get('__root__') || []).map(attachChildren);
  // Sort roots by date descending (newest top-level comment first)
  roots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return roots;
}

// ── Debug ────────────────────────────────────────────────

if (import.meta.env.DEV) {
  console.log('[localFs] DATA_DIR:', DATA_DIR);
  console.log('[localFs] Posts:', getAllPosts().length, '| Published:', getPublishedPosts().length);
}

// ── Adapter 出口 ─────────────────────────────────────────
// DataSource 契约实现（src/data/index.ts 为唯一注册点）。
export const localFsAdapter: DataSource = {
  getPublishedPosts,
  getPostById,
  getProfile,
  getPublicSettings,
  getComments,
  getCollections,
  getCollectionPostIds,
};
