#!/usr/bin/env node
/**
 * Chronicle Aurora — 预览构建产物
 *
 * 服务根目录 dist/（`npm run build:astro` 的产物），而不是 packages/template-astro/dist
 * （那只是 gen 的中间目录）。零依赖，仅 Node 内置模块。
 *
 * 用法:
 *   npm run preview            # → http://localhost:4321
 *   PORT=5000 npm run preview
 *   node scripts/serve-dist.mjs --dir dist --port 8080
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback
}

const DIR = path.resolve(ROOT, arg('dir', process.env.DIST_DIR || 'dist'))
const PORT = Number(arg('port', process.env.PORT || 4321))
const HOST = arg('host', process.env.HOST || '127.0.0.1')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

if (!fs.existsSync(DIR)) {
  console.error(`[preview] 找不到构建产物: ${DIR}`)
  console.error('[preview] 先运行: npm run build:astro')
  process.exit(1)
}

function resolveFile(urlPath) {
  // 去掉 query/hash，解码，拒绝越界
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0])
  const rel = clean.replace(/^\/+/, '')
  const abs = path.resolve(DIR, rel)
  if (abs !== DIR && !abs.startsWith(DIR + path.sep)) return null

  const candidates = []
  if (rel === '' || clean.endsWith('/')) {
    candidates.push(path.join(abs, 'index.html'))
  } else {
    candidates.push(abs)
    candidates.push(`${abs}.html`)
    candidates.push(path.join(abs, 'index.html'))
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function send(res, status, filePath, body) {
  const type = filePath ? (MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream') : 'text/plain; charset=utf-8'
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  let file = resolveFile(req.url || '/')
  if (file) {
    send(res, 200, file, fs.readFileSync(file))
    return
  }

  // 静态托管的 404 行为：返回 404.html（存在时），否则纯文本
  const notFound = path.join(DIR, '404.html')
  if (fs.existsSync(notFound)) {
    send(res, 404, notFound, fs.readFileSync(notFound))
    return
  }
  send(res, 404, null, 'Not Found\n')
})

server.listen(PORT, HOST, () => {
  console.log(`[preview] ${DIR}`)
  console.log(`[preview] http://${HOST}:${PORT}`)
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
