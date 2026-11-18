#!/usr/bin/env node
/**
 * Chronicle Aurora — 校验 base 前缀
 *
 * 站点部署在子路径（GitHub Pages 项目页）时，所有站内绝对链接都必须带
 * `BASE_PATH` 前缀。构建后扫一遍 HTML，漏一个就失败——比线上 404 才发现好。
 *
 * 用法:
 *   node scripts/check-base-links.mjs --dir dist --base /chronicle-aurora/
 *   BASE_PATH=/repo/ node scripts/check-base-links.mjs --dir dist
 */

import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
function arg(name, fallback) {
  const index = argv.indexOf(`--${name}`)
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback
}

const dir = path.resolve(arg('dir', 'dist'))
const rawBase = arg('base', process.env.BASE_PATH || '/')
const base = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`

if (base === '/') {
  console.log('[base-links] base is "/" — nothing to assert')
  process.exit(0)
}

if (!fs.existsSync(dir)) {
  console.error(`[base-links] build output not found: ${dir}`)
  process.exit(1)
}

const attributePattern = /(?:href|src)="(\/[^"]*)"/g
const violations = new Map()

function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const abs = path.join(current, entry.name)
    if (entry.isDirectory()) {
      walk(abs)
      continue
    }
    if (!entry.name.endsWith('.html')) continue

    const html = fs.readFileSync(abs, 'utf-8')
    for (const match of html.matchAll(attributePattern)) {
      const url = match[1]
      if (url.startsWith('//')) continue
      if (url === base || url.startsWith(base)) continue
      const rel = path.relative(dir, abs).split(path.sep).join('/')
      if (!violations.has(url)) violations.set(url, new Set())
      violations.get(url).add(rel)
    }
  }
}

walk(dir)

if (violations.size > 0) {
  console.error(`[base-links] ${violations.size} URL(s) missing the ${base} prefix:`)
  for (const [url, files] of [...violations.entries()].slice(0, 20)) {
    console.error(`  ${url}  (e.g. ${[...files].slice(0, 2).join(', ')})`)
  }
  process.exit(1)
}

console.log(`[base-links] PASS — every absolute link starts with ${base}`)
