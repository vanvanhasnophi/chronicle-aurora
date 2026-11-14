#!/usr/bin/env node
/**
 * Build-time AI summaries for the optional AI plugin.
 *
 *   AI_API_KEY=... AI_MODEL=gpt-4o-mini npm run ai:summaries
 *
 * Writes data/ai-enhance/summaries.json. The site never calls an AI API at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataDir = path.join(root, args.includes('--data-dir') ? args[args.indexOf('--data-dir') + 1] : 'data');
const force = args.includes('--force');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const model = process.env.AI_MODEL || 'gpt-4o-mini';
const locales = (process.env.AI_LOCALES || 'zh,en').split(',').map((v) => v.trim()).filter(Boolean);
const languageNames = { zh: 'Simplified Chinese', en: 'English' };

if (!apiKey) {
  console.error('[ai] Missing AI_API_KEY. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL).');
  process.exit(1);
}

const indexFile = path.join(dataDir, 'posts', 'index.json');
const outFile = path.join(dataDir, 'ai-enhance', 'summaries.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
const entries = Array.isArray(index) ? index : Object.entries(index).map(([id, value]) => ({ id, ...value }));
const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf-8')) : {};

function stripFrontmatter(value) {
  return String(value || '').replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function summarize(entry, body, locale) {
  const language = languageNames[locale] || locale;
  const prompt = [
    `Summarize this blog post in 2-3 concise sentences in ${language}.`,
    'Do not use markdown headings or bullet lists.',
    `Title: ${entry.title || ''}`,
    entry.tags?.length ? `Tags: ${entry.tags.join(', ')}` : '',
    '',
    body.slice(0, 14000),
  ].filter(Boolean).join('\n');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 240,
      messages: [
        { role: 'system', content: 'You write accurate, compact article summaries.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const summary = String(json?.choices?.[0]?.message?.content || '').trim();
  if (!summary) throw new Error('API returned an empty summary');
  return summary;
}

const next = { ...existing };
let generated = 0;
for (const entry of entries.slice(0, limit)) {
  if (!entry?.id || entry.status === 'draft') continue;
  const mdFile = path.join(dataDir, 'posts', entry.id, 'index.md');
  if (!fs.existsSync(mdFile)) continue;
  const raw = fs.readFileSync(mdFile, 'utf-8');
  const sourceHash = hash(raw);
  const previous = existing[entry.id];
  const previousLocales = previous && !previous.summary && typeof previous === 'object' ? previous : {};
  const localeEntries = { ...previousLocales };
  for (const locale of locales) {
    const cached = localeEntries[locale];
    if (!force && cached?.summary && cached.sourceHash === sourceHash) {
      console.log(`[ai] skip ${entry.id}:${locale} (unchanged)`);
      continue;
    }
    const body = stripFrontmatter(raw);
    console.log(`[ai] summarize ${entry.id}:${locale} ...`);
    const summary = await summarize(entry, body, locale);
    localeEntries[locale] = {
      summary,
      model,
      locale,
      sourceHash,
      updatedAt: new Date().toISOString(),
    };
    generated += 1;
  }
  next[entry.id] = localeEntries;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(next, null, 2) + '\n');
console.log(`[ai] wrote ${outFile} (${generated} generated, ${Object.keys(next).length} cached)`);
