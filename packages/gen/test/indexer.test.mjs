/**
 * Chronicle Gen — post indexer tests (node:test, no extra dependencies)
 *
 * The indexer is the single canonical path from `data/posts/` to
 * `posts/index.json`; every page route is generated from its output, so these
 * assertions guard the data contract downstream forks rely on.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { buildPostIndex, rebuildPostIndex } from '../src/builder/indexer.mjs'

const roots = []

function makeData(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-index-'))
  roots.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
  return dir
}

after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

test('indexes posts, normalises frontmatter and skips reserved directories', () => {
  const dataDir = makeData({
    'posts/alpha/index.md': [
      '---',
      'title: Alpha',
      'date: 2026-01-02',
      'tags: one, two',
      'status: published',
      'author: Ada, Bob',
      'image: https://example.com/og.png',
      '---',
      '',
      'Alpha body text.',
    ].join('\n'),
    'posts/beta/index.md': '---\ntitle: Beta\nmarp: true\n---\n\nSlides body.',
    'posts/gamma/index.md': '---\ntitle: Gamma\n---\n\nDraft without status.',
    'posts/_hidden/index.md': '---\ntitle: Hidden\n---\n\nMust not be indexed.',
    'posts/.draft/index.md': '---\ntitle: Dot\n---\n\nMust not be indexed.',
    'posts/no-index/readme.md': 'no index.md here',
  })

  const index = buildPostIndex(dataDir)

  assert.deepEqual(Object.keys(index).sort(), ['alpha', 'beta', 'gamma'])

  assert.equal(index.alpha.title, 'Alpha')
  assert.equal(index.alpha.status, 'published')
  assert.deepEqual(index.alpha.tags, ['one', 'two'])
  assert.equal(index.alpha.author, 'Ada')
  assert.deepEqual(index.alpha.authors, ['Ada', 'Bob'])
  assert.equal(index.alpha.type, 'article')
  assert.equal(index.alpha.image, 'https://example.com/og.png')
  assert.equal(index.beta.image, undefined, 'posts without an image frontmatter field carry no image')

  assert.equal(index.beta.type, 'slides', 'marp: true should map to the slides type')
  assert.equal(index.gamma.status, 'draft', 'missing status defaults to draft')
  assert.ok(index.alpha.summary.length > 0, 'summary falls back to the body text')
})

test('falls back to the directory name when the title is missing', () => {
  const dataDir = makeData({ 'posts/untitled-post/index.md': '---\nstatus: published\n---\n\nBody.' })
  const index = buildPostIndex(dataDir)
  assert.equal(index['untitled-post'].title, 'untitled-post')
})

test('attaches the first collection that contains a post', () => {
  const dataDir = makeData({
    'posts/alpha/index.md': '---\ntitle: Alpha\n---\n\nBody.',
    'posts/beta/index.md': '---\ntitle: Beta\n---\n\nBody.',
    'posts/gamma/index.md': '---\ntitle: Gamma\n---\n\nBody.',
    'collections.yml': [
      'collections:',
      '  - name: Guide',
      '    slug: guide',
      '    nodes:',
      '      - id: alpha',
      '        type: post',
      '      - id: ""',
      '        type: group',
      '        title: Nested',
      '        children:',
      '          - id: beta',
      '            type: post',
      '  - name: Other',
      '    slug: other',
      '    nodes:',
      '      - id: alpha',
      '        type: post',
      '',
    ].join('\n'),
  })

  const index = buildPostIndex(dataDir)
  assert.deepEqual(index.alpha.extensions.collections, { name: 'Guide', path: 'Guide' })
  assert.deepEqual(index.beta.extensions.collections, { name: 'Guide', path: 'Guide / Nested' })
  assert.equal(index.gamma.extensions, undefined, 'unlisted posts get no collection extension')
})

test('collections.enabled: false in site.yml disables the extension', () => {
  const dataDir = makeData({
    'posts/alpha/index.md': '---\ntitle: Alpha\n---\n\nBody.',
    'collections.yml': 'collections:\n  - name: Guide\n    slug: guide\n    nodes:\n      - id: alpha\n        type: post\n',
    'site.yml': 'collections:\n  enabled: false\n',
  })

  const index = buildPostIndex(dataDir)
  assert.equal(index.alpha.extensions, undefined)
})

test('rebuildPostIndex writes posts/index.json and reports the count', () => {
  const dataDir = makeData({
    'posts/alpha/index.md': '---\ntitle: Alpha\n---\n\nBody.',
    'posts/beta/index.md': '---\ntitle: Beta\n---\n\nBody.',
  })

  const count = rebuildPostIndex(dataDir)
  assert.equal(count, 2)

  const written = JSON.parse(fs.readFileSync(path.join(dataDir, 'posts', 'index.json'), 'utf-8'))
  assert.deepEqual(Object.keys(written).sort(), ['alpha', 'beta'])
  assert.equal(written.alpha.title, 'Alpha')
})

test('missing posts directory yields an empty index', () => {
  const dataDir = makeData({ 'site.yml': 'rss: true\n' })
  assert.deepEqual(buildPostIndex(dataDir), {})
})
