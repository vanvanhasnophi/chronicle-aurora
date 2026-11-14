#!/usr/bin/env node
/**
 * Plugin isolation check: build with collections disabled and assert there is
 * no collection residue in pages, post layout, index, slides, or CSS.
 * Restores site.yml + posts/index.json afterwards.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteFile = path.join(root, 'data/site.yml');
const indexFile = path.join(root, 'data/posts/index.json');
const target = path.join(root, 'dist-isolation-test');
const siteBackup = fs.readFileSync(siteFile, 'utf-8');
const indexBackup = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf-8') : null;

function fail(message) {
  throw new Error(`[isolation] ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

try {
  const disabled = siteBackup.replace(
    /collections:\s*\n(\s+)enabled:\s*true/,
    (match, indent) => `collections:\n${indent}enabled: false`,
  );
  check(disabled !== siteBackup, 'collections.enabled:true not found in site.yml');
  fs.writeFileSync(siteFile, disabled);

  const result = spawnSync(
    process.execPath,
    ['packages/gen/bin/cli.mjs', 'build', '--dataDir', 'data', '--codeDir', 'packages/template-astro', '--targetDir', 'dist-isolation-test', '--granularity', 'full'],
    { cwd: root, stdio: 'inherit' },
  );
  check(result.status === 0, `disabled build failed (${result.status})`);

  check(!fs.existsSync(path.join(target, 'zh/collection/index.html')), 'collection page still generated');
  check(!fs.existsSync(path.join(target, 'collection/index.html')), 'root collection redirect still generated');
  check(fs.existsSync(path.join(target, 'friends/index.html')), 'generic root redirect lost (/friends)');
  check(fs.existsSync(path.join(target, 'search/index.html')), 'generic root redirect lost (/search)');

  const post = read(path.join(target, 'zh/post/getting-started/index.html'));
  const body = post.slice(post.indexOf('<body'), post.indexOf('>', post.indexOf('<body')) + 1);
  check(!body.includes('has-collection-nav'), 'post body still has has-collection-nav');
  check(!post.includes('data-menu="collection"'), 'post still has collection corner action');
  check(!post.includes('collection-nav-root'), 'post still has collection sidebar');
  check(!post.includes('cn-switcher'), 'post still has collection switcher');
  check(post.includes('prevnext-nav'), 'global prevnext disappeared');

  const slides = read(path.join(target, 'zh/post/slides-demo/index.html'));
  check(!slides.includes('slide-info-label">Collection'), 'slides still render Collection row');

  const index = JSON.parse(read(indexFile));
  check(!index['getting-started']?.collection, 'index.json still has collection field');
  check(!index['getting-started']?.collectionPath, 'index.json still has collectionPath field');
  check(!index['getting-started']?.extensions?.collections, 'index.json still has collections extension');

  const cssFiles = fs.readdirSync(path.join(target, '_astro')).filter((file) => file.endsWith('.css'));
  const postCss = cssFiles.map((file) => read(path.join(target, '_astro', file))).join('\n');
  check(!postCss.includes('.cn-panel') && !postCss.includes('has-collection-nav'), 'collection nav CSS still bundled');

  console.log('[isolation] PASS — disabled collections leaves no page/layout/index/slides/CSS residue');
} finally {
  fs.writeFileSync(siteFile, siteBackup);
  if (indexBackup !== null) fs.writeFileSync(indexFile, indexBackup);
  fs.rmSync(target, { recursive: true, force: true });
}
