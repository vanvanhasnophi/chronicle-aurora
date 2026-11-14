/** Serializable metadata for the search plugin. */
export const searchMeta = {
  id: 'search',
  key: 'search',
  name: 'Search 检索',
  description: 'Search suggestions, global search, full-text index — 搜索建议 / 全局搜索 / 全文索引',
  featureFlag: 'enabled',
  schemaId: 'chronicle:search',
  filePath: 'data/site.yml',
  format: 'yaml' as const,
  storage: 'site' as const,
  builtin: true,
  entries: [{ target: 'chronicle:homepage' }],
};
