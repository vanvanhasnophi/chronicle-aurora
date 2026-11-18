#!/usr/bin/env node
/**
 * Chronicle Aurora — CMS（浏览器模式）图标设置端到端测试
 *
 * 当前仓库不提供 Electron 运行时，CMS 以 Vite 浏览器模式运行（`npm run dev:cms`）。
 * 这个脚本自动：
 *   1. 起一个独立的 Vite 实例（默认 5178）；
 *   2. 用无头 Chrome 打开 /settings/appearance；
 *   3. 通过 CMS 的 /api/import 上传一张头像，检查文件落位；
 *   4. 勾选「Use Avatar as Icon」并 Save，检查 site.yml 落位；
 *   5. 构建，检查 dist 里的图标文件、<head> 与 manifest；
 *   6. 取消勾选并 Save，重新构建，确认回到默认图标；
 *   7. 清理测试头像、还原 site.yml、删除测试产物。
 *
 * 用法:
 *   npm run test:cms                 # 需要本机 Chrome（或 CHROME=...）
 *   npm run test:cms -- --port 5179
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = path.join(ROOT, 'data/site.yml')
const AVATAR_DIR = path.join(ROOT, 'data/avatar')
const BRANDING_DIR = path.join(ROOT, 'data/branding')
const AVATAR_NAME = 'cms-icon-test.png'
const AVATAR = path.join(AVATAR_DIR, AVATAR_NAME)
const DIST = path.join(ROOT, 'dist-cms-test')
const PNG_SOURCE = path.join(ROOT, 'packages/template-astro/public/favicon-192.png')
const VITE_BIN = path.join(ROOT, 'node_modules/vite/bin/vite.js')

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback
}
const PORT = Number(arg('port', 5178))
const KEEP = argv.includes('--keep')

const CHROME_CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const pass = (message) => console.log(`  ✓ ${message}`)
const fail = (message) => { throw new Error(message) }

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) if (fs.existsSync(candidate)) return candidate
  throw new Error('Chrome not found — set CHROME=/path/to/chrome')
}

function assert(condition, message) {
  if (!condition) fail(message)
  pass(message)
}

function brandsIconsPresent() {
  if (!fs.existsSync(BRANDING_DIR)) return false
  return fs.readdirSync(BRANDING_DIR).some((file) => /^(favicon|icon-|apple-touch)/i.test(file))
}

function avatarImages() {
  if (!fs.existsSync(AVATAR_DIR)) return []
  return fs.readdirSync(AVATAR_DIR).filter((file) => /\.(png|jpe?g|webp|avif|svg|gif)$/i.test(file) && !file.startsWith('.'))
}

function siteFlag(value) {
  if (!fs.existsSync(SITE)) return false
  return new RegExp(`useAvatarAsIcon:\\s*${value}`).test(fs.readFileSync(SITE, 'utf-8'))
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true })
  const res = spawnSync(process.execPath, [
    'packages/gen/bin/cli.mjs', 'build',
    '--dataDir', 'data',
    '--codeDir', 'packages/template-astro',
    '--targetDir', 'dist-cms-test',
  ], { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, SITE_URL: 'https://cms-test.example.com' } })
  assert(res.status === 0, `build succeeded (exit ${res.status})`)
}

function headIcon() {
  const file = path.join(DIST, 'en/index.html')
  if (!fs.existsSync(file)) return ''
  const match = fs.readFileSync(file, 'utf-8').match(/<link rel="icon" href="([^"]+)"/)
  return match ? match[1] : ''
}

function manifestIcons() {
  const file = path.join(DIST, 'site.webmanifest')
  if (!fs.existsSync(file)) return []
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')).icons.map((icon) => icon.src) } catch { return [] }
}

async function startVite() {
  const server = spawn(process.execPath, [VITE_BIN, '--port', String(PORT), '--strictPort'], {
    cwd: path.join(ROOT, 'packages/manager'),
    stdio: 'ignore',
    env: { ...process.env, ELECTRON: '' },
  })
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`)
      if (res.ok) return server
    } catch { /* not up */ }
    if (server.exitCode !== null) throw new Error(`vite exited with ${server.exitCode}`)
    await sleep(150)
  }
  server.kill()
  throw new Error('vite did not start')
}

async function connectChrome(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-icon-chrome-'))
  const port = 9700 + Math.floor(Math.random() * 200)
  const browser = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' })

  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break } catch { /* wait */ }
    if (i > 120) throw new Error('chrome did not start')
    await sleep(150)
  }

  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?url=about:blank`, { method: 'PUT' })).json()
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    socket.onopen = () => resolve(socket)
    socket.onerror = reject
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
  }
  const send = (method, params = {}) => new Promise((resolve) => {
    const messageId = ++id
    pending.set(messageId, resolve)
    ws.send(JSON.stringify({ id: messageId, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.result.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails))
    return result.result.result.value
  }

  return {
    send, evaluate,
    async close() {
      ws.close()
      browser.kill()
      await sleep(300)
      try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
    },
  }
}

async function main() {
  const chrome = findChrome()
  assert(fs.existsSync(SITE), 'data/site.yml present')
  assert(fs.existsSync(PNG_SOURCE), 'default icon available for the upload fixture')
  assert(!brandsIconsPresent(), 'no data/branding icon files (they would take precedence)')

  const existing = avatarImages()
  assert(existing.length === 0, `data/avatar is empty before the test${existing.length ? ` (found ${existing.join(', ')})` : ''}`)

  const originalSite = fs.readFileSync(SITE, 'utf-8')
  const png = fs.readFileSync(PNG_SOURCE).toString('base64')
  let vite
  let cdp

  try {
    vite = await startVite()
    cdp = await connectChrome(chrome)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/settings/appearance` })
    await sleep(3000)

    console.log('\n1) upload an avatar through the CMS API')
    const upload = await cdp.evaluate(`(async () => {
      const bytes = Uint8Array.from(atob('${png}'), (c) => c.charCodeAt(0));
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'x-filename': '${AVATAR_NAME}', 'x-dest': 'data/avatar' },
        body: bytes,
      });
      return JSON.stringify({ status: res.status, body: await res.text() });
    })()`)
    assert(JSON.parse(upload).status === 200, 'upload API returned 200')
    assert(fs.existsSync(AVATAR) && fs.statSync(AVATAR).size > 0, `file landed: data/avatar/${AVATAR_NAME} (${fs.existsSync(AVATAR) ? fs.statSync(AVATAR).size : 0} bytes)`)

    console.log('\n2) toggle "Use Avatar as Icon" and save')
    const on = await cdp.evaluate(`(async () => {
      const cb = document.querySelector('input[type=checkbox]');
      cb.click();
      await new Promise((r) => setTimeout(r, 200));
      [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Save').click();
      await new Promise((r) => setTimeout(r, 1500));
      return JSON.stringify({ checked: cb.checked });
    })()`)
    assert(JSON.parse(on).checked === true, 'checkbox is checked in the CMS')
    assert(siteFlag('true'), 'site.yml has appearance.useAvatarAsIcon: true')

    console.log('\n3) build and check what lands in dist')
    build()
    const avatarDist = fs.existsSync(path.join(DIST, 'data/avatar')) ? fs.readdirSync(path.join(DIST, 'data/avatar')) : []
    assert(avatarDist.some((file) => file.startsWith('cms-icon-test')), `avatar copied to dist (${avatarDist.join(', ')})`)
    assert(headIcon() === `/data/avatar/${AVATAR_NAME}`, `<head> icon points at the avatar (${headIcon()})`)
    assert(manifestIcons().includes(`data/avatar/${AVATAR_NAME}`), `manifest points at the avatar (${manifestIcons().join(', ')})`)

    console.log('\n4) toggle back off and save')
    const off = await cdp.evaluate(`(async () => {
      const cb = document.querySelector('input[type=checkbox]');
      cb.click();
      await new Promise((r) => setTimeout(r, 200));
      [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Save').click();
      await new Promise((r) => setTimeout(r, 1500));
      return JSON.stringify({ checked: cb.checked });
    })()`)
    assert(JSON.parse(off).checked === false, 'checkbox is unchecked again')
    assert(siteFlag('false'), 'site.yml has appearance.useAvatarAsIcon: false')

    console.log('\n5) rebuild and confirm the default icons are back')
    build()
    assert(headIcon() === '/favicon.svg', `<head> icon is the default (${headIcon()})`)
    assert(manifestIcons().join(',') === 'favicon-192.png,favicon-512.png', `manifest is the default (${manifestIcons().join(', ')})`)

    console.log('\nPASS — CMS browser mode writes the icon setting and the avatar file, and the build follows it.')
  } finally {
    await cdp?.close()
    vite?.kill()
    await sleep(300)
    if (fs.existsSync(AVATAR)) fs.unlinkSync(AVATAR)
    try { fs.rmdirSync(AVATAR_DIR) } catch {}
    fs.writeFileSync(SITE, originalSite, 'utf-8')
    if (!KEEP) fs.rmSync(DIST, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`\nFAIL — ${error.message}`)
  process.exit(1)
})
