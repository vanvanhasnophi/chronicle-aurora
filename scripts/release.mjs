#!/usr/bin/env node
/**
 * Chronicle Aurora — 版本提升（单一来源：根 package.json）
 *
 * 一次同步：根 package.json → 4 个 workspace → package-lock 的版本字段 → CHANGELOG 新章节。
 * 不会自动 commit / push；加 --tag 时只打本地 tag，推不推由你决定。
 *
 * 用法:
 *   npm run release -- 3.1.0 --dry-run
 *   npm run release -- 3.1.0
 *   npm run release -- 3.1.0 --tag
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACES = ['packages/template-astro', 'packages/manager', 'packages/gen', 'packages/shared']
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const makeTag = args.includes('--tag')
const version = args.find((arg) => !arg.startsWith('--'))

if (!version || !SEMVER.test(version)) {
  console.error('Usage: npm run release -- <major.minor.patch> [--dry-run] [--tag]')
  process.exit(1)
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8'))
}

function writeJson(rel, data) {
  const abs = path.join(ROOT, rel)
  if (dryRun) return
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

const changes = []

for (const rel of ['package.json', ...WORKSPACES.map((dir) => `${dir}/package.json`)]) {
  const pkg = readJson(rel)
  if (pkg.version === version) {
    changes.push(`${rel}: already ${version}`)
    continue
  }
  changes.push(`${rel}: ${pkg.version || '(none)'} → ${version}`)
  if (pkg.private !== false && rel === 'package.json' && pkg.private !== true) {
    // root package is private today; keep whatever value it has
  }
  pkg.version = version
  writeJson(rel, pkg)
}

// Keep package-lock's workspace version fields in sync (npm ci checks them).
const lockRel = 'package-lock.json'
if (fs.existsSync(path.join(ROOT, lockRel))) {
  const lock = readJson(lockRel)
  for (const dir of WORKSPACES) {
    if (lock.packages?.[dir] && lock.packages[dir].version !== version) {
      lock.packages[dir].version = version
    }
  }
  if (lock.packages?.[''] && lock.packages[''].version !== version) {
    lock.packages[''].version = version
  }
  writeJson(lockRel, lock)
  changes.push(`${lockRel}: workspace version fields → ${version}`)
}

// Keep per-package lockfiles in sync too: the deploy workflow runs
// `npm install` inside packages/*, and `npm ci` inside a package must agree
// with its package.json.
for (const dir of WORKSPACES) {
  const rel = `${dir}/package-lock.json`
  if (!fs.existsSync(path.join(ROOT, rel))) continue
  const lock = readJson(rel)
  let changed = false
  if (lock.version !== undefined && lock.version !== version) {
    lock.version = version
    changed = true
  }
  if (lock.packages?.[''] && lock.packages[''].version !== undefined && lock.packages[''].version !== version) {
    lock.packages[''].version = version
    changed = true
  }
  if (changed) {
    writeJson(rel, lock)
    changes.push(`${rel}: version → ${version}`)
  }
}

// Keep the README version badge in sync (static shields.io badge).
for (const rel of ['README.md', 'README.zh.md']) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) continue
  const text = fs.readFileSync(abs, 'utf-8')
  const encoded = version.replace(/-/g, '--')
  const next = text.replace(
    /https:\/\/img\.shields\.io\/badge\/version-[^)\s]+/,
    `https://img.shields.io/badge/version-${encoded}-2f855a`,
  )
  if (next === text) continue
  if (!dryRun) fs.writeFileSync(abs, next, 'utf-8')
  changes.push(`${rel}: version badge → ${version}`)
}

// Start a new CHANGELOG section so the current [Unreleased] entries become the release.
const changelogRel = 'CHANGELOG.md'
if (fs.existsSync(path.join(ROOT, changelogRel))) {
  const text = fs.readFileSync(path.join(ROOT, changelogRel), 'utf-8')
  if (text.includes(`## [${version}]`)) {
    changes.push(`${changelogRel}: section for ${version} already exists`)
  } else if (text.includes('## [Unreleased]')) {
    const date = new Date().toISOString().slice(0, 10)
    const next = text.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] — ${date}`)
    if (!dryRun) fs.writeFileSync(path.join(ROOT, changelogRel), next, 'utf-8')
    changes.push(`${changelogRel}: new section [${version}] — ${date}`)
  }
}

for (const line of changes) console.log(dryRun ? `[dry-run] ${line}` : line)

if (makeTag) {
  if (dryRun) {
    console.log(`[dry-run] git tag v${version}`)
  } else {
    execFileSync('git', ['tag', `v${version}`], { cwd: ROOT, stdio: 'inherit' })
    console.log(`tagged v${version}`)
  }
}

console.log('')
console.log('Next steps:')
console.log(`  1. review:  git diff --stat`)
console.log(`  2. commit:  git commit -am "chore(release): ${version}"`)
console.log(`  3. push:    git push${makeTag ? ' && git push --tags' : ''}`)
