#!/usr/bin/env node
/**
 * Guard against mojibake in tracked text files.
 *
 * UTF-8 text decoded as GBK/ANSI leaves a distinctive trail of CJK code points
 * that do not occur in normal Chinese prose. Fail fast in CI instead of
 * discovering the damage in a later diff.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const TEXT_FILE = /\.(ya?ml|md|json|ts|mts|astro|vue|css|mjs|cjs|js|sh|txt)$/i
const REPLACEMENT = '\uFFFD'
// Code points that only show up when UTF-8 bytes were decoded as GBK/ANSI.
// Kept as numbers so this file never trips its own check.
const MOJIBAKE_CODEPOINTS = [
  0x9225, 0x9239, 0x95c2, 0x95b8, 0x940e, 0x7f02, 0x95bb, 0x95ba,
  0x95b9, 0x5a75, 0x9366, 0x93b4, 0x93c2, 0x951b, 0x9286,
]
const MOJIBAKE = new RegExp(
  `[${MOJIBAKE_CODEPOINTS.map((code) => `\\u{${code.toString(16)}}`).join('')}]`,
  'gu',
)

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
