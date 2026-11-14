/** Serializable metadata for the comments plugin. */
export const commentsMeta = {
  id: 'comments',
  key: 'comments',
  name: 'Comments 评论',
  description: 'Master switch, backend, attitude, image upload — 主开关与评论配置（后端/态度/图床）',
  featureFlag: 'enabled',
  schemaId: 'chronicle:comments',
  filePath: 'data/site.yml',
  format: 'yaml' as const,
  storage: 'site' as const,
  builtin: true,
  entries: [{ target: 'chronicle:post-page' }],
  contentType: {
    dir: 'data/comments',
    idFrom: 'filename' as const,
    file: '*.json',
    format: 'json' as const,
  },
};
