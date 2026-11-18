#!/usr/bin/env node
/** All optional plugins disabled: assert no page/UI/index residue. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirName = process.env.CHRONICLE_ISOLATION_DATA_DIR
  || (fs.existsSync(path.join(root, 'demo', 'posts')) ? 'demo' : 'data');
const siteFile = path.join(root, dataDirName, 'site.yml');
const indexFile = path.join(root, dataDirName, 'posts/index.json');
const target = path.join(root, 'dist-isolation-all');

if (!fs.existsSync(path.join(root, dataDirName, 'posts/getting-started/index.md'))) {
  console.error(`[isolation:all] fixtures missing in ${dataDirName}/posts — run: npm run demo:fetch`);
  process.exit(1);
}

const siteBackup = fs.readFileSync(siteFile, 'utf-8');
const indexBackup = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf-8') : null;

function check(condition, message) {
  if (!condition) throw new Error(`[isolation:all] ${message}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

try {
  let disabled = siteBackup;
  for (const key of ['collections', 'friends', 'comments', 'search', 'slides', 'reading-experience', 'ai-enhance']) {
    disabled = disabled.replace(
      new RegExp(`(${key}:\\s*\\n\\s+enabled:\\s*)true`),
      '$1false',
    );
  }
  check(disabled !== siteBackup, 'plugin flags not found');
  fs.writeFileSync(siteFile, disabled);

  const result = spawnSync(
    process.execPath,
    ['packages/gen/bin/cli.mjs', 'build', '--dataDir', dataDirName, '--codeDir', 'packages/template-astro', '--targetDir', 'dist-isolation-all', '--granularity', 'full'],
    { cwd: root, stdio: 'inherit' },
  );
  check(result.status === 0, `disabled build failed (${result.status})`);

  for (const page of ['zh/collection', 'zh/friends', 'zh/search', 'collection', 'friends', 'search']) {
    check(!fs.existsSync(path.join(target, page, 'index.html')), `page still generated: ${page}`);
  }

  const post = read(path.join(target, 'zh/post/getting-started/index.html'));
  check(!post.includes('data-menu="collection"'), 'collection action still present');
  check(!post.includes('data-action="scrollToComment"'), 'comment action still present');
  check(!post.includes('data-menu="toc"'), 'TOC action still present');
  check(!post.includes('collection-nav-root'), 'collection sidebar still present');
  check(!post.includes('chronicle-toc-data'), 'TOC data still present');
  check(!post.includes('id="inline-toc"'), 'inline TOC still present');
  check(!post.includes('comment-section'), 'comment section still present');

  check(!fs.existsSync(path.join(target, 'posts/full_index.json')), 'full_index still generated');
  check(fs.existsSync(path.join(target, 'zh/post/getting-started/index.html')), 'normal post missing');

  console.log('[isolation:all] PASS — all optional plugins disabled leaves no page/UI/index residue');
} finally {
  fs.writeFileSync(siteFile, siteBackup);
  if (indexBackup !== null) fs.writeFileSync(indexFile, indexBackup);
  fs.rmSync(target, { recursive: true, force: true });
}
