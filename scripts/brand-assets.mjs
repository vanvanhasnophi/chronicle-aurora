#!/usr/bin/env node
/**
 * Chronicle Aurora — 品牌资产生成（默认社交分享图 + favicon / 图标集）
 *
 * 读取 data/site.yml 的站点名、描述与强调色，生成：
 *   public/branding/og-default.png   1200×630 默认 og:image
 *   public/favicon.svg               矢量图标（可随主题色）
 *   public/favicon-32.png            32×32
 *   public/favicon-192.png           192×192
 *   public/favicon-512.png           512×512
 *   public/apple-touch-icon.png      180×180（带背景，避免 iOS 透明边）
 *   public/favicon.ico               32×32（PNG-in-ICO，兼容 /favicon.ico 请求）
 *   public/site.webmanifest          name / icons / theme_color
 *
 * 用法:
 *   npm run assets                 # 读 data/site.yml
 *   npm run assets -- --data demo  # 用演示站的站点信息
 *   npm run assets -- --out <dir>  # 输出到别处
 *
 * 产物是提交进仓库的静态资产：CI 不需要字体/浏览器，fork 后运行一次即可换成自己的品牌。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback
}

const DATA_DIR = path.resolve(ROOT, arg('data', 'data'))
const OUT_DIR = path.resolve(ROOT, arg('out', 'packages/template-astro/public'))
const SITE_FILE = path.join(DATA_DIR, 'site.yml')

if (!fs.existsSync(SITE_FILE)) {
  console.error(`[assets] site.yml not found in ${DATA_DIR}`)
  process.exit(1)
}

const site = YAML.parse(fs.readFileSync(SITE_FILE, 'utf-8')) || {}
const siteName = String(site.homepage?.siteName || 'Chronicle Aurora').trim()
const description = String(site.homepage?.siteDescription || '').trim()
const accent = /^#[0-9a-fA-F]{6}$/.test(String(site.appearance?.accent || '')) ? site.appearance.accent : '#10b981'

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const FONT_STACK = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif"

/** 按宽度换行：优先在空格处断行，CJK 逐字断行；超出行数加省略号。 */
function wrap(text, maxUnits, maxLines) {
  const isWide = (char) => /[\u3000-\u9fff\uff00-\uffef]/.test(char)
  const widthOf = (value) => Array.from(value).reduce((sum, char) => sum + (isWide(char) ? 2 : 1), 0)
  const chars = Array.from(text)
  const lines = []
  let line = ''
  let index = 0

  while (index < chars.length && lines.length < maxLines) {
    const char = chars[index]
    if (widthOf(line) + (isWide(char) ? 2 : 1) > maxUnits && line) {
      const lastSpace = line.lastIndexOf(' ')
      if (!isWide(char) && lastSpace > 0) {
        lines.push(line.slice(0, lastSpace).trimEnd())
        line = line.slice(lastSpace + 1)
        continue
      }
      lines.push(line.trimEnd())
      line = ''
      continue
    }
    line += char
    index++
  }

  if (line && lines.length < maxLines) lines.push(line.trimEnd())
  if (lines.length === maxLines) {
    const consumed = lines.join('').replace(/\s/g, '').length
    const total = text.replace(/\s/g, '').length
    if (consumed < total) {
      const last = lines[maxLines - 1]
      lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 1)).trimEnd() + '…'
    }
  }
  return lines
}

function ogSvg() {
  const titleSize = siteName.length > 20 ? 72 : 88
  const titleLines = wrap(siteName, 22, 2)
  const descLines = wrap(description, 56, 3)
  const titleY = 300 - (titleLines.length - 1) * 30
  const descY = titleY + titleLines.length * 92 + 10

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0c10"/>
      <stop offset="1" stop-color="#14181f"/>
    </linearGradient>
    <radialGradient id="glow" cx="82%" cy="18%" r="62%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    ${AURORA_DEFS}
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(80 81.9) scale(0.96)">${AURORA_MARK}</g>
  ${titleLines.map((line, index) => `<text x="80" y="${titleY + index * 92}" font-family="${FONT_STACK}"
        font-size="${titleSize}" font-weight="700" fill="#f7f8fa">${escapeXml(line)}</text>`).join('\n  ')}
  ${descLines.map((line, index) => `<text x="82" y="${descY + index * 46}" font-family="${FONT_STACK}"
        font-size="34" font-weight="400" fill="#b9c0cc">${escapeXml(line)}</text>`).join('\n  ')}
  <rect x="80" y="540" width="104" height="6" rx="3" fill="${accent}"/>
  <text x="200" y="551" font-family="${FONT_STACK}" font-size="26" fill="#7d8797">Chronicle Aurora</text>
</svg>`
}

/**
 * 默认品牌标记：空心等边三角形 + 中横杠 → 字母「A」；青绿极光渐变 + 柔光，透明背景。
 * 不使用站点强调色，也不加纯色底；想换色/换底请用 data/branding/ 覆盖。
 */
const AURORA_DEFS = `<linearGradient id="aurora" gradientUnits="userSpaceOnUse" x1="22" y1="22" x2="80" y2="82">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="0.55" stop-color="#2dd4bf"/>
      <stop offset="1" stop-color="#34d399"/>
    </linearGradient>
    <filter id="auroraGlow" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="3.4"/>
    </filter>`

// 等边三角形（顶点 50,24.5；底边 18..82，y=80）+ 中横杠
const A_PATH = 'M50 24.5 18 80 82 80Z M30 60H70'

const AURORA_MARK = `<g transform="translate(6.45 -16.82) scale(1.021) rotate(60 50 50) translate(0 -3)">
    <g fill="none" stroke="url(#aurora)" stroke-linecap="round" stroke-linejoin="round">
      <path d="${A_PATH}" stroke-width="14" opacity="0.55" filter="url(#auroraGlow)"/>
      <path d="${A_PATH}" stroke-width="9.5"/>
    </g>
  </g>`

function iconSvg(size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    ${AURORA_DEFS}
  </defs>
  <g transform="scale(${(size / 100).toFixed(4)})">
    ${AURORA_MARK}
  </g>
</svg>`
}

/** 极简 ICO 容器：一个 32×32 的 PNG 条目（Vista+ 支持 PNG-in-ICO）。 */
function pngToIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const directory = Buffer.alloc(16)
  directory[0] = size >= 256 ? 0 : size
  directory[1] = size >= 256 ? 0 : size
  directory.writeUInt16LE(1, 4)
  directory.writeUInt16LE(32, 6)
  directory.writeUInt32LE(png.length, 8)
  directory.writeUInt32LE(22, 12)
  return Buffer.concat([header, directory, png])
}

async function main() {
  const outPublic = OUT_DIR
  const outBranding = path.join(outPublic, 'branding')
  fs.mkdirSync(outBranding, { recursive: true })

  await sharp(Buffer.from(ogSvg())).png({ compressionLevel: 9 }).toFile(path.join(outBranding, 'og-default.png'))

  fs.writeFileSync(path.join(outPublic, 'favicon.svg'), iconSvg(512), 'utf-8')

  for (const size of [32, 192, 512]) {
    await sharp(Buffer.from(iconSvg(512)))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outPublic, `favicon-${size}.png`))
  }

  await sharp(Buffer.from(iconSvg(512)))
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(path.join(outPublic, 'apple-touch-icon.png'))

  const png32 = await sharp(Buffer.from(iconSvg(32))).resize(32, 32).png().toBuffer()
  fs.writeFileSync(path.join(outPublic, 'favicon.ico'), pngToIco(png32, 32))

  const firstWord = siteName.split(/\s+/)[0] || siteName;
  const shortName = siteName.length <= 12 ? siteName : (firstWord.length <= 12 ? firstWord : Array.from(firstWord).slice(0, 12).join(''))
  const manifest = {
    name: siteName,
    short_name: shortName,
    description,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#0a0c10',
    theme_color: accent,
    icons: [
      { src: 'favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'favicon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
  fs.writeFileSync(path.join(outPublic, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

  console.log(`[assets] ${siteName} — accent ${accent}`)
  console.log(`[assets] wrote branding/og-default.png + favicon set + site.webmanifest`)
}

main().catch((error) => {
  console.error('[assets] failed:', error.message)
  process.exit(1)
})
