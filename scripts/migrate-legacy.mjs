#!/usr/bin/env node
/**
 * Chronicle Aurora — Legacy Data Migration
 *
 * Usage:
 *   node scripts/migrate-legacy.mjs data.tar.gz
 *
 * 1. Backs up data/ → data.bak/
 * 2. Extracts legacy archive
 * 3. Converts to Aurora format in-place in data/
 */

import { execSync } from 'node:child_process'
import YAML from 'yaml'
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, rmSync, copyFileSync, cpSync, statSync } from 'node:fs'
import { join, parse, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(__dirname, '..')
const DATA = join(REPO, 'data')
const DATA_BAK = join(REPO, 'data.bak')
const TMP = join(REPO, '.migrate-tmp')

const tarball = process.argv[2]
if (!tarball || !existsSync(tarball)) {
  console.error('Usage: node scripts/migrate-legacy.mjs <data.tar.gz>')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────

function slugify(text) {
  return (text || 'untitled')
    .toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function parseYaml(text) {
  const result = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^(?:-\s+)?(\w[\w-]*):\s*(.*)/)
    if (m) result[m[1]] = m[2].trim()
  }
  return result
}

function toYaml(obj, indent = '') {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `${indent}- ${toYaml(item, indent + '  ').trimStart()}`
      }
      return `${indent}- ${item}`
    }).join('\n')
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => {
        if (k.startsWith('_')) return ''
        if (typeof v === 'object') return `${indent}${k}:\n${toYaml(v, indent + '  ')}`
        // Only quote if contains newline or leading/trailing whitespace
        const sv = String(v)
        const needsQuote = sv.includes('\n') || sv !== sv.trim()
        const val = needsQuote ? `"${sv.replace(/"/g, '\\"')}"` : sv
        return `${indent}${k}: ${val}`
      }).filter(Boolean).join('\n')
  }
  return String(obj)
}

// ═══════════════════════════════════════════════════════════
// Step 1: Backup
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 1/6 Backing up data/ → data.bak/')
if (existsSync(DATA_BAK)) rmSync(DATA_BAK, { recursive: true, force: true })
if (existsSync(DATA)) {
  // cpSync 而非 `cp -r`：Windows 上 npm script 走 cmd.exe，没有 cp 命令
  cpSync(DATA, DATA_BAK, { recursive: true })
}

// ═══════════════════════════════════════════════════════════
// Step 2: Extract legacy
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 2/6 Extracting legacy archive')
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
execSync(`tar -xzf "${tarball}" -C "${TMP}"`)

// Find the extracted data directory
let legacyData = join(TMP, 'data')
if (!existsSync(legacyData)) {
  // Try one level deep
  const entries = readdirSync(TMP)
  for (const e of entries) {
    const candidate = join(TMP, e, 'data')
    if (existsSync(candidate)) { legacyData = candidate; break }
  }
}
if (!existsSync(legacyData)) {
  console.error('[migrate] Could not find data/ in archive. Found:')
  console.error(readdirSync(TMP))
  process.exit(1)
}

// ═══════════════════════════════════════════════════════════
// Step 3: Convert configs (JSON → YAML)
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 3/6 Converting configs JSON → YAML')

// Legacy JSON → structured YAML. The template's data/*.yml (schema defaults) is
// used as the base document, so hand-written comments and untouched keys survive.
const str = (value) => (value === undefined || value === null ? '' : String(value))
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

function readDoc(dest) {
  const file = join(DATA, dest)
  return existsSync(file)
    ? YAML.parseDocument(readFileSync(file, 'utf-8'), { keepSourceTokens: true })
    : new YAML.Document()
}

function writeDoc(dest, doc) {
  writeFileSync(join(DATA, dest), doc.toString({ lineWidth: -1 }), 'utf-8')
}

function migrateSettings(legacy) {
  const doc = readDoc('site.yml')

  doc.setIn(['homepage', 'siteName'], str(legacy.siteName || legacy.sitename))
  doc.setIn(['homepage', 'siteDescription'], str(legacy.siteDescription))
  doc.setIn(['homepage', 'icpNumber'], str(legacy.icpNumber))
  doc.setIn(['homepage', 'homepageMode'], str(legacy.homepageMode || 'split'))
  doc.setIn(['homepage', 'singleColumnHomepage'], bool(legacy.singleColumnHomepage, false))
  if (legacy.cardVisibility && typeof legacy.cardVisibility === 'object') {
    for (const [key, value] of Object.entries(legacy.cardVisibility)) {
      doc.setIn(['homepage', 'cardVisibility', key], !!value)
    }
  }

  doc.setIn(['appearance', 'theme'], str(legacy.frontendTheme || legacy.theme || 'follow'))
  doc.setIn(['appearance', 'accent'], str(legacy.frontendAccent || legacy.accent || '#10b981'))
  doc.setIn(['appearance', 'font'], str(legacy.frontendFont || legacy.font || 'sans'))
  doc.setIn(['appearance', 'locale'], str(legacy.frontendLocale || legacy.locale || 'follow'))

  doc.setIn(['rss'], bool(legacy.rss, true))
  doc.setIn(['analytics', 'enabled'], bool(legacy.traffic, false))
  if (legacy.gaMeasurementId) {
    doc.setIn(['analytics', 'backend'], 'ga')
    doc.setIn(['analytics', 'gaMeasurementId'], str(legacy.gaMeasurementId))
  }

  // Plugin blocks: single-purpose plugins keep only `enabled` (feature flag).
  doc.setIn(['search', 'enabled'], true)
  if (legacy.searchSuggestions !== undefined) doc.setIn(['search', 'searchSuggestions'], !!legacy.searchSuggestions)
  doc.setIn(['friends', 'enabled'], bool(legacy.friendsPage, true))
  doc.setIn(['collections', 'enabled'], bool(legacy.collectionPage, true))

  if (legacy.comment && typeof legacy.comment === 'object') {
    if (legacy.comment.enabled !== undefined) doc.setIn(['comments', 'enabled'], !!legacy.comment.enabled)
    if (legacy.comment.backend) doc.setIn(['comments', 'backend'], str(legacy.comment.backend))
    if (legacy.comment.walineServerUrl) doc.setIn(['comments', 'walineServerUrl'], str(legacy.comment.walineServerUrl))
  }

  // aboutPage is a site-level flag (x-site-flag in the profile schema), not a profile.yml key.
  doc.setIn(['aboutPage'], bool(legacy.aboutPage, true))

  writeDoc('site.yml', doc)
}

function migrateProfile(legacy) {
  const doc = readDoc('profile.yml')
  doc.setIn(['name'], str(legacy.name || 'Chronicle Aurora'))
  doc.setIn(['bio'], str(legacy.bio))
  doc.setIn(['location'], str(legacy.location))
  doc.setIn(['showProfileCard'], bool(legacy.showProfileCard, false))
  doc.setIn(['links'], (legacy.links || [])
    .filter((link) => link && (link.url || link.label))
    .map((link) => ({ label: str(link.label), url: str(link.url) })))
  writeDoc('profile.yml', doc)
}

function migrateFriends(legacy) {
  const doc = readDoc('friends.yml')
  if (legacy.globalStyle) doc.setIn(['globalStyle'], str(legacy.globalStyle))
  doc.setIn(['cards'], (legacy.cards || []).map((card) => ({
    name: str(card.name),
    avatar: str(card.avatar),
    intro: str(card.intro),
    homeUrl: str(card.homeUrl),
    storyPostId: str(card.storyPostId),
  })))
  writeDoc('friends.yml', doc)
}

function migrateCollections(legacy) {
  const doc = readDoc('collections.yml')
  const list = Array.isArray(legacy) ? legacy : (legacy.collections || [])
  doc.setIn(['collections'], list.map((collection) => ({
    name: str(collection.name),
    description: str(collection.description),
    cover: str(collection.cover),
    slug: str(collection.slug || slugify(collection.name || '')),
    nodes: collection.nodes || [],
  })))
  // Article-side navigation defaults (current collections schema).
  if (!doc.hasIn(['post', 'collectionNav', 'enabled'])) {
    doc.setIn(['post', 'collectionNav', 'enabled'], true)
    doc.setIn(['post', 'collectionNav', 'alwaysCollapsed'], false)
  }
  writeDoc('collections.yml', doc)
}

const handlers = {
  'settings.json': migrateSettings,
  'profile.json': migrateProfile,
  'friends.json': migrateFriends,
  'collections.json': migrateCollections,
}

for (const [src, handler] of Object.entries(handlers)) {
  const srcPath = join(legacyData, src)
  if (!existsSync(srcPath)) continue
  try {
    handler(JSON.parse(readFileSync(srcPath, 'utf-8')))
    console.log(`  ${src} → structured YAML`)
  } catch (e) { console.error(`  FAILED ${src}:`, e.message) }
}
// ═══════════════════════════════════════════════════════════
// Step 4: Migrate posts
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 4/6 Migrating posts (UUID → slug)')

const legacyPosts = join(legacyData, 'posts')
const legacyIndex = join(legacyPosts, 'index.json')
const legacyIndexData = existsSync(legacyIndex)
  ? JSON.parse(readFileSync(legacyIndex, 'utf-8'))
  : []
const indexEntries = Array.isArray(legacyIndexData) ? legacyIndexData : Object.values(legacyIndexData)

const newPostsDir = join(DATA, 'posts')
if (existsSync(newPostsDir)) {
  // Keep existing posts, only add new ones from legacy
}
mkdirSync(newPostsDir, { recursive: true })

const newIndex = {}
let postCount = 0

for (const entry of indexEntries) {
  const uuid = entry.id
  if (!uuid) continue

  // Slug = UUID (keep existing UUID as identifier)
  const slug = entry.slug || uuid

  // Find content files
  const legacyPostDir = join(legacyPosts, uuid)
  if (!existsSync(legacyPostDir)) continue

  const contentFiles = readdirSync(legacyPostDir).filter(f => f.endsWith('-content.md') && !f.endsWith('.bak'))
  if (contentFiles.length === 0) continue

  const srcFile = join(legacyPostDir, contentFiles[0])
  let raw = readFileSync(srcFile, 'utf-8')

  // Parse frontmatter
  let fm = {}
  let body = raw
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 3)
    if (end !== -1) {
      fm = parseYaml(raw.slice(3, end))
      body = raw.slice(end + 3).trim()
    }
  }

  // Fix status: modifying → draft
  let status = entry.status || 'draft'
  if (status === 'modifying') status = 'draft'

  // Replace upload/ URLs with asset:// protocol
  body = body.replace(/https?:\/\/[^)\s]*\/server\/data\/upload\/[^)\s]+/g, (url) => {
    const filename = basename(url.split('?')[0])
    return `asset://${filename}`
  })
  body = body.replace(/\/server\/data\/upload\/([^)\s]+)/g, (_, p) => {
    return `asset://${basename(p)}`
  })

  // Build new frontmatter
  const newFm = {
    title: entry.title || '',
    date: entry.date || new Date().toISOString(),
    tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : (entry.tags || ''),
    author: entry.author || '',
    aiGenerated: entry.aiGenerated || false,
    font: entry.font || 'sans',
    status,
  }
  if (entry.summary) newFm.summary = entry.summary

  // Write index.md
  const destDir = join(newPostsDir, slug)
  mkdirSync(destDir, { recursive: true })
  const indexMd = `---\n${toYaml(newFm)}\n---\n\n${body}\n`
  writeFileSync(join(destDir, 'index.md'), indexMd, 'utf-8')

  // Copy attachments (images etc.) from legacy post dir
  for (const f of readdirSync(legacyPostDir)) {
    if (f.endsWith('-content.md') || f.endsWith('.bak') || f.endsWith('-draft.md')) continue
    copyFileSync(join(legacyPostDir, f), join(destDir, f))
  }

  // Build index entry
  newIndex[slug] = {
    title: entry.title || '', date: entry.date || '', tags: Array.isArray(entry.tags) ? entry.tags : [],
    status, summary: entry.summary || '', font: entry.font || 'sans',
    author: entry.author || '', aiGenerated: entry.aiGenerated || false,
    type: (fm.marp === true || fm.marp === 'true') ? 'slides' : 'article',
  }

  postCount++
}

// Write new index.json
writeFileSync(join(newPostsDir, 'index.json'), JSON.stringify(newIndex, null, 2) + '\n', 'utf-8')
console.log(`  ${postCount} posts migrated`)

// ═══════════════════════════════════════════════════════════
// Step 5: Migrate assets (upload/ → assets/)
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 5/6 Migrating assets upload/ → assets/')

const legacyUpload = join(legacyData, 'upload')
const newAssets = join(DATA, 'assets')
mkdirSync(newAssets, { recursive: true })

if (existsSync(legacyUpload)) {
  let assetCount = 0
  function copyAssets(dir, base) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '.thumbs') continue
      const src = join(dir, entry.name)
      if (entry.isDirectory()) {
        copyAssets(src, base)
      } else {
        const dest = join(newAssets, entry.name)
        if (!existsSync(dest)) { copyFileSync(src, dest); assetCount++ }
      }
    }
  }
  copyAssets(legacyUpload, '')
  console.log(`  ${assetCount} assets migrated`)
}

// Handle about.md → __about__/index.md
const legacyAbout = join(legacyData, 'about.md')
const aboutDir = join(DATA, '__about__')
if (existsSync(legacyAbout)) {
  mkdirSync(aboutDir, { recursive: true })
  let aboutContent = readFileSync(legacyAbout, 'utf-8')
  // Replace upload URLs
  aboutContent = aboutContent.replace(/\/server\/data\/upload\/([^)\s]+)/g, (_, p) => `asset://${basename(p)}`)
  aboutContent = aboutContent.replace(/https?:\/\/[^)\s]*\/server\/data\/upload\/([^)\s]+)/g, (_, p) => `asset://${basename(p)}`)
  const aboutMd = `---\ntitle: About\ndate: ${new Date().toISOString().split('T')[0]}\nstatus: published\n---\n\n${aboutContent}\n`
  writeFileSync(join(aboutDir, 'index.md'), aboutMd, 'utf-8')
  console.log('  about.md → __about__/index.md')
}

// ═══════════════════════════════════════════════════════════
// Step 6: Cleanup
// ═══════════════════════════════════════════════════════════

console.log('[migrate] 6/6 Cleanup')

// Delete index.json (Aurora rebuilds on demand)
const indexFile = join(DATA, 'posts', 'index.json')
try { rmSync(indexFile); console.log('  Deleted posts/index.json (will be rebuilt)') } catch {}

// Delete legacy files we don't need
for (const file of ['security.json', 'settings.json', 'profile.json', 'friends.json', 'collections.json', '.schema-version']) {
  try { rmSync(join(DATA, file)); console.log(`  Deleted ${file}`) } catch {}
}

// Remove branding/ and manager-background/ (replaced by background/ + avatar/)
for (const dir of ['branding', 'manager-background', 'upload']) {
  try { rmSync(join(DATA, dir), { recursive: true, force: true }); console.log(`  Deleted ${dir}/`) } catch {}
}

// Clean up tmp
rmSync(TMP, { recursive: true, force: true })

console.log('\n✅ Migration complete!')
console.log(`   Backup: ${DATA_BAK}`)
console.log(`   Posts:  ${postCount}`)
