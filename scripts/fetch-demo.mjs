#!/usr/bin/env node
/**
 * Chronicle Aurora — 取演示站内容
 *
 * 演示站（https://chr.eightyfor.top）的内容放在 `demo` 分支上，仓库默认分支只放模板。
 * 这样「Use this template」拿到的仓库是干净的（data/ 只有 schema 默认值），
 * 而演示站又始终用 main 的代码 + demo 分支的内容构建，不会与模板漂移。
 *
 * demo/ 是 gitignore 的，所以你可以在本地改它做实验；再次 fetch 会覆盖这些改动，
 * 因此默认先比对、发现有本地改动就拒绝（--force 强制覆盖）。
 *
 * 用法:
 *   npm run demo:fetch                 # origin/demo → ./demo
 *   npm run demo:fetch -- --dry-run    # 只比对，不写入
 *   npm run demo:fetch -- --force      # 覆盖本地改动
 *   npm run demo:fetch -- demo         # 指定 ref
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = path.join(ROOT, 'demo')

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const DRY_RUN = argv.includes('--dry-run')
const REQUESTED = argv.find((arg) => !arg.startsWith('--')) || 'origin/demo'

function git(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return { status: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() }
}

function resolveRef() {
  for (const ref of [REQUESTED, 'demo']) {
    if (git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0) return ref
  }
  return null
}

// Generated during builds; comparing it would make every build look like a local edit.
const IGNORED = new Set(['demo/posts/index.json'])

/**
 * Hash working files the way git would (honouring .gitattributes / core.autocrlf),
 * so a CRLF checkout does not look like a local modification.
 */
function hashWorkingFiles(rels) {
  const res = spawnSync('git', ['hash-object', '--stdin-paths'], { cwd: ROOT, input: rels.join('\n') })
  if (res.status !== 0) return new Map()
  const lines = res.stdout.toString('utf8').trim().split('\n')
  const map = new Map()
  rels.forEach((rel, i) => map.set(rel, lines[i]))
  return map
}

function listRefFiles(ref) {
  const res = spawnSync('git', ['ls-tree', '-r', '-z', ref, 'demo'], { cwd: ROOT })
  if (res.status !== 0) return new Map()
  const files = new Map()
  for (const entry of res.stdout.toString('utf8').split('\0')) {
    if (!entry) continue
    const tab = entry.indexOf('\t')
    if (tab === -1) continue
    const [mode, type, sha] = entry.slice(0, tab).split(' ')
    const rel = entry.slice(tab + 1)
    if (type !== 'blob') continue
    files.set(rel, { sha, mode })
  }
  return files
}

function listWorkingFiles() {
  const files = new Set()
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else files.add(path.relative(ROOT, abs).split(path.sep).join('/'))
    }
  }
  walk(TARGET)
  return files
}

/** Compare ./demo against the ref tree. Returns { changed: [], missing: [], extra: [] }. */
function compare(refFiles) {
  const working = listWorkingFiles()
  const changed = []
  const missing = []
  const present = []
  for (const [rel, { sha }] of refFiles) {
    if (IGNORED.has(rel)) continue
    if (!fs.existsSync(path.join(ROOT, rel))) {
      missing.push(rel)
      continue
    }
    present.push(rel)
  }
  const hashes = hashWorkingFiles(present)
  for (const rel of present) {
    if (hashes.get(rel) !== refFiles.get(rel).sha) changed.push(rel)
  }
  const extra = [...working].filter((rel) => !refFiles.has(rel) && !IGNORED.has(rel))
  return { changed, missing, extra }
}

function countFiles(dir) {
  let n = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name))
      else n++
    }
  }
  try { walk(dir) } catch { /* ignore */ }
  return n
}

function main() {
  const ref = resolveRef()
  if (!ref) {
    console.error(`[demo] 找不到演示分支 ${REQUESTED}（也没有本地 demo 分支）。`)
    console.error('[demo] 由本模板生成的仓库没有 demo 分支 —— 直接用你的 data/ 即可。')
    process.exit(1)
  }

  const refFiles = listRefFiles(ref)
  if (refFiles.size === 0) {
    console.error(`[demo] ${ref} 里没有 demo/ 内容，拒绝继续。`)
    process.exit(1)
  }

  const local = compare(refFiles)
  const dirty = local.changed.length + local.missing.length + local.extra.length > 0

  if (dirty) {
    console.warn('[demo] demo/ 与 ' + ref + ' 有差异：')
    for (const f of local.changed) console.warn(`  modified: ${f}`)
    for (const f of local.missing) console.warn(`  missing:  ${f}`)
    for (const f of local.extra) console.warn(`  extra:    ${f}`)
    if (DRY_RUN) {
      console.warn('[demo] --dry-run：未写入。')
      process.exit(0)
    }
    if (!FORCE) {
      console.error('[demo] 继续会覆盖这些本地改动。确认要覆盖请加 --force。')
      process.exit(1)
    }
    console.warn('[demo] --force：覆盖本地改动。')
  } else if (DRY_RUN) {
    console.log(`[demo] demo/ 与 ${ref} 一致（${refFiles.size} 个文件）。`)
    process.exit(0)
  }

  // 从 demo 分支取出 demo/ 目录：checkout 会写工作区并暂存，随后 unstage 保持干净。
  // demo/ 在 .gitignore 里，所以不会混进你的提交。
  const co = git(['checkout', ref, '--', 'demo'])
  if (co.status !== 0) {
    console.error('[demo] 取出失败:', co.stderr || co.stdout)
    process.exit(1)
  }
  git(['reset', '-q', '--', 'demo'])

  console.log(`[demo] 已从 ${ref} 取到 demo/（${countFiles(TARGET)} 个文件）`)
  console.log('[demo] 预览: npm run dev:demo   /   构建: npm run build:demo')
}

main()
