import fs from 'node:fs';
import path from 'node:path';
import { getDataContext, type PluginDataHooks } from '../../data/pluginHooks';
import type { PostMeta } from '../../data/types';

type SummaryEntry = {
  summary?: string;
  model?: string;
  locale?: string;
  updatedAt?: string;
  sourceHash?: string;
};

type LocaleSummaries = Record<string, SummaryEntry>;

let cache: { dataDir: string; mtimeMs: number; entries: Record<string, SummaryEntry> } | null = null;

function readSummaries(): Record<string, SummaryEntry> {
  const dataDir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  const file = path.join(dataDir, 'ai-enhance', 'summaries.json');
  try {
    const stat = fs.statSync(file);
    if (cache && cache.dataDir === dataDir && cache.mtimeMs === stat.mtimeMs) return cache.entries;
    const entries = JSON.parse(fs.readFileSync(file, 'utf-8')) || {};
    cache = { dataDir, mtimeMs: stat.mtimeMs, entries };
    return entries;
  } catch {
    return {};
  }
}

function enrichPost(post: PostMeta): Partial<PostMeta> | void {
  const entry = readSummaries()[post.id] as SummaryEntry | LocaleSummaries | undefined;
  if (!entry || typeof entry !== 'object') return;
  // Legacy single-summary cache: treat it as the default locale fallback.
  const summaries: LocaleSummaries = 'summary' in entry ? { en: entry as SummaryEntry } : (entry as LocaleSummaries);
  if (!Object.values(summaries).some((item) => item?.summary)) return;
  const extensions = { ...(post.extensions || {}), ai: { summaries } };
  return { extensions };
}

export const aiEnhanceDataHooks: PluginDataHooks = { enrichPost };
