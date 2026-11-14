/** Serializable metadata for the reading-experience plugin. */
export const readingExperienceMeta = {
  id: 'reading-experience',
  key: 'reading-experience',
  name: 'Reading Experience 阅读体验',
  description: 'TOC & end-of-article blocks (related, prev/next, share, attitude, author card) — 目录与文末区块（相关/上下篇/分享/态度/作者卡）',
  featureFlag: 'enabled',
  schemaId: 'chronicle:reading-experience',
  filePath: 'data/site.yml',
  format: 'yaml' as const,
  storage: 'site' as const,
  builtin: true,
  entries: [{ target: 'chronicle:post-page' }],
};
