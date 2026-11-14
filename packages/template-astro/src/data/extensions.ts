/** Generic helpers for plugin-owned post metadata. Core does not interpret keys. */
import type { PostMeta } from './types';

export function getPostExtension<T = unknown>(post: PostMeta | null | undefined, key: string): T | undefined {
  const extensions = post?.extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  return extensions[key] as T | undefined;
}

export function withPostExtension<T extends PostMeta>(
  post: T,
  key: string,
  value: unknown,
): T {
  return {
    ...post,
    extensions: {
      ...(post.extensions || {}),
      [key]: value,
    },
  };
}
