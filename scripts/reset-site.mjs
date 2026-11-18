#!/usr/bin/env node
/**
 * Chronicle Aurora — 重置模板设置（全局重置 ①）
 *
 * 将 data/ 下的模板设置文件重置为各 schema 的 default 值（即「我们目前的配置」）：
 *   - data/site.yml          ← homepage + appearance 默认树 + post-page 的 post 子树
 *   - data/profile.yml       ← profile 默认
 *   - data/friends.yml       ← friends 默认（友链卡片清空）
 *   - data/collections.yml   ← collections 默认（合集清空、文章内合集导航回默认）
 *   - data/background/background.yml ← 背景 meta 默认（含 baseColorLight/Dark）
 *
 * schema 位置与 manager 的模板清单（packages/manager/src/data/schemaRegistry.ts）一致：
 * 原 template-settings 多 tab 大 schema 已拆成 homepage / appearance / post-page 三个模块，
 * friends / collections 随插件放在各自 src/plugins/<key>/schema.json。
 *
 * 使用 yaml Document API（keepSourceTokens）只更新被重置的路径，保留手写注释与未涉及键。
 *
 * 用法: node scripts/reset-site.mjs [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { REPO_ROOT, buildSchemaDefaults, readSchema, BACKGROUND_META_DEFAULTS } from './lib/schema-defaults.mjs'

const DRY_RUN = process.argv.includes('--dry-run')

// 写入 data/site.yml 的模板核心模块（按顺序合并默认树）
const SITE_SCHEMAS = [
  'packages/template-astro/schemas/homepage.schema.json',
  'packages/template-astro/schemas/appearance.schema.json',
]
// 文章页基础：只取 post 子树写入 site.yml
const POST_PAGE_SCHEMA = 'packages/template-astro/schemas/post-page.schema.json'
// 独立文件 schema
const FILE_SCHEMAS = [
  { schemaPath: 'packages/template-astro/schemas/profile.schema.json', file: 'data/profile.yml' },
  { schemaPath: 'packages/template-astro/src/plugins/friends/schema.json', file: 'data/friends.yml' },
  { schemaPath: 'packages/template-astro/src/plugins/collections/schema.json', file: 'data/collections.yml' },
]

function resolveRepoPath(rel) { return path.join(REPO_ROOT, rel) }

function readText(rel) {
  const abs = resolveRepoPath(rel)
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : ''
}

function writeText(rel, content) {
  const abs = resolveRepoPath(rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf-8')
}

/** Document API 增量合并：只 setIn payload 涉及的路径，保留注释与其他键 */
function applyPayload(doc, payload, prefix = []) {
  for (const [k, v] of Object.entries(payload || {})) {
    const p = [...prefix, k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (doc.getIn(p) === undefined || doc.getIn(p) === null) doc.setIn(p, {})
      applyPayload(doc, v, p)
    } else {
      doc.setIn(p, v)
    }
  }
}

/**
 * 剔除不写入本文件的字段：
 *   - x-persist:false（UI 虚拟：background / backgroundMeta / avatar）
 *   - x-file（跨文件持久化：baseColorLight/Dark → background.yml，单独重置）
 *   - x-site-flag（值存 site.yml 而非本 schema 文件：profile.aboutPage / friends.friendsGlobalStyle）
 *   - $ 前缀虚拟键（$about_edit 等）
 */
function stripVirtual(defaults, schema) {
  const out = {}
  for (const [k, v] of Object.entries(defaults)) {
    const prop = schema?.properties?.[k]
    if (k.startsWith('$')) continue
    if (prop?.['x-persist'] === false) continue
    if (prop?.['x-file']) continue
    if (prop?.['x-site-flag']) continue
    if (prop?.['x-widget'] === 'fieldset' && prop.properties) {
      out[k] = stripVirtual(v, prop)
    } else {
      out[k] = v
    }
  }
  return out
}

/** 数组 schema 整体替换：保留头部注释，正文按默认序列化 */
function writeArrayFile(file, schema, existing) {
  const fresh = YAML.stringify(schema.default ?? [], { lineWidth: -1 })
  const headComments = (existing || '').split('\n').filter((l) => l.startsWith('#')).join('\n')
  const body = headComments ? headComments + '\n' + fresh : fresh
  if (!DRY_RUN) writeText(file, body)
  log(file + ' 已重置（保留头部注释）' + (DRY_RUN ? '（dry-run）' : ''))
}

function log(...args) { console.log('[reset-site]', ...args) }

async function main() {
  if (DRY_RUN) log('DRY RUN — 不写入文件')

  // ── 1. site.yml：homepage + appearance 默认树 + post-page 的 post 子树 ──
  const siteDefaults = Object.assign(
    {},
    ...SITE_SCHEMAS.map((schemaPath) => {
      const sch = readSchema(schemaPath)
      return stripVirtual(buildSchemaDefaults(sch), sch)
    }),
  )
  const ppSchema = readSchema(POST_PAGE_SCHEMA)
  siteDefaults.post = stripVirtual(buildSchemaDefaults(ppSchema).post || {}, ppSchema.properties?.post || {})
  log('site.yml 重置键:', Object.keys(siteDefaults).join(', '))

  const siteExisting = readText('data/site.yml')
  const siteDoc = siteExisting ? YAML.parseDocument(siteExisting, { keepSourceTokens: true }) : new YAML.Document()
  applyPayload(siteDoc, siteDefaults)
  if (!DRY_RUN) writeText('data/site.yml', siteDoc.toString({ lineWidth: -1 }))
  log('data/site.yml 已重置' + (DRY_RUN ? '（dry-run）' : ''))

  // ── 2. profile / friends / collections ──
  for (const { schemaPath, file } of FILE_SCHEMAS) {
    const sch = readSchema(schemaPath)
    const existing = readText(file)

    // 顶层数组 schema（collections 老格式）→ 整体替换
    if (sch.type === 'array') {
      writeArrayFile(file, sch, existing)
      continue
    }

    const defaults = stripVirtual(buildSchemaDefaults(sch), sch)
    const doc = existing ? YAML.parseDocument(existing, { keepSourceTokens: true }) : new YAML.Document()
    applyPayload(doc, defaults)
    if (!DRY_RUN) writeText(file, doc.toString({ lineWidth: -1 }))
    log(file + ' 已重置' + (DRY_RUN ? '（dry-run）' : ''))
  }

  // ── 3. background.yml：背景 meta 重置（含 baseColorLight/Dark）──
  const bgFile = 'data/background/background.yml'
  const bgExisting = readText(bgFile)
  const bgDoc = bgExisting ? YAML.parseDocument(bgExisting, { keepSourceTokens: true }) : new YAML.Document()
  applyPayload(bgDoc, BACKGROUND_META_DEFAULTS)
  if (!DRY_RUN) writeText(bgFile, bgDoc.toString({ lineWidth: -1 }))
  log(bgFile + ' 已重置' + (DRY_RUN ? '（dry-run）' : ''))

  log('完成' + (DRY_RUN ? '（dry-run，未写入）' : ' — 可 git diff 检查后提交'))
}

main().catch((e) => { console.error('[reset-site] 失败:', e); process.exit(1) })
