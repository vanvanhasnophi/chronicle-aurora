/**
 * Generic plugin data hooks — plugins can extend the DataSource without the
 * core adapter knowing their domain. Hooks are registered by plugin manifests
 * and looked up lazily (dataSource is created before plugin registration).
 */
import type { DataSource, PostMeta } from './types';

export interface PluginDataHooks extends Partial<DataSource> {
  /** Add plugin-owned fields to a post (e.g. collection assignment). */
  enrichPost?: (post: PostMeta) => Partial<PostMeta> | void;
  /** Add plugin-owned settings/config after the core settings shape is built. */
  enrichSettings?: (settings: Record<string, any>) => void;
}

export interface PluginDataContext {
  dataDir: string;
}

let context: PluginDataContext = { dataDir: '' };
const hooks = new Map<string, PluginDataHooks>();

export function setDataContext(next: PluginDataContext): void {
  context = next;
}

export function getDataContext(): PluginDataContext {
  return context;
}

export function registerDataHooks(id: string, next: PluginDataHooks | undefined): void {
  if (!next) return;
  const previous = hooks.get(id) ?? {};
  hooks.set(id, { ...previous, ...next });
}

export function getDataHook<K extends keyof DataSource>(name: K): DataSource[K] | undefined {
  for (const hook of hooks.values()) {
    const fn = hook[name];
    if (typeof fn === 'function') return fn as DataSource[K];
  }
  return undefined;
}

/** Apply all plugin enrichPost hooks in registration order. */
export function applyPostExtensions<T extends PostMeta>(post: T): T {
  for (const hook of hooks.values()) {
    if (!hook.enrichPost) continue;
    const extra = hook.enrichPost(post);
    if (extra && typeof extra === 'object') Object.assign(post, extra);
  }
  return post;
}

/** Apply plugin settings hooks after core settings normalization. */
export function applySettingsExtensions(settings: Record<string, any>): void {
  for (const hook of hooks.values()) {
    if (hook.enrichSettings) hook.enrichSettings(settings);
  }
}
