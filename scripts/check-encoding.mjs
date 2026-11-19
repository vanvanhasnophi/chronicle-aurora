#!/usr/bin/env node
/**
 * Guard against mojibake in tracked text files.
 *
 * UTF-8 text that was decoded as GBK/ANSI and re-encoded leaves a very
 * characteristic trail (鈥 / 鈹 / 闂 / 鏂 / 锛 …). This has silently damaged
 * hand-written comments before, so fail fast in CI instead of discovering it
 * in a later diff.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const TEXT_FILE = /\.(ya?ml|md|json|ts|mts|astro|vue|css|mjs|cjs|js|sh|txt)$/i
const REPLACEMENT = '\uFFFD'
// Characters that only show up when UTF-8 bytes were decoded as GBK/ANSI.
const MOJIBAKE = /[鈥鈹闂閸鐎缂閻閺閹婵鍦鎴鏂锛銆]/g

const files = execSync('git ls-files -z', { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter((file) => file && TEXT_FILE.test(file))
  .filter((file) => !file.includes('node_modules/') && !file.startsWith('dist'))

const problems = []
for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const replacement = text.includes(REPLACEMENT)
  const matches = text.match(MOJIBAKE) ?? []
  const distinct = new Set(matches).size
  if (replacement || distinct >= 2 || matches.length >= 3) {
    const lines = text.split('\n')
    const badLines = lines
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => line.includes(REPLACEMENT) || (line.match(MOJIBAKE)?.length ?? 0) > 0)
      .slice(0, 3)
      .map(({ line, index }) => `  ${index}: ${line.trim().slice(0, 100)}`)
    problems.push(`${file}\n${badLines.join('\n')}`)
  }
}

if (problems.length > 0) {
  console.error('Mojibake detected in tracked files:\n\n' + problems.join('\n\n'))
  process.exit(1)
}

console.log(`Encoding check passed (${files.length} text files)`)
