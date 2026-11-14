/**
 * Chronicle Manager — 模板清单（Template Manifest，T5）
 *
 * 由 SCHEMA_REGISTRY 升级而来：除「schemaId → 文件」映射外，增加
 * 内容类型声明、插件配置注册、background 双位置声明——
 * manager 据此适配任意模板（做其他模板的 CMS），不再硬编码 chronicle 约定。
 *
 * 全部路径相对仓库根。
 */
import { collectionsMeta } from '../../../template-astro/src/plugins/collections/meta'
import { friendsMeta } from '../../../template-astro/src/plugins/friends/meta'
import { commentsMeta } from '../../../template-astro/src/plugins/comments/meta'
import { slidesMeta } from '../../../template-astro/src/plugins/slides/meta'
import { searchMeta } from '../../../template-astro/src/plugins/search/meta'
import { readingExperienceMeta } from '../../../template-astro/src/plugins/reading-experience/meta'
import '../plugins/collections'

export interface SchemaMapping {
  /** JSON Schema $id，如 "chronicle:template-settings" */
  schemaId: string
  /** 文件路径（相对仓库根） */
  filePath: string
  /** 文件格式 */
  format: 'yaml' | 'json'
  /**
   * Site-level feature flag（data/site.yml 顶层键）——置位时页面渲染主开关，
   * flag 关闭则编辑区整体禁用。
   */
  headerFlag?: string
  /** schema 内 x-nav 的 tab（template-settings 的多 tab schema 用） */
  tab?: string
}

/** 内容类型与文件约定（manager 读写内容的基础契约） */
export interface ContentTypeMapping {
  /** 内容目录（相对仓库根） */
  dir: string
  /** id 来源：目录名（posts）或文件名 */
  idFrom: 'dirname' | 'filename'
  /** 单篇内容文件名 */
  file: string
  /** 文件格式 */
  format: 'yaml' | 'markdown' | 'json'
}

/** 插件配置位置（插件 settingsSchema 声明的逻辑段 → schema 文件 + 配置落点） */
export interface PluginMapping {
  /** 插件逻辑段（插件 manifest.settingsSchema 声明的值） */
  key: string
  /** 承载该段设置的 schema $id */
  schemaId: string
  /** 配置写入位置（文件路径） */
  filePath: string
  format: 'yaml' | 'json'
  /** 插件名（插件总览页显示） */
  name: string
  /** 说明 */
  description: string
  /** 配置存储归属：'site' = 写 site.yml 段；'file' = 独立数据文件（friends.yml/collections.yml）；'post' = 文章级 frontmatter 配置 */
  storage?: 'site' | 'file' | 'post'
  /** 内置插件（随模板出厂，无独立配置页）——仅总览页 tag 提示，不影响存储 */
  builtin?: boolean
  /** 插件开关（site.yml featureFlags 键，总览页 toggle；缺省 = 无开关） */
  featureFlag?: string
  /** 内容编辑类插件（合集树/友链卡片等重 UI）——总览页标注，编辑在详情页 */
  contentEditor?: boolean
  /** 跳转入口：在 target schema 的设置页顶部注入「相关插件」链接（→ plugins/<key> 详情） */
  entries?: { target: string; label?: string }[]

}

/**
 * background 双位置声明：UI 显示在 appearance 分组，配置写入独立位置
 * （background.yml + 图片目录自动发现，URL 不写进 site.yml）。
 * —— T5 重构保持此分离为显式契约，读写实现不变。
 */
export interface BackgroundMapping {
  /** UI 所在 x-nav 分组（template-settings 的 appearance tab） */
  uiNav: string
  /** UI 所在 x-group（appearance 内的 background 分组） */
  uiGroup: string
  /** 元数据配置文件（mode/pos/blur/overlay/baseColor 等） */
  metaFile: string
  /** 背景媒体目录（图片/视频自动发现） */
  mediaDir: string
}

export interface TemplateManifest {
  /** 模板名（default: 'chronicle'；其他模板提供同名清单即可被 manager 适配） */
  name: string
  /** 设置 schema 注册（原 SCHEMA_REGISTRY） */
  settings: Record<string, SchemaMapping>
  /** 内容类型与文件约定 */
  contentTypes: Record<string, ContentTypeMapping>
  /** 插件配置位置（插件 settingsSchema → schema + 落点） */
  plugins: Record<string, PluginMapping>
  /** background 双位置声明 */
  background: BackgroundMapping
}

// ── 主清单：chronicle（默认模板）────────────────────────

const settings: Record<string, SchemaMapping> = {
  // 模板核心设置：schema 跟随模块拆分（原 template-settings 多 tab → 3 独立模块；功能开关模块 = 插件开关）
  'chronicle:homepage': {
    schemaId: 'chronicle:homepage',
    filePath: 'data/site.yml',
    format: 'yaml',
  },
  'chronicle:appearance': {
    schemaId: 'chronicle:appearance',
    filePath: 'data/site.yml',
    format: 'yaml',
  },
  'chronicle:system-settings': {
    schemaId: 'chronicle:system-settings',
    filePath: '.chronicle/workspace.json',
    format: 'json',
  },
  'chronicle:profile': {
    schemaId: 'chronicle:profile',
    filePath: 'data/profile.yml',
    format: 'yaml',
  },
  [collectionsMeta.schemaId]: {
    schemaId: collectionsMeta.schemaId,
    filePath: collectionsMeta.filePath,
    format: collectionsMeta.format,
    // 单功能插件：页面开关 = 插件总开关（组内 enabled，PluginSettings 管理）
  },
  [friendsMeta.schemaId]: {
    schemaId: friendsMeta.schemaId,
    filePath: friendsMeta.filePath,
    format: friendsMeta.format,
  },
  'chronicle:post-page': {
    schemaId: 'chronicle:post-page',
    filePath: 'data/site.yml',
    format: 'yaml',
  },
}

const contentTypes: Record<string, ContentTypeMapping> = {
  posts: { dir: 'data/posts', idFrom: 'dirname', file: 'index.md', format: 'markdown' },
  comments: commentsMeta.contentType,
  commentsPending: { dir: 'data/comments-pending', idFrom: 'filename', file: '*.json', format: 'json' },
  profile: { dir: 'data', idFrom: 'filename', file: 'profile.yml', format: 'yaml' },
  [collectionsMeta.key]: collectionsMeta.contentType,
  [friendsMeta.key]: friendsMeta.contentType,
}

// 插件配置位置：插件 settingsSchema 声明的逻辑段 → schema + 落点。
// 现状模式：search/comments 段在 template-settings.schema.json（site.yml）；friends 独立文件。
const plugins: Record<string, PluginMapping> = {
  search: {
    key: searchMeta.key,
    schemaId: searchMeta.schemaId,
    filePath: searchMeta.filePath,
    format: searchMeta.format,
    name: searchMeta.name,
    description: searchMeta.description,
    featureFlag: searchMeta.featureFlag,
    builtin: searchMeta.builtin,
    storage: searchMeta.storage,
    entries: searchMeta.entries,
  },
  friends: {
    key: friendsMeta.key,
    schemaId: friendsMeta.schemaId,
    filePath: friendsMeta.filePath,
    format: friendsMeta.format,
    name: friendsMeta.name,
    description: friendsMeta.description,
    featureFlag: friendsMeta.featureFlag,
    builtin: friendsMeta.builtin,
    storage: friendsMeta.storage,
    contentEditor: friendsMeta.contentEditor,
  },
  comments: {
    key: commentsMeta.key,
    schemaId: commentsMeta.schemaId,
    filePath: commentsMeta.filePath,
    format: commentsMeta.format,
    name: commentsMeta.name,
    description: commentsMeta.description,
    featureFlag: commentsMeta.featureFlag,
    builtin: commentsMeta.builtin,
    storage: commentsMeta.storage,
    entries: commentsMeta.entries,
  },
  slides: {
    key: slidesMeta.key,
    schemaId: slidesMeta.schemaId,
    filePath: slidesMeta.filePath,
    format: slidesMeta.format,
    name: slidesMeta.name,
    description: slidesMeta.description,
    featureFlag: slidesMeta.featureFlag,
    storage: slidesMeta.storage,
    builtin: slidesMeta.builtin,
  },
  collections: {
    key: collectionsMeta.key,
    schemaId: collectionsMeta.schemaId,
    filePath: collectionsMeta.filePath,
    format: collectionsMeta.format,
    name: collectionsMeta.name,
    description: collectionsMeta.description,
    featureFlag: collectionsMeta.featureFlag,
    builtin: collectionsMeta.builtin,
    storage: collectionsMeta.storage,
    contentEditor: collectionsMeta.contentEditor,
  },
  readingExperience: {
    key: readingExperienceMeta.key,
    schemaId: readingExperienceMeta.schemaId,
    filePath: readingExperienceMeta.filePath,
    format: readingExperienceMeta.format,
    name: readingExperienceMeta.name,
    description: readingExperienceMeta.description,
    featureFlag: readingExperienceMeta.featureFlag,
    builtin: readingExperienceMeta.builtin,
    storage: readingExperienceMeta.storage,
    entries: readingExperienceMeta.entries,
  },
}

export const TEMPLATE_MANIFEST: TemplateManifest = {
  name: 'chronicle',
  settings,
  contentTypes,
  plugins,
  background: {
    uiNav: 'appearance',
    uiGroup: 'background',
    metaFile: 'data/background/background.yml',
    mediaDir: 'data/background/',
  },
}

// ── 兼容导出（原 SCHEMA_REGISTRY API，消费方零改动）────────────────
export const SCHEMA_REGISTRY: Record<string, SchemaMapping> = settings

export function getMapping(schemaId: string): SchemaMapping | undefined {
  if (settings[schemaId]) return settings[schemaId]
  // 插件 schema（chronicle:search/comments/…）的 mapping 在 plugins 映射里——合并查找，
  // 否则插件详情页（/settings/plugins/<key>）useSchemaForm 拿不到 filePath
  const plugin = Object.values(plugins).find((p) => p.schemaId === schemaId)
  if (plugin) return { schemaId, filePath: plugin.filePath, format: plugin.format }
  return undefined
}

export function hasMapping(schemaId: string): boolean {
  return schemaId in settings || Object.values(plugins).some((p) => p.schemaId === schemaId)
}
