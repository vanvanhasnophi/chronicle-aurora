#!/usr/bin/env node
/**
 * Chronicle Aurora — 把本地 `demo/` 的改动提交到 `demo` 分支
 *
 * `demo/` 在 main 上是 gitignore 的（内容是 `demo` 分支的检出副本），所以普通
 * `git commit` 不会带上它。这个脚本用一个临时 index：先读入 demo 分支的树，
 * 再把当前 `demo/` 的改动写进去、生成提交并更新本地 `demo` 分支——不碰 main 的
 * 工作区与暂存区。
 *
 * 用法:
 *   npm run demo:commit -- "docs(demo): update getting-started"
 *   npm run demo:commit -- --push "docs(demo): ..."
 *   npm run demo:commit -- --branch=demo-test "..."   # 演练用
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_DIR = path.join(ROOT, 'demo')

const argv = process.argv.slice(2)
const push = argv.includes('--push')
const branch = (argv.find((arg) => arg.startsWith('--branch=')) || '').split('=')[1] || 'demo'
const message = argv.filter((arg) => !arg.startsWith('--')).join(' ').trim()

if (!message) {
  console.error('Usage: npm run demo:commit -- "<commit message>" [--push] [--branch=demo]')
  process.exit(1)
}

if (!fs.existsSync(DEMO_DIR)) {
  console.error('[demo] 没有 demo/ —— 先运行: npm run demo:fetch')
  process.exit(1)
}

function git(args, options = {}) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...options })
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${res.stderr || res.stdout}`)
  }
  return (res.stdout || '').trim()
}

const ref = `refs/heads/${branch}`
try {
  git(['rev-parse', '--verify', ref])
} catch {
  console.error(`[demo] 本地没有 ${branch} 分支 —— 先运行: npm run demo:fetch`)
  process.exit(1)
}

const parent = git(['rev-parse', ref])
const indexFile = path.join(os.tmpdir(), `chronicle-demo-index-${Date.now()}`)
const env = { ...process.env, GIT_INDEX_FILE: indexFile }

try {
  // Seed the temporary index from the branch tree, then stage the working copy
  // of demo/ into it (force, because the path is git-ignored on main).
  git(['read-tree', ref], { env })
  git(['add', '-A', '-f', '--', 'demo'], { env })
  const tree = git(['write-tree'], { env })

  if (tree === git(['rev-parse', `${ref}^{tree}`])) {
    console.log('[demo] demo/ 与分支一致，没有可提交的改动。')
    process.exit(0)
  }

  const commit = git(['commit-tree', tree, '-p', parent, '-m', message], { env })
  git(['update-ref', ref, commit, parent])

  const changed = git(['diff', '--name-only', parent, commit])
  console.log(`[demo] 已提交 ${commit.slice(0, 7)} 到 ${branch}`)
  console.log(changed.split('\n').filter(Boolean).map((file) => `  ${file}`).join('\n'))
} finally {
  fs.rmSync(indexFile, { force: true })
}

if (push) {
  git(['push', 'origin', branch], { stdio: 'inherit' })
  console.log(`[demo] pushed ${branch} — the deploy workflow runs on its own`)
} else {
  console.log(`[demo] 下一步: git push origin ${branch}`)
}
