/**
 * Chronicle Post Types
 *
 * 数据契约对齐 Aurora 现状（docs/cleanup-plan.md 类型对齐）：
 * - id = 文章目录名（slug 优先，CJK 兜底随机），非 UUID
 * - 正文 = posts/<id>/index.md（非 <uuid>-content.md）
 * - 真相源 = data/（posts/index.json 是派生索引）
 */

/** TOC entry generated from markdown headings */
export interface TocEntry {
  id: string
  text: string
  level: number
}

/** A post entry in posts/index.json — metadata only, no body */
export interface PostMeta {
  /** 目录名（slug 优先，CJK/emoji 兜底 crypto.randomUUID()）——创建后不可变 */
  id: string
  title: string
  /** ISO 8601 creation date */
  date: string
  /** ISO 8601 last-modification date */
  updatedAt: string
  /** 磁盘文件名（index.md） */
  filename: string
  /** First ~200 chars of content, used in list views */
  summary: string
  tags: string[]
  /** published | draft */
  status: PostStatus
  /** Font preference: "sans" | "serif" */
  font: string
  /** Generic plugin-owned metadata (e.g. { collections: { name, path } }). */
  extensions?: Record<string, unknown>
  author: string
  aiGenerated: boolean
  /** Directory name (= id, used on disk) */
  dir: string
  toc: TocEntry[]
  /** True if a compiled HTML version exists on disk */
  hasHtml?: boolean
  /** Content type: 'article' (default) or 'slides' */
  type?: PostType
  /** Slide layout mode, only meaningful when type='slides' */
  layout?: SlideLayout
  /** Slideshow configuration, only meaningful when type='slides' */
  slideshow?: SlideshowConfig
}

/** Full post including markdown body and compiled HTML */
export interface Post extends PostMeta {
  /** Markdown 正文（posts/<id>/index.md 去 frontmatter） */
  content: string
  /** 编译后的 HTML（构建期渲染；可能为空） */
  compiledHtml: string
}

export type PostStatus = 'published' | 'draft'

export type PostType = 'article' | 'slides'

export type SlideLayout = 'slideshow' | 'cover' | 'section'

export interface SlideshowConfig {
  /** Marp theme name. Built-in: 'default' | 'gaia' | 'uncover' | 'chronicle'.
   *  Also accepts a custom CSS file path or URL. Default: 'chronicle' */
  theme?: string
  /** Slide aspect ratio. Default: '16:9'. Cover layout may use '21:9' or '2:1' */
  ratio?: '16:9' | '4:3' | '21:9' | '2:1'
  /** Global footer text shown on every slide */
  footer?: string
}

/** Input for creating or updating a post via API */

/** Normalized post shape sent to public consumers (no draft content, no internals) */

/** Paginated post list response */

/** Arguments for listing posts */
