/**
 * Chronicle Gen — Post Index Builder
 *
 * Generates data/posts/index.json from the posts/ directory.
 * Pure function: reads posts/ + collections.yml → writes index.json.
 * Callable from CMS (via Electron IPC), gen build, CI/CD, or CLI.
 *
 * This is the CANONICAL implementation. All index generation flows
 * through rebuildPostIndex() — no other code should build or patch
 * index.json directly.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import YAML from 'yaml'
import { extractBodySummary } from '../../../shared/src/utils/summary.ts'

/**
 * @typedef {Object} IndexEntry
 * @property {string} title
 * @property {string} date
 * @property {string[]} tags
 * @property {string} status
 * @property {string} [summary]
 * @property {string} [font]
 * @property {string} [author]
 * @property {string[]} [authors]
 * @property {boolean} [aiGenerated]
 * @property {'article'|'slides'} [type]
 * @property {Record<string, unknown>} [extensions]
 */

/**
 * @typedef {Object.<string, import('./indexer.mjs').IndexEntry>} IndexOutput
 */

/**
 * Parse simple YAML frontmatter key:value pairs from markdown text.
 * Handles comma-separated tags, booleans, numbers, quoted strings.
 * @param {string} raw
 * @returns {Record<string, any>}
 */
function parseFrontmatter(raw) {
  const fm = {}
  if (!raw.startsWith('---')) return fm
  const end = raw.indexOf('---', 3)
  if (end === -1) return fm

  const block = raw.slice(3, end)
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()

    if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (val === 'null' || val === '~' || val === '') val = null
    else if (/^\d+(\.\d+)?$/.test(val)) val = Number(val)
    else val = val.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')

    if (key === 'tags' && typeof val === 'string') {
      val = val.split(',').map(s => s.trim()).filter(Boolean)
    }

    fm[key] = val
  }
  return fm
}

/**
 * Build collection→post reverse index from collections.yml.
 * Each post maps to the FIRST collection that contains it (collections.yml order).
 * Keep this in sync with template-astro localFs.resolveCollectionAssignments.
 * @param {string} dataDir
 * @returns {Map<string, { collection: string; collectionPath: string }>}
 */
function collectionsEnabled(dataDir) {
  const siteFile = path.join(dataDir, 'site.yml')
  if (!fs.existsSync(siteFile)) return true
  try {
    const site = YAML.parse(fs.readFileSync(siteFile, 'utf-8')) || {}
    const cfg = site.collections || {}
    return cfg.enabled !== false && cfg.collectionPage !== false
  } catch {
    return true
  }
}

function buildCollectionIndex(dataDir) {
  const map = new Map()
  if (!collectionsEnabled(dataDir)) return map
  const file = path.join(dataDir, 'collections.yml')
  if (!fs.existsSync(file)) return map

  try {
    const data = YAML.parse(fs.readFileSync(file, 'utf-8'))
    const cols = Array.isArray(data) ? data : (data?.collections || [])

    /**
     * @param {any[]} nodes
     * @param {string} colName
     * @param {string[]} parents
     */
    function walk(nodes, colName, parents) {
      if (!Array.isArray(nodes)) return
      for (const node of nodes) {
        if (node?.type === 'post' && node.id) {
          const collectionPath = parents.length > 0
            ? `${colName} / ${parents.join(' / ')}`
            : colName
          const id = String(node.id)
          if (!map.has(id)) {
            map.set(id, { collection: colName, collectionPath })
          }
        }
        if (node?.type === 'group' && Array.isArray(node.children)) {
          walk(node.children, colName, [...parents, node.title || 'Untitled'])
        }
      }
    }

    for (const col of cols) {
      if (col.name && Array.isArray(col.nodes)) walk(col.nodes, col.name, [])
    }
  } catch { /* collections.yml may not exist or be malformed */ }

  return map
}

/**
 * Build the complete posts index from the posts/ directory.
 * Includes both article metadata AND collection assignments in one pass.
 *
 * @param {string} dataDir — path to the data/ directory
 * @returns {IndexOutput}
 */
export function buildPostIndex(dataDir) {
  const postsDir = path.join(dataDir, 'posts')
  /** @type {IndexOutput} */
  const index = {}

  if (!fs.existsSync(postsDir)) return index

  const collectionIndex = buildCollectionIndex(dataDir)

  for (const entry of fs.readdirSync(postsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const slug = entry.name
    const mdPath = path.join(postsDir, slug, 'index.md')
    if (!fs.existsSync(mdPath)) continue

    const raw = fs.readFileSync(mdPath, 'utf-8')
    const fm = parseFrontmatter(raw)

    const collectionInfo = collectionIndex.get(slug)
    const summary = fm.summary || extractBodySummary(raw)
    // 多作者：author 逗号分隔（同 tags 约定）；author 保留首个以兼容单值消费方，authors 存完整列表
    const authors = typeof fm.author === 'string'
      ? fm.author.split(',').map((s) => s.trim()).filter(Boolean)
      : []
    /** @type {IndexEntry} */
    const out = {
      title: fm.title || slug,
      date: fm.date || new Date().toISOString(),
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      status: fm.status || 'draft',
      summary,
      font: fm.font,
      author: authors[0] || null,
      authors: authors.length ? authors : undefined,
      aiGenerated: fm.aiGenerated,
      type: fm.marp ? 'slides' : (fm.type || 'article'),
    }
    if (collectionInfo) {
      out.extensions = {
        ...(out.extensions || {}),
        collections: {
          name: collectionInfo.collection,
          path: collectionInfo.collectionPath,
        },
      }
    }
    index[slug] = out
  }

  return index
}

/**
 * Rebuild and write index.json. Returns the number of posts indexed.
 * This is the SINGLE CANONICAL entry point for index generation.
 *
 * @param {string} dataDir — path to the data/ directory
 * @returns {number} count of posts indexed
 */
export function rebuildPostIndex(dataDir) {
  const index = buildPostIndex(dataDir)
  const indexFile = path.join(dataDir, 'posts', 'index.json')
  fs.mkdirSync(path.dirname(indexFile), { recursive: true })
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n', 'utf-8')
  return Object.keys(index).length
}
