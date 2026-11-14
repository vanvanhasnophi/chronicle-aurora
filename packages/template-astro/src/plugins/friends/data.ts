/** Friends plugin data/settings provider. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { getDataContext, type PluginDataHooks } from '../../data/pluginHooks';

function resolveAssetUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('asset://')) return '/assets/' + url.slice(8);
  if (url.startsWith('post://')) return '/posts/' + url.slice(7);
  return url;
}

function readFriends(): { cards: unknown[]; globalStyle: string | null } {
  const dir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  try {
    const raw = YAML.parse(fs.readFileSync(path.join(dir, 'friends.yml'), 'utf-8')) || {};
    const cards = (Array.isArray(raw.cards) ? raw.cards : []).map((card: any) => ({
      ...card,
      avatar: resolveAssetUrl(String(card?.avatar || '')),
      cover: resolveAssetUrl(String(card?.cover || '')),
    }));
    return { cards, globalStyle: raw.globalStyle ?? null };
  } catch {
    return { cards: [], globalStyle: null };
  }
}

function enrichSettings(settings: Record<string, any>): void {
  const { cards, globalStyle } = readFriends();
  const dir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  let siteStyle = '';
  try {
    const site = YAML.parse(fs.readFileSync(path.join(dir, 'site.yml'), 'utf-8')) || {};
    if (typeof site.friendsGlobalStyle === 'string') siteStyle = site.friendsGlobalStyle;
  } catch { /* ignore */ }
  settings.friendsCards = cards;
  settings.friendsGlobalStyle = siteStyle || globalStyle;
}

export const friendsDataHooks: PluginDataHooks = { enrichSettings };
