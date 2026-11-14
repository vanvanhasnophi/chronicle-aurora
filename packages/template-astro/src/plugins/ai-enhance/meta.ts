/** Serializable metadata for the optional AI plugin. */
export const aiEnhanceMeta = {
  id: 'ai-enhance',
  key: 'ai-enhance',
  name: 'AI 增强',
  description: 'AI 增强：构建期生成的文章摘要；运行时无 API Key。',
  featureFlag: 'enabled',
  schemaId: 'chronicle:ai-enhance',
  filePath: 'data/site.yml',
  format: 'yaml' as const,
  storage: 'site' as const,
  builtin: false,
  entries: [{ target: 'chronicle:post-page' }],
};
