#!/usr/bin/env node
/**
 * Chronicle Aurora — command documentation gate
 *
 * The full script list lives in README.md / README.zh.md ("Commands" /
 * "命令速查"). This check fails when package.json gains or loses a script
 * without the tables following, so the reference cannot silently drift.
 *
 *   npm run check:commands
 */
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scripts = Object.keys(pkg.scripts || {})
const docs = [
  { file: 'README.md', text: fs.readFileSync('README.md', 'utf8') },
  { file: 'README.zh.md', text: fs.readFileSync('README.zh.md', 'utf8') },
]

const mentioned = (text, name) =>
  new RegExp(`npm (?:run )?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(text)

let failed = false
for (const { file, text } of docs) {
  const missing = scripts.filter((name) => !mentioned(text, name))
  if (missing.length) {
    failed = true
    console.error(`[check:commands] ${file} is missing ${missing.length} script(s):`)
    for (const name of missing) console.error(`  - npm run ${name}`)
  }
}

if (failed) {
  console.error('\nAdd them to the Commands table in README.md and README.zh.md.')
  process.exit(1)
}

console.log(`[check:commands] PASS — all ${scripts.length} scripts documented in both READMEs`)
