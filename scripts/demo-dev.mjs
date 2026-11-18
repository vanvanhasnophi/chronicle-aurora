#!/usr/bin/env node
/**
 * Chronicle Aurora — 用演示站内容启动开发服务器
 *
 * 等价于 `CHRONICLE_DATA_DIR=demo npm run dev:astro`，但跨平台。
 * 需要先 `npm run demo:fetch`。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_DIR = path.join(ROOT, 'demo')

if (!fs.existsSync(DEMO_DIR)) {
  console.error('[dev:demo] 还没有 demo/ —— 先运行: npm run demo:fetch')
  process.exit(1)
}

const res = spawnSync('npm', ['run', 'dev', '--workspace=@chronicle/template-astro'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, CHRONICLE_DATA_DIR: DEMO_DIR },
  shell: process.platform === 'win32',
})

process.exit(res.status ?? 1)
