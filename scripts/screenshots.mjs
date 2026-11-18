#!/usr/bin/env node
/**
 * Chronicle Aurora — 生成 README 截图（桌面 + 移动，浅色模式，英文首页）
 *
 * 流程：复制 demo/ → 强制 `appearance.theme: light` → 构建到 dist-shots →
 * 起本地静态服务 → 用 Chrome DevTools Protocol 以真实设备尺寸截图 →
 * 写入 .github/assets/。
 *
 * 用法:
 *   npm run shots                 # 1440x900@2x + 390x844@3x
 *   npm run shots -- --keep       # 保留 dist-shots 便于检查
 *
 * 依赖：本机 Chrome（或设置 CHROME 环境变量指向可执行文件）。需要先 npm run demo:fetch。
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, '.github', 'assets')
const DEMO = path.join(ROOT, 'demo')
const SHOTS = path.join(ROOT, 'dist-shots')
const KEEP = process.argv.includes('--keep')
const PORT = Number(process.env.SHOT_PORT || 4391)

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

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('Chrome not found — set CHROME=/path/to/chrome')
}

function prepareData() {
  if (!fs.existsSync(DEMO)) {
    throw new Error('demo/ not found — run: npm run demo:fetch')
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-shots-data-'))
  fs.cpSync(DEMO, dataDir, { recursive: true })

  const siteYml = path.join(dataDir, 'site.yml')
  const text = fs.readFileSync(siteYml, 'utf-8')
  const patched = text.replace(/(appearance:\s*\n(?:[ \t].*\n)*?[ \t]+theme:\s*)\S+/, '$1light')
  fs.writeFileSync(siteYml, patched, 'utf-8')
  if (!/theme:\s*light/.test(patched)) throw new Error('could not force appearance.theme: light')
  return dataDir
}

function build(dataDir) {
  const res = spawnSync(process.execPath, [
    'packages/gen/bin/cli.mjs', 'build',
    '--dataDir', dataDir,
    '--codeDir', 'packages/template-astro',
    '--targetDir', 'dist-shots',
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, SITE_URL: process.env.SITE_URL || 'https://chr.eightyfor.top', BASE_PATH: '/' },
  })
  if (res.status !== 0) throw new Error(`build failed (${res.status})`)
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const probe = () => {
      http.get(`http://127.0.0.1:${PORT}/en/`, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else reject(new Error(`preview responded ${res.statusCode}`))
      }).on('error', () => {
        if (++attempts > 100) reject(new Error('preview server did not start'))
        else setTimeout(probe, 150)
      })
    }
    probe()
  })
}

async function capture(chrome, { url, width, height, dpr, mobile, out }) {
  const debugPort = 9300 + Math.floor(Math.random() * 400)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-shots-chrome-'))
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
        if (res.ok) break
      } catch { /* not up yet */ }
      if (i > 100) throw new Error('chrome did not start')
      await sleep(150)
    }

    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?url=about:blank`, { method: 'PUT' })).json()
    const ws = await new Promise((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl)
      socket.onopen = () => resolve(socket)
      socket.onerror = reject
    })

    let id = 0
    const pending = new Map()
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message)
        pending.delete(message.id)
      }
    }
    const send = (method, params = {}) => new Promise((resolve) => {
      const messageId = ++id
      pending.set(messageId, resolve)
      ws.send(JSON.stringify({ id: messageId, method, params }))
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile })
    if (mobile) {
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      })
    }
    await send('Page.navigate', { url })
    await sleep(3000)

    const metrics = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        theme: document.documentElement.getAttribute('data-theme'),
        lang: document.documentElement.getAttribute('lang')
      })`,
      returnByValue: true,
    })
    const state = JSON.parse(metrics.result.result.value)
    if (state.scrollWidth > state.width + 1) {
      throw new Error(`horizontal overflow at ${width}px (${state.scrollWidth} > ${state.width})`)
    }
    if (state.theme !== 'light' || state.lang !== 'en') {
      throw new Error(`unexpected page state: ${JSON.stringify(state)}`)
    }

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
    console.log(`[shots] ${path.basename(out)} — ${width}x${height} @${dpr}x`)
    ws.close()
  } finally {
    browser.kill()
    await sleep(300)
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* chrome still holding files */ }
  }
}

async function main() {
  const chrome = findChrome()
  fs.mkdirSync(ASSETS, { recursive: true })
  const dataDir = prepareData()

  let server
  try {
    build(dataDir)
    server = spawn(process.execPath, ['scripts/serve-dist.mjs', '--dir', 'dist-shots', '--port', String(PORT)], {
      cwd: ROOT,
      stdio: 'ignore',
    })
    await waitForServer()

    await capture(chrome, {
      url: `http://127.0.0.1:${PORT}/en/`,
      width: 1440, height: 900, dpr: 2, mobile: false,
      out: path.join(ASSETS, 'demo-desktop.png'),
    })
    await capture(chrome, {
      url: `http://127.0.0.1:${PORT}/en/`,
      width: 390, height: 844, dpr: 3, mobile: true,
      out: path.join(ASSETS, 'demo-mobile.png'),
    })
  } finally {
    server?.kill()
    fs.rmSync(dataDir, { recursive: true, force: true })
    if (!KEEP) fs.rmSync(SHOTS, { recursive: true, force: true })
  }

  console.log('[shots] done → .github/assets/demo-desktop.png, demo-mobile.png')
}

main().catch((error) => {
  console.error('[shots] failed:', error.message)
  process.exit(1)
})
