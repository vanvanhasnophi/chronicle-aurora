/** Reading-experience settings provider: owns TOC / end-of-article defaults. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { getDataContext, type PluginDataHooks } from '../../data/pluginHooks';

const TOC_DEFAULTS = {
  inlineToc: true,
  tocFloat: true,
  tocFloatAlwaysExpanded: false,
  mobileTocControl: true,
};

const END_OF_ARTICLE_DEFAULTS = {
  relatedPosts: true,
  prevNext: true,
  prevNextMode: 'both',
  prevNextScope: 'global',
  prevNextOrder: 'desc',
  authorCard: true,
  share: true,
  shareChannels: ['twitter', 'weibo', 'linkedin'],
};

function readSite(): Record<string, any> {
  const dir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  try {
    return YAML.parse(fs.readFileSync(path.join(dir, 'site.yml'), 'utf-8')) || {};
  } catch {
    return {};
  }
}

function enrichSettings(settings: Record<string, any>): void {
  const raw = readSite();
  const group = raw['reading-experience'] && typeof raw['reading-experience'] === 'object'
    ? raw['reading-experience']
    : {};
  const legacy = raw.post && typeof raw.post === 'object' ? raw.post : {};
  const post = settings.post || {};

  const toc = group.toc ?? legacy.toc ?? raw.postToc ?? {};
  const end = group.endOfArticle ?? legacy.endOfArticle ?? raw.postEndOfArticle ?? {};

  settings.post = {
    ...post,
    postToc: { ...TOC_DEFAULTS, ...(toc && typeof toc === 'object' ? toc : {}) },
    postTocEnabled: raw.postTocEnabled ?? legacy.toc?.enabled ?? toc?.enabled ?? true,
    postEndOfArticle: {
      ...END_OF_ARTICLE_DEFAULTS,
      ...(end && typeof end === 'object' ? end : {}),
    },
  };
}

export const readingExperienceDataHooks: PluginDataHooks = { enrichSettings };
