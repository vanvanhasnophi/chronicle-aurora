/**
 * Serializable metadata for the collections plugin.
 * Kept component-free so the Manager can consume it without importing Astro.
 */
export const collectionsMeta = {
  id: 'collections',
  key: 'collections',
  name: 'Collections 合集',
  description: 'Collection tree & navigation settings — 合集树与合集导航设置',
  featureFlag: 'enabled',
  schemaId: 'chronicle:collections',
  filePath: 'data/collections.yml',
  format: 'yaml' as const,
  storage: 'file' as const,
  builtin: true,
  contentEditor: true,
  dataFiles: ['data/collections.yml'],
  contentType: {
    dir: 'data',
    idFrom: 'filename' as const,
    file: 'collections.yml',
    format: 'yaml' as const,
  },
};
