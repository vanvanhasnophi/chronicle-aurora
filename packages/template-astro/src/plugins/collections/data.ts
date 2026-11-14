/**
 * Collections plugin data provider.
 * Owns collections.yml parsing, post assignment and post ordering. Core only
 * sees the generic DataSource hooks registered through the manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { getDataContext, type PluginDataHooks } from '../../data/pluginHooks';
import type { PostMeta } from '../../data/types';

interface CollectionEntry {
  name: string;
  description?: string;
  slug?: string;
  cover?: string;
  nodes?: any[];
}

interface CollectionData {
  collections: CollectionEntry[];
  byPost: Map<string, { collection: string; collectionPath: string }>;
}

let cache: CollectionData | null = null;
let cacheMtime = 0;

function dataDir(): string {
  return getDataContext().dataDir || path.resolve(process.cwd(), 'data');
}

function resolveAssetUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('asset://')) return '/assets/' + url.slice(8);
  if (url.startsWith('post://')) return '/posts/' + url.slice(7);
  return url;
}

function walk(
  nodes: any[] | undefined,
  colName: string,
  parents: string[],
  byPost: Map<string, { collection: string; collectionPath: string }>,
) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'post' && node.id) {
      const id = String(node.id);
      // First collection wins, matching template-astro localFs and gen indexer.
      if (!byPost.has(id)) {
        byPost.set(id, {
          collection: colName,
          collectionPath: parents.length ? `${colName} / ${parents.join(' / ')}` : colName,
        });
      }
    }
    if (node.type === 'group' && Array.isArray(node.children)) {
      walk(node.children, colName, [...parents, node.title || 'Untitled'], byPost);
    }
  }
}

function load(): CollectionData {
  const dir = dataDir();
  const file = path.join(dir, 'collections.yml');
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
    if (cache && cacheMtime === mtime) return cache;
  } catch {
    cache = { collections: [], byPost: new Map() };
    cacheMtime = 0;
    return cache;
  }

  let collections: CollectionEntry[] = [];
  try {
    const raw = YAML.parse(fs.readFileSync(file, 'utf-8'));
    const list = Array.isArray(raw) ? raw : raw?.collections;
    if (Array.isArray(list)) {
      collections = list.filter(Boolean).map((c: any) => ({
        ...c,
        name: String(c.name || ''),
        description: String(c.description || ''),
        slug: String(c.slug || ''),
        cover: resolveAssetUrl(String(c.cover || '')),
        nodes: Array.isArray(c.nodes) ? c.nodes : [],
      }));
    }
  } catch {
    collections = [];
  }

  const byPost = new Map<string, { collection: string; collectionPath: string }>();
  for (const collection of collections) {
    if (collection.name) walk(collection.nodes, collection.name, [], byPost);
  }

  cache = { collections, byPost };
  cacheMtime = mtime;
  return cache;
}

function getCollections(): Record<string, unknown> {
  return { collections: load().collections };
}

function getCollectionPostIds(collectionName: string): string[] {
  const collection = load().collections.find(
    (item) => String(item.name || item.slug || '') === collectionName,
  );
  if (!collection) return [];
  const ids: string[] = [];
  const visit = (nodes: any[]) => {
    for (const node of nodes || []) {
      if (node?.type === 'post' && node.id) ids.push(String(node.id));
      if (node?.type === 'group') visit(node.children);
    }
  };
  visit(collection.nodes || []);
  return ids;
}

function enrichPost(post: PostMeta): Partial<PostMeta> {
  const assignment = load().byPost.get(String(post.id));
  const extensions = { ...(post.extensions || {}) };
  if (!assignment) {
    delete extensions.collections;
    return { extensions };
  }
  extensions.collections = {
    name: assignment.collection,
    path: assignment.collectionPath,
  };
  return { extensions };
}

function enrichSettings(settings: Record<string, any>): void {
  const file = path.join(dataDir(), 'collections.yml');
  let nav: Record<string, any> = {};
  try {
    const raw = YAML.parse(fs.readFileSync(file, 'utf-8')) || {};
    if (raw?.post?.collectionNav && typeof raw.post.collectionNav === 'object') {
      nav = raw.post.collectionNav;
    }
  } catch {
    /* no collections config */
  }
  settings.post = settings.post || {};
  settings.post.postCollectionNav = {
    alwaysCollapsed: false,
    ...(settings.post.postCollectionNav || {}),
    ...nav,
  };
  settings.post.postCollectionNavEnabled = nav.enabled !== false;
}

export const collectionDataHooks: PluginDataHooks = {
  getCollections,
  getCollectionPostIds,
  enrichPost,
  enrichSettings,
};
